import { Router } from "express";
import { db } from "@workspace/db";
import { askanuscases, caseActivityLog, caseFollowups, askanustasks, askanusnotes } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

const router = Router();

const TODAY = () => new Date().toISOString().slice(0, 10);

const CASE_URGENCIES = new Set(["low", "medium", "high", "critical"]);
const CASE_STATUSES = new Set(["open", "in_progress", "closed"]);
const CASE_CATEGORIES = new Set([
  "Bikur Cholim", "Hachnosas Kallah", "Housing", "Financial", "Education",
  "Medical", "Transportation", "Food", "Orphan Support", "General",
]);
const TASK_PRIORITIES = new Set(["low", "medium", "high"]);
const PROGRESS_ACTIONS = new Set(["funds_received", "funds_promised", "goal", "note", "followup", "status"]);

function validDateString(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function finiteNonNegative(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

function finitePositive(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

async function getCaseWithDetails(id: number, userId: number) {
  const [c] = await db.select().from(askanuscases).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  if (!c) return null;
  const activity = await db.select().from(caseActivityLog).where(eq(caseActivityLog.caseId, id)).orderBy(desc(caseActivityLog.createdAt));
  const followups = await db.select().from(caseFollowups).where(eq(caseFollowups.caseId, id)).orderBy(desc(caseFollowups.createdAt));
  return {
    ...c,
    goalAmount: Number(c.goalAmount),
    fundsPromised: Number(c.fundsPromised),
    fundsReceived: Number(c.fundsReceived),
    createdAt: c.createdAt.toISOString(),
    lastUpdated: c.lastUpdated.toISOString(),
    activityLog: activity.map(a => ({
      ...a,
      amount: a.amount != null ? Number(a.amount) : null,
      createdAt: a.createdAt.toISOString(),
    })),
    followUpNotes: followups.map(f => ({ ...f, createdAt: f.createdAt.toISOString() })),
  };
}

// --- Cases ---

router.get("/api/askanus/cases", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  const cases = await db.select().from(askanuscases)
    .where(eq(askanuscases.userId, userId))
    .orderBy(desc(askanuscases.lastUpdated));
  const result = await Promise.all(cases.map(c => getCaseWithDetails(c.id, userId)));
  res.json(result);
});

router.post("/api/askanus/cases", requireAuth, async (req, res) => {
  const { title, description, urgency, category, contactName, deadline, goalAmount, notes } = req.body;
  const cleanTitle = String(title || "").trim();
  const cleanUrgency = String(urgency ?? "medium");
  const cleanCategory = String(category ?? "General");

  if (!cleanTitle) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!CASE_URGENCIES.has(cleanUrgency)) {
    res.status(400).json({ error: "invalid urgency" });
    return;
  }
  if (!CASE_CATEGORIES.has(cleanCategory)) {
    res.status(400).json({ error: "invalid category" });
    return;
  }
  if (!validDateString(deadline)) {
    res.status(400).json({ error: "invalid deadline" });
    return;
  }
  if (!finiteNonNegative(goalAmount ?? 0)) {
    res.status(400).json({ error: "goalAmount must be zero or greater" });
    return;
  }

  const userId = getSessionUserId(req)!;
  const [created] = await db.insert(askanuscases).values({
    userId,
    title: cleanTitle.slice(0, 240),
    description: description ? String(description).trim().slice(0, 5000) : "",
    urgency: cleanUrgency,
    category: cleanCategory,
    contactName: contactName ? String(contactName).trim().slice(0, 240) : "",
    deadline: deadline ? String(deadline) : "",
    goalAmount: String(Number(goalAmount ?? 0)),
    notes: notes ? String(notes).trim().slice(0, 5000) : "",
  }).returning();
  // seed opening activity
  const today = TODAY();
  await db.insert(caseActivityLog).values({ caseId: created.id, date: today, type: "status_change", note: "Case opened" });
  const full = await getCaseWithDetails(created.id, userId);
  res.status(201).json(full);
});

router.patch("/api/askanus/cases/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [owned] = await db.select({ id: askanuscases.id }).from(askanuscases).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }
  const { status, urgency, goalAmount, fundsPromised, fundsReceived, notes } = req.body;
  const updates: Record<string, unknown> = { lastUpdated: new Date() };

  if (status !== undefined) {
    const clean = String(status);
    if (!CASE_STATUSES.has(clean)) { res.status(400).json({ error: "invalid status" }); return; }
    updates.status = clean;
  }
  if (urgency !== undefined) {
    const clean = String(urgency);
    if (!CASE_URGENCIES.has(clean)) { res.status(400).json({ error: "invalid urgency" }); return; }
    updates.urgency = clean;
  }
  if (goalAmount !== undefined) {
    if (!finiteNonNegative(goalAmount)) { res.status(400).json({ error: "goalAmount must be zero or greater" }); return; }
    updates.goalAmount = String(Number(goalAmount));
  }
  if (fundsPromised !== undefined) {
    if (!finiteNonNegative(fundsPromised)) { res.status(400).json({ error: "fundsPromised must be zero or greater" }); return; }
    updates.fundsPromised = String(Number(fundsPromised));
  }
  if (fundsReceived !== undefined) {
    if (!finiteNonNegative(fundsReceived)) { res.status(400).json({ error: "fundsReceived must be zero or greater" }); return; }
    updates.fundsReceived = String(Number(fundsReceived));
  }
  if (notes !== undefined) updates.notes = String(notes ?? "").trim().slice(0, 5000);
  await db.update(askanuscases).set(updates).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  const full = await getCaseWithDetails(id, userId);
  res.json(full);
});

