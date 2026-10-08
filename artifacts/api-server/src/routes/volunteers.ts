import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, volunteerProfilesTable, helpRequestsTable, notificationsTable, supportMessagesTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole, getCurrentSessionUser } from "../middlewares/auth";
import { getMemberIdentity, resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

const HELP_TYPES = new Set(["medical", "wedding", "food", "housing", "transportation", "financial", "other"]);
const HELP_URGENCIES = new Set(["low", "medium", "high", "critical"]);
const HELP_STATUSES = new Set(["pending", "open", "rejected", "resolved"]);
const VOLUNTEER_AVAILABILITY = new Set(["weekdays", "evenings", "weekends", "flexible", "on_call", "anytime", "by_appointment"]);

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
  const cleanAvailability = String(availability || "");
  const cleanLocation = String(location || "").trim();
  if (!VOLUNTEER_AVAILABILITY.has(cleanAvailability) || !cleanLocation) {
    res.status(400).json({ error: "valid availability and location required" });
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
    skills: Array.isArray(skills) ? skills.slice(0, 30).map(v => String(v).slice(0, 100)) : [],
    availability: cleanAvailability,
    bio: bio ? String(bio).trim().slice(0, 3000) : null,
    location: cleanLocation.slice(0, 200),
    areasOfInterest: Array.isArray(areasOfInterest) ? areasOfInterest.slice(0, 30).map(v => String(v).slice(0, 100)) : [],
    labels: [],
    isFeatured: false,
  }).returning();
  await logActivity("volunteer", `${safeUserName} registered as a volunteer`, safeUserName);

  const volunteerUser = await getMemberIdentity(userId);
  await db.insert(supportMessagesTable).values({
    userId,
    name: safeUserName,
    email: volunteerUser?.email || volunteerUser?.phone || "Gavhah member",
    type: "volunteer_registration",
    subject: `New volunteer registration: ${safeUserName}`,
    message: [
      `Location: ${cleanLocation}`,
      `Availability: ${cleanAvailability}`,
      Array.isArray(skills) && skills.length ? `Skills: ${skills.join(", ")}` : "",
      Array.isArray(areasOfInterest) && areasOfInterest.length ? `Areas: ${areasOfInterest.join(", ")}` : "",
      bio ? `Bio: ${String(bio).trim()}` : "",
    ].filter(Boolean).join("\n"),
    status: "open",
  });

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
  const cleanName = String(name || "").trim();
  const cleanNeedType = String(needType || "");
  const cleanDescription = String(description || "").trim();
  const cleanUrgency = String(urgency || "medium");
  if (!cleanName || !cleanDescription || !HELP_TYPES.has(cleanNeedType)) {
    res.status(400).json({ error: "name, valid needType, and description are required" });
    return;
  }
  if (!HELP_URGENCIES.has(cleanUrgency)) {
    res.status(400).json({ error: "invalid urgency" });
    return;
  }

  const user = await getMemberIdentity(userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const contactInfo = user.email || user.phone || `Gavhah member #${userId}`;

  const [request] = await db.insert(helpRequestsTable).values({
    userId,
    name: cleanName.slice(0, 200),
    contactInfo,
    location: location ? String(location).trim().slice(0, 200) : null,
    needType: cleanNeedType,
    description: cleanDescription.slice(0, 5000),
    urgency: cleanUrgency,
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
    const currentUser = await getCurrentSessionUser(req);
    if (!currentUser || (currentUser.id !== request.userId && !isStaffRole(currentUser.role))) {
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
  if (location !== undefined) updates.location = location ? String(location).trim().slice(0, 200) : null;
  if (needType !== undefined) {
    const clean = String(needType);
    if (!HELP_TYPES.has(clean)) { res.status(400).json({ error: "invalid needType" }); return; }
    updates.needType = clean;
  }
  if (description !== undefined) {
    if (!String(description).trim()) { res.status(400).json({ error: "description required" }); return; }
    updates.description = String(description).trim().slice(0, 5000);
  }
  if (urgency !== undefined) {
    const clean = String(urgency);
    if (!HELP_URGENCIES.has(clean)) { res.status(400).json({ error: "invalid urgency" }); return; }
    updates.urgency = clean;
  }

  if (isStaffRole(role)) {
    if (status !== undefined) {
      const clean = String(status);
      if (!HELP_STATUSES.has(clean)) { res.status(400).json({ error: "invalid status" }); return; }
      updates.status = clean;
    }
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

    if (status === "open" && existing.status === "pending") {
      await logActivity("help_request", "A new help request was approved for the directory", request.name);
    }

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
