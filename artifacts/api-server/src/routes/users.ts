import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, discussionsTable, helpRequestsTable, memberMailingTable } from "@workspace/db";
import { mailingValues, parseMailingInput, publicMailingStatus } from "../lib/member-mailing";
import { count } from "drizzle-orm";
import { hashPassword } from "../lib/crypto";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { createRateLimiter } from "../middlewares/rate-limit";
import { queueStaffReview } from "../lib/notify";
import { isReservedSuperAdminName } from "../lib/super-admin";

const router: IRouter = Router();

const registrationLimiter = createRateLimiter({
  name: "registration",
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many account registrations from this network. Please try again later.",
});

function safeUser<T extends { passwordHash?: unknown }>(user: T) {
  const { passwordHash: _passwordHash, ...safe } = user as T & { passwordHash?: unknown };
  return safe;
}

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator" || role === "super_admin";
}

/** Home addresses are more sensitive than normal moderation content. */
const privateMailingAdmin: import("express").RequestHandler = (req, res, next) => {
  const role = getSessionUserRole(req);
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Postal addresses are restricted to administrators" }); return;
  }
  next();
};

const sameOrigin: import("express").RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (!origin) { next(); return; }
  try {
    if (new URL(origin).host !== req.get("host")) {
      res.status(403).json({ error: "Cross-origin changes are not permitted" }); return;
    }
  } catch { res.status(403).json({ error: "Invalid origin" }); return; }
  next();
};

router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const { role, search } = req.query as Record<string, string>;
  let query = db.select().from(usersTable).$dynamic();
  if (role) query = query.where(eq(usersTable.role, role));
  const users = await query.orderBy(usersTable.createdAt);
  const filtered = search
    ? users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.nickname ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : users;
  res.json(filtered.map(safeUser));
});

router.post("/users", registrationLimiter, async (req, res): Promise<void> => {
  const { name, nickname, email, phone, password, location, bio } = req.body as Record<string, string>;
  const providedMailing = req.body?.mailingAddress;
  const mailing: ReturnType<typeof parseMailingInput> = providedMailing === undefined || providedMailing === null
    ? { value: null }
    : parseMailingInput(providedMailing);
  if (mailing.error) { res.status(400).json({ error: mailing.error }); return; }

  if (!nickname) {
    res.status(400).json({ error: "nickname is required" });
    return;
  }
  const cleanRegistrationName = (name?.trim() || nickname.trim());
  const cleanRegistrationNickname = nickname.trim();
  if (
    isReservedSuperAdminName(cleanRegistrationName) ||
    isReservedSuperAdminName(cleanRegistrationNickname)
  ) {
    res.status(409).json({ error: "This account name is reserved" });
    return;
  }
  if (!email && !phone) {
    res.status(400).json({ error: "email or phone is required" });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: "password must be at least 8 characters" });
    return;
  }

  if (email) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (existing) { res.status(409).json({ error: "Email already registered" }); return; }
  }
  if (phone) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone.trim()));
    if (existing) { res.status(409).json({ error: "Phone number already registered" }); return; }
  }

  const passwordHash = await hashPassword(password);

  // Account and optional mailing data commit together. If saving the provided
  // address fails, registration fails as a whole rather than silently losing it.
  const user = await db.transaction(async tx => {
    const [created] = await tx.insert(usersTable).values({
      name: name?.trim() || nickname.trim(),
      nickname: nickname.trim(),
      email: email ? email.toLowerCase().trim() : null,
      phone: phone ? phone.trim() : null,
      passwordHash,
      location: location?.trim() || null,
      bio: bio?.trim() || null,
    }).returning();
    if (mailing.value) {
      await tx.insert(memberMailingTable).values(mailingValues(created.id, mailing.value));
    }
    return created;
  });

  await queueStaffReview({
    userId: user.id,
    name: user.nickname || user.name,
    contact: user.email || user.phone,
    type: "member_registration",
    subject: `New member registration: ${user.nickname || user.name}`,
    message: [
      `Member ID: ${user.id}`,
      user.location ? `Location: ${user.location}` : "",
      user.email ? `Email: ${user.email}` : "",
      user.phone ? `Phone: ${user.phone}` : "",
      user.bio ? `Bio: ${user.bio}` : "",
    ].filter(Boolean).join("\n"),
    notificationType: "admin_member_registration",
  });

  res.status(201).json(safeUser(user));
});

/** Mailing data is NEVER included in /users, /users/me, or public profiles. */
router.get("/me/mailing-address", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const [row] = await db.select().from(memberMailingTable)
    .where(eq(memberMailingTable.userId, getSessionUserId(req)!));
  if (!row) { res.json({ address: null, status: "no_address" }); return; }
  const { mailingHold: _hold, adminNote: _note, userId: _id, ...address } = row;
  res.json({ address, status: publicMailingStatus(row) });
});

