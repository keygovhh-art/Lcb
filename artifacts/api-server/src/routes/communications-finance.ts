import { Router } from "express";
import { db } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSessionUserId, requireAuth } from "../middlewares/auth";
import {
  askanuscases, caseActivityLog, caseFollowups, communicationContacts,
  fundraisingCallReports, maxPledges, maxReceipts, maxFollowupContacts,
} from "@workspace/db/schema";

const router=Router();
const clean=(value:unknown,max=300)=>String(value??"").trim().slice(0,max);
const idOk=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const centsOk=(v:unknown)=>{
  const n=Number(v);
  return Number.isFinite(n)&&n>0&&n<=9999999999
    && Math.abs(n*100-Math.round(n*100))<0.000001;
};
const datesOk=(v:unknown)=>!v||/^\d{4}-\d{2}-\d{2}$/.test(String(v));
const methods=new Set(["cash","check","card","bank","external","other"]);
const shapePledge=(x:typeof maxPledges.$inferSelect)=>({
  ...x,amount:Number(x.amount),paidAmount:Number(x.paidAmount),
  remaining:Math.max(0,Number(x.amount)-Number(x.paidAmount)),
  createdAt:x.createdAt.toISOString(),updatedAt:x.updatedAt.toISOString(),
});
const shapeReceipt=(x:typeof maxReceipts.$inferSelect)=>({
  ...x,amount:Number(x.amount),createdAt:x.createdAt.toISOString(),
});

router.get("/askanus/finance/overview",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const rawCaseId=req.query.caseId;
  const caseId=rawCaseId===undefined?null:Number(rawCaseId);
  if(caseId!==null&&!idOk(caseId)){res.status(400).json({error:"Invalid case ID"});return;}
  if(caseId!==null){
    const [owned]=await db.select({id:askanuscases.id}).from(askanuscases)
      .where(and(eq(askanuscases.id,caseId),eq(askanuscases.userId,userId)));
    if(!owned){res.status(404).json({error:"Not found"});return;}
  }
  const [pledges,receipts]=await Promise.all([
    db.select().from(maxPledges)
      .where(caseId===null?eq(maxPledges.userId,userId):and(eq(maxPledges.userId,userId),eq(maxPledges.caseId,caseId)))
      .orderBy(desc(maxPledges.createdAt)).limit(300),
    db.select().from(maxReceipts)
      .where(caseId===null?eq(maxReceipts.userId,userId):and(eq(maxReceipts.userId,userId),eq(maxReceipts.caseId,caseId)))
      .orderBy(desc(maxReceipts.createdAt)).limit(300),
  ]);
  res.setHeader("Cache-Control","private, no-store");
  res.json({pledges:pledges.map(shapePledge),receipts:receipts.map(shapeReceipt),
    note:"Received figures are manually reported until verified externally."});
});

router.get("/askanus/contacts/:id/360",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const contactId=Number(req.params.id);
  if(!idOk(contactId)){res.status(400).json({error:"Invalid contact ID"});return;}
  const [contact]=await db.select().from(communicationContacts).where(and(
    eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)));
  if(!contact){res.status(404).json({error:"Not found"});return;}
  const [calls,pledges,receipts,links]=await Promise.all([
    db.select().from(fundraisingCallReports).where(and(
      eq(fundraisingCallReports.userId,userId),eq(fundraisingCallReports.contactId,contactId)))
      .orderBy(desc(fundraisingCallReports.createdAt)).limit(200),
    db.select().from(maxPledges).where(and(
      eq(maxPledges.userId,userId),eq(maxPledges.contactId,contactId)))
      .orderBy(desc(maxPledges.createdAt)).limit(200),
    db.select().from(maxReceipts).where(and(
      eq(maxReceipts.userId,userId),eq(maxReceipts.contactId,contactId)))
      .orderBy(desc(maxReceipts.createdAt)).limit(200),
    db.select({followup:caseFollowups}).from(maxFollowupContacts)
      .innerJoin(caseFollowups,eq(maxFollowupContacts.followupId,caseFollowups.id))
      .where(and(eq(maxFollowupContacts.userId,userId),eq(maxFollowupContacts.contactId,contactId)))
      .orderBy(desc(caseFollowups.createdAt)).limit(200),
  ]);
  res.setHeader("Cache-Control","private, no-store");
  res.json({
    contact:{...contact,createdAt:contact.createdAt.toISOString(),updatedAt:contact.updatedAt.toISOString()},
    calls:calls.map(c=>({...c,amount:Number(c.amount),createdAt:c.createdAt.toISOString()})),
    pledges:pledges.map(shapePledge),receipts:receipts.map(shapeReceipt),
    followups:links.map(({followup:f})=>({...f,createdAt:f.createdAt.toISOString()})),
  });
});

