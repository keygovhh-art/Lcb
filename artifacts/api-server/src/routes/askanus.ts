import { Router } from "express";
import { db, featuredCauseSupportersTable, projectMembersTable } from "@workspace/db";
import { askanuscases, caseActivityLog, caseFollowups, askanustasks, askanusnotes, fundraisingCallReports, maxProgressEvents, maxPledges, maxReceipts, maxFollowupContacts, maxHistoryEvents } from "@workspace/db/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { requireAuth, getSessionUserId } from "../middlewares/auth";
import { isRepeatRule, nextRepeatDate, validCalendarDate } from "../lib/followup-recurrence";

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

const validDateString=validCalendarDate;

function validFollowupTime(time:unknown,zone:unknown){
  if(time===undefined||time===null||time==="")return true;
  if(typeof time!=="string"||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))return false;
  if(typeof zone!=="string"||zone.length>80)return false;
  try { new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(); return true; }
  catch{return false;}
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

// Returns ONLY this signed-in member's official participation. No reliance on public names.
router.get("/me/official-joins", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const userId = getSessionUserId(req)!;
  const [causeJoins, projectJoins, personal] = await Promise.all([
    db.select({ id: featuredCauseSupportersTable.causeId }).from(featuredCauseSupportersTable)
      .where(eq(featuredCauseSupportersTable.userId, userId)),
    db.select({ id: projectMembersTable.projectId }).from(projectMembersTable)
      .where(eq(projectMembersTable.userId, userId)),
    db.select({ id: askanuscases.id, type: askanuscases.sourceType, source: askanuscases.sourceId })
      .from(askanuscases).where(eq(askanuscases.userId, userId)),
  ]);
  const keys = new Map(personal.map(c => [`${c.type}:${c.source}`, c.id]));
  const result = new Map<string, { sourceType: string; sourceId: number; caseId: number | null }>();
  for (const c of causeJoins) result.set(`featured_cause:${c.id}`, {
    sourceType: "featured_cause", sourceId: c.id, caseId: keys.get(`featured_cause:${c.id}`) || null,
  });
  for (const p of projectJoins) result.set(`community_project:${p.id}`, {
    sourceType: "community_project", sourceId: p.id, caseId: keys.get(`community_project:${p.id}`) || null,
  });
  res.json(Array.from(result.values()));
});

// --- Cases ---

// Batch-load histories and follow-ups; do not run two extra queries per case.
// Supports an unlimited number of stored follow-ups without N+1 database roundtrips.
router.get("/askanus/cases", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  res.setHeader("Cache-Control", "private, no-store");
  const cases = await db.select().from(askanuscases)
    .where(eq(askanuscases.userId, userId))
    .orderBy(desc(askanuscases.lastUpdated));
  if (!cases.length) { res.json([]); return; }
  const ids = cases.map(c => c.id);
  const [allActivity, allFollowups] = await Promise.all([
    db.select().from(caseActivityLog).where(inArray(caseActivityLog.caseId, ids))
      .orderBy(desc(caseActivityLog.createdAt)),
    db.select().from(caseFollowups).where(inArray(caseFollowups.caseId, ids))
      .orderBy(desc(caseFollowups.createdAt)),
  ]);
  const activityMap = new Map<number, typeof allActivity>();
  const followupMap = new Map<number, typeof allFollowups>();
  for (const a of allActivity) {
    const list = activityMap.get(a.caseId) ?? [];
    list.push(a); activityMap.set(a.caseId, list);
  }
  for (const f of allFollowups) {
    const list = followupMap.get(f.caseId) ?? [];
    list.push(f); followupMap.set(f.caseId, list);
  }
  res.json(cases.map(c => ({
    ...c,
    goalAmount: Number(c.goalAmount),
    fundsPromised: Number(c.fundsPromised),
    fundsReceived: Number(c.fundsReceived),
    createdAt: c.createdAt.toISOString(),
    lastUpdated: c.lastUpdated.toISOString(),
    activityLog: (activityMap.get(c.id) ?? []).map(a => ({
      ...a, amount: a.amount != null ? Number(a.amount) : null,
      createdAt: a.createdAt.toISOString(),
    })),
    followUpNotes: (followupMap.get(c.id) ?? []).map(f => ({
      ...f, createdAt: f.createdAt.toISOString(),
    })),
  })));
});

