import { Router, type IRouter } from "express";
import { eq, desc, sql, and, ne } from "drizzle-orm";
import {
  db,
  featuredCausesTable,
  featuredCauseSupportersTable,
  causeSubmissionsTable,
  notificationsTable,
  supportMessagesTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName, getMemberIdentity } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { deleteManagedMediaUrl } from "../lib/media-cleanup";
import { notifyStaff } from "../lib/notify";

const router: IRouter = Router();

function routeId(value: string | string[]) {
  return Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
}

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
  if (status && !["active", "completed"].includes(status)) {
    res.status(400).json({ error: "Only public cause statuses can be requested" });
    return;
  }

  const all = await db.select().from(featuredCausesTable).orderBy(desc(featuredCausesTable.createdAt));
  res.json(all.filter(c => c.status !== "pending" && (!status || c.status === status)));
});

router.get("/admin/featured-causes", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(featuredCausesTable).orderBy(desc(featuredCausesTable.createdAt));
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
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const organizerName = req.body?.organizerName ? String(req.body.organizerName).trim() : null;
  const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl).trim() : null;
  const location = req.body?.location ? String(req.body.location).trim() : null;
  const deadline = req.body?.deadline ? String(req.body.deadline).trim() : null;
  const status = String(req.body?.status || "pending");
  const goalAmount = req.body?.goalAmount === null || req.body?.goalAmount === undefined || req.body?.goalAmount === ""
    ? null
    : Number(req.body.goalAmount);

  if (!title || !description) {
    res.status(400).json({ error: "title and description required" });
    return;
  }
  if (!["pending", "active", "completed"].includes(status)) {
    res.status(400).json({ error: "Invalid cause status" });
    return;
  }
  if (goalAmount !== null && (!Number.isFinite(goalAmount) || goalAmount < 0)) {
    res.status(400).json({ error: "goalAmount must be zero or greater" });
    return;
  }

  if (status === "active") {
    await db.update(featuredCausesTable)
      .set({ status: "completed" })
      .where(eq(featuredCausesTable.status, "active"));
  }

  const [cause] = await db.insert(featuredCausesTable).values({
    title,
    description,
    organizerName,
    goalAmount: goalAmount === null ? null : String(goalAmount),
    status,
    imageUrl,
    location,
    deadline,
  }).returning();

  const actorName = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("cause", `Created featured cause "${cause.title}"`, actorName);
  res.status(201).json(cause);
});

// GET /featured-causes/:id
router.get("/featured-causes/:id", async (req, res): Promise<void> => {
  const id = routeId(req.params.id);
  const [cause] = await db.select().from(featuredCausesTable).where(and(
    eq(featuredCausesTable.id, id),
    ne(featuredCausesTable.status, "pending"),
  ));
  if (!cause) { res.status(404).json({ error: "Not found" }); return; }
  res.json(cause);
});

// PATCH /featured-causes/:id
router.patch("/featured-causes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = routeId(req.params.id);
  const [existing] = await db.select().from(featuredCausesTable).where(eq(featuredCausesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Record<string, unknown> = {};
  const { title, description, organizerName, goalAmount, status, imageUrl, location, deadline } = req.body;

  if (title !== undefined) {
    const clean = String(title).trim();
    if (!clean) { res.status(400).json({ error: "title required" }); return; }
    updates.title = clean;
  }
  if (description !== undefined) {
    const clean = String(description).trim();
    if (!clean) { res.status(400).json({ error: "description required" }); return; }
    updates.description = clean;
  }
  if (organizerName !== undefined) updates.organizerName = organizerName ? String(organizerName).trim() : null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl ? String(imageUrl).trim() : null;
  if (location !== undefined) updates.location = location ? String(location).trim() : null;
  if (deadline !== undefined) updates.deadline = deadline ? String(deadline).trim() : null;

  if (goalAmount !== undefined) {
    const goal = goalAmount === null || goalAmount === "" ? null : Number(goalAmount);
    if (goal !== null && (!Number.isFinite(goal) || goal < 0)) {
      res.status(400).json({ error: "goalAmount must be zero or greater" });
      return;
    }
    updates.goalAmount = goal === null ? null : String(goal);
  }

  if (status !== undefined) {
    const cleanStatus = String(status);
    if (!["pending", "active", "completed"].includes(cleanStatus)) {
      res.status(400).json({ error: "Invalid cause status" });
      return;
    }
    if (cleanStatus === "active") {
      await db.update(featuredCausesTable)
        .set({ status: "completed" })
        .where(and(eq(featuredCausesTable.status, "active"), ne(featuredCausesTable.id, id)));
    }
    updates.status = cleanStatus;
  }

  const [cause] = await db.update(featuredCausesTable)
    .set(updates)
    .where(eq(featuredCausesTable.id, id))
    .returning();

  if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== cause.imageUrl) {
    await deleteManagedMediaUrl(existing.imageUrl);
  }

  res.json(cause);
});

