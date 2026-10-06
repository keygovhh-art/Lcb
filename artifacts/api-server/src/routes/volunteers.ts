import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, volunteerProfilesTable, helpRequestsTable, notificationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { getMemberIdentity, resolveMemberDisplayName } from "../lib/user-display";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

function publicHelpRequest<T extends { contactInfo?: unknown }>(request: T) {
  const { contactInfo: _contactInfo, ...safe } = request as T & { contactInfo?: unknown };
  return safe;
}

router.get("/featured/volunteers", async (_req, res): Promise<void> => {
  const featured = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.isFeatured, true)).limit(4);
  res.json(featured);
});

router.get("/featured/requests", async (_req, res): Promise<void> => {
  const featured = await db.select().from(helpRequestsTable).where(and(
    eq(helpRequestsTable.isFeatured, true),
    eq(helpRequestsTable.status, "open"),
  )).limit(4);
  res.json(featured.map(publicHelpRequest));
});

router.get("/volunteers", async (req, res): Promise<void> => {
  const { location, search } = req.query as Record<string, string>;
  let all = await db.select().from(volunteerProfilesTable);
  if (location) all = all.filter(v => v.location.toLowerCase().includes(location.toLowerCase()));
  if (search) all = all.filter(v => v.userName.toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/volunteers", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const { userName, skills, availability, location, bio, areasOfInterest } = req.body;
  if (!availability || !String(location || "").trim()) {
    res.status(400).json({ error: "availability and location required" });
    return;
  }

  const [existing] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.userId, userId));
  if (existing) {
    res.status(409).json({ error: "You are already registered as a volunteer" });
    return;
  }

  const safeUserName = await resolveMemberDisplayName(userId, userName);
  const [vol] = await db.insert(volunteerProfilesTable).values({
    userId,
    userName: safeUserName,
    skills: Array.isArray(skills) ? skills : [],
    availability: String(availability),
    bio: bio ? String(bio).trim() : null,
    location: String(location).trim(),
    areasOfInterest: Array.isArray(areasOfInterest) ? areasOfInterest : [],
    labels: [],
    isFeatured: false,
  }).returning();
  res.status(201).json(vol);
});

router.get("/volunteers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [vol] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  if (!vol) { res.status(404).json({ error: "Not found" }); return; }
  res.json(vol);
});

router.patch("/volunteers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const { userName, skills, availability, location, bio, areasOfInterest, isFeatured } = req.body;
  const updates: Record<string, unknown> = {};
  if (userName !== undefined) updates.userName = await resolveMemberDisplayName(existing.userId, userName);
  if (Array.isArray(skills)) updates.skills = skills;
  if (availability !== undefined) updates.availability = String(availability);
  if (location !== undefined) {
    if (!String(location).trim()) { res.status(400).json({ error: "location required" }); return; }
    updates.location = String(location).trim();
  }
  if (bio !== undefined) updates.bio = bio ? String(bio).trim() : null;
  if (Array.isArray(areasOfInterest)) updates.areasOfInterest = areasOfInterest;
  if (isStaffRole(getSessionUserRole(req)) && isFeatured !== undefined) updates.isFeatured = !!isFeatured;

  const [updated] = await db.update(volunteerProfilesTable)
    .set(updates)
    .where(eq(volunteerProfilesTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/volunteers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  res.sendStatus(204);
});

router.get("/admin/help-requests", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(helpRequestsTable);
  res.json(all);
});

router.get("/help-requests", async (req, res): Promise<void> => {
  const { type, urgency } = req.query as Record<string, string>;
  let all = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.status, "open"));
  if (type) all = all.filter(r => r.needType === type);
  if (urgency) all = all.filter(r => r.urgency === urgency);
  res.json(all.map(publicHelpRequest));
});

router.post("/help-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const { name, needType, description, urgency, location } = req.body;
  if (!String(name || "").trim() || !needType || !String(description || "").trim()) {
    res.status(400).json({ error: "name, needType, and description are required" });
    return;
  }

  const user = await getMemberIdentity(userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const contactInfo = user.email || user.phone || `Gavhah member #${userId}`;

  const [request] = await db.insert(helpRequestsTable).values({
    userId,
    name: String(name).trim(),
    contactInfo,
    location: location ? String(location).trim() : null,
    needType,
    description: String(description).trim(),
    urgency: urgency || "medium",
    isFeatured: false,
    status: "pending",
  }).returning();

  res.status(201).json(publicHelpRequest(request));
});

router.get("/help-requests/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [request] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }

  if (request.status !== "open") {
    const userId = getSessionUserId(req);
    if (userId !== request.userId && !isStaffRole(getSessionUserRole(req))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  res.json(publicHelpRequest(request));
});

router.patch("/help-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const role = getSessionUserRole(req);
  const [existing] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(role)) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const { name, location, needType, description, urgency, status, isFeatured } = req.body;
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (!String(name).trim()) { res.status(400).json({ error: "name required" }); return; }
    updates.name = String(name).trim();
  }
  if (location !== undefined) updates.location = location ? String(location).trim() : null;
  if (needType !== undefined) updates.needType = needType;
  if (description !== undefined) {
    if (!String(description).trim()) { res.status(400).json({ error: "description required" }); return; }
    updates.description = String(description).trim();
  }
  if (urgency !== undefined) updates.urgency = urgency;

  if (isStaffRole(role)) {
    if (status !== undefined) updates.status = status;
    if (isFeatured !== undefined) updates.isFeatured = !!isFeatured;
  }

  const [request] = await db.update(helpRequestsTable)
    .set(updates)
    .where(eq(helpRequestsTable.id, id))
    .returning();

  if (isStaffRole(role) && status !== undefined && status !== existing.status) {
    const decisionMessage =
      status === "open" ? `Your help request "${request.name}" was approved and is now public.` :
      status === "rejected" ? `Your help request "${request.name}" was not approved for public listing.` :
      status === "resolved" ? `Your help request "${request.name}" was marked resolved.` :
      null;

    if (decisionMessage) {
      await db.insert(notificationsTable).values({
        userId: request.userId,
        type: "help_request",
        message: decisionMessage,
        linkUrl: "/directory",
        isRead: false,
      });
    }
  }

  res.json(isStaffRole(role) ? request : publicHelpRequest(request));
});

router.delete("/help-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  res.sendStatus(204);
});

export default router;
