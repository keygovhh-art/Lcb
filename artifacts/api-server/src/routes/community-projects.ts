import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, communityProjectsTable, projectMembersTable, supportMessagesTable, askanuscases, caseActivityLog } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { resolveMemberDisplayName, getMemberIdentity } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { notifyUser, notifyStaff, queueStaffReview } from "../lib/notify";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator" || role === "super_admin";
}

const PROJECT_TYPES = new Set(["project", "campaign", "initiative", "program"]);
const PROJECT_STATUSES = new Set(["active", "completed"]);
const PROJECT_MEMBER_ROLES = new Set(["volunteer", "supporter", "organizer", "donor"]);

function routeId(value: string | string[]) {
  return Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
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
  const cleanTitle = String(title || "").trim();
  const cleanDescription = String(description || "").trim();
  const cleanType = String(type || "project");
  if (!cleanTitle || !cleanDescription) {
    res.status(400).json({ error: "title and description are required" });
    return;
  }
  if (!PROJECT_TYPES.has(cleanType)) {
    res.status(400).json({ error: "invalid project type" });
    return;
  }

  const safeOrganizerName = await resolveMemberDisplayName(userId, organizerName);
  // An organizer joins their own project automatically, so their private
  // My Askanus case must be created in the very same transaction.
  const project = await db.transaction(async tx => {
    const [created] = await tx.insert(communityProjectsTable).values({
      ownerId: userId, title: cleanTitle.slice(0, 240),
      description: cleanDescription.slice(0, 5000), type: cleanType,
      organizerName: safeOrganizerName,
      location: location ? String(location).trim().slice(0, 200) : null,
      goalDescription: goalDescription ? String(goalDescription).trim().slice(0, 1000) : null,
      status: "active",
    }).returning();
    await tx.insert(projectMembersTable).values({
      userId, projectId: created.id, name: safeOrganizerName,
      role: "organizer", message: null,
    });
    const [personal] = await tx.insert(askanuscases).values({
      userId, title: created.title, description: created.description,
      category: "General", contactName: safeOrganizerName,
      notes: "Your organized community project. Add tasks, follow-ups and actual work here.",
      sourceType: "community_project", sourceId: created.id,
    }).onConflictDoNothing().returning();
    if (personal) await tx.insert(caseActivityLog).values({
      caseId: personal.id, date: new Date().toISOString().slice(0, 10),
      type: "status_change", note: "Created and joined official community project",
    });
    return created;
  });

  await logActivity("project", `Created community project "${project.title}"`, safeOrganizerName);
  const creator = await getMemberIdentity(userId);
  await queueStaffReview({
    userId,
    name: safeOrganizerName,
    contact: creator?.email || creator?.phone,
    type: "project_creation",
    subject: `New community project: ${project.title}`,
    message: [
      `Organizer: ${safeOrganizerName}`,
      `Type: ${project.type}`,
      project.location ? `Location: ${project.location}` : "",
      `Description: ${project.description}`,
    ].filter(Boolean).join("\n"),
    notificationType: "admin_project_creation",
  });
  res.status(201).json(project);
});

