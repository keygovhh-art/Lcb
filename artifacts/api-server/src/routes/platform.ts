import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db, announcementsTable, reportsTable, notificationsTable,
  broadcastsTable, usersTable, volunteerProfilesTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName } from "../lib/user-display";

const router: IRouter = Router();

// Announcements
router.get("/announcements", async (_req, res): Promise<void> => {
  const all = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  res.json(all);
});

router.post("/announcements", requireAdmin, async (req, res): Promise<void> => {
  const { title, content } = req.body;
  if (!String(title || "").trim() || !String(content || "").trim()) {
    res.status(400).json({ error: "title and content required" });
    return;
  }
  const userId = getSessionUserId(req)!;
  const authorName = await resolveMemberDisplayName(userId);
  const [ann] = await db.insert(announcementsTable).values({
    title: String(title).trim(),
    content: String(content).trim(),
    authorId: userId,
    authorName,
  }).returning();
  res.status(201).json(ann);
});

router.patch("/announcements/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const title = String(req.body?.title || "").trim();
  const content = String(req.body?.content || "").trim();

  if (!title || !content) {
    res.status(400).json({ error: "title and content required" });
    return;
  }

  const [announcement] = await db.update(announcementsTable)
    .set({ title, content })
    .where(eq(announcementsTable.id, id))
    .returning();

  if (!announcement) { res.status(404).json({ error: "Not found" }); return; }
  res.json(announcement);
});

router.delete("/announcements/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.sendStatus(204);
});

// Reports
router.get("/reports", requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query as Record<string, string>;
  let all = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
  if (status) all = all.filter(r => r.status === status);
  res.json(all);
});

router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const { contentType, contentId, reason, description } = req.body;
  if (!contentType || !contentId || !reason) { res.status(400).json({ error: "Required fields missing" }); return; }
  const [report] = await db.insert(reportsTable).values({
    contentType, contentId, reason, description, reporterId: getSessionUserId(req)!, status: "pending"
  }).returning();
  res.status(201).json(report);
});

router.post("/reports/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [report] = await db.update(reportsTable).set({ status: "resolved" }).where(eq(reportsTable.id, id)).returning();
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  res.json(report);
});

router.post("/reports/:id/dismiss", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [report] = await db.update(reportsTable).set({ status: "dismissed" }).where(eq(reportsTable.id, id)).returning();
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  res.json(report);
});

// Website broadcasts
router.get("/broadcasts", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(broadcastsTable).orderBy(desc(broadcastsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/broadcasts", requireAdmin, async (req, res): Promise<void> => {
  const authorId = getSessionUserId(req)!;
  const { recipientGroup, channel, subject, message } = req.body;

  if (!String(subject || "").trim() || !String(message || "").trim()) {
    res.status(400).json({ error: "subject and message are required" });
    return;
  }
  if (channel !== "website") {
    res.status(400).json({ error: "Only website notifications are active right now" });
    return;
  }

  const users = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    status: usersTable.status,
  }).from(usersTable);

  let recipientIds = users
    .filter(u => u.status === "active")
    .map(u => u.id);

  if (recipientGroup === "admins") {
    recipientIds = users
      .filter(u => u.status === "active" && (u.role === "admin" || u.role === "moderator"))
      .map(u => u.id);
  } else if (recipientGroup === "volunteers") {
    const volunteerRows = await db.select({ userId: volunteerProfilesTable.userId }).from(volunteerProfilesTable);
    const volunteers = new Set(volunteerRows.map(v => v.userId));
    recipientIds = users
      .filter(u => u.status === "active" && volunteers.has(u.id))
      .map(u => u.id);
  } else if (recipientGroup !== "all") {
    res.status(400).json({ error: "Unsupported recipient group" });
    return;
  }

  const cleanSubject = String(subject).trim();
  const cleanMessage = String(message).trim();

  if (recipientIds.length > 0) {
    await db.insert(notificationsTable).values(
      recipientIds.map(userId => ({
        userId,
        type: "broadcast",
        message: `${cleanSubject} — ${cleanMessage}`,
        linkUrl: "/notifications",
        isRead: false,
      }))
    );
  }

  const [broadcast] = await db.insert(broadcastsTable).values({
    authorId,
    subject: cleanSubject,
    message: cleanMessage,
    recipientGroup,
    channel: "website",
    recipientCount: recipientIds.length,
  }).returning();

  res.status(201).json(broadcast);
});

// Notifications
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const all = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId)).orderBy(desc(notificationsTable.createdAt));
  res.json(all);
});

router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const all = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId));
  const count = all.filter(n => !n.isRead).length;
  res.json({ count });
});

router.post("/notifications", requireAdmin, async (req, res): Promise<void> => {
  const { userId, type, message, linkUrl } = req.body;
  if (!message || !type) { res.status(400).json({ error: "message and type required" }); return; }
  const [notif] = await db.insert(notificationsTable).values({
    userId: userId ?? 1, type, message, linkUrl: linkUrl ?? null, isRead: false,
  }).returning();
  res.status(201).json(notif);
});

router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = getSessionUserId(req)!;
  const [notif] = await db.update(notificationsTable).set({ isRead: true }).where(
    and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId))
  ).returning();
  if (!notif) { res.status(404).json({ error: "Not found" }); return; }
  res.json(notif);
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const result = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId)).returning();
  res.json({ updatedCount: result.length });
});

export default router;
