import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, volunteerProfilesTable, helpRequestsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { getMemberIdentity, resolveMemberDisplayName } from "../lib/user-display";

const router: IRouter = Router();

function publicHelpRequest<T extends { contactInfo?: unknown }>(request: T) {
  const { contactInfo: _contactInfo, ...safe } = request as T & { contactInfo?: unknown };
  return safe;
}

router.get("/featured/volunteers", async (_req, res): Promise<void> => {
  const featured = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.isFeatured, true)).limit(4);
  res.json(featured);
});

router.get("/featured/requests", async (_req, res): Promise<void> => {
  const featured = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.isFeatured, true)).limit(4);
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

router.get("/admin/help-requests", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(helpRequestsTable);
  res.json(all);
});

router.get("/help-requests", async (req, res): Promise<void> => {
  const { type, urgency } = req.query as Record<string, string>;
  let all = await db.select().from(helpRequestsTable);
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
    status: "open",
  }).returning();

  res.status(201).json(publicHelpRequest(request));
});

router.get("/help-requests/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [request] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  res.json(publicHelpRequest(request));
});

router.patch("/help-requests/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { status, isFeatured } = req.body;
  const [request] = await db.update(helpRequestsTable).set({ status, isFeatured }).where(eq(helpRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  res.json(request);
});

export default router;
