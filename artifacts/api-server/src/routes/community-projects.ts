import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, communityProjectsTable, projectMembersTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { notifyUser } from "../lib/notify";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

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
  const userId = getSessionUserId(req)!;
  const { title, description, type, organizerName, location, goalDescription } = req.body;
  if (!String(title || "").trim() || !String(description || "").trim()) {
    res.status(400).json({ error: "title and description are required" });
    return;
  }

  const safeOrganizerName = await resolveMemberDisplayName(userId, organizerName);
  const [project] = await db.insert(communityProjectsTable).values({
    ownerId: userId,
    title: String(title).trim(),
    description: String(description).trim(),
    type: type || "project",
    organizerName: safeOrganizerName,
    location: location ? String(location).trim() : null,
    goalDescription: goalDescription ? String(goalDescription).trim() : null,
    status: "active",
  }).returning();

  await db.insert(projectMembersTable).values({
    userId,
    projectId: project.id,
    name: safeOrganizerName,
    role: "organizer",
    message: null,
  }).onConflictDoNothing();

  await logActivity("project", `Created community project "${project.title}"`, safeOrganizerName);
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
router.patch("/community-projects/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.ownerId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  const { title, description, type, organizerName, location, goalDescription, status } = req.body;
  const [project] = await db.update(communityProjectsTable)
    .set({ title, description, type, organizerName, location, goalDescription, status })
    .where(eq(communityProjectsTable.id, id))
    .returning();
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

// DELETE /community-projects/:id
router.delete("/community-projects/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.ownerId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(projectMembersTable).where(eq(projectMembersTable.projectId, id));
  await db.delete(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  res.sendStatus(204);
});

// POST /community-projects/:id/join
router.post("/community-projects/:id/join", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  const userId = getSessionUserId(req)!;
  const { name, role, message } = req.body;
  if (!role) { res.status(400).json({ error: "role required" }); return; }

  const [project] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [existing] = await db.select().from(projectMembersTable).where(and(
    eq(projectMembersTable.projectId, projectId),
    eq(projectMembersTable.userId, userId),
  ));
  if (existing) { res.json(existing); return; }

  const safeName = await resolveMemberDisplayName(userId, name);
  const [member] = await db.insert(projectMembersTable).values({
    userId,
    projectId,
    name: safeName,
    role,
    message: message ? String(message).trim() : null,
  }).returning();

  if (project.ownerId !== userId) {
    await notifyUser(
      project.ownerId,
      "project_join",
      `${safeName} joined your project "${project.title}".`,
      "/directory",
    );
  }

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
