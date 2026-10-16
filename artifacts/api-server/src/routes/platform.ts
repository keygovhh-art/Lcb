import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db, announcementsTable, reportsTable, notificationsTable,
  broadcastsTable, hotlineMailboxItems, usersTable, volunteerProfilesTable, newsTable, discussionsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { createRateLimiter } from "../middlewares/rate-limit";
import { resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { notifyStaff } from "../lib/notify";

const router: IRouter = Router();

const reportLimiter = createRateLimiter({
  name: "reports",
  windowMs: 15 * 60 * 1000,
  max: 30,
});

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
    title: String(title).trim().slice(0, 240),
    content: String(content).trim().slice(0, 10000),
    authorId: userId,
    authorName,
  }).returning();
  await logActivity("announcement", `Published announcement "${ann.title}"`, authorName);
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
    .set({ title: title.slice(0, 240), content: content.slice(0, 10000) })
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

router.post("/reports", requireAuth, reportLimiter, async (req, res): Promise<void> => {
  const contentType = String(req.body?.contentType || "");
  const contentId = Number(req.body?.contentId);
  const reason = String(req.body?.reason || "");
  const description = req.body?.description ? String(req.body.description).trim().slice(0, 2000) : null;
  const reporterId = getSessionUserId(req)!;

  if (!["news", "discussion"].includes(contentType) || !Number.isInteger(contentId) || contentId <= 0) {
    res.status(400).json({ error: "Invalid report target" });
    return;
  }
  if (!["spam", "inappropriate", "misinformation", "harassment", "other"].includes(reason)) {
    res.status(400).json({ error: "Invalid report reason" });
    return;
  }

  const targetExists = contentType === "news"
    ? (await db.select({ id: newsTable.id }).from(newsTable).where(eq(newsTable.id, contentId)))[0]
    : (await db.select({ id: discussionsTable.id }).from(discussionsTable).where(eq(discussionsTable.id, contentId)))[0];

  if (!targetExists) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  const [existing] = await db.select({ id: reportsTable.id }).from(reportsTable).where(and(
    eq(reportsTable.contentType, contentType),
    eq(reportsTable.contentId, contentId),
    eq(reportsTable.reporterId, reporterId),
    eq(reportsTable.status, "pending"),
  ));
  if (existing) {
    res.status(409).json({ error: "You already have a pending report for this content" });
    return;
  }

  const [report] = await db.insert(reportsTable).values({
    contentType,
    contentId,
    reason,
    description,
    reporterId,
    status: "pending",
  }).returning();
  await notifyStaff(`New content report: ${contentType} #${contentId} — ${reason}`, "/founder", "admin_report");
  res.status(201).json(report);
});

router.post("/reports/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "pending") { res.status(409).json({ error: "Report already reviewed" }); return; }
  const [report] = await db.update(reportsTable).set({ status: "resolved" }).where(eq(reportsTable.id, id)).returning();
  res.json(report);
});

router.post("/reports/:id/dismiss", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "pending") { res.status(409).json({ error: "Report already reviewed" }); return; }
  const [report] = await db.update(reportsTable).set({ status: "dismissed" }).where(eq(reportsTable.id, id)).returning();
  res.json(report);
});

// Website broadcasts
router.get("/broadcasts", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(broadcastsTable).orderBy(desc(broadcastsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/broadcasts", requireAdmin, async (req, res): Promise<void> => {
  const authorId=getSessionUserId(req)!;
  const {recipientGroup,channel,subject,message}=req.body??{};
  const requestId=req.body?.requestId===undefined?null:String(req.body.requestId||"").trim();
  const title=String(subject||"").trim().slice(0,240);
  const body=String(message||"").trim().slice(0,5000);
  const targets=new Set(["website","hotline_inbox","both"]);
  if(!title||!body||!targets.has(channel)||!new Set(["all","admins","volunteers"]).has(recipientGroup)
    ||(requestId!==null&&!/^[a-f0-9-]{36}$/i.test(requestId))){
    res.status(400).json({error:"Choose valid recipients and a website or hotline-inbox channel"});return;
  }
  // No SMS, outbound calls, voicemail deposit at the provider, or TTS billing.
  const users=await db.select({
    id:usersTable.id,role:usersTable.role,status:usersTable.status,
  }).from(usersTable);
  const volunteers=recipientGroup==="volunteers"
    ?new Set((await db.select({userId:volunteerProfilesTable.userId}).from(volunteerProfilesTable)).map(v=>v.userId))
    :new Set<number>();
  const recipients=users.filter(u=>u.status==="active"&&(
    recipientGroup==="all" ||
    (recipientGroup==="admins"&&["admin","moderator","super_admin"].includes(u.role)) ||
    (recipientGroup==="volunteers"&&volunteers.has(u.id))
  )).map(u=>u.id);
  const result=await db.transaction(async tx=>{
    const [saved]=await tx.insert(broadcastsTable).values({
      authorId,subject:title,message:body,recipientGroup,channel,
      recipientCount:recipients.length,requestId,
    }).onConflictDoNothing().returning();
    if(!saved){
      const [old]=await tx.select().from(broadcastsTable).where(and(
        eq(broadcastsTable.authorId,authorId),eq(broadcastsTable.requestId,requestId!)));
      if(!old||old.subject!==title||old.message!==body||old.channel!==channel||
         old.recipientGroup!==recipientGroup)return {kind:"conflict" as const};
      return {kind:"duplicate" as const,broadcast:old};
    }
    // Fan out in chunks to stay below Postgres' query-parameter limit.
    for(let i=0;i<recipients.length;i+=250){
      const batch=recipients.slice(i,i+250);
      if(channel==="website"||channel==="both"){
        await tx.insert(notificationsTable).values(batch.map(userId=>({
          userId,type:"broadcast",message:title+" — "+body,
          linkUrl:"/notifications",isRead:false,
        })));
      }
      if(channel==="hotline_inbox"||channel==="both"){
        await tx.insert(hotlineMailboxItems).values(batch.map(userId=>({
          userId,broadcastId:saved.id,subject:title,message:body,
        })));
      }
    }
    return {kind:"created" as const,broadcast:saved};
  });
  res.setHeader("Cache-Control","private, no-store");
  if(result.kind==="conflict"){res.status(409).json({error:"Broadcast request ID already used for different content"});return;}
  res.status(result.kind==="duplicate"?200:201).json({
    ...result.broadcast,duplicate:result.kind==="duplicate",
    hotlineProviderDelivered:false,externalPhoneCalls:0,externalSms:0,
    message:"Internal inbox delivery only. Actual IVR playback requires hotline API integration.",
  });
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
  const userId = Number(req.body?.userId);
  const type = String(req.body?.type || "").trim();
  const message = String(req.body?.message || "").trim();
  const linkUrl = req.body?.linkUrl ? String(req.body.linkUrl).trim().slice(0, 1000) : null;

  if (!Number.isInteger(userId) || userId <= 0 || !message || !type) {
    res.status(400).json({ error: "valid userId, message, and type required" });
    return;
  }

  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const [notif] = await db.insert(notificationsTable).values({
    userId,
    type: type.slice(0, 80),
    message: message.slice(0, 5000),
    linkUrl,
    isRead: false,
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
