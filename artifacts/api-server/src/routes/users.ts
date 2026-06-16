import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, usersTable, discussionsTable, helpRequestsTable, groupsTable } from "@workspace/db";
import { count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/users", async (req, res): Promise<void> => {
  const { role, search } = req.query as Record<string, string>;
  let query = db.select().from(usersTable).$dynamic();
  if (role) query = query.where(eq(usersTable.role, role));
  const users = await query.orderBy(usersTable.createdAt);
  const filtered = search
    ? users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.nickname ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : users;
  res.json(filtered);
});

router.post("/users", async (req, res): Promise<void> => {
  const { name, nickname, email, phone, password, location, bio } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!email && !phone) {
    res.status(400).json({ error: "email or phone is required" });
    return;
  }
  // Check for duplicates
  if (email) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existing) { res.status(409).json({ error: "Email already registered" }); return; }
  }
  if (phone) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone));
    if (existing) { res.status(409).json({ error: "Phone already registered" }); return; }
  }
  const [user] = await db.insert(usersTable).values({
    name,
    nickname: nickname || null,
    email: email || null,
    phone: phone || null,
    passwordHash: password || "",
    location: location || null,
    bio: bio || null,
  }).returning();
  res.status(201).json(user);
});

router.get("/users/me", async (_req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).limit(1);
  if (!user) { res.status(404).json({ error: "No user found" }); return; }
  res.json(user);
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, nickname, bio, location, role, status, preferredLanguage } = req.body;
  const [user] = await db.update(usersTable)
    .set({ name, nickname, bio, location, role, status, preferredLanguage })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

router.post("/users/:id/ban", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.update(usersTable).set({ status: "banned" }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.post("/users/:id/suspend", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.get("/users/:id/dashboard", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = parseInt(raw, 10);
  const [discCount] = await db.select({ count: count() }).from(discussionsTable).where(eq(discussionsTable.authorId, userId));
  const [reqCount] = await db.select({ count: count() }).from(helpRequestsTable);
  res.json({
    userId,
    discussionCount: discCount?.count ?? 0,
    commentCount: 0,
    groupCount: 0,
    helpRequestCount: reqCount?.count ?? 0,
    volunteerActivityCount: 0,
    notificationCount: 0,
    savedCount: 0,
    recentDiscussions: [],
    recentGroups: [],
  });
});

export default router;