router.post("/askanus/cases", requireAuth, async (req, res) => {
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
    urgency: cleanUrgency as "low" | "medium" | "high" | "critical",
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

router.patch("/askanus/cases/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [owned] = await db.select({
    id:askanuscases.id,status:askanuscases.status,closedAt:askanuscases.closedAt,
  }).from(askanuscases).where(
    and(eq(askanuscases.id,id),eq(askanuscases.userId,userId))
  );
  if(!owned){res.status(404).json({error:"Not found"});return;}
  const { status, urgency, goalAmount, fundsPromised, fundsReceived, notes } = req.body;
  // Financial totals are derived by idempotent ledger events, never overwritten
  // directly by an unrelated case metadata patch.
  if (fundsPromised !== undefined || fundsReceived !== undefined) {
    res.status(409).json({error:"Use the audited progress/pledge/receipt endpoints to change money totals"});
    return;
  }
  const updates: Record<string, unknown> = { lastUpdated: new Date() };

  if (status !== undefined) {
    const clean = String(status);
    if (!CASE_STATUSES.has(clean)) { res.status(400).json({ error: "invalid status" }); return; }
    updates.status = clean;
    updates.closedAt=clean==="closed"?(owned.status==="closed"?owned.closedAt||new Date():new Date()):null;
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
  if (notes !== undefined) updates.notes = String(notes ?? "").trim().slice(0, 5000);
  await db.transaction(async tx=>{
    await tx.update(askanuscases).set(updates).where(
      and(eq(askanuscases.id, id),eq(askanuscases.userId,userId))
    );
    if(status!==undefined){
      await tx.insert(maxHistoryEvents).values({
        userId,caseId:id,entityType:"case",entityId:id,
        action:status==="closed"?"case_completed":status==="open"?"case_reopened":"case_status_changed",
        title:"פראיעקט־מצב: "+String(status),
        details:JSON.stringify({status,urgency:urgency??null,notes:notes??null}),
      });
    }
  });
  const full = await getCaseWithDetails(id, userId);
  res.json(full);
});

router.delete("/askanus/cases/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [owned] = await db.select({ id: askanuscases.id }).from(askanuscases).where(
    and(eq(askanuscases.id, id), eq(askanuscases.userId, userId))
  );
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }

  // An official membership remains joined. Archive the private work by closing
  // the case; do not erase its audit trail or break the original source link.
  const [linked] = await db.select({ sourceType: askanuscases.sourceType })
    .from(askanuscases).where(and(eq(askanuscases.id, id), eq(askanuscases.userId, userId)));
  if (linked?.sourceType) {
    res.status(409).json({ error: "Official joined cases can be closed but not deleted. Use Close to keep your history." });
    return;
  }
  // Do not erase a project with manually logged fundraising transactions.
  // The communication report is audit evidence; archiving/closing is safer.
  const [fundraising] = await db.select({ id: fundraisingCallReports.id })
    .from(fundraisingCallReports).where(and(
      eq(fundraisingCallReports.caseId, id),
      eq(fundraisingCallReports.userId, userId),
    )).limit(1);
  if (fundraising) {
    res.status(409).json({ error: "This case has a fundraising history. Close the case rather than deleting its financial audit trail." });
    return;
  }
  const [progressMoney,pledgeMoney,receiptMoney] = await Promise.all([
    db.select({id:maxProgressEvents.id}).from(maxProgressEvents)
      .where(and(eq(maxProgressEvents.caseId,id),eq(maxProgressEvents.userId,userId))).limit(1),
    db.select({id:maxPledges.id}).from(maxPledges)
      .where(and(eq(maxPledges.caseId,id),eq(maxPledges.userId,userId))).limit(1),
    db.select({id:maxReceipts.id}).from(maxReceipts)
      .where(and(eq(maxReceipts.caseId,id),eq(maxReceipts.userId,userId))).limit(1),
  ]);
  if(progressMoney.length||pledgeMoney.length||receiptMoney.length){
    res.status(409).json({error:"This case has audited monetary records. Close it to preserve the financial history."});
    return;
  }
  // A genuine, explicitly confirmed deletion. Ordinary completion never
  // calls DELETE. Snapshot the project's final nonfinancial state separately
  // before destroying the row and its child notes/follow-ups.
  await db.transaction(async tx=>{
    const [whole]=await tx.select().from(askanuscases).where(and(
      eq(askanuscases.id,id),eq(askanuscases.userId,userId))).for("update");
    if(!whole)throw Error("CASE_NOT_FOUND");
    await tx.insert(maxHistoryEvents).values({
      userId,caseId:id,entityType:"case",entityId:id,
      action:"case_explicitly_deleted",title:whole.title,
      details:JSON.stringify({title:whole.title,status:whole.status,
        description:whole.description,goalAmount:whole.goalAmount}),
    });
    await tx.delete(caseActivityLog).where(eq(caseActivityLog.caseId,id));
    await tx.delete(caseFollowups).where(eq(caseFollowups.caseId,id));
    await tx.delete(askanuscases).where(and(eq(askanuscases.id,id),eq(askanuscases.userId,userId)));
  });
  res.json({ ok: true });
});

