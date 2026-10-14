import { Router } from "express";
import { db } from "@workspace/db";
import { askanuscases, caseActivityLog, caseFollowups, communicationContacts, fundraisingCallReports, maxPledges, maxReceipts, maxFollowupContacts } from "@workspace/db/schema";
import { and, desc, eq, sql, or, ilike } from "drizzle-orm";
import { getSessionUserId, requireAuth } from "../middlewares/auth";
import { isRepeatRule } from "../lib/followup-recurrence";

const router = Router();
const moneyKinds = new Set(["none", "received", "pledged"]);
const outcomes = new Set(["spoke", "no_answer", "callback", "not_interested", "do_not_call", "other"]);
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
  // Server-side search and pagination prevent large address books from
  // silently hiding all records after the first 500.
  const term=clean(req.query?.q,120);
  const rawLimit=Number(req.query?.limit ?? 500);
  const rawOffset=Number(req.query?.offset ?? 0);
  if(!Number.isSafeInteger(rawLimit)||rawLimit<1||rawLimit>500||
     !Number.isSafeInteger(rawOffset)||rawOffset<0||rawOffset>1000000){
    res.status(400).json({error:"Invalid contact pagination"});return;
  }
  const escapedTerm=term.replace(/[\\%_]/g, v=>"\\"+v);
  const owner=eq(communicationContacts.userId,userId);
  const search=term ? or(
    ilike(communicationContacts.name,"%"+escapedTerm+"%"),
    ilike(communicationContacts.phone,"%"+escapedTerm+"%"),
    ilike(communicationContacts.email,"%"+escapedTerm+"%"),
  ) : undefined;
  const contacts = await db.select().from(communicationContacts)
    .where(search?and(owner,search):owner)
    .orderBy(desc(communicationContacts.updatedAt),desc(communicationContacts.id))
    .limit(rawLimit).offset(rawOffset);
  res.json(contacts.map(formatContact));
});
router.post("/askanus/contacts", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  const name = clean(req.body?.name, 240);
  if (!name) { res.status(400).json({ error: "Contact name is required" }); return; }
  const [created] = await db.insert(communicationContacts).values({
    userId, name, phone: clean(req.body?.phone, 80),
    email: clean(req.body?.email, 240), notes: clean(req.body?.notes, 4000),
    preferredTimezone: clean(req.body?.preferredTimezone || "America/New_York", 80),
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
  if (req.body?.doNotCall !== undefined) {
    if (typeof req.body.doNotCall !== "boolean") {
      res.status(400).json({error:"doNotCall must be a boolean"}); return;
    }
    if(req.body.doNotCall===false){
      const [current]=await db.select({doNotCall:communicationContacts.doNotCall})
        .from(communicationContacts).where(and(
          eq(communicationContacts.id,Number(req.params.id)),
          eq(communicationContacts.userId,getSessionUserId(req)!),
        ));
      if(current?.doNotCall){
        res.status(409).json({error:"Opt-out can only be reversed after an explicit, audited re-consent process"});return;
      }
    }
    updates.doNotCall = req.body.doNotCall;
    updates.optOutReason = clean(req.body?.optOutReason,500);
  }
  if (req.body?.preferredHours !== undefined) updates.preferredHours = clean(req.body.preferredHours,240);
  if (req.body?.contactRole !== undefined) updates.contactRole = clean(req.body.contactRole,64);
  if (req.body?.relationshipNotes !== undefined) updates.relationshipNotes = clean(req.body.relationshipNotes,1500);
  if (req.body?.preferredTimezone !== undefined) updates.preferredTimezone = clean(req.body.preferredTimezone,80);

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
  const dueTime = clean(body.dueTime, 5) || null;
  const timeZone = clean(body.timeZone, 80) || null;
  const repeatRule = clean(body.repeatRule || "none",20);
  if(dueTime){
    try{if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime)||!timeZone)throw Error();
      new Intl.DateTimeFormat("en-US",{timeZone}).format();
    }catch{res.status(400).json({error:"Invalid reminder time or time zone"});return;}
  }
  const contactId = body.contactId == null || body.contactId === "" ? null : Number(body.contactId);
  const mood = clean(body.mood || "neutral",40);

  if (!safeId(caseId) || !requestId || requestId.length < 12 ||
      !new Set(["friendly","neutral","busy","uncomfortable","uninterested","other"]).has(mood) ||
      !contactName || !outcomes.has(outcome) || !moneyKinds.has(moneyKind) ||
      !Number.isFinite(amount) || amount < 0 || amount > 9999999999 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 ||
      (moneyKind === "none" && amount !== 0) ||
      (moneyKind !== "none" && amount <= 0) ||
      !isoDate(dueDate) || !isRepeatRule(repeatRule) ||
      (repeatRule!=="none" && (!followupNote||!dueDate)) || (dueTime && (!followupNote || !dueDate)) || (followupNote && !dueDate && body.dueDate) ||
      (contactId !== null && !safeId(contactId)) ||
      (outcome === "do_not_call" && contactId === null)) {
    res.status(400).json({ error: "Invalid call report fields" }); return;
  }
  // Check the signed-in member owns the case; increments below are atomic SQL updates.
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
      amount: String(amount), note, requestId, observedMood:mood,
    }).onConflictDoNothing().returning();
    if (!saved) {
      const [existing] = await tx.select().from(fundraisingCallReports).where(and(
        eq(fundraisingCallReports.userId,userId),eq(fundraisingCallReports.requestId,requestId)));
      if(!existing || existing.caseId!==caseId || Number(existing.amount)!==amount ||
          existing.moneyKind!==moneyKind || existing.contactId!==contactId || existing.outcome!==outcome){
        return {kind:"conflict" as const};
      }
      return {kind:"duplicate" as const, report:existing};
    }
    await tx.insert(caseActivityLog).values({
      caseId,date:today,type:"contact",
      note: `Manual call report: ${contactName} — ${outcome} (observed mood: ${mood})${note ? " — "+note : ""}`.slice(0,1500),
    });
    if(outcome==="do_not_call" && contactId!==null) {
      await tx.update(communicationContacts).set({
        doNotCall:true,optOutReason:note||"Asked not to be called",updatedAt:new Date(),
      }).where(and(eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)));
    }
    if (moneyKind==="pledged") {
      await tx.insert(maxPledges).values({
        userId,caseId,contactId,callReportId:saved.id,amount:String(amount),note,
      });
    } else if (moneyKind==="received") {
      await tx.insert(maxReceipts).values({
        userId,caseId,contactId,callReportId:saved.id,amount:String(amount),
        requestId:"call:"+requestId,method:"other",verification:"manually_reported",
      });
    }
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
      const [followup]=await tx.insert(caseFollowups).values({
        caseId,date:today,note:followupNote,dueDate,dueTime,timeZone:dueTime?timeZone:null,
        repeatRule,repeatAnchorDay:repeatRule==="monthly"&&dueDate?Number(dueDate.slice(-2)):null,
      }).returning();
      if(contactId!==null)await tx.insert(maxFollowupContacts).values({
        userId,contactId,followupId:followup.id,
      });
    }
    return {kind:"created" as const, report:saved};
  });
  res.setHeader("Cache-Control", "private, no-store");
  if(result.kind==="conflict"){
    res.status(409).json({error:"This request ID is already used for a different call report"});return;
  }
  res.status(result.kind==="duplicate" ? 200 : 201).json({
    duplicate:result.kind==="duplicate",report:formatCall(result.report),
  });
});

export default router;