// Add a donor-specific follow-up, but store the actual record in the SHARED
// case_followups table. My Askanus and MAX therefore see one record and one id.
router.post("/askanus/contacts/:id/followups",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const contactId=Number(req.params.id),caseId=Number(req.body?.caseId);
  const note=clean(req.body?.note,1500);
  const dueDate=clean(req.body?.dueDate,10)||null;
  if(!idOk(contactId)||!idOk(caseId)||!note||!datesOk(dueDate)){
    res.status(400).json({error:"Invalid follow-up"});return;
  }
  const [ownedCase,ownedContact]=await Promise.all([
    db.select({id:askanuscases.id}).from(askanuscases).where(and(
      eq(askanuscases.id,caseId),eq(askanuscases.userId,userId))),
    db.select({id:communicationContacts.id}).from(communicationContacts).where(and(
      eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId))),
  ]);
  if(!ownedCase.length||!ownedContact.length){res.status(404).json({error:"Not found"});return;}
  const today=new Date().toISOString().slice(0,10);
  const created=await db.transaction(async tx=>{
    const [f]=await tx.insert(caseFollowups).values({caseId,date:today,note,dueDate}).returning();
    await tx.insert(maxFollowupContacts).values({userId,contactId,followupId:f.id});
    return f;
  });
  res.status(201).json({...created,createdAt:created.createdAt.toISOString()});
});

// Apply a real PARTIAL PAYMENT to one specific pledge without adding a second
// pledge or losing the remaining balance. Duplicate requests never add twice.
router.post("/askanus/pledges/:id/settlements",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const pledgeId=Number(req.params.id);
  const amount=Number(req.body?.amount);
  const requestId=clean(req.body?.requestId,128);
  const method=clean(req.body?.method||"other",32);
  const reference=clean(req.body?.reference,240);
  if(!idOk(pledgeId)||!centsOk(amount)||requestId.length<12||!methods.has(method)){
    res.status(400).json({error:"Invalid payment details"});return;
  }
  const [pledge]=await db.select().from(maxPledges).where(and(
    eq(maxPledges.id,pledgeId),eq(maxPledges.userId,userId)));
  if(!pledge){res.status(404).json({error:"Pledge not found"});return;}
  try{
    const result=await db.transaction(async tx=>{
      const [receipt]=await tx.insert(maxReceipts).values({
        userId,caseId:pledge.caseId,contactId:pledge.contactId,pledgeId,
        amount:String(amount),method,reference,requestId,verification:"manually_reported",
      }).onConflictDoNothing().returning();
      if(!receipt){
        const [duplicate]=await tx.select().from(maxReceipts).where(and(
          eq(maxReceipts.userId,userId),eq(maxReceipts.requestId,requestId)));
        if(!duplicate||duplicate.pledgeId!==pledgeId||Number(duplicate.amount)!==amount)
          return {kind:"conflict" as const};
        return {kind:"duplicate" as const,receipt:duplicate};
      }
      const [updated]=await tx.update(maxPledges).set({
        paidAmount:sql`${maxPledges.paidAmount} + ${String(amount)}`,
        status:sql`CASE WHEN ${maxPledges.paidAmount} + ${String(amount)} >= ${maxPledges.amount} THEN 'paid' ELSE 'open' END`,
        updatedAt:new Date(),
      }).where(and(
        eq(maxPledges.id,pledgeId),eq(maxPledges.userId,userId),
        eq(maxPledges.status,"open"),
        sql`${maxPledges.paidAmount} + ${String(amount)} <= ${maxPledges.amount}`,
      )).returning();
      if(!updated)throw new Error("PAYMENT_EXCEEDS_PLEDGE");
      await tx.update(askanuscases).set({
        fundsReceived:sql`${askanuscases.fundsReceived} + ${String(amount)}`,
        fundsPromised:sql`GREATEST(0, ${askanuscases.fundsPromised} - ${String(amount)})`,
        lastUpdated:new Date(),
      }).where(and(eq(askanuscases.id,pledge.caseId),eq(askanuscases.userId,userId)));
      await tx.insert(caseActivityLog).values({
        caseId:pledge.caseId,date:new Date().toISOString().slice(0,10),
        type:"funds_received",amount:String(amount),
        note:`Manually reported payment $${amount.toFixed(2)} toward pledge #${pledgeId}; method ${method}`,
      });
      return {kind:"created" as const,receipt};
    });
    if(result.kind==="conflict"){res.status(409).json({error:"Request ID is already used for a different payment"});return;}
    res.status(result.kind==="duplicate"?200:201).json({
      duplicate:result.kind==="duplicate",receipt:shapeReceipt(result.receipt),
      note:"Manually reported, not payment-provider verified.",
    });
  }catch(e){
    if(e instanceof Error&&e.message==="PAYMENT_EXCEEDS_PLEDGE"){
      res.status(409).json({error:"Payment exceeds the remaining pledge, or pledge is no longer open"});return;
    }
    throw e;
  }
});
export default router;