router.delete("/api/askanus/cases/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [owned] = await db.select({ id: askanuscases.id }).from(askanuscases).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(caseActivityLog).where(eq(caseActivityLog.caseId, id));
  await db.delete(caseFollowups).where(eq(caseFollowups.caseId, id));
  await db.delete(askanuscases).where(eq(askanuscases.id, id));
  res.json({ ok: true });
});

// Unified progress update — handles all UpdateProgressDialog actions atomically
router.post("/api/askanus/cases/:id/progress", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const { action, amount, note, from, dueDate, status, goal } = req.body;
  const today = TODAY();

  const [existing] = await db.select().from(askanuscases).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (!PROGRESS_ACTIONS.has(String(action || ""))) {
    res.status(400).json({ error: "invalid progress action" });
    return;
  }
  if ((action === "funds_received" || action === "funds_promised") && !finitePositive(amount)) {
    res.status(400).json({ error: "amount must be greater than zero" });
    return;
  }
  if (action === "goal" && !finiteNonNegative(goal)) {
    res.status(400).json({ error: "goal must be zero or greater" });
    return;
  }
  if ((action === "note" || action === "followup") && !String(note || "").trim()) {
    res.status(400).json({ error: "note is required" });
    return;
  }
  if (action === "followup" && !validDateString(dueDate)) {
    res.status(400).json({ error: "invalid follow-up date" });
    return;
  }
  if (action === "status" && !CASE_STATUSES.has(String(status || ""))) {
    res.status(400).json({ error: "invalid status" });
    return;
  }

  const caseUpdates: Record<string, unknown> = { lastUpdated: new Date() };

  if (action === "funds_received" && amount) {
    const newTotal = Number(existing.fundsReceived) + Number(amount);
    caseUpdates.fundsReceived = String(newTotal);
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "funds_received",
      note: String(note || `${Number(amount).toLocaleString()} received`).trim().slice(0, 1500),
      amount: String(amount),
    });
  } else if (action === "funds_promised" && amount) {
    const newTotal = Number(existing.fundsPromised) + Number(amount);
    caseUpdates.fundsPromised = String(newTotal);
    const pledgeNote = from ? `$${Number(amount).toLocaleString()} pledged by ${from}` : `$${Number(amount).toLocaleString()} pledged`;
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "funds_promised",
      note: pledgeNote.slice(0, 1500), amount: String(Number(amount)),
    });
  } else if (action === "goal" && goal !== undefined) {
    caseUpdates.goalAmount = String(goal);
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "update",
      note: `Goal updated to $${Number(goal).toLocaleString()}`,
    });
  } else if (action === "note" && note) {
    await db.insert(caseActivityLog).values({ caseId: id, date: today, type: "note", note: String(note).trim().slice(0, 1500) });
  } else if (action === "followup" && note) {
    await db.insert(caseFollowups).values({ caseId: id, date: today, note: String(note).trim().slice(0, 1500), dueDate: dueDate || null });
  } else if (action === "status" && status) {
    caseUpdates.status = status;
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "status_change",
      note: `Status changed to ${status.replace("_", " ")}`,
    });
  }

  if (Object.keys(caseUpdates).length > 1) {
    await db.update(askanuscases).set(caseUpdates).where(eq(askanuscases.id, id));
  }

  const full = await getCaseWithDetails(id, userId);
  res.json(full);
});

