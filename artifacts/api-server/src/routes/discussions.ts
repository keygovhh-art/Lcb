import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, discussionsTable, commentsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

router.get("/discussions/trending", async (_req, res): Promise<void> => {
  const trending = await db.select().from(discussionsTable)
    .orderBy(desc(discussionsTable.views), desc(discussionsTable.likes))
    .limit(5);
  res.json(trending);
});

router.get("/discussions", async (req, res): Promise<void> => {
  const { category, search } = req.query as Record<string, string>;
  let all = await db.select().from(discussionsTable).orderBy(desc(discussionsTable.createdAt));
  if (category) all = all.filter(d => d.category === category);
  if (search) all = all.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.content.toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/discussions", requireAuth, async (req, res): Promise<void> => {
  const { title, content, category, authorName } = req.body;
  if (!title || !content) { res.status(400).json({ error: "title and content required" }); return; }
  const [disc] = await db.insert(discussionsTable).values({
    title, content, category: category || "general",
    authorId: getSessionUserId(req)!, authorName: authorName || "Community Member",
  }).returning();
  res.status(201).json(disc);
});

router.get("/discussions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [disc] = await db.select().from(discussionsTable).where(eq(discussionsTable.id, id));
  if (!disc) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(discussionsTable).set({ views: sql`${discussionsTable.views} + 1` }).where(eq(discussionsTable.id, id));
  res.json({ ...disc, views: disc.views + 1 });
});

router.patch("/discussions/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(discussionsTable).where(eq(discussionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  const { title, content, category, isPinned } = req.body;
  const [disc] = await db.update(discussionsTable).set({ title, content, category, isPinned, updatedAt: new Date() }).where(eq(discussionsTable.id, id)).returning();
  if (!disc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(disc);
});

router.delete("/discussions/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(discussionsTable).where(eq(discussionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(discussionsTable).where(eq(discussionsTable.id, id));
  res.sendStatus(204);
});

router.post("/discussions/:id/like", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select({ id: discussionsTable.id }).from(discussionsTable).where(eq(discussionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const state = await setLikeState(getSessionUserId(req)!, "discussion", id);
  if (state.changed) {
    const [disc] = await db.update(discussionsTable)
      .set({ likes: sql`GREATEST(0, ${discussionsTable.likes} + ${state.delta})` })
      .where(eq(discussionsTable.id, id))
      .returning();
    res.json({ likes: disc.likes, liked: state.liked });
    return;
  }

  const [disc] = await db.select({ likes: discussionsTable.likes }).from(discussionsTable).where(eq(discussionsTable.id, id));
  res.json({ likes: disc.likes, liked: state.liked });
});

router.post("/discussions/:id/lock", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [disc] = await db.update(discussionsTable).set({ isLocked: true }).where(eq(discussionsTable.id, id)).returning();
  if (!disc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(disc);
});

router.get("/discussions/:id/comments", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const comments = await db.select().from(commentsTable).where(eq(commentsTable.discussionId, id)).orderBy(commentsTable.createdAt);
  res.json(comments);
});

router.post("/discussions/:id/comments/:commentId/like", requireAuth, async (req, res): Promise<void> => {
  const discussionId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const [comment] = await db.select({ id: commentsTable.id, likes: commentsTable.likes })
    .from(commentsTable)
    .where(and(eq(commentsTable.id, commentId), eq(commentsTable.discussionId, discussionId)));
  if (!comment) { res.status(404).json({ error: "Not found" }); return; }

  const state = await setLikeState(getSessionUserId(req)!, "comment", commentId);
  let likes = comment.likes;
  if (state.changed) {
    const [updated] = await db.update(commentsTable)
      .set({ likes: sql`GREATEST(0, ${commentsTable.likes} + ${state.delta})` })
      .where(eq(commentsTable.id, commentId))
      .returning({ likes: commentsTable.likes });
    likes = updated.likes;
  }
  res.json({ likes, liked: state.liked });
});

router.post("/discussions/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const discussionId = parseInt(raw, 10);
  const { content, parentId, authorName } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const [comment] = await db.insert(commentsTable).values({
    content, discussionId, parentId: parentId ?? null,
    authorId: getSessionUserId(req)!, authorName: authorName || "Community Member",
  }).returning();
  await db.update(discussionsTable).set({ commentCount: sql`${discussionsTable.commentCount} + 1` }).where(eq(discussionsTable.id, discussionId));
  res.status(201).json(comment);
});

export default router;
