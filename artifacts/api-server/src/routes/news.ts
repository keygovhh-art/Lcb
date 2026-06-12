import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, newsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/news/featured", async (_req, res): Promise<void> => {
  const featured = await db.select().from(newsTable).where(eq(newsTable.isFeatured, true)).orderBy(desc(newsTable.createdAt)).limit(5);
  res.json(featured);
});

router.get("/news", async (req, res): Promise<void> => {
  const { category, search } = req.query as Record<string, string>;
  let all = await db.select().from(newsTable).orderBy(desc(newsTable.createdAt));
  if (category) all = all.filter(n => n.category === category);
  if (search) all = all.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || (n.summary ?? "").toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/news", async (req, res): Promise<void> => {
  const { title, content, summary, imageUrl, category, isFeatured, authorName } = req.body;
  if (!title || !content) { res.status(400).json({ error: "title and content required" }); return; }
  const [article] = await db.insert(newsTable).values({
    title, content, summary, imageUrl, category: category || "community",
    isFeatured: isFeatured ?? false,
    authorId: 1,
    authorName: authorName || "Community Member",
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

// Increment view count when article is opened
router.post("/news/:id/view", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.update(newsTable).set({ viewCount: sql`${newsTable.viewCount} + 1` }).where(eq(newsTable.id, id));
  res.json({ ok: true });
});

router.patch("/news/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { title, content, summary, imageUrl, category, isFeatured } = req.body;
  const [article] = await db.update(newsTable).set({ title, content, summary, imageUrl, category, isFeatured }).where(eq(newsTable.id, id)).returning();
  if (!article) { res.status(404).json({ error: "Not found" }); return; }
  res.json(article);
});

router.delete("/news/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(newsTable).where(eq(newsTable.id, id));
  res.sendStatus(204);
});

export default router;