router.put("/me/mailing-address", sameOrigin, requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = parseMailingInput(req.body);
  if (parsed.error || !parsed.value) {
    res.status(400).json({ error: parsed.error || "Invalid address" }); return;
  }
  const userId = getSessionUserId(req)!;
  const [old] = await db.select().from(memberMailingTable)
    .where(eq(memberMailingTable.userId, userId));
  // Explicit consent must be renewed after changing the actual address.
  const oldAddress = old &&
    [old.recipient, old.addressLine1, old.addressLine2 || "", old.city, old.state, old.postalCode, old.country].join("|");
  const newAddress = [
    parsed.value.recipient, parsed.value.addressLine1, parsed.value.addressLine2 || "",
    parsed.value.city, parsed.value.state, parsed.value.postalCode, parsed.value.country,
  ].join("|");
  if (old && oldAddress !== newAddress && parsed.value.uspsConsent) {
    if (req.body?.confirmNewAddressConsent !== true) {
      res.status(400).json({ error: "Please explicitly confirm USPS consent again for this changed address" }); return;
    }
  }
  const values = mailingValues(userId, parsed.value);
  await db.insert(memberMailingTable).values(values)
    .onConflictDoUpdate({
      target: memberMailingTable.userId,
      set: {
        recipient: values.recipient, addressLine1: values.addressLine1,
        addressLine2: values.addressLine2, city: values.city, state: values.state,
        postalCode: values.postalCode, country: values.country,
        uspsConsent: values.uspsConsent, consentAt: values.consentAt,
        addressUpdatedAt: values.addressUpdatedAt,
        // mailingHold and adminNote can ONLY be managed by administrators.
      },
    });
  const [row] = await db.select().from(memberMailingTable).where(eq(memberMailingTable.userId, userId));
  res.json({ status: publicMailingStatus(row), saved: true });
});

router.delete("/me/mailing-address", sameOrigin, requireAuth, async (req, res): Promise<void> => {
  await db.delete(memberMailingTable).where(eq(memberMailingTable.userId, getSessionUserId(req)!));
  res.json({ status: "no_address", deleted: true });
});

router.get("/admin/members/mailing", requireAdmin, privateMailingAdmin, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const [members, addresses] = await Promise.all([
    db.select({
      id: usersTable.id, name: usersTable.name, nickname: usersTable.nickname,
      email: usersTable.email, phone: usersTable.phone, role: usersTable.role,
      status: usersTable.status, location: usersTable.location,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt)),
    db.select().from(memberMailingTable),
  ]);
  const byMember = new Map(addresses.map(address => [address.userId, address]));
  const search = String(req.query?.search || "").trim().toLowerCase().slice(0,120);
  const filter = String(req.query?.mailStatus || "all");
  const valid = ["all", "no_address", "do_not_send", "permission_yes", "on_hold"];
  if (!valid.includes(filter)) {
    res.status(400).json({ error: "Invalid mailing filter" }); return;
  }
  const rows = members.map(member => {
    const address = byMember.get(member.id) || null;
    return { ...member, address, mailStatus: publicMailingStatus(address) };
  }).filter(row => {
    if (filter !== "all" && row.mailStatus !== filter) return false;
    if (!search) return true;
    return [row.id, row.name, row.nickname, row.email, row.phone, row.location]
      .some(value => String(value || "").toLowerCase().includes(search));
  });
  res.json({
    counts: {
      total: members.length,
      permissionYes: addresses.filter(a => a.uspsConsent && !a.mailingHold).length,
      doNotSend: addresses.filter(a => !a.uspsConsent).length,
      noAddress: members.length - addresses.length,
      onHold: addresses.filter(a => a.mailingHold && a.uspsConsent).length,
    },
    items: rows,
  });
});

router.patch("/admin/members/:id/mailing", sameOrigin, requireAdmin, privateMailingAdmin, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid member ID" }); return;
  }
  const [row] = await db.select().from(memberMailingTable).where(eq(memberMailingTable.userId, id));
  if (!row) { res.status(404).json({ error: "Member has no postal address" }); return; }
  if (typeof req.body?.mailingHold !== "boolean") {
    res.status(400).json({ error: "mailingHold must be a boolean" }); return;
  }
  const adminNote = typeof req.body?.adminNote === "string" ? req.body.adminNote.trim().slice(0,1500) : (row.adminNote || "");
  // Admin may BLOCK mail but may never grant mailing permission for a member.
  const [changed] = await db.update(memberMailingTable)
    .set({ mailingHold: req.body.mailingHold, adminNote })
    .where(eq(memberMailingTable.userId, id)).returning();
  res.json({ mailStatus: publicMailingStatus(changed), updated: true });
});

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(safeUser(user));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const requesterId = getSessionUserId(req)!;
  if (requesterId !== id && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(safeUser(user));
});

