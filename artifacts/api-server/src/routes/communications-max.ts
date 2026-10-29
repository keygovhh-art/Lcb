import { Router } from "express";
import { db } from "@workspace/db";
import { askanuscases, caseActivityLog, caseFollowups, communicationContacts, fundraisingCallReports, maxPledges, maxReceipts, maxFollowupContacts, maxHistoryEvents, maxDonorRecontacts } from "@workspace/db/schema";
import { and, desc, eq, sql, or, ilike } from "drizzle-orm";
import { getSessionUserId, requireAuth } from "../middlewares/auth";
import { isRepeatRule, validCalendarDate } from "../lib/followup-recurrence";
import { computeMaxCallback,computeMaxRecontact,maxMoods, type MaxCallbackPlan,type MaxRecontactPlan } from "../lib/max-calling-workflow";

const router = Router();
const moneyKinds = new Set(["none", "received", "pledged"]);
const outcomes = new Set(["gave", "no_answer", "callback", "not_interested", "do_not_call", "other", "spoke"]); // legacy spoke remains readable/accepted, but hidden in new UX
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const cleanTags = (value: unknown) => {
  const original=clean(value,600);
  return [...new Set(original.split(/[,;]+/).map(t=>t.trim()).filter(Boolean))]
    .slice(0,20).map(t=>t.slice(0,40)).join(", ").slice(0,400);
};
const isoDate = validCalendarDate;
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
    ilike(communicationContacts.organization,"%"+escapedTerm+"%"),
    ilike(communicationContacts.city,"%"+escapedTerm+"%"),
    ilike(communicationContacts.tags,"%"+escapedTerm+"%"),

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
  const created=await db.transaction(async tx=>{
    const [newContact]=await tx.insert(communicationContacts).values({
      userId,name,phone:clean(req.body?.phone,80),
      email:clean(req.body?.email,240),notes:clean(req.body?.notes,4000),
      organization:clean(req.body?.organization,200),
      city:clean(req.body?.city,120),tags:cleanTags(req.body?.tags),
      preferredTimezone:clean(req.body?.preferredTimezone||"America/New_York",80),
    }).returning();
    await tx.insert(maxHistoryEvents).values({
      userId,caseId:null,entityType:"contact",entityId:newContact.id,
      action:"contact_created",title:newContact.name,
      details:JSON.stringify({name:newContact.name,
        organization:newContact.organization,city:newContact.city,tags:newContact.tags}),
    });
    return newContact;
  });
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
    updates.doNotCall = req.body.doNotCall;
    updates.optOutReason = clean(req.body?.optOutReason,500);
  }
  if(req.body?.organization!==undefined)updates.organization=clean(req.body.organization,200);
  if(req.body?.city!==undefined)updates.city=clean(req.body.city,120);
  if(req.body?.tags!==undefined)updates.tags=cleanTags(req.body.tags);
  if (req.body?.preferredHours !== undefined) updates.preferredHours = clean(req.body.preferredHours,240);
  if (req.body?.contactRole !== undefined) updates.contactRole = clean(req.body.contactRole,64);
  if (req.body?.relationshipNotes !== undefined) updates.relationshipNotes = clean(req.body.relationshipNotes,1500);
  if (req.body?.preferredTimezone !== undefined) updates.preferredTimezone = clean(req.body.preferredTimezone,80);

  const userId=getSessionUserId(req)!,contactId=Number(req.params.id);
  const result=await db.transaction(async tx=>{
    const [prior]=await tx.select().from(communicationContacts).where(and(
      eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)
    )).for("update");
    if(!prior)return {kind:"missing" as const};
    if(req.body?.doNotCall===false&&prior.doNotCall){
      return {kind:"audit_required" as const};
    }
    const [current]=await tx.update(communicationContacts).set(updates).where(and(
      eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)
    )).returning();
    const historyFields=[
      "name","phone","email","notes","organization","city","tags",
      "doNotCall","optOutReason","preferredHours","contactRole",
      "relationshipNotes","preferredTimezone",
    ] as const;
    const changes:Record<string,{before:unknown;after:unknown}>={};
    for(const field of historyFields){
      if(prior[field]!==current[field]){
        changes[field]={before:prior[field],after:current[field]};
      }
    }
    if(Object.keys(changes).length){
      await tx.insert(maxHistoryEvents).values({
        userId,caseId:null,entityType:"contact",entityId:contactId,
        action:prior.doNotCall!==current.doNotCall&&current.doNotCall
          ?"contact_marked_do_not_call":"contact_updated",
        title:current.name,details:JSON.stringify({changes}),
      });
    }
    return {kind:"saved" as const,row:current};
  });
  if(result.kind==="missing"){res.status(404).json({error:"Not found"});return;}
  if(result.kind==="audit_required"){
    res.status(409).json({error:"Use the explicitly audited owner override or donor permission workflow"});return;
  }
  res.json(formatContact(result.row));
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
  // Only a distinct, explicit confirmation allows a recorded Do Not Call
  // request to update the contact-wide blocking flag.
  const doNotCallConfirmed = body.doNotCallConfirmed === true;
  const moneyKind = clean(body.moneyKind, 32) || "none";
  const amount = Number(body.amount ?? 0);
  const followupNote = clean(body.followupNote, 1500);
  const dueDate = clean(body.dueDate, 10) || null;
  const dueTime = clean(body.dueTime, 5) || null;
  const timeZone = clean(body.timeZone, 80) || null;
  const repeatRule = clean(body.repeatRule || "none",20);
  const callbackPlan = body.callbackPlan as MaxCallbackPlan|undefined;
  const recontactPlan = body.recontactPlan as MaxRecontactPlan|undefined;
  const localZone = clean(body.timeZone || "America/New_York",80);
  let calculatedCallback:ReturnType<typeof computeMaxCallback>=null;
  let calculatedRecontact:Date|null=null;
  try{
    if(callbackPlan)calculatedCallback=computeMaxCallback(callbackPlan,new Date(),localZone);
    if(recontactPlan)calculatedRecontact=computeMaxRecontact(recontactPlan,new Date());
  }catch(e){
    res.status(400).json({error:e instanceof Error?e.message:"Invalid MAX callback or recontact schedule"});return;
  }
  if(calculatedRecontact&&(body.contactId===null||body.contactId===undefined||body.contactId==="")){
    res.status(400).json({error:"Choose an existing donor to schedule a future eligibility review"});return;
  }
  if(dueTime){
    try{if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime)||!timeZone)throw Error();
      new Intl.DateTimeFormat("en-US",{timeZone}).format();
    }catch{res.status(400).json({error:"Invalid reminder time or time zone"});return;}
  }
  const contactId = body.contactId == null || body.contactId === "" ? null : Number(body.contactId);
  const mood = clean(body.mood || "neutral",40);

  if (!safeId(caseId) || !requestId || requestId.length < 12 ||
      !new Set<string>([...maxMoods]).has(mood) ||
      !contactName || !outcomes.has(outcome) || !moneyKinds.has(moneyKind) ||
      (outcome==="gave" && moneyKind==="none") ||
      ((mood==="gave_generously"||mood==="warm_and_gave_generously") && moneyKind==="none") ||
      (outcome==="no_answer" && moneyKind!=="none") ||
      (outcome==="do_not_call" && !!calculatedRecontact) ||
      !Number.isFinite(amount) || amount < 0 || amount > 9999999999 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 ||
      (moneyKind === "none" && amount !== 0) ||
      (moneyKind !== "none" && amount <= 0) ||
      !isoDate(dueDate) || !isRepeatRule(repeatRule) ||
      (repeatRule!=="none" && (!followupNote||!dueDate)) || (dueTime && (!followupNote || !dueDate)) || (followupNote && !dueDate && body.dueDate) ||
      (contactId !== null && !safeId(contactId)) ||
      (outcome === "do_not_call" && (contactId === null || !doNotCallConfirmed)) ||
      (outcome !== "do_not_call" && doNotCallConfirmed)) {
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
    if(outcome==="do_not_call" && doNotCallConfirmed && contactId!==null) {
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
    const effectiveFollowup=calculatedCallback
      ? (followupNote||"צוריק רופן נאכן פארענדיגן דעם רוף")
      : followupNote;
    const effectiveDate=calculatedCallback?.date||dueDate;
    const effectiveTime=calculatedCallback?.time||dueTime;
    const effectiveZone=calculatedCallback?.timeZone||timeZone;
    if (effectiveFollowup) {
      const [followup]=await tx.insert(caseFollowups).values({
        caseId,date:today,note:effectiveFollowup,dueDate:effectiveDate,dueTime:effectiveTime,timeZone:effectiveTime?effectiveZone:null,
        repeatRule,repeatAnchorDay:repeatRule==="monthly"&&dueDate?Number(dueDate.slice(-2)):null,
      }).returning();
      if(contactId!==null)await tx.insert(maxFollowupContacts).values({
        userId,contactId,followupId:followup.id,
      });
    }
    if(calculatedRecontact && contactId!==null){
      // An eligibility window is informational; DNC remains in force and
      // eligibility NEVER triggers an automatic outgoing call.
      await tx.insert(maxDonorRecontacts).values({
        userId,caseId,contactId,scope:recontactPlan!.scope,
        dueAt:calculatedRecontact,sourceReportId:saved.id,status:"waiting",
      }).onConflictDoUpdate({
        target:[maxDonorRecontacts.userId,maxDonorRecontacts.contactId,
          maxDonorRecontacts.caseId,maxDonorRecontacts.scope],
        set:{dueAt:calculatedRecontact,sourceReportId:saved.id,
          status:"waiting",updatedAt:new Date()},
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
    callbackDueAt:result.kind==="created"?calculatedCallback?.dueAt||null:null,
    callbackTimeZone:result.kind==="created"?calculatedCallback?.timeZone||null:null,
    recontactDueAt:result.kind==="created"?calculatedRecontact?.toISOString()||null:null,
  });
});


// All categories are based on SAVED results, not assumed phone-call statuses.
// Counts aggregate all historical records, including old legacy "spoke" reports.
router.get("/askanus/max/outcome-groups",requireAuth,async(req,res)=>{
 const userId=getSessionUserId(req)!;
 const group=clean(req.query.outcome,40);
 if(group && !outcomes.has(group)){res.status(400).json({error:"Unknown outcome"});return;}
 const counts=await db.select({
  outcome:fundraisingCallReports.outcome,
  count:sql<number>`cast(count(*) as integer)`
 }).from(fundraisingCallReports).where(eq(fundraisingCallReports.userId,userId))
  .groupBy(fundraisingCallReports.outcome);
 const results=await db.select().from(fundraisingCallReports)
  .where(group?and(eq(fundraisingCallReports.userId,userId),eq(fundraisingCallReports.outcome,group)):
    eq(fundraisingCallReports.userId,userId))
  .orderBy(desc(fundraisingCallReports.createdAt)).limit(100);
 res.setHeader("Cache-Control","private,no-store");
 res.json({groups:counts,items:results.map(formatCall)});
});

router.get("/askanus/max/recontact",requireAuth,async(req,res)=>{
 const userId=getSessionUserId(req)!;
 const filter=clean(req.query.filter||"all",20);
 if(!["all","due","waiting","done"].includes(filter)){
  res.status(400).json({error:"Invalid recontact filter"});return;
 }
 const rows=await db.select({
  record:maxDonorRecontacts,donor:communicationContacts.name,
  doNotCall:communicationContacts.doNotCall,project:askanuscases.title
 }).from(maxDonorRecontacts)
  .innerJoin(communicationContacts,and(eq(communicationContacts.id,maxDonorRecontacts.contactId),
    eq(communicationContacts.userId,userId)))
  .innerJoin(askanuscases,and(eq(askanuscases.id,maxDonorRecontacts.caseId),
    eq(askanuscases.userId,userId)))
  .where(and(eq(maxDonorRecontacts.userId,userId),
    filter==="done"?eq(maxDonorRecontacts.status,"done"):
    filter==="due"?and(eq(maxDonorRecontacts.status,"waiting"),sql`${maxDonorRecontacts.dueAt}<=now()`):
    filter==="waiting"?and(eq(maxDonorRecontacts.status,"waiting"),sql`${maxDonorRecontacts.dueAt}>now()`):
    sql`true`))
  .orderBy(maxDonorRecontacts.dueAt).limit(300);
 res.setHeader("Cache-Control","private,no-store");
 res.json({items:rows.map(({record,donor,doNotCall,project})=>({
  ...record,donor,doNotCall,project,
  dueAt:record.dueAt.toISOString(),
  eligible:record.status==="waiting"&&record.dueAt.getTime()<=Date.now()&&!doNotCall,
  canAutoCall:false
 }))});
});

export default router;