// POST /featured-causes/:id/join
router.post("/featured-causes/:id/join", requireAuth, async (req, res): Promise<void> => {
  const causeId = routeId(req.params.id);
  const userId = getSessionUserId(req)!;
  const [cause] = await db.select().from(featuredCausesTable).where(eq(featuredCausesTable.id, causeId));
  if (!cause || cause.status !== "active") {
    res.status(404).json({ error: "Active cause not found" });
    return;
  }

  const pledgeType = String(req.body?.pledgeType || "");
  const allowedPledgeTypes = ["financial", "volunteer", "both", "items", "coordination"];
  if (!allowedPledgeTypes.includes(pledgeType)) {
    res.status(400).json({ error: "Invalid pledge type" });
    return;
  }

  const rawPledgeAmount = req.body?.pledgeAmount;
  let pledgeAmount: number | null = null;
  if (pledgeType === "financial" || pledgeType === "both") {
    if (rawPledgeAmount !== undefined && rawPledgeAmount !== null && rawPledgeAmount !== "") {
      const parsed = Number(rawPledgeAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        res.status(400).json({ error: "Pledge amount must be greater than zero" });
        return;
      }
      pledgeAmount = parsed;
    }
  }

  const [existing] = await db.select().from(featuredCauseSupportersTable).where(and(
    eq(featuredCauseSupportersTable.causeId, causeId),
    eq(featuredCauseSupportersTable.userId, userId),
  ));
  if (existing) {
    res.status(409).json({ error: "You already joined this cause" });
    return;
  }

  const safeName = await resolveMemberDisplayName(userId, req.body?.name);
  const message = req.body?.message ? String(req.body.message).trim().slice(0, 1500) : null;
  const location = req.body?.location ? String(req.body.location).trim().slice(0, 200) : null;

  const [supporter] = await db.insert(featuredCauseSupportersTable).values({
    userId,
    causeId,
    name: safeName,
    pledgeType,
    pledgeAmount: pledgeAmount === null ? null : String(pledgeAmount),
    message,
    location,
  }).returning();

  await db.update(featuredCausesTable)
    .set({ supporterCount: sql`${featuredCausesTable.supporterCount} + 1` })
    .where(eq(featuredCausesTable.id, causeId));

  if (pledgeAmount !== null) {
    await db.update(featuredCausesTable)
      .set({ amountRaised: sql`${featuredCausesTable.amountRaised} + ${pledgeAmount}` })
      .where(eq(featuredCausesTable.id, causeId));
  }

  const joiningUser = await getMemberIdentity(userId);
  await db.insert(supportMessagesTable).values({
    userId,
    name: safeName,
    email: joiningUser?.email || joiningUser?.phone || "Gavhah member",
    type: "cause_join",
    subject: `Cause participation: ${cause.title}`,
    message: [
      `Member: ${safeName}`,
      `Pledge type: ${pledgeType}`,
      pledgeAmount !== null ? `Amount: ${pledgeAmount}` : "",
      location ? `Location: ${location}` : "",
      message ? `Message: ${message}` : "",
    ].filter(Boolean).join("\n"),
    status: "open",
  });

  res.status(201).json(supporter);
});

// GET /featured-causes/:id/supporters
router.get("/featured-causes/:id/supporters", async (req, res): Promise<void> => {
  const causeId = routeId(req.params.id);
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

  const cleanUrgency = String(urgency || "normal");
  if (!["normal", "high", "urgent"].includes(cleanUrgency)) {
    res.status(400).json({ error: "Invalid urgency" });
    return;
  }

  const safeSubmittedBy = await resolveMemberDisplayName(userId, submittedBy);
  const [submission] = await db.insert(causeSubmissionsTable).values({
    userId,
    title: String(title).trim().slice(0, 200),
    description: String(description).trim().slice(0, 5000),
    submittedBy: safeSubmittedBy,
    location: location ? String(location).trim().slice(0, 200) : null,
    urgency: cleanUrgency,
  }).returning();

  await notifyStaff(
    `New cause submission: ${submission.title} — ${submission.urgency}`,
    "/founder",
    "admin_cause_submission",
  );
  res.status(201).json(submission);
});

// GET /cause-submissions (admin)
router.get("/cause-submissions", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(causeSubmissionsTable).orderBy(desc(causeSubmissionsTable.createdAt));
  res.json(all);
});

router.post("/cause-submissions/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = routeId(req.params.id);
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
  const id = routeId(req.params.id);
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