// Unified progress update — handles all UpdateProgressDialog actions atomically
router.post("/askanus/cases/:id/progress", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const { action, amount, note, from, dueDate, dueTime, timeZone, repeatRule, status, goal } = req.body;
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
  if (action === "followup" && (!validDateString(dueDate) || !validFollowupTime(dueTime,timeZone) || (dueTime && !dueDate))) {
    res.status(400).json({ error: "invalid follow-up date" });
    return;
  }
  if(action==="followup" && (!isRepeatRule(repeatRule||"none") ||
       (repeatRule && repeatRule!=="none" && !dueDate))){
    res.status(400).json({error:"Recurring follow-ups require a valid rule and date"});return;
  }
  if (action === "status" && !CASE_STATUSES.has(String(status || ""))) {
    res.status(400).json({ error: "invalid status" });
    return;
  }

  // User-provided idempotency key prevents double-counting if the network retries.
  // This route shares the MAX pledge/receipt ledger and uses atomic SQL increments.
  if(action==="funds_received" || action==="funds_promised"){
    const requestId=String(req.body?.requestId??"").trim();
    const amountNumber=Number(amount);
    if(requestId.length<12 || requestId.length>128 ||
       !Number.isFinite(amountNumber) || amountNumber<=0 || amountNumber>9999999999 ||
       Math.abs(amountNumber*100-Math.round(amountNumber*100))>0.000001){
      res.status(400).json({error:"A valid unique requestId and cents-precise positive amount are required"});
      return;
    }
    const event=await db.transaction(async tx=>{
      const [created]=await tx.insert(maxProgressEvents).values({
        userId,caseId:id,eventKind:action,amount:String(amountNumber),requestId,
      }).onConflictDoNothing().returning();
      if(!created){
        const [prior]=await tx.select().from(maxProgressEvents).where(and(
          eq(maxProgressEvents.userId,userId),eq(maxProgressEvents.requestId,requestId)));
        if(!prior || prior.caseId!==id || prior.eventKind!==action ||
           Number(prior.amount)!==amountNumber) return "conflict" as const;
        return "duplicate" as const;
      }
      if(action==="funds_received"){
        await tx.insert(maxReceipts).values({
          userId,caseId:id,amount:String(amountNumber),
          method:"other",verification:"manually_reported",
          requestId:"my-progress:"+requestId,reference:String(note||"").slice(0,240),
        });
      } else {
        await tx.insert(maxPledges).values({
          userId,caseId:id,amount:String(amountNumber),
          note:from?"צוגעזאגט דורך "+String(from).slice(0,160):"מאנועל איינגעשריבענע התחייבות",
        });
      }
      await tx.insert(caseActivityLog).values({
        caseId:id,date:today,type:action,
        amount:String(amountNumber),
        note:action==="funds_received"
          ? String(note||"$"+amountNumber.toFixed(2)+" manually reported received").slice(0,1500)
          : "$"+amountNumber.toFixed(2)+" pledged"+(from?" by "+String(from).slice(0,160):""),
      });
      const [updated]=await tx.update(askanuscases).set({
        ...(action==="funds_received"
          ? {fundsReceived:sql`${askanuscases.fundsReceived} + ${String(amountNumber)}`}
          : {fundsPromised:sql`${askanuscases.fundsPromised} + ${String(amountNumber)}`}),
        lastUpdated:new Date(),
      }).where(and(eq(askanuscases.id,id),eq(askanuscases.userId,userId))).returning();
      if(!updated)throw new Error("Owned case missing during progress update");
      return "created" as const;
    });
    if(event==="conflict"){res.status(409).json({error:"Request key conflicts with another money entry"});return;}
    res.setHeader("Cache-Control","private, no-store");
    const full=await getCaseWithDetails(id,userId);
    res.json(full);
    return;
  }

  // Metadata updates and their historical audit records must commit together.
  await db.transaction(async tx=>{
    const caseUpdates: Record<string, unknown> = { lastUpdated: new Date() };

  if (action === "goal" && goal !== undefined) {
    caseUpdates.goalAmount = String(goal);
    await tx.insert(caseActivityLog).values({
      caseId: id, date: today, type: "update",
      note: `Goal updated to $${Number(goal).toLocaleString()}`,
    });
  } else if (action === "note" && note) {
    await tx.insert(caseActivityLog).values({ caseId: id, date: today, type: "note", note: String(note).trim().slice(0, 1500) });
  } else if (action === "followup" && note) {
    const [newFollowup]=await tx.insert(caseFollowups).values({ caseId: id, date: today,
      note: String(note).trim().slice(0, 1500), dueDate: dueDate || null,
      dueTime:dueTime||null, timeZone:dueTime?timeZone:null,
      repeatRule:repeatRule||"none",
      repeatAnchorDay:repeatRule==="monthly"&&dueDate?Number(dueDate.slice(-2)):null,
    }).returning();
    await tx.insert(maxHistoryEvents).values({
      userId,caseId:id,entityType:"followup",entityId:newFollowup.id,
      action:"followup_created",title:newFollowup.note.slice(0,240),
      details:JSON.stringify({note:newFollowup.note,dueDate:newFollowup.dueDate,
        dueTime:newFollowup.dueTime,repeatRule:newFollowup.repeatRule}),
    });
  } else if (action === "status" && status) {
    caseUpdates.status = status;
    caseUpdates.closedAt=status==="closed"?(existing.status==="closed"?existing.closedAt||new Date():new Date()):null;
    await tx.insert(maxHistoryEvents).values({
      userId,caseId:id,entityType:"case",entityId:id,
      action:status==="closed"?"case_completed":status==="open"?"case_reopened":"case_status_changed",
      title:existing.title,
      details:JSON.stringify({status,previousStatus:existing.status}),
    });
    await tx.insert(caseActivityLog).values({
      caseId: id, date: today, type: "status_change",
      note: `Status changed to ${status.replace("_", " ")}`,
    });
  }

  if (Object.keys(caseUpdates).length > 1) {
    await tx.update(askanuscases).set(caseUpdates).where(eq(askanuscases.id, id));
  }

  });
  const full = await getCaseWithDetails(id, userId);
  res.json(full);
});

