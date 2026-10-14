import { Router } from "express";
import { db } from "@workspace/db";
import { askanuscases, caseActivityLog, caseFollowups, communicationContacts, fundraisingCallReports } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSessionUserId, requireAuth } from "../middlewares/auth";

const router = Router();
const moneyKinds = new Set(["none", "received", "pledged"]);
const outcomes = new Set(["spoke", "no_answer", "callback", "not_interested", "other"]);
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => !v || /^\d{4}-\d{2}-\d{2}$/.test(String(v));
const safeId = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0;
const formatContact = (c: typeof communicationContacts.$inferSelect) => ({
  ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
});
const formatCall = (r: typeof fundraisingCallReports.$inferSelect) => ({
  ...r, amount: Number(r.amount), createdAt: r.createdAt.toISOString(),
});

// User-scoped contact records; campaign admins have no implicit access.
router.get("/askanus/contacts", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  res.setHeader("Cache-Control", "private, no-store");
  const contacts = await db.select().from(communicationContacts)
    .where(eq(communicationContacts.userId, userId))
    .orderBy(desc(communicationContacts.updatedAt)).limit(500);
  res.json(contacts.map(formatContact));
});
router.post("/askanus/contacts", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  const name = clean(req.body?.name, 240);
  if (!name) { res.status(400).json({ error: "Contact name is required" }); return; }
  const [created] = await db.insert(communicationContacts).values({
    userId, name, phone: clean(req.body?.phone, 80),
    email: clean(req.body?.email, 240), notes: clean(req.body?.notes, 4000),
  }).returning();
  res.status(201).json(formatContact(created));
});
router.patch("/askanus/contacts/:id", requireAuth, async (req, res) => {
  if (!safeId(req.params.id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const updates: Partial<typeof communicationContacts.$inferInsert> = { updatedAt: new Date() };
  for (const [key, limit] of [["name",240],["phone",80],["email",240],["notes",4000]] as const) {
    if (req.body?.[key] !== undefined) updates[key] = clean(req.body[key],limit);
  }
  if (updates.name === "") { res.status(400).json({ error: "Contact name is required" }); return; }
  const [row] = await db.update(communicationContacts).set(updates).where(and(
    eq(communicationContacts.id, Number(req.params.id)),
    eq(communicationContacts.userId, getSessionUserId(req)!),
  )).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatContact(row));
});

router.get("/askanus/call-reports", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  res.setHeader("Cache-Control", "private, no-store");
  const rows = await db.select().from(fundraisingCallReports)
    .where(eq(fundraisingCallReports.userId,userId))
    .orderBy(desc(fundraisingCallReports.createdAt)).limit(100);
  res.json(rows.map(formatCall));
});

/**
 * Single transaction: idempotent manual call report + money + follow-up + personal case.
 * The case is owned by the signed-in user. Never count a retry as another donation.
 */
router.post("/askanus/cases/:id/call-reports", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  const caseId = Number(req.params.id);
  const body = req.body ?? {};
  const requestId = clean(body.requestId, 128);
  const contactName = clean(body.contactName, 240);
  const note = clean(body.note, 1500);
  const outcome = clean(body.outcome, 32);
  const moneyKind = clean(body.moneyKind, 32) || "none";
  const amount = Number(body.amount ?? 0);
  const followupNote = clean(body.followupNote, 1500);
  const dueDate = clean(body.dueDate, 10) || null;
  const contactId = body.contactId == null || body.contactId === "" ? null : Number(body.contactId);

  if (!safeId(caseId) || !requestId || requestId.length < 12 ||
      !contactName || !outcomes.has(outcome) || !moneyKinds.has(moneyKind) ||
      !Number.isFinite(amount) || amount < 0 || amount > 9999999999 ||
      (moneyKind === "none" && amount !== 0) ||
      (moneyKind !== "none" && amount <= 0) ||
      !isoDate(dueDate) || (followupNote && !dueDate && body.dueDate) ||
      (contactId !== null && !safeId(contactId))) {
    res.status(400).json({ error: "Invalid call report fields" }); return;
  }
  // Always load/lock the owned case before modifying its totals.
  const [owned] = await db.select({ id: askanuscases.id }).from(askanuscases)
    .where(and(eq(askanuscases.id,caseId),eq(askanuscases.userId,userId)));
  if (!owned) { res.status(404).json({error:"Case not found"}); return; }
  if (contactId !== null) {
    const [contact] = await db.select({id:communicationContacts.id}).from(communicationContacts)
      .where(and(eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)));
    if (!contact) { res.status(404).json({error:"Contact not found"}); return; }
  }
  const today = new Date().toISOString().slice(0,10);
  const result = await db.transaction(async tx => {
    const [saved] = await tx.insert(fundraisingCallReports).values({
      userId, caseId, contactId, contactName, outcome, moneyKind,
      amount: String(amount), note, requestId,
    }).onConflictDoNothing().returning();
    if (!saved) {
      const [existing] = await tx.select().from(fundraisingCallReports).where(and(
        eq(fundraisingCallReports.userId,userId),eq(fundraisingCallReports.requestId,requestId)));
      return {report:existing,duplicate:true};
    }
    await tx.insert(caseActivityLog).values({
      caseId,date:today,type:"contact",
      note: `Manual call report: ${contactName} — ${outcome}${note ? " — "+note : ""}`.slice(0,1500),
    });
    if (moneyKind !== "none") {
      await tx.insert(caseActivityLog).values({
        caseId,date:today,type:moneyKind === "received" ? "funds_received" : "funds_promised",
        note: `Manual report: ${contactName} — ${moneyKind === "received" ? "received" : "pledged"} $${amount.toFixed(2)}`.slice(0,1500),
        amount:String(amount),
      });
      await tx.update(askanuscases).set({
        ...(moneyKind === "received"
          ? { fundsReceived: sql`${askanuscases.fundsReceived} + ${String(amount)}` }
          : { fundsPromised: sql`${askanuscases.fundsPromised} + ${String(amount)}` }),
        lastUpdated: new Date(),
      }).where(and(eq(askanuscases.id,caseId),eq(askanuscases.userId,userId)));
    }
    if (followupNote) {
      await tx.insert(caseFollowups).values({caseId,date:today,note:followupNote,dueDate});
    }
    return {report:saved,duplicate:false};
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.status(result.duplicate ? 200 : 201).json({
    duplicate:result.duplicate, report:formatCall(result.report),
  });
});

export default router;
