import { Router, type IRouter } from "express";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, groupPostsTable, usersTable, entityLikesTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole, getCurrentSessionUser } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { resolveMemberDisplayName } from "../lib/user-display";
import { deleteManagedMediaUrl } from "../lib/media-cleanup";
import { logActivity } from "../lib/activity";
import { notifyUser } from "../lib/notify";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

router.get("/groups", async (req, res): Promise<void> => {
  const { search, privacy } = req.query as Record<string, string>;
  let all = await db.select().from(groupsTable).orderBy(desc(groupsTable.createdAt));
  if (privacy) all = all.filter(g => g.privacy === privacy);
  if (search) all = all.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const { name, description, privacy, imageUrl } = req.body;
  if (!String(name || "").trim() || !String(description || "").trim()) {
    res.status(400).json({ error: "name and description required" });
    return;
  }
  if (privacy && !["public", "private"].includes(privacy)) {
    res.status(400).json({ error: "invalid privacy setting" });
    return;
  }
  const userId = getSessionUserId(req)!;
  const ownerName = await resolveMemberDisplayName(userId);
  const [group] = await db.insert(groupsTable).values({
    name: String(name).trim().slice(0, 200),
    description: String(description).trim().slice(0, 5000),
    privacy: privacy || "public",
    imageUrl: imageUrl || null,
    ownerId: userId,
    ownerName,
    memberCount: 1,
  }).returning();

  await db.insert(groupMembersTable).values({
    userId,
    userName: ownerName,
    groupId: group.id,
    role: "owner",
    status: "approved",
  }).onConflictDoNothing();

  await logActivity("group", `Created community group "${group.name}"`, ownerName);
  res.status(201).json(group);
});

router.get("/groups/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Not found" }); return; }
  res.json(group);
});

router.patch("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.ownerId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  const { name, description, privacy, imageUrl } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (!cleanName) { res.status(400).json({ error: "name required" }); return; }
    updates.name = cleanName.slice(0, 200);
  }
  if (description !== undefined) {
    const cleanDescription = String(description).trim();
    if (!cleanDescription) { res.status(400).json({ error: "description required" }); return; }
    updates.description = cleanDescription.slice(0, 5000);
  }
  if (privacy !== undefined) {
    if (!["public", "private"].includes(privacy)) {
      res.status(400).json({ error: "invalid privacy setting" }); return;
    }
    updates.privacy = privacy;
  }
  if (imageUrl !== undefined) updates.imageUrl = imageUrl || null;

  const [group] = await db.update(groupsTable).set(updates).where(eq(groupsTable.id, id)).returning();
  if (!group) { res.status(404).json({ error: "Not found" }); return; }

  if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== group.imageUrl) {
    await deleteManagedMediaUrl(existing.imageUrl);
  }

  if (privacy !== undefined && existing.privacy === "private" && group.privacy === "public") {
    const approvedNow = await db.update(groupMembersTable)
      .set({ status: "approved" })
      .where(and(
        eq(groupMembersTable.groupId, id),
        eq(groupMembersTable.status, "pending"),
      ))
      .returning();

    if (approvedNow.length > 0) {
      await db.update(groupsTable)
        .set({ memberCount: sql`${groupsTable.memberCount} + ${approvedNow.length}` })
        .where(eq(groupsTable.id, id));

      for (const member of approvedNow) {
        await notifyUser(
          member.userId,
          "group_membership_review",
          `Your request to join "${group.name}" was approved because the group is now public.`,
          `/groups/${id}`,
        );
      }
    }
  }

  res.json(group);
});

router.delete("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.ownerId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  const postIds = (await db.select({ id: groupPostsTable.id })
    .from(groupPostsTable)
    .where(eq(groupPostsTable.groupId, id)))
    .map(row => row.id);

  if (postIds.length > 0) {
    await db.delete(entityLikesTable).where(and(
      eq(entityLikesTable.entityType, "group_post"),
      inArray(entityLikesTable.entityId, postIds),
    ));
  }
  await db.delete(groupPostsTable).where(eq(groupPostsTable.groupId, id));
  await db.delete(groupMembersTable).where(eq(groupMembersTable.groupId, id));
  await db.delete(groupsTable).where(eq(groupsTable.id, id));
  await deleteManagedMediaUrl(existing.imageUrl);
  res.sendStatus(204);
});

