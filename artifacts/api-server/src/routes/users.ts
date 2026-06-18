import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, discussionsTable, helpRequestsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { hashPassword } from "../lib/crypto";

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
  const { name, nickname, email, phone, password, location, bio } = req.body as Record<string, string>;

  if (!nickname) {
    res.status(400).json({ error: "nickname is required" });
    return;
  }
  if (!email && !phone) {
    res.status(400).json({ error: "email or phone is required" });
    return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "password must be at least 6 characters" });
    return;
  }

  if (email) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (existing) { res.status(409).json({ error: "Email already registered" }); return; }
  }
  if (phone) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone.trim()));
    if (existing) { res.status(409).json({ error: "Phone number already registered" }); return; }
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(usersTable).values({
    name: name?.trim() || nickname.trim(),
    nickname: nickname.trim(),
    email: email ? email.toLowerCase().trim() : null,
    phone: phone ? phone.trim() : null,
    passwordHash,
    location: location?.trim() || null,
    bio: bio?.trim() || null,
  }).returning();

  res.status(201).json(user);
});

router.get("/users/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (userId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (user) { res.json(user); return; }
  }
  const [user] = await db.select().from(usersTable).limit(1);
  if (!user) { res.status(404).json({ error: "No user found" }); return; }
  res.json(user);
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { name, nickname, bio, location, role, status, preferredLanguage } = req.body;
  const [user] = await db.update(usersTable)
    .set({ name, nickname, bio, location, role, status, preferredLanguage })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

router.post("/users/:id/ban", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [user] = await db.update(usersTable).set({ status: "banned" }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.post("/users/:id/suspend", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [user] = await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.get("/users/:id/dashboard", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id as string, 10);
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
