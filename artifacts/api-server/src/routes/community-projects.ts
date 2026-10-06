import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, communityProjectsTable, projectMembersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// GET /community-projects
router.get("/community-projects", async (req, res): Promise<void> => {
  const { type, status } = req.query as Record<string, string>;
  let all = await db.select().from(communityProjectsTable).orderBy(desc(communityProjectsTable.createdAt));
  if (type) all = all.filter(p => p.type === type);
  if (status) all = all.filter(p => p.status === status);
  res.json(all);
});

// POST /community-projects
router.post("/community-projects", requireAuth, async (req, res): Promise<void> => {
  const { title, description, type, organizerName, location, goalDescription } = req.body;
  if (!title || !description || !organizerName) {
    res.status(400).json({ error: "title, description, and organizerName required" });
    return;
  }
  const [project] = await db.insert(communityProjectsTable).values({
    title, description,
    type: type || "project",
    organizerName,
    location: location || null,
    goalDescription: goalDescription || null,
  }).returning();
  res.status(201).json(project);
});

// GET /community-projects/:id
router.get("/community-projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [project] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

// PATCH /community-projects/:id
router.patch("/community-projects/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { title, description, type, organizerName, location, goalDescription, status } = req.body;
  const [project] = await db.update(communityProjectsTable)
    .set({ title, description, type, organizerName, location, goalDescription, status })
    .where(eq(communityProjectsTable.id, id))
    .returning();
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

// DELETE /community-projects/:id
router.delete("/community-projects/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  res.sendStatus(204);
});

// POST /community-projects/:id/join
router.post("/community-projects/:id/join", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  const { name, role, message } = req.body;
  if (!name || !role) { res.status(400).json({ error: "name and role required" }); return; }
  const [member] = await db.insert(projectMembersTable).values({
    projectId,
    name,
    role,
    message: message || null,
  }).returning();
  res.status(201).json(member);
});

// GET /community-projects/:id/members
router.get("/community-projects/:id/members", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  const members = await db
    .select()
    .from(projectMembersTable)
    .where(eq(projectMembersTable.projectId, projectId))
    .orderBy(desc(projectMembersTable.createdAt));
  res.json(members);
});

export default router;