// Idempotent completion with one, linked future follow-up per recurring event.
router.patch("/askanus/followups/:id/toggle", requireAuth, async(req,res)=>{
  const id=Number(req.params.id),userId=getSessionUserId(req)!;
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid ID"});return;}
  if(req.body?.completed!==undefined && typeof req.body.completed!=="boolean"){
    res.status(400).json({error:"completed must be a boolean"});return;
  }
  const result=await db.transaction(async tx=>{
    const [existing]=await tx.select().from(caseFollowups).where(eq(caseFollowups.id,id));
    if(!existing)return {kind:"missing" as const};
    const [owned]=await tx.select({id:askanuscases.id}).from(askanuscases)
      .where(and(eq(askanuscases.id,existing.caseId),eq(askanuscases.userId,userId)));
    if(!owned)return {kind:"missing" as const};
    const desired=typeof req.body?.completed==="boolean"?req.body.completed:!existing.completed;
    if(desired===existing.completed)return {kind:"same" as const,row:existing};
    const [updated]=await tx.update(caseFollowups).set({
      completed:desired,completedAt:desired?new Date():null,
    })
      .where(and(eq(caseFollowups.id,id),eq(caseFollowups.completed,existing.completed)))
      .returning();
    if(!updated)return {kind:"conflict" as const};
    await tx.insert(maxHistoryEvents).values({
      userId,caseId:existing.caseId,entityType:"followup",entityId:id,
      action:desired?"followup_completed":"followup_reopened",
      title:existing.note.slice(0,240),
      details:JSON.stringify({note:existing.note,dueDate:existing.dueDate,
        dueTime:existing.dueTime,timeZone:existing.timeZone,
        repeatRule:existing.repeatRule,previousCompleted:existing.completed,
        completed:desired,completedAt:updated.completedAt?.toISOString()??null}),
    });
    if(desired && isRepeatRule(existing.repeatRule) && existing.repeatRule!=="none" && existing.dueDate){
      const nextDate=nextRepeatDate(existing.dueDate,existing.repeatRule,existing.repeatAnchorDay);
      if(nextDate){
        // The database unique generated_from_id index prevents double generation.
        const [next]=await tx.insert(caseFollowups).values({
          caseId:existing.caseId,date:new Date().toISOString().slice(0,10),
          note:existing.note,dueDate:nextDate,dueTime:existing.dueTime,
          timeZone:existing.timeZone,repeatRule:existing.repeatRule,
          repeatAnchorDay:existing.repeatAnchorDay||Number(existing.dueDate.slice(-2)),
          generatedFromId:id,
        }).onConflictDoNothing().returning();
        if(next){
          await tx.insert(maxHistoryEvents).values({
            userId,caseId:existing.caseId,entityType:"followup",entityId:next.id,
            action:"followup_recurring_generated",title:next.note.slice(0,240),
            details:JSON.stringify({dueDate:next.dueDate,dueTime:next.dueTime,
              generatedFromId:existing.id,repeatRule:next.repeatRule}),
          });
          // Donor 360 and My Askanus always see the same new follow-up.
          const [contact]=await tx.select().from(maxFollowupContacts)
            .where(and(eq(maxFollowupContacts.followupId,id),eq(maxFollowupContacts.userId,userId)));
          if(contact)await tx.insert(maxFollowupContacts).values({
            userId,contactId:contact.contactId,followupId:next.id,
          });
        }
      }
    }
    return {kind:"saved" as const,row:updated};
  });
  if(result.kind==="missing"){res.status(404).json({error:"Not found"});return;}
  if(result.kind==="conflict"){res.status(409).json({error:"Follow-up was changed by another request; refresh"});return;}
  res.setHeader("Cache-Control","private, no-store");
  res.json({...result.row,createdAt:result.row.createdAt.toISOString()});
});

