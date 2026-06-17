import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  featuredCausesTable,
  featuredCauseSupportersTable,
  causeSubmissionsTable,
} from "@workspace/db";

const router: IRouter = Router();

// GET /featured-causes
router.get("/featured-causes", async (req, res): Promise<void> => {
  const { status } = req.query as Record<string, string>;
  let all = await db.select().from(featuredCausesTable).orderBy(desc(featuredCausesTable.createdAt));
  if (status) all = all.filter(c => c.status === status);
  res.json(all);
});

// GET /featured-causes/active — must be before /:id
router.get("/featured-causes/active", async (_req, res): Promise<void> => {
  const [cause] = await db
    .select()
    .from(featuredCausesTable)
    .where(eq(featuredCausesTable.status, "active"))
    .orderBy(desc(featuredCausesTable.createdAt))
    .limit(1);
  if (!cause) { res.status(404).json({ error: "No active cause" }); return; }
  res.json(cause);
});

// POST /featured-causes
router.post("/featured-causes", async (req, res): Promise<void> => {
  const { title, description, organizerName, goalAmount, status, imageUrl, location, deadline } = req.body;
  if (!title || !description) { res.status(400).json({ error: "title and description required" }); return; }
  const [cause] = await db.insert(featuredCausesTable).values({
    title, description,
    organizerName: organizerName || null,
    goalAmount: goalAmount ? String(goalAmount) : null,
    status: status || "pending",
    imageUrl: imageUrl || null,
    location: location || null,
    deadline: deadline || null,
  }).returning();
  res.status(201).json(cause);
});

// GET /featured-causes/:id
router.get("/featured-causes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [cause] = await db.select().from(featuredCausesTable).where(eq(featuredCausesTable.id, id));
  if (!cause) { res.status(404).json({ error: "Not found" }); return; }
  res.json(cause);
});

// PATCH /featured-causes/:id
router.patch("/featured-causes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { title, description, organizerName, goalAmount, status, imageUrl, location, deadline } = req.body;
  const [cause] = await db.update(featuredCausesTable)
    .set({ title, description, organizerName, goalAmount: goalAmount ? String(goalAmount) : undefined, status, imageUrl, location, deadline })
    .where(eq(featuredCausesTable.id, id))
    .returning();
  if (!cause) { res.status(404).json({ error: "Not found" }); return; }
  res.json(cause);
});

// POST /featured-causes/:id/join
router.post("/featured-causes/:id/join", async (req, res): Promise<void> => {
  const causeId = parseInt(req.params.id, 10);
  const { name, pledgeType, pledgeAmount, message, location } = req.body;
  if (!name || !pledgeType) { res.status(400).json({ error: "name and pledgeType required" }); return; }

  const [supporter] = await db.insert(featuredCauseSupportersTable).values({
    causeId,
    name,
    pledgeType,
    pledgeAmount: pledgeAmount ? String(pledgeAmount) : null,
    message: message || null,
    location: location || null,
  }).returning();

  // Increment supporter count
  await db.update(featuredCausesTable)
    .set({ supporterCount: sql`${featuredCausesTable.supporterCount} + 1` })
    .where(eq(featuredCausesTable.id, causeId));

  // If financial pledge, add to amountRaised
  if (pledgeAmount && (pledgeType === "financial" || pledgeType === "both")) {
    await db.update(featuredCausesTable)
      .set({ amountRaised: sql`${featuredCausesTable.amountRaised} + ${pledgeAmount}` })
      .where(eq(featuredCausesTable.id, causeId));
  }

  res.status(201).json(supporter);
});

// GET /featured-causes/:id/supporters
router.get("/featured-causes/:id/supporters", async (req, res): Promise<void> => {
  const causeId = parseInt(req.params.id, 10);
  const supporters = await db
    .select()
    .from(featuredCauseSupportersTable)
    .where(eq(featuredCauseSupportersTable.causeId, causeId))
    .orderBy(desc(featuredCauseSupportersTable.createdAt));
  res.json(supporters);
});

// POST /cause-submissions
router.post("/cause-submissions", async (req, res): Promise<void> => {
  const { title, description, submittedBy, location, urgency } = req.body;
  if (!title || !description || !submittedBy) {
    res.status(400).json({ error: "title, description, and submittedBy required" });
    return;
  }
  const [submission] = await db.insert(causeSubmissionsTable).values({
    title, description, submittedBy,
    location: location || null,
    urgency: urgency || "normal",
  }).returning();
  res.status(201).json(submission);
});

// GET /cause-submissions (admin)
router.get("/cause-submissions", async (_req, res): Promise<void> => {
  const all = await db.select().from(causeSubmissionsTable).orderBy(desc(causeSubmissionsTable.createdAt));
  res.json(all);
});

export default router;