// GET /community-projects/:id
router.get("/community-projects/:id", async (req, res): Promise<void> => {
  const id = routeId(req.params.id);
  const [project] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

// PATCH /community-projects/:id
router.patch("/community-projects/:id", requireAuth, async (req, res): Promise<void> => {
  const id = routeId(req.params.id);
  const [existing] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.ownerId !== getSessionUserId(req)! && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  const { title, description, type, organizerName, location, goalDescription, status } = req.body;
  const updates: Record<string, unknown> = {};

  if (title !== undefined) {
    const clean = String(title).trim();
    if (!clean) { res.status(400).json({ error: "title required" }); return; }
    updates.title = clean.slice(0, 240);
  }
  if (description !== undefined) {
    const clean = String(description).trim();
    if (!clean) { res.status(400).json({ error: "description required" }); return; }
    updates.description = clean.slice(0, 5000);
  }
  if (type !== undefined) {
    const clean = String(type);
    if (!PROJECT_TYPES.has(clean)) { res.status(400).json({ error: "invalid project type" }); return; }
    updates.type = clean;
  }
  if (organizerName !== undefined) {
    updates.organizerName = await resolveMemberDisplayName(existing.ownerId, organizerName);
  }
  if (location !== undefined) updates.location = location ? String(location).trim().slice(0, 200) : null;
  if (goalDescription !== undefined) updates.goalDescription = goalDescription ? String(goalDescription).trim().slice(0, 1000) : null;
  if (status !== undefined) {
    const clean = String(status);
    if (!PROJECT_STATUSES.has(clean)) { res.status(400).json({ error: "invalid project status" }); return; }
    updates.status = clean;
  }

  const [project] = await db.update(communityProjectsTable)
    .set(updates)
    .where(eq(communityProjectsTable.id, id))
    .returning();
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

// DELETE /community-projects/:id
router.delete("/community-projects/:id", requireAuth, async (req, res): Promise<void> => {
  const id = routeId(req.params.id);
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
  const projectId = routeId(req.params.id);
  const userId = getSessionUserId(req)!;
  const { name, role, message } = req.body;
  const cleanRole = String(role || "");
  if (!PROJECT_MEMBER_ROLES.has(cleanRole)) {
    res.status(400).json({ error: "valid role required" });
    return;
  }

  const [project] = await db.select().from(communityProjectsTable).where(eq(communityProjectsTable.id, projectId));
  if (!project || project.status !== "active") {
    res.status(404).json({ error: "Active project not found" });
    return;
  }

  const safeName = await resolveMemberDisplayName(userId, name);
  // Prevent repeated joins from creating duplicate memberships or case files.
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"community_project:" + projectId}), ${userId})`);
    const [existing] = await tx.select().from(projectMembersTable).where(and(
      eq(projectMembersTable.projectId, projectId),
      eq(projectMembersTable.userId, userId),
    )).limit(1);
    const [personal] = await tx.insert(askanuscases).values({
      userId,
      title: project.title.slice(0, 240),
      description: project.description.slice(0, 5000),
      category: "General",
      contactName: project.organizerName.slice(0, 240),
      notes: "Joined community project. Track what you actually do in your private workspace.",
      sourceType: "community_project", sourceId: projectId,
    }).onConflictDoNothing().returning();
    if (personal) await tx.insert(caseActivityLog).values({
      caseId: personal.id, date: new Date().toISOString().slice(0, 10),
      type: "status_change", note: "Joined community project",
    });
    if (existing) return { member: existing, alreadyJoined: true };
    const [member] = await tx.insert(projectMembersTable).values({
      userId, projectId, name: safeName, role: cleanRole,
      message: message ? String(message).trim().slice(0, 1500) : null,
    }).returning();
    return { member, alreadyJoined: false };
  });
  if (result.alreadyJoined) { res.json(result.member); return; }
  const member = result.member;

  if (project.ownerId !== userId) {
    await notifyUser(
      project.ownerId,
      "project_join",
      `${safeName} joined your project "${project.title}".`,
      "/directory",
    );
  }

  const joiningUser = await getMemberIdentity(userId);
  await db.insert(supportMessagesTable).values({
    userId,
    name: safeName,
    email: joiningUser?.email || joiningUser?.phone || "Gavhah member",
    type: "project_join",
    subject: `Project participation: ${project.title}`,
    message: [
      `Member: ${safeName}`,
      `Role: ${cleanRole}`,
      message ? `Message: ${String(message).trim()}` : "",
    ].filter(Boolean).join("\n"),
    status: "open",
  });
  await notifyStaff(`New project participation: ${safeName} → ${project.title}`, "/founder", "admin_project_join");

  res.status(201).json(member);
});

// GET /community-projects/:id/members
router.get("/community-projects/:id/members", async (req, res): Promise<void> => {
  const projectId = routeId(req.params.id);
  const members = await db
    .select()
    .from(projectMembersTable)
    .where(eq(projectMembersTable.projectId, projectId))
    .orderBy(desc(projectMembersTable.createdAt));
  res.json(members);
});

export default router;