router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const requesterId = getSessionUserId(req)!;
  const requesterRole = getSessionUserRole(req);

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const isSelf = requesterId === id;
  const isSuperAdmin = requesterRole === "super_admin";
  const isAdmin = requesterRole === "admin" || isSuperAdmin;
  const isModerator = requesterRole === "moderator";

  if (!isSelf && !isAdmin && !isModerator) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  if (!isSelf && isModerator && (target.role === "admin" || target.role === "super_admin")) {
    res.status(403).json({ error: "Moderators cannot manage administrators" });
    return;
  }
  if (!isSelf && target.role === "super_admin" && !isSuperAdmin) {
    res.status(403).json({ error: "Only a super admin can manage another super admin" });
    return;
  }

  const { name, nickname, bio, location, role, status, preferredLanguage } = req.body;
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (!isSelf && !isAdmin) { res.status(403).json({ error: "Not allowed" }); return; }
    const cleanName = String(name).trim();
    if (!cleanName) { res.status(400).json({ error: "name cannot be empty" }); return; }
    if (isReservedSuperAdminName(cleanName) && target.role !== "super_admin") {
      res.status(409).json({ error: "This account name is reserved" }); return;
    }
    updates.name = cleanName;
  }
  if (nickname !== undefined) {
    if (!isSelf && !isAdmin) { res.status(403).json({ error: "Not allowed" }); return; }
    const cleanNickname = String(nickname).trim();
    if (!cleanNickname) { res.status(400).json({ error: "nickname cannot be empty" }); return; }
    if (isReservedSuperAdminName(cleanNickname) && target.role !== "super_admin") {
      res.status(409).json({ error: "This account name is reserved" }); return;
    }
    updates.nickname = cleanNickname;
  }
  if (bio !== undefined) {
    if (!isSelf && !isAdmin) { res.status(403).json({ error: "Not allowed" }); return; }
    updates.bio = bio ? String(bio).trim() : null;
  }
  if (location !== undefined) {
    if (!isSelf && !isAdmin) { res.status(403).json({ error: "Not allowed" }); return; }
    updates.location = location ? String(location).trim() : null;
  }
  if (preferredLanguage !== undefined) {
    if (!isSelf && !isAdmin) { res.status(403).json({ error: "Not allowed" }); return; }
    updates.preferredLanguage = String(preferredLanguage);
  }

  if (role !== undefined) {
    if (!isAdmin) {
      res.status(403).json({ error: "Only administrators can change roles" });
      return;
    }
    if (!["member", "moderator", "admin", "super_admin"].includes(String(role))) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    if (String(role) === "super_admin" && !isSuperAdmin) {
      res.status(403).json({ error: "Only a super admin can assign the super admin role" });
      return;
    }
    if (isSelf && role !== target.role) {
      res.status(400).json({ error: "You cannot change your own admin role here" });
      return;
    }
    updates.role = role;
  }

  if (status !== undefined) {
    if (!isAdmin && !isModerator) {
      res.status(403).json({ error: "Only staff can change account status" });
      return;
    }
    if (isSelf && status !== target.status) {
      res.status(400).json({ error: "You cannot suspend or ban your own account" });
      return;
    }
    if (!["active", "suspended", "banned"].includes(String(status))) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    updates.status = status;
  }

  const [user] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  res.json(safeUser(user));
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const requesterRole = getSessionUserRole(req);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role === "super_admin" && requesterRole !== "super_admin") {
    res.status(403).json({ error: "Only a super admin can delete a super admin account" });
    return;
  }
  if (id === getSessionUserId(req)) {
    res.status(400).json({ error: "You cannot delete your own admin account" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

router.post("/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const requesterId = getSessionUserId(req)!;
  const requesterRole = getSessionUserRole(req);
  if (id === requesterId) {
    res.status(400).json({ error: "You cannot ban your own account" });
    return;
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (requesterRole === "moderator" && (target.role === "admin" || target.role === "super_admin")) {
    res.status(403).json({ error: "Moderators cannot manage administrators" });
    return;
  }
  if (target.role === "super_admin" && requesterRole !== "super_admin") {
    res.status(403).json({ error: "Only a super admin can manage a super admin account" });
    return;
  }
  const [user] = await db.update(usersTable).set({ status: "banned" }).where(eq(usersTable.id, id)).returning();
  res.json(safeUser(user));
});

router.post("/users/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const requesterId = getSessionUserId(req)!;
  const requesterRole = getSessionUserRole(req);
  if (id === requesterId) {
    res.status(400).json({ error: "You cannot suspend your own account" });
    return;
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (requesterRole === "moderator" && (target.role === "admin" || target.role === "super_admin")) {
    res.status(403).json({ error: "Moderators cannot manage administrators" });
    return;
  }
  if (target.role === "super_admin" && requesterRole !== "super_admin") {
    res.status(403).json({ error: "Only a super admin can manage a super admin account" });
    return;
  }
  const [user] = await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, id)).returning();
  res.json(safeUser(user));
});

router.get("/users/:id/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id as string, 10);
  const requesterId = getSessionUserId(req)!;
  if (requesterId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const [discCount] = await db.select({ count: count() }).from(discussionsTable).where(eq(discussionsTable.authorId, userId));
  const [reqCount] = await db.select({ count: count() }).from(helpRequestsTable);
  res.json({
    userId,
    discussionCount: discCount?.count ?? 0,
    commentCount: 0,
    groupCount: 0,
    helpRequestCount: reqCount?.count ?? 0,
    volunteerActivityCount: 0,
    notificationCount: 0,
    savedCount: 0,
    recentDiscussions: [],
    recentGroups: [],
  });
});

export default router;