// Edit the SAME case follow-up from My Askanus or Communications MAX.
// Authorization is performed in the UPDATE predicate, not trusted from the caller.
router.patch("/askanus/followups/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid follow-up ID" }); return;
  }
  const updates: Partial<typeof caseFollowups.$inferInsert> = {};
  if (req.body?.note !== undefined) {
    const note = String(req.body.note ?? "").trim();
    if (!note || note.length > 1500) { res.status(400).json({ error: "Invalid note" }); return; }
    updates.note = note;
  }
  if (req.body?.dueDate !== undefined) {
    if (!validDateString(req.body.dueDate)) {
      res.status(400).json({ error: "Invalid due date" }); return;
    }
    updates.dueDate = req.body.dueDate ? String(req.body.dueDate) : null;
  }
  if (req.body?.dueTime !== undefined || req.body?.timeZone !== undefined) {
    const [existingFollowup]=await db.select({dueDate:caseFollowups.dueDate,dueTime:caseFollowups.dueTime,timeZone:caseFollowups.timeZone})
      .from(caseFollowups).where(and(eq(caseFollowups.id,id),sql`EXISTS (SELECT 1 FROM askanus_cases ac WHERE ac.id=${caseFollowups.caseId} AND ac.user_id=${userId})`));
    if(!existingFollowup){res.status(404).json({error:"Not found"});return;}
    const dueTime=req.body?.dueTime===undefined?existingFollowup.dueTime:req.body.dueTime;
    const timeZone=req.body?.timeZone===undefined?existingFollowup.timeZone:req.body.timeZone;
    const actualDate=req.body?.dueDate===undefined?existingFollowup.dueDate:req.body.dueDate;
    if(!validFollowupTime(dueTime,timeZone) || (dueTime && !actualDate)){
      res.status(400).json({error:"Invalid follow-up time/timezone"});return;
    }
    updates.dueTime=dueTime||null;
    updates.timeZone=dueTime?timeZone:null;
  }
  if(req.body?.repeatRule!==undefined){
    if(!isRepeatRule(req.body.repeatRule)){
      res.status(400).json({error:"Invalid repeat rule"});return;
    }
    const [current]=await db.select({dueDate:caseFollowups.dueDate,completed:caseFollowups.completed})
      .from(caseFollowups).where(and(eq(caseFollowups.id,id),
        sql`EXISTS (SELECT 1 FROM askanus_cases ac WHERE ac.id=${caseFollowups.caseId} AND ac.user_id=${userId})`));
    if(!current){res.status(404).json({error:"Not found"});return;}
    if(current.completed){
      res.status(409).json({error:"Reopen the completed follow-up before changing its recurrence"});return;
    }
    const futureDate=req.body?.dueDate===undefined?current.dueDate:req.body.dueDate;
    if(req.body.repeatRule!=="none"&&!futureDate){
      res.status(400).json({error:"A recurring follow-up requires a due date"});return;
    }
    updates.repeatRule=req.body.repeatRule;
    updates.repeatAnchorDay=req.body.repeatRule==="monthly"&&futureDate
      ?Number(String(futureDate).slice(-2)):null;
  }
  if (!Object.keys(updates).length) {
    res.status(400).json({ error: "Nothing to update" }); return;
  }
  const updated=await db.transaction(async tx=>{
    const ownedPredicate=and(eq(caseFollowups.id,id),
      sql`EXISTS (SELECT 1 FROM askanus_cases ac
        WHERE ac.id=${caseFollowups.caseId} AND ac.user_id=${userId})`);
    const [previous]=await tx.select().from(caseFollowups)
      .where(ownedPredicate).for("update");
    if(!previous)return null;
    const [current]=await tx.update(caseFollowups).set(updates)
      .where(ownedPredicate).returning();
    if(!current)return null;
    const changed=Object.keys(updates).some(k=>{
      const key=k as keyof typeof current;
      return current[key]!==previous[key];
    });
    if(changed)await tx.insert(maxHistoryEvents).values({
      userId,caseId:current.caseId,entityType:"followup",entityId:id,
      action:"followup_edited",title:current.note.slice(0,240),
      details:JSON.stringify({
        before:{note:previous.note,dueDate:previous.dueDate,dueTime:previous.dueTime,
          timeZone:previous.timeZone,repeatRule:previous.repeatRule},
        after:{note:current.note,dueDate:current.dueDate,dueTime:current.dueTime,
          timeZone:current.timeZone,repeatRule:current.repeatRule},
      }),
    });
    return current;
  });
  if (!updated) { res.status(404).json({ error: "Follow-up not found" }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// Permanently delete an individual follow-up only if the authenticated account
// owns its parent case. Completing a follow-up NEVER deletes it; this route does.
router.delete("/askanus/followups/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid follow-up ID" });
    return;
  }

  // Explicit Delete is different from Done. Snapshot the deleted work first.
  // The historical event is independent of the source row and survives forever
  // unless a separate, expressly authorized history-purge process is introduced.
  const deleted = await db.transaction(async tx=>{
    const [row]=await tx.delete(caseFollowups).where(and(
      eq(caseFollowups.id,id),
      sql`EXISTS (
        SELECT 1 FROM askanus_cases ac
        WHERE ac.id=${caseFollowups.caseId} AND ac.user_id=${userId}
      )`,
    )).returning();
    if(row){
      await tx.insert(maxHistoryEvents).values({
        userId,caseId:row.caseId,entityType:"followup",entityId:row.id,
        action:"followup_explicitly_deleted",title:row.note.slice(0,240),
        details:JSON.stringify({note:row.note,dueDate:row.dueDate,
          dueTime:row.dueTime,completed:row.completed,repeatRule:row.repeatRule}),
      });
    }
    return row;
  });

  if (!deleted) {
    res.status(404).json({ error: "Follow-up not found" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ ok: true, deletedId: deleted.id });
});

