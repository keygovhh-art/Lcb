import { Router, type IRouter } from "express";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { db, discussionsTable, commentsTable, entityLikesTable, supportMessagesTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { resolveMemberDisplayName, getMemberIdentity } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { notifyUser, notifyStaff } from "../lib/notify";
import { getEngagementSetting } from "../lib/engagement-settings";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator" || role === "super_admin";
}

function cleanForumTopic(input: unknown): string | null {
  if (input === undefined || input === null) return "";
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length > 100 || /[\u0000-\u001F\u007F]/.test(value)) return null;
  return value;
}

router.get("/discussions/trending", requireAuth, async (_req, res): Promise<void> => {
  const trending = await db.select().from(discussionsTable)
    .orderBy(desc(discussionsTable.views), desc(discussionsTable.likes))
    .limit(5);
  res.json(trending);
});

router.get("/discussions", requireAuth, async (req, res): Promise<void> => {
  const { category, search } = req.query as Record<string, string>;
  let all = await db.select().from(discussionsTable).orderBy(desc(discussionsTable.createdAt));
  if (category) all = all.filter(d => d.category === category);
  if (search) all = all.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.content.toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/discussions", requireAuth, async (req, res): Promise<void> => {
  const { title, content, category, authorName } = req.body;
  const cleanTitle = String(title || "").trim();
  const cleanContent = String(content || "").trim();
  const cleanCategory = cleanForumTopic(category);
  if (!cleanTitle || !cleanContent) {
    res.status(400).json({ error: "title and content required" });
    return;
  }
  if (cleanCategory === null) {
    res.status(400).json({ error: "topic must be text of at most 100 characters" });
    return;
  }
  const userId = getSessionUserId(req)!;
  const safeAuthorName = await resolveMemberDisplayName(userId, authorName);
  const [disc] = await db.insert(discussionsTable).values({
    title: cleanTitle.slice(0, 300),
    content: cleanContent.slice(0, 30000),
    category: cleanCategory ? `u:${cleanCategory}` : "",
    authorId: userId,
    authorName: safeAuthorName,
  }).returning();
  await logActivity("discussion", `Started discussion "${disc.title}"`, safeAuthorName);
  res.status(201).json(disc);
});

