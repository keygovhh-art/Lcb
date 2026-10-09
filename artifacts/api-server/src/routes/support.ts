import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, supportMessagesTable, usersTable, volunteerProfilesTable } from "@workspace/db";
import { CONNECTION_META_TYPE, newConnectionState } from "../lib/member-connections";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { createRateLimiter } from "../middlewares/rate-limit";
import { notifyStaff } from "../lib/notify";

const router: IRouter = Router();

const publicSupportLimiter = createRateLimiter({
  name: "support",
  windowMs: 15 * 60 * 1000,
  max: 20,
});

const SUPPORT_TYPES = new Set(["support", "feedback", "suggestion", "report", "other"]);
const MEMBER_REQUEST_TYPES = new Set(["volunteer_contact", "help_offer"]);

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

router.post("/support-messages", publicSupportLimiter, async (req, res): Promise<void> => {
  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 200).toLowerCase();
  const type = cleanText(req.body?.type, 40);
  const subject = cleanText(req.body?.subject, 200);
  const message = cleanText(req.body?.message, 5000);

  if (!name || !email || !type || !subject || !message) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (!validEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (!SUPPORT_TYPES.has(type)) {
    res.status(400).json({ error: "Invalid support message type" });
    return;
  }

  const [created] = await db.insert(supportMessagesTable).values({
    userId: getSessionUserId(req) ?? null,
    name,
    email,
    type,
    subject,
    message,
    status: "open",
  }).returning();

  await notifyStaff(`New ${type} message: ${subject}`, "/founder", "admin_support");
  res.status(201).json(created);
});

router.post("/member-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const type = cleanText(req.body?.type, 40);
  const subject = cleanText(req.body?.subject, 200);
  const message = cleanText(req.body?.message, 5000);

  if (!type || !subject || !message) {
    res.status(400).json({ error: "type, subject, and message are required" });
    return;
  }
  if (!MEMBER_REQUEST_TYPES.has(type)) {
    res.status(400).json({ error: "Invalid member request type" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (type === "volunteer_contact") {
    const volunteerId = Number(req.body?.volunteerId);
    if (!Number.isSafeInteger(volunteerId) || volunteerId <= 0) {
      res.status(400).json({ error: "Select a verified volunteer profile to request contact" });
      return;
    }
    const [volunteer] = await db.select().from(volunteerProfilesTable)
      .where(eq(volunteerProfilesTable.id, volunteerId));
    if (!volunteer) { res.status(404).json({ error: "Volunteer profile not found" }); return; }
    if (volunteer.userId === userId) {
      res.status(400).json({ error: "You cannot request contact with yourself" }); return;
    }
    const [volunteerAccount] = await db.select({
      status: usersTable.status, email: usersTable.email, phone: usersTable.phone,
    }).from(usersTable).where(eq(usersTable.id, volunteer.userId));
    if (!volunteerAccount || volunteerAccount.status !== "active" ||
        !(volunteerAccount.email || volunteerAccount.phone)) {
      res.status(409).json({ error: "Volunteer contact is temporarily unavailable" }); return;
    }

    // Prevent multiple pending requests to the same volunteer. The metadata
    // is created in the SAME transaction as the staff inbox item.
    const [openItems, allMeta] = await Promise.all([
      db.select({ id: supportMessagesTable.id }).from(supportMessagesTable)
        .where(and(
          eq(supportMessagesTable.userId, userId),
          eq(supportMessagesTable.type, "volunteer_contact"),
          eq(supportMessagesTable.status, "open"),
        )),
      db.select({ subject: supportMessagesTable.subject, message: supportMessagesTable.message })
        .from(supportMessagesTable).where(eq(supportMessagesTable.type, CONNECTION_META_TYPE)),
    ]);
    const metaById = new Map(allMeta.map(row => [row.subject, row.message]));
    for (const row of openItems) {
      const raw = metaById.get(`support:${row.id}`);
      if (!raw) continue;
      try {
        const previous = JSON.parse(raw);
        if (previous.volunteerId === volunteerId && previous.stage !== "closed_unfulfilled") {
          res.status(409).json({ error: "You already have an open request for this volunteer" });
          return;
        }
      } catch { /* Ignore malformed legacy metadata. */ }
    }

    const cleanNote = message.slice(0, 1500);
    const [created] = await db.transaction(async tx => {
      const [item] = await tx.insert(supportMessagesTable).values({
        userId, name: user.nickname || user.name,
        email: user.email || user.phone || "Gavhah member",
        type: "volunteer_contact",
        subject: `Volunteer contact request: ${volunteer.userName}`,
        message: `Member asked to connect with volunteer #${volunteer.id} (${volunteer.userName}) in ${volunteer.location}.` +
          (cleanNote ? `\nMessage: ${cleanNote}` : ""),
        status: "open",
      }).returning();
      await tx.insert(supportMessagesTable).values({
        userId, name: "Member Connection Workflow", email: "connections@internal.invalid",
        type: CONNECTION_META_TYPE, subject: `support:${item.id}`,
        message: JSON.stringify(newConnectionState({
          volunteerId: volunteer.id, volunteerUserId: volunteer.userId, requesterUserId: userId,
        })),
        status: "resolved",
      });
      return [item];
    });
    await notifyStaff(
      `New volunteer connection request: ${user.nickname || user.name} — ${volunteer.userName}`,
      "/founder", "admin_member_connection",
    );
    res.status(201).json(created);
    return;
  }

  const [created] = await db.insert(supportMessagesTable).values({
    userId,
    name: user.nickname || user.name,
    email: user.email || user.phone || "Gavhah member",
    type,
    subject,
    message,
    status: "open",
  }).returning();

  await notifyStaff(
    `New member connection request: ${user.nickname || user.name} — ${subject}`,
    "/founder",
    "admin_member_connection",
  );
  res.status(201).json(created);
});

router.get("/admin/support-messages", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(supportMessagesTable).orderBy(desc(supportMessagesTable.createdAt));
  res.json(rows.filter(row => !String(row.type).startsWith("__")));
});

router.patch("/admin/support-messages/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  if (!["open", "resolved"].includes(status)) {
    res.status(400).json({ error: "Invalid support status" });
    return;
  }

  const [existing] = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (String(existing.type).startsWith("__")) {
    res.status(403).json({ error: "Internal system records must be managed through their dedicated admin controls" });
    return;
  }
  if (existing.type === "volunteer_contact" && status === "resolved") {
    res.status(409).json({
      error: "Connection requests cannot be marked successful by staff review. The requester must confirm contact, or staff must close it as unfulfilled with a recorded reason.",
    });
    return;
  }

  const [updated] = await db.update(supportMessagesTable)
    .set({ status })
    .where(eq(supportMessagesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
