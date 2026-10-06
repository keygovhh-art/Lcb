import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, groupPostsTable, usersTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole } from "../middlewares/auth";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

async function currentDisplayName(userId: number) {
  const [user] = await db.select({ name: usersTable.name, nickname: usersTable.nickname }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.nickname || user?.name || "Community Member";
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
  if (!name || !description) { res.status(400).json({ error: "name and description required" }); return; }
  const userId = getSessionUserId(req)!;
  const ownerName = await currentDisplayName(userId);
  const [group] = await db.insert(groupsTable).values({
    name, description, privacy: privacy || "public", imageUrl,
    ownerId: userId, ownerName,
  }).returning();
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
  const [group] = await db.update(groupsTable).set({ name, description, privacy, imageUrl }).where(eq(groupsTable.id, id)).returning();
  if (!group) { res.status(404).json({ error: "Not found" }); return; }
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
  await db.delete(groupsTable).where(eq(groupsTable.id, id));
  res.sendStatus(204);
});

router.post("/groups/:id/join", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId))
  );
  if (existing) { res.json(existing); return; }

  const userName = await currentDisplayName(userId);
  const [member] = await db.insert(groupMembersTable).values({
    userId, userName,
    groupId, role: "member", status: "approved",
  }).returning();
  await db.update(groupsTable).set({ memberCount: sql`${groupsTable.memberCount} + 1` }).where(eq(groupsTable.id, groupId));
  res.json(member);
});

router.get("/groups/:id/members", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, id));
  res.json(members);
});

router.get("/groups/:id/posts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const posts = await db.select().from(groupPostsTable).where(eq(groupPostsTable.groupId, id)).orderBy(desc(groupPostsTable.createdAt));
  res.json(posts);
});

router.post("/groups/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const { content, authorName } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const [post] = await db.insert(groupPostsTable).values({
    content, groupId, authorId: getSessionUserId(req)!, authorName: authorName || await currentDisplayName(getSessionUserId(req)!),
  }).returning();
  await db.update(groupsTable).set({ postCount: sql`${groupsTable.postCount} + 1` }).where(eq(groupsTable.id, groupId));
  res.status(201).json(post);
});

export default router;