router.get("/discussions/:id", requireAuth, async (req, res): Promise<void> => {
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
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (title !== undefined) {
    const clean = String(title).trim();
    if (!clean) { res.status(400).json({ error: "title required" }); return; }
    updates.title = clean.slice(0, 300);
  }
  if (content !== undefined) {
    const clean = String(content).trim();
    if (!clean) { res.status(400).json({ error: "content required" }); return; }
    updates.content = clean.slice(0, 30000);
  }
  if (category !== undefined) {
    const clean = cleanForumTopic(category);
    if (clean === null) { res.status(400).json({ error: "topic must be text of at most 100 characters" }); return; }
    updates.category = clean ? `u:${clean}` : "";
  }
  if (isPinned !== undefined) {
    if (!isStaffRole(getSessionUserRole(req))) {
      res.status(403).json({ error: "Only staff can pin discussions" });
      return;
    }
    updates.isPinned = !!isPinned;
  }

  const [disc] = await db.update(discussionsTable).set(updates).where(eq(discussionsTable.id, id)).returning();
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
  const commentIds = (await db.select({ id: commentsTable.id })
    .from(commentsTable)
    .where(eq(commentsTable.discussionId, id)))
    .map(row => row.id);

  if (commentIds.length > 0) {
    await db.delete(entityLikesTable).where(and(
      eq(entityLikesTable.entityType, "comment"),
      inArray(entityLikesTable.entityId, commentIds),
    ));
  }
  await db.delete(entityLikesTable).where(and(
    eq(entityLikesTable.entityType, "discussion"),
    eq(entityLikesTable.entityId, id),
  ));
  await db.delete(commentsTable).where(eq(commentsTable.discussionId, id));
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

router.get("/discussions/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const comments = await db.select().from(commentsTable).where(eq(commentsTable.discussionId, id)).orderBy(commentsTable.createdAt);
  res.json(comments);
});

router.patch("/discussions/:id/comments/:commentId", requireAuth, async (req, res): Promise<void> => {
  const discussionId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const [comment] = await db.select().from(commentsTable).where(and(
    eq(commentsTable.id, commentId),
    eq(commentsTable.discussionId, discussionId),
  ));
  if (!comment) { res.status(404).json({ error: "Not found" }); return; }
  if (comment.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const content = String(req.body?.content || "").trim();
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  if (content.length > 10000) { res.status(400).json({ error: "comment is too long" }); return; }

  const [updated] = await db.update(commentsTable)
    .set({ content })
    .where(eq(commentsTable.id, commentId))
    .returning();
  res.json(updated);
});

router.delete("/discussions/:id/comments/:commentId", requireAuth, async (req, res): Promise<void> => {
  const discussionId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const [comment] = await db.select().from(commentsTable).where(and(
    eq(commentsTable.id, commentId),
    eq(commentsTable.discussionId, discussionId),
  ));
  if (!comment) { res.status(404).json({ error: "Not found" }); return; }
  if (comment.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const allComments = await db.select().from(commentsTable)
    .where(eq(commentsTable.discussionId, discussionId));
  const idsToDelete = new Set<number>([commentId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of allComments) {
      if (item.parentId !== null && idsToDelete.has(item.parentId) && !idsToDelete.has(item.id)) {
        idsToDelete.add(item.id);
        changed = true;
      }
    }
  }
  const deleteIds = Array.from(idsToDelete);

  if (deleteIds.length > 0) {
    await db.delete(entityLikesTable).where(and(
      eq(entityLikesTable.entityType, "comment"),
      inArray(entityLikesTable.entityId, deleteIds),
    ));
    await db.delete(commentsTable).where(inArray(commentsTable.id, deleteIds));
    await db.update(discussionsTable)
      .set({ commentCount: sql`GREATEST(0, ${discussionsTable.commentCount} - ${deleteIds.length})` })
      .where(eq(discussionsTable.id, discussionId));
  }
  res.sendStatus(204);
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
  const cleanContent = String(content || "").trim();
  if (!cleanContent) { res.status(400).json({ error: "content required" }); return; }
  if (cleanContent.length > 10000) { res.status(400).json({ error: "comment is too long" }); return; }

  const [discussion] = await db.select().from(discussionsTable).where(eq(discussionsTable.id, discussionId));
  if (!discussion) { res.status(404).json({ error: "Discussion not found" }); return; }
  if (discussion.isLocked) { res.status(423).json({ error: "Discussion is locked" }); return; }

  const userId = getSessionUserId(req)!;

  let parent: typeof commentsTable.$inferSelect | null = null;
  if (parentId !== undefined && parentId !== null) {
    const parsedParentId = Number(parentId);
    if (!Number.isInteger(parsedParentId)) {
      res.status(400).json({ error: "invalid parent comment" });
      return;
    }
    [parent] = await db.select().from(commentsTable).where(and(
      eq(commentsTable.id, parsedParentId),
      eq(commentsTable.discussionId, discussionId),
    ));
    if (!parent) {
      res.status(400).json({ error: "parent comment does not belong to this discussion" });
      return;
    }
  }

  const safeAuthorName = await resolveMemberDisplayName(userId, authorName);
  const engagement = await getEngagementSetting("forum");

  if (engagement.replyMode === "off") {
    res.status(403).json({ error: "Replies are currently disabled for this section" });
    return;
  }

  if (engagement.replyMode === "review") {
    const member = await getMemberIdentity(userId);
    const payload = {
      discussionId,
      content: cleanContent,
      parentId: parent?.id ?? null,
      authorId: userId,
      authorName: safeAuthorName,
      createdAt: new Date().toISOString(),
    };

    const [pending] = await db.insert(supportMessagesTable).values({
      userId,
      name: safeAuthorName,
      email: member?.email || member?.phone || "Gavhah member",
      type: "__pending_comment__",
      subject: `forum:${discussionId}`,
      message: JSON.stringify(payload),
      status: "open",
    }).returning();

    await notifyStaff(
      `Forum reply waiting for review: ${discussion.title}`,
      "/founder",
      "admin_comment_review",
    );

    res.status(202).json({
      pending: true,
      reviewId: pending.id,
      message: "Reply submitted for review",
    });
    return;
  }

  const [comment] = await db.insert(commentsTable).values({
    content: cleanContent,
    discussionId,
    parentId: parent?.id ?? null,
    authorId: userId,
    authorName: safeAuthorName,
  }).returning();

  if (discussion.authorId !== userId) {
    await notifyUser(
      discussion.authorId,
      "discussion_reply",
      `${safeAuthorName} replied to your discussion "${discussion.title}".`,
      `/forum/${discussionId}`,
    );
  }

  if (parent) {
    if (parent.authorId !== userId && parent.authorId !== discussion.authorId) {
      await notifyUser(
        parent.authorId,
        "comment_reply",
        `${safeAuthorName} replied to your forum comment.`,
        `/forum/${discussionId}`,
      );
    }
  }

  await db.update(discussionsTable).set({ commentCount: sql`${discussionsTable.commentCount} + 1` }).where(eq(discussionsTable.id, discussionId));
  res.status(201).json(comment);
});

export default router;
