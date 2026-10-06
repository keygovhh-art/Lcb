import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, volunteerProfilesTable, helpRequestsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/featured/volunteers", async (_req, res): Promise<void> => {
  const featured = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.isFeatured, true)).limit(4);
  res.json(featured);
});

router.get("/featured/requests", async (_req, res): Promise<void> => {
  const featured = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.isFeatured, true)).limit(4);
  res.json(featured);
});

router.get("/volunteers", async (req, res): Promise<void> => {
  const { location, search } = req.query as Record<string, string>;
  let all = await db.select().from(volunteerProfilesTable);
  if (location) all = all.filter(v => v.location.toLowerCase().includes(location.toLowerCase()));
  if (search) all = all.filter(v => v.userName.toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/volunteers", requireAuth, async (req, res): Promise<void> => {
  const { userName, skills, availability, location, areasOfInterest } = req.body;
  if (!availability || !location) { res.status(400).json({ error: "availability and location required" }); return; }
  const [vol] = await db.insert(volunteerProfilesTable).values({
    userId: getSessionUserId(req)!, userName: userName || "Community Member",
    skills: skills || [],
    availability,
    location,
    areasOfInterest: areasOfInterest || [],
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

router.get("/help-requests", async (req, res): Promise<void> => {
  const { type, urgency } = req.query as Record<string, string>;
  let all = await db.select().from(helpRequestsTable);
  if (type) all = all.filter(r => r.needType === type);
  if (urgency) all = all.filter(r => r.urgency === urgency);
  res.json(all);
});

router.post("/help-requests", requireAuth, async (req, res): Promise<void> => {
  const { name, contactInfo, needType, description, urgency } = req.body;
  if (!name || !contactInfo || !needType || !description) {
    res.status(400).json({ error: "Required fields missing" }); return;
  }
  const [request] = await db.insert(helpRequestsTable).values({
    name, contactInfo, needType, description, urgency: urgency || "medium",
    isFeatured: false, status: "open",
  }).returning();
  res.status(201).json(request);
});

router.get("/help-requests/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [request] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  res.json(request);
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
