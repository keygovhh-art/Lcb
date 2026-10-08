import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, discussionsTable, helpRequestsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { hashPassword } from "../lib/crypto";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { createRateLimiter } from "../middlewares/rate-limit";
import { queueStaffReview } from "../lib/notify";
import { RESERVED_SUPER_ADMIN_NAME, isReservedSuperAdminName } from "../lib/super-admin";

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

  const [user] = await db.insert(usersTable).values({
    name: name?.trim() || nickname.trim(),
    nickname: nickname.trim(),
    email: email ? email.toLowerCase().trim() : null,
    phone: phone ? phone.trim() : null,
    passwordHash,
    location: location?.trim() || null,
    bio: bio?.trim() || null,
  }).returning();

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
