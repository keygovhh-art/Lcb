import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  db,
  featuredCausesTable,
  featuredCauseSupportersTable,
  causeSubmissionsTable,
  notificationsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

router.get("/admin/cause-activity", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: featuredCauseSupportersTable.id,
    causeId: featuredCauseSupportersTable.causeId,
    causeType: featuredCausesTable.title,
    name: featuredCauseSupportersTable.name,
    pledgeType: featuredCauseSupportersTable.pledgeType,
    pledgeAmount: featuredCauseSupportersTable.pledgeAmount,
    message: featuredCauseSupportersTable.message,
    location: featuredCauseSupportersTable.location,
    createdAt: featuredCauseSupportersTable.createdAt,
  })
    .from(featuredCauseSupportersTable)
    .innerJoin(featuredCausesTable, eq(featuredCauseSupportersTable.causeId, featuredCausesTable.id))
    .orderBy(desc(featuredCauseSupportersTable.createdAt));
  res.json(rows);
});

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
router.post("/featured-causes", requireAdmin, async (req, res): Promise<void> => {
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
router.patch("/featured-causes/:id", requireAdmin, async (req, res): Promise<void> => {
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
router.post("/featured-causes/:id/join", requireAuth, async (req, res): Promise<void> => {
  const causeId = parseInt(req.params.id, 10);
  const userId = getSessionUserId(req)!;
  const { name, pledgeType, pledgeAmount, message, location } = req.body;
  if (!pledgeType) { res.status(400).json({ error: "pledgeType required" }); return; }

  const [existing] = await db.select().from(featuredCauseSupportersTable).where(and(
    eq(featuredCauseSupportersTable.causeId, causeId),
    eq(featuredCauseSupportersTable.userId, userId),
  ));
  if (existing) {
    res.status(409).json({ error: "You already joined this cause" });
    return;
  }

  const safeName = await resolveMemberDisplayName(userId, name);
  const [supporter] = await db.insert(featuredCauseSupportersTable).values({
    userId,
    causeId,
    name: safeName,
    pledgeType,
    pledgeAmount: pledgeAmount ? String(pledgeAmount) : null,
    message: message || null,
    location: location || null,
  }).returning();

  await db.update(featuredCausesTable)
    .set({ supporterCount: sql`${featuredCausesTable.supporterCount} + 1` })
    .where(eq(featuredCausesTable.id, causeId));

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
router.post("/cause-submissions", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const { title, description, submittedBy, location, urgency } = req.body;
  if (!String(title || "").trim() || !String(description || "").trim()) {
    res.status(400).json({ error: "title and description are required" });
    return;
  }

  const safeSubmittedBy = await resolveMemberDisplayName(userId, submittedBy);
  const [submission] = await db.insert(causeSubmissionsTable).values({
    userId,
    title: String(title).trim(),
    description: String(description).trim(),
    submittedBy: safeSubmittedBy,
    location: location ? String(location).trim() : null,
    urgency: urgency || "normal",
  }).returning();

  res.status(201).json(submission);
});

// GET /cause-submissions (admin)
router.get("/cause-submissions", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(causeSubmissionsTable).orderBy(desc(causeSubmissionsTable.createdAt));
  res.json(all);
});

router.post("/cause-submissions/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [submission] = await db.select().from(causeSubmissionsTable).where(eq(causeSubmissionsTable.id, id));
  if (!submission) { res.status(404).json({ error: "Not found" }); return; }
  if (submission.status !== "pending") {
    res.status(409).json({ error: "This submission has already been reviewed" });
    return;
  }

  await db.update(featuredCausesTable)
    .set({ status: "completed" })
    .where(eq(featuredCausesTable.status, "active"));

  const [cause] = await db.insert(featuredCausesTable).values({
    title: submission.title,
    description: submission.description,
    organizerName: submission.submittedBy,
    status: "active",
    location: submission.location,
  }).returning();

  await db.update(causeSubmissionsTable)
    .set({ status: "approved", adminNotes: req.body?.adminNotes ?? null })
    .where(eq(causeSubmissionsTable.id, id));

  await logActivity("cause", `Featured cause "${cause.title}" was approved`, submission.submittedBy);

  await db.insert(notificationsTable).values({
    userId: submission.userId,
    type: "cause_review",
    message: `Your cause submission "${submission.title}" was approved and is now featured.`,
    linkUrl: "/united",
    isRead: false,
  });

  res.json(cause);
});

router.post("/cause-submissions/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(causeSubmissionsTable).where(eq(causeSubmissionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "pending") {
    res.status(409).json({ error: "This submission has already been reviewed" });
    return;
  }

  const [submission] = await db.update(causeSubmissionsTable)
    .set({ status: "rejected", adminNotes: req.body?.adminNotes ?? null })
    .where(eq(causeSubmissionsTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    userId: submission.userId,
    type: "cause_review",
    message: `Your cause submission "${submission.title}" was reviewed and was not selected.`,
    linkUrl: "/united",
    isRead: false,
  });

  res.json(submission);
});

export default router;
