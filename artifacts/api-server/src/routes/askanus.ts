import { Router } from "express";
import { db } from "@workspace/db";
import { askanuscases, caseActivityLog, caseFollowups, askanustasks, askanusnotes } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

const router = Router();

const TODAY = () => new Date().toISOString().slice(0, 10);

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
  if (!String(title || "").trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const userId = getSessionUserId(req)!;
  const [created] = await db.insert(askanuscases).values({
    userId,
    title: String(title).trim(),
    description: description ? String(description).trim() : "",
    urgency: urgency ?? "medium",
    category: category ?? "General",
    contactName: contactName ?? "",
    deadline: deadline ?? "",
    goalAmount: String(goalAmount ?? 0),
    notes: notes ?? "",
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
  if (status !== undefined) updates.status = status;
  if (urgency !== undefined) updates.urgency = urgency;
  if (goalAmount !== undefined) updates.goalAmount = String(goalAmount);
  if (fundsPromised !== undefined) updates.fundsPromised = String(fundsPromised);
  if (fundsReceived !== undefined) updates.fundsReceived = String(fundsReceived);
  if (notes !== undefined) updates.notes = notes;
  await db.update(askanuscases).set(updates).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  const full = await getCaseWithDetails(id, userId);
  res.json(full);
});

router.delete("/api/askanus/cases/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  await db.delete(askanuscases).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
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

  const caseUpdates: Record<string, unknown> = { lastUpdated: new Date() };

  if (action === "funds_received" && amount) {
    const newTotal = Number(existing.fundsReceived) + Number(amount);
    caseUpdates.fundsReceived = String(newTotal);
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "funds_received",
      note: note || `$${Number(amount).toLocaleString()} received`,
      amount: String(amount),
    });
  } else if (action === "funds_promised" && amount) {
    const newTotal = Number(existing.fundsPromised) + Number(amount);
    caseUpdates.fundsPromised = String(newTotal);
    const pledgeNote = from ? `$${Number(amount).toLocaleString()} pledged by ${from}` : `$${Number(amount).toLocaleString()} pledged`;
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "funds_promised",
      note: pledgeNote, amount: String(amount),
    });
  } else if (action === "goal" && goal !== undefined) {
    caseUpdates.goalAmount = String(goal);
    await db.insert(caseActivityLog).values({
      caseId: id, date: today, type: "update",
      note: `Goal updated to $${Number(goal).toLocaleString()}`,
    });
  } else if (action === "note" && note) {
    await db.insert(caseActivityLog).values({ caseId: id, date: today, type: "note", note });
  } else if (action === "followup" && note) {
    await db.insert(caseFollowups).values({ caseId: id, date: today, note, dueDate: dueDate || null });
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
  if (!String(title || "").trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [created] = await db.insert(askanustasks).values({
    userId: getSessionUserId(req)!,
    title: String(title).trim(), caseTitle: caseTitle ?? "", deadline: deadline ?? "",
    priority: priority ?? "medium", notes: notes ?? "",
  }).returning();
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.patch("/api/askanus/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const { title, caseTitle, deadline, completed, priority, notes } = req.body;
  if (title !== undefined) updates.title = title;
  if (caseTitle !== undefined) updates.caseTitle = caseTitle;
  if (deadline !== undefined) updates.deadline = deadline;
  if (completed !== undefined) updates.completed = completed;
  if (priority !== undefined) updates.priority = priority;
  if (notes !== undefined) updates.notes = notes;
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
    title: String(title).trim(),
    content: String(content).trim(),
  }).returning();
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.patch("/api/askanus/notes/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { title, content } = req.body;
  const [updated] = await db.update(askanusnotes).set({ title, content }).where(
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