// Toggle followup
router.patch("/api/askanus/followups/:id/toggle", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(caseFollowups).where(eq(caseFollowups.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const [ownedCase] = await db.select({ id: askanuscases.id }).from(askanuscases).where(
    and(eq(askanuscases.id, existing.caseId), eq(askanuscases.userId, getSessionUserId(req)!))
  );
  if (!ownedCase) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(caseFollowups).set({ completed: !existing.completed }).where(eq(caseFollowups.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// --- Tasks ---

router.get("/api/askanus/tasks", requireAuth, async (req, res) => {
  const tasks = await db.select().from(askanustasks)
    .where(eq(askanustasks.userId, getSessionUserId(req)!))
    .orderBy(desc(askanustasks.createdAt));
  res.json(tasks.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.post("/api/askanus/tasks", requireAuth, async (req, res) => {
  const { title, caseTitle, deadline, priority, notes } = req.body;
  const cleanTitle = String(title || "").trim();
  const cleanPriority = String(priority ?? "medium");
  if (!cleanTitle) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!TASK_PRIORITIES.has(cleanPriority)) {
    res.status(400).json({ error: "invalid priority" });
    return;
  }
  if (!validDateString(deadline)) {
    res.status(400).json({ error: "invalid deadline" });
    return;
  }
  const [created] = await db.insert(askanustasks).values({
    userId: getSessionUserId(req)!,
    title: cleanTitle.slice(0, 240),
    caseTitle: caseTitle ? String(caseTitle).trim().slice(0, 240) : "",
    deadline: deadline ? String(deadline) : "",
    priority: cleanPriority,
    notes: notes ? String(notes).trim().slice(0, 3000) : "",
  }).returning();
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.patch("/api/askanus/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const { title, caseTitle, deadline, completed, priority, notes } = req.body;
  if (title !== undefined) {
    const clean = String(title).trim();
    if (!clean) { res.status(400).json({ error: "title is required" }); return; }
    updates.title = clean.slice(0, 240);
  }
  if (caseTitle !== undefined) updates.caseTitle = String(caseTitle ?? "").trim().slice(0, 240);
  if (deadline !== undefined) {
    if (!validDateString(deadline)) { res.status(400).json({ error: "invalid deadline" }); return; }
    updates.deadline = deadline ? String(deadline) : "";
  }
  if (completed !== undefined) {
    if (typeof completed !== "boolean") { res.status(400).json({ error: "completed must be true or false" }); return; }
    updates.completed = completed;
  }
  if (priority !== undefined) {
    const clean = String(priority);
    if (!TASK_PRIORITIES.has(clean)) { res.status(400).json({ error: "invalid priority" }); return; }
    updates.priority = clean;
  }
  if (notes !== undefined) updates.notes = String(notes ?? "").trim().slice(0, 3000);
  const [updated] = await db.update(askanustasks).set(updates).where(
    and(eq(askanustasks.id, id), eq(askanustasks.userId, getSessionUserId(req)!))
  ).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/api/askanus/tasks/:id", requireAuth, async (req, res) => {
  await db.delete(askanustasks).where(
    and(eq(askanustasks.id, Number(req.params.id)), eq(askanustasks.userId, getSessionUserId(req)!))
  );
  res.json({ ok: true });
});

// --- Notes ---

router.get("/api/askanus/notes", requireAuth, async (req, res) => {
  const notes = await db.select().from(askanusnotes)
    .where(eq(askanusnotes.userId, getSessionUserId(req)!))
    .orderBy(desc(askanusnotes.createdAt));
  res.json(notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

router.post("/api/askanus/notes", requireAuth, async (req, res) => {
  const { title, content } = req.body;
  if (!String(title || "").trim() || !String(content || "").trim()) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  const [created] = await db.insert(askanusnotes).values({
    userId: getSessionUserId(req)!,
    title: String(title).trim().slice(0, 240),
    content: String(content).trim().slice(0, 10000),
  }).returning();
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.patch("/api/askanus/notes/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const title = String(req.body?.title || "").trim();
  const content = String(req.body?.content || "").trim();
  if (!title || !content) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  const [updated] = await db.update(askanusnotes).set({
    title: title.slice(0, 240),
    content: content.slice(0, 10000),
  }).where(
    and(eq(askanusnotes.id, id), eq(askanusnotes.userId, getSessionUserId(req)!))
  ).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/api/askanus/notes/:id", requireAuth, async (req, res) => {
  await db.delete(askanusnotes).where(
    and(eq(askanusnotes.id, Number(req.params.id)), eq(askanusnotes.userId, getSessionUserId(req)!))
  );
  res.json({ ok: true });
});

export default router;