router.post("/groups/:id/join", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const userId = getSessionUserId(req)!;

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const desiredStatus = group.privacy === "private" ? "pending" : "approved";
  const [existing] = await db.select().from(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId))
  );

  if (existing && existing.status === "approved") {
    res.json(existing);
    return;
  }
  if (existing && existing.status === "pending" && desiredStatus === "pending") {
    res.json(existing);
    return;
  }

  const userName = await resolveMemberDisplayName(userId);
  let member;

  if (existing) {
    [member] = await db.update(groupMembersTable)
      .set({ status: desiredStatus, role: "member", userName })
      .where(eq(groupMembersTable.id, existing.id))
      .returning();
  } else {
    [member] = await db.insert(groupMembersTable).values({
      userId,
      userName,
      groupId,
      role: "member",
      status: desiredStatus,
    }).returning();
  }

  if (desiredStatus === "approved") {
    await db.update(groupsTable)
      .set({ memberCount: sql`${groupsTable.memberCount} + 1` })
      .where(eq(groupsTable.id, groupId));
  }

  if (group.ownerId !== userId) {
    await notifyUser(
      group.ownerId,
      desiredStatus === "pending" ? "group_join_request" : "group_join",
      desiredStatus === "pending"
        ? `${userName} requested to join your private group "${group.name}".`
        : `${userName} joined your group "${group.name}".`,
      `/groups/${groupId}`,
    );
  }

  res.json(member);
});

router.get("/groups/:id/members", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  if (group.privacy === "public") {
    const members = await db.select().from(groupMembersTable).where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.status, "approved"),
    ));
    res.json(members);
    return;
  }

  const userId = getSessionUserId(req);
  if (!userId) {
    res.json([]);
    return;
  }

  const currentUser = await getCurrentSessionUser(req);
  if (!currentUser) {
    res.json([]);
    return;
  }

  if (group.ownerId === currentUser.id || isStaffRole(currentUser.role)) {
    const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
    res.json(members);
    return;
  }

  const [membership] = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.userId, userId),
  ));

  if (!membership) {
    res.json([]);
    return;
  }

  if (membership.status !== "approved") {
    res.json([membership]);
    return;
  }

  const members = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.status, "approved"),
  ));
  res.json(members);
});

router.patch("/groups/:id/members/:memberId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const requesterId = getSessionUserId(req)!;
  if (group.ownerId !== requesterId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Only the group owner can review membership requests" });
    return;
  }

  const [member] = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.id, memberId),
    eq(groupMembersTable.groupId, groupId),
  ));
  if (!member) { res.status(404).json({ error: "Membership request not found" }); return; }

  const status = String(req.body?.status || "");
  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Status must be approved or rejected" });
    return;
  }
  if (member.status !== "pending") {
    res.status(409).json({ error: "This membership request has already been reviewed" });
    return;
  }

  const [updated] = await db.update(groupMembersTable)
    .set({ status })
    .where(eq(groupMembersTable.id, memberId))
    .returning();

  if (status === "approved") {
    await db.update(groupsTable)
      .set({ memberCount: sql`${groupsTable.memberCount} + 1` })
      .where(eq(groupsTable.id, groupId));
  }

  await notifyUser(
    updated.userId,
    "group_membership_review",
    status === "approved"
      ? `Your request to join "${group.name}" was approved.`
      : `Your request to join "${group.name}" was not approved.`,
    `/groups/${groupId}`,
  );

  res.json(updated);
});

