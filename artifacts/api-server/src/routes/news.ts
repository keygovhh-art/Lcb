import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, newsTable, entityLikesTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { resolveMemberDisplayName } from "../lib/user-display";
import { deleteManagedMediaUrl } from "../lib/media-cleanup";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

const NEWS_CATEGORIES = new Set([
  "emergency_appeal", "fundraising", "announcement", "volunteer_call",
  "alert", "org_update", "bikur_cholim", "community", "medical", "wedding",
]);
const NEWS_URGENCIES = new Set(["normal", "high", "breaking"]);

function validOptionalDate(value: unknown) {
  return value === undefined || value === null || value === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

router.get("/news/featured", async (_req, res): Promise<void> => {
  const featured = await db.select().from(newsTable).where(eq(newsTable.isFeatured, true)).orderBy(desc(newsTable.createdAt)).limit(5);
  res.json(featured);
});

router.get("/news", async (req, res): Promise<void> => {
  const { category, search, urgency } = req.query as Record<string, string>;
  let all = await db.select().from(newsTable).orderBy(desc(newsTable.createdAt));
  if (category) all = all.filter(n => n.category === category);
  if (urgency) all = all.filter(n => n.urgency === urgency);
  if (search) all = all.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.summary ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (n.organization ?? "").toLowerCase().includes(search.toLowerCase())
  );
  res.json(all);
});

router.post("/news", requireAuth, async (req, res): Promise<void> => {
  const { title, content, summary, imageUrl, category, urgency, deadline, organization, isFeatured, authorName } = req.body;
  const cleanTitle = String(title || "").trim();
  const cleanContent = String(content || "").trim();
  const cleanCategory = String(category || "announcement");
  const cleanUrgency = String(urgency || "normal");
  if (!cleanTitle || !cleanContent) {
    res.status(400).json({ error: "title and content required" });
    return;
  }
  if (!NEWS_CATEGORIES.has(cleanCategory)) {
    res.status(400).json({ error: "invalid category" });
    return;
  }
  if (!NEWS_URGENCIES.has(cleanUrgency)) {
    res.status(400).json({ error: "invalid urgency" });
    return;
  }
  if (!validOptionalDate(deadline)) {
    res.status(400).json({ error: "invalid deadline" });
    return;
  }
  const userId = getSessionUserId(req)!;
  const safeAuthorName = await resolveMemberDisplayName(userId, authorName);
  const [article] = await db.insert(newsTable).values({
    title: cleanTitle.slice(0, 300),
    content: cleanContent.slice(0, 30000),
    summary: summary ? String(summary).trim().slice(0, 1500) : null,
    imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 2000) : null,
    category: cleanCategory,
    urgency: cleanUrgency,
    deadline: deadline ? String(deadline) : null,
    organization: organization ? String(organization).trim().slice(0, 240) : null,
    isFeatured: isStaffRole(getSessionUserRole(req)) ? (isFeatured ?? false) : false,
    authorId: userId,
    authorName: safeAuthorName,
  }).returning();
  await logActivity("news", `Published news update "${article.title}"`, safeAuthorName);
  res.status(201).json(article);
});

router.get("/news/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [article] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  res.json(article);
});

router.post("/news/:id/like", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { liked } = req.body as { liked?: boolean };

  const [article] = await db.select({ id: newsTable.id }).from(newsTable).where(eq(newsTable.id, id));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }

  const state = await setLikeState(getSessionUserId(req)!, "news", id, liked);
  let likeCount: number;
  if (state.changed) {
    const [updated] = await db.update(newsTable)
      .set({ likeCount: sql`GREATEST(0, ${newsTable.likeCount} + ${state.delta})` })
      .where(eq(newsTable.id, id))
      .returning({ likeCount: newsTable.likeCount });
    likeCount = updated.likeCount;
  } else {
    const [current] = await db.select({ likeCount: newsTable.likeCount }).from(newsTable).where(eq(newsTable.id, id));
    likeCount = current.likeCount;
  }

  res.json({ likeCount, liked: state.liked });
});

router.post("/news/:id/view", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db.update(newsTable)
    .set({ viewCount: sql`${newsTable.viewCount} + 1` })
    .where(eq(newsTable.id, id))
    .returning({ id: newsTable.id });
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

router.patch("/news/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  const { title, content, summary, imageUrl, category, urgency, deadline, organization, isFeatured } = req.body;
  const updates: Record<string, unknown> = {};

  if (title !== undefined) {
    const cleanTitle = String(title).trim();
    if (!cleanTitle) { res.status(400).json({ error: "title required" }); return; }
    updates.title = cleanTitle.slice(0, 300);
  }
  if (content !== undefined) {
    const cleanContent = String(content).trim();
    if (!cleanContent) { res.status(400).json({ error: "content required" }); return; }
    updates.content = cleanContent.slice(0, 30000);
  }
  if (summary !== undefined) updates.summary = summary ? String(summary).trim().slice(0, 1500) : null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl ? String(imageUrl).trim().slice(0, 2000) : null;
  if (category !== undefined) {
    const clean = String(category);
    if (!NEWS_CATEGORIES.has(clean)) { res.status(400).json({ error: "invalid category" }); return; }
    updates.category = clean;
  }
  if (urgency !== undefined) {
    const clean = String(urgency);
    if (!NEWS_URGENCIES.has(clean)) { res.status(400).json({ error: "invalid urgency" }); return; }
    updates.urgency = clean;
  }
  if (deadline !== undefined) {
    if (!validOptionalDate(deadline)) { res.status(400).json({ error: "invalid deadline" }); return; }
    updates.deadline = deadline ? String(deadline) : null;
  }
  if (organization !== undefined) updates.organization = organization ? String(organization).trim().slice(0, 240) : null;
  if (isStaffRole(getSessionUserRole(req)) && isFeatured !== undefined) updates.isFeatured = !!isFeatured;

  const [article] = await db.update(newsTable)
    .set(updates)
    .where(eq(newsTable.id, id)).returning();
  if (!article) { res.status(404).json({ error: "Not found" }); return; }

  if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== article.imageUrl) {
    await deleteManagedMediaUrl(existing.imageUrl);
  }

  res.json(article);
});

router.delete("/news/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(entityLikesTable).where(and(
    eq(entityLikesTable.entityType, "news"),
    eq(entityLikesTable.entityId, id),
  ));
  await db.delete(newsTable).where(eq(newsTable.id, id));
  await deleteManagedMediaUrl(existing.imageUrl);
  res.sendStatus(204);
});

export default router;