// --- Tasks ---

router.get("/askanus/tasks", requireAuth, async (req, res) => {
  const tasks = await db.select().from(askanustasks)
    .where(eq(askanustasks.userId, getSessionUserId(req)!))
    .orderBy(desc(askanustasks.createdAt));
  res.json(tasks.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.post("/askanus/tasks", requireAuth, async (req, res) => {
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
    priority: cleanPriority as "low" | "medium" | "high",
    notes: notes ? String(notes).trim().slice(0, 3000) : "",
  }).returning();
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.patch("/askanus/tasks/:id", requireAuth, async (req, res) => {
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
    updates.completedAt=completed?new Date():null;
  }
  if (priority !== undefined) {
    const clean = String(priority);
    if (!TASK_PRIORITIES.has(clean)) { res.status(400).json({ error: "invalid priority" }); return; }
    updates.priority = clean;
  }
  if (notes !== undefined) updates.notes = String(notes ?? "").trim().slice(0, 3000);
  const userId=getSessionUserId(req)!;
  const updated=await db.transaction(async tx=>{
    const [previous]=await tx.select().from(askanustasks).where(and(
      eq(askanustasks.id,id),eq(askanustasks.userId,userId))).for("update");
    if(!previous)return null;
    if(completed!==undefined&&completed===previous.completed){
      updates.completedAt=previous.completedAt;
    }
    const [current]=await tx.update(askanustasks).set(updates).where(and(
      eq(askanustasks.id,id),eq(askanustasks.userId,userId))).returning();
    if(!current)return null;
    // An HTTP retry that leaves the same final state does not manufacture
    // another "completed" historical event.
    const changed=Object.keys(updates).some(k=>{
      const key=k as keyof typeof current;
      return current[key]!==previous[key];
    });
    if(changed){
      await tx.insert(maxHistoryEvents).values({
        userId,caseId:null,entityType:"task",entityId:id,
        action:completed!==undefined&&completed!==previous.completed
          ?(completed?"task_completed":"task_reopened"):"task_edited",
        title:current.title,
        details:JSON.stringify({title:current.title,caseTitle:current.caseTitle,
          deadline:current.deadline,completed:current.completed,
          priority:current.priority,notes:current.notes}),
      });
    }
    return current;
  });
  if(!updated){res.status(404).json({error:"Not found"});return;}
  res.json({...updated,createdAt:updated.createdAt.toISOString()});
});

router.delete("/askanus/tasks/:id", requireAuth, async (req, res) => {
  const userId=getSessionUserId(req)!,id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid task ID"});return;}
  const removed=await db.transaction(async tx=>{
    const [row]=await tx.delete(askanustasks).where(and(
      eq(askanustasks.id,id),eq(askanustasks.userId,userId))).returning();
    if(row)await tx.insert(maxHistoryEvents).values({
      userId,caseId:null,entityType:"task",entityId:id,action:"task_explicitly_deleted",
      title:row.title,
      details:JSON.stringify({title:row.title,completed:row.completed,notes:row.notes}),
    });
    return row;
  });
  if(!removed){res.status(404).json({error:"Task not found"});return;}
  res.json({ok:true});
});

// --- Notes ---

router.get("/askanus/notes", requireAuth, async (req, res) => {
  const notes = await db.select().from(askanusnotes)
    .where(eq(askanusnotes.userId, getSessionUserId(req)!))
    .orderBy(desc(askanusnotes.createdAt));
  res.json(notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

router.post("/askanus/notes", requireAuth, async (req, res) => {
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

router.patch("/askanus/notes/:id", requireAuth, async (req, res) => {
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

router.delete("/askanus/notes/:id", requireAuth, async (req, res) => {
  await db.delete(askanusnotes).where(
    and(eq(askanusnotes.id, Number(req.params.id)), eq(askanusnotes.userId, getSessionUserId(req)!))
  );
  res.json({ ok: true });
});

export default router;