router.get("/groups/:id/posts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Not found" }); return; }

  if (group.privacy !== "public") {
    const userId = getSessionUserId(req);
    if (!userId) { res.status(401).json({ error: "Sign in required" }); return; }

    const currentUser = await getCurrentSessionUser(req);
    if (!currentUser) { res.status(401).json({ error: "Sign in required" }); return; }

    const [membership] = await db.select().from(groupMembersTable).where(and(
      eq(groupMembersTable.groupId, id),
      eq(groupMembersTable.userId, currentUser.id),
      eq(groupMembersTable.status, "approved"),
    ));
    if (!membership && group.ownerId !== currentUser.id && !isStaffRole(currentUser.role)) {
      res.status(403).json({ error: "Private group" }); return;
    }
  }

  const posts = await db.select().from(groupPostsTable).where(eq(groupPostsTable.groupId, id)).orderBy(desc(groupPostsTable.createdAt));
  res.json(posts);
});

router.patch("/groups/:id/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const postId = Number(req.params.postId);
  const [post] = await db.select().from(groupPostsTable).where(and(
    eq(groupPostsTable.id, postId),
    eq(groupPostsTable.groupId, groupId),
  ));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  if (post.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const content = String(req.body?.content || "").trim();
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  if (content.length > 10000) { res.status(400).json({ error: "content is too long" }); return; }

  const [updated] = await db.update(groupPostsTable)
    .set({ content })
    .where(eq(groupPostsTable.id, postId))
    .returning();
  res.json(updated);
});

router.delete("/groups/:id/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const postId = Number(req.params.postId);
  const [post] = await db.select().from(groupPostsTable).where(and(
    eq(groupPostsTable.id, postId),
    eq(groupPostsTable.groupId, groupId),
  ));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  if (post.authorId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  await db.delete(entityLikesTable).where(and(
    eq(entityLikesTable.entityType, "group_post"),
    eq(entityLikesTable.entityId, postId),
  ));
  await db.delete(groupPostsTable).where(eq(groupPostsTable.id, postId));
  await db.update(groupsTable)
    .set({ postCount: sql`GREATEST(0, ${groupsTable.postCount} - 1)` })
    .where(eq(groupsTable.id, groupId));
  res.sendStatus(204);
});

router.post("/groups/:id/posts/:postId/like", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const postId = Number(req.params.postId);
  const [post] = await db.select({ id: groupPostsTable.id, likes: groupPostsTable.likes })
    .from(groupPostsTable)
    .where(and(eq(groupPostsTable.id, postId), eq(groupPostsTable.groupId, groupId)));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Not found" }); return; }

  const userId = getSessionUserId(req)!;
  if (group.privacy === "private" && group.ownerId !== userId && !isStaffRole(getSessionUserRole(req))) {
    const [membership] = await db.select().from(groupMembersTable).where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.userId, userId),
      eq(groupMembersTable.status, "approved"),
    ));
    if (!membership) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  const state = await setLikeState(userId, "group_post", postId);
  let likes = post.likes;
  if (state.changed) {
    const [updated] = await db.update(groupPostsTable)
      .set({ likes: sql`GREATEST(0, ${groupPostsTable.likes} + ${state.delta})` })
      .where(eq(groupPostsTable.id, postId))
      .returning({ likes: groupPostsTable.likes });
    likes = updated.likes;
  }
  res.json({ likes, liked: state.liked });
});

router.post("/groups/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const userId = getSessionUserId(req)!;
  const { content, authorName } = req.body;
  const cleanContent = String(content || "").trim();
  if (!cleanContent) { res.status(400).json({ error: "content required" }); return; }
  if (cleanContent.length > 10000) { res.status(400).json({ error: "content is too long" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const [membership] = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.userId, userId),
    eq(groupMembersTable.status, "approved"),
  ));
  if (!membership && group.ownerId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Join this group before posting" });
    return;
  }

  const safeAuthorName = await resolveMemberDisplayName(userId, authorName);
  const [post] = await db.insert(groupPostsTable).values({
    content: cleanContent,
    groupId,
    authorId: userId,
    authorName: safeAuthorName,
  }).returning();

  await db.update(groupsTable)
    .set({ postCount: sql`${groupsTable.postCount} + 1` })
    .where(eq(groupsTable.id, groupId));

  res.status(201).json(post);
});

export default router;
