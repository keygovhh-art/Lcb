import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, newsTable, entityLikesTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { resolveMemberDisplayName } from "../lib/user-display";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
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
  if (!title || !content) { res.status(400).json({ error: "title and content required" }); return; }
  const userId = getSessionUserId(req)!;
  const safeAuthorName = await resolveMemberDisplayName(userId, authorName);
  const [article] = await db.insert(newsTable).values({
    title: String(title).trim(),
    content: String(content).trim(),
    summary: summary ? String(summary).trim() : null,
    imageUrl: imageUrl ? String(imageUrl).trim() : null,
    category: category || "announcement",
    urgency: urgency || "normal",
    deadline: deadline || null,
    organization: organization ? String(organization).trim() : null,
    isFeatured: isStaffRole(getSessionUserRole(req)) ? (isFeatured ?? false) : false,
    authorId: userId,
    authorName: safeAuthorName,
  }).returning();
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
  await db.update(newsTable).set({ viewCount: sql`${newsTable.viewCount} + 1` }).where(eq(newsTable.id, id));
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
  const [article] = await db.update(newsTable)
    .set({ title, content, summary, imageUrl, category, urgency, deadline, organization, isFeatured: isStaffRole(getSessionUserRole(req)) ? isFeatured : existing.isFeatured })
    .where(eq(newsTable.id, id)).returning();
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
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
  res.sendStatus(204);
});

export default router;
