import { Router } from "express";
import { db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { communicationContacts, maxContactConsents } from "@workspace/db/schema";
import { getSessionUserId, requireAuth } from "../middlewares/auth";

const router=Router();
const methods=new Set(["written","in_person","incoming_call","other"]);
const idOk=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;

// A person's previous opt-out must remain effective until the person
// personally grants renewed permission. Never infer consent from silence,
// a payment, a donation, a staff checkbox, or an unanswered outgoing call.
router.post("/askanus/contacts/:id/reconsent",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const contactId=Number(req.params.id);
  const method=String(req.body?.method??"").trim();
  const evidence=String(req.body?.evidence??"").trim();
  const requestId=String(req.body?.requestId??"").trim();
  const rawAt=req.body?.consentAt;
  const consentAt=typeof rawAt==="string"?new Date(rawAt):new Date(Number.NaN);
  const now=Date.now();
  if(!idOk(contactId)||!methods.has(method)||evidence.length<12||evidence.length>1500||
     requestId.length<12||requestId.length>128||
     req.body?.userConfirmedDirectConsent!==true||
     !Number.isFinite(consentAt.getTime())||
     consentAt.getTime()>now+5*60*1000 ||
     consentAt.getTime()<now-366*24*60*60*1000){
    res.status(400).json({error:"Explicit renewed permission, evidence, method, date and unique request key required"});
    return;
  }
  const result=await db.transaction(async tx=>{
    // Serialize reconsent with other owner-scoped updates to this row.
    const [contact]=await tx.select().from(communicationContacts).where(and(
      eq(communicationContacts.id,contactId),
      eq(communicationContacts.userId,userId)
    )).for("update");
    if(!contact)return {kind:"missing" as const};
    const [prior]=await tx.select().from(maxContactConsents).where(and(
      eq(maxContactConsents.userId,userId),
      eq(maxContactConsents.requestId,requestId)
    ));
    if(prior){
      const matches=prior.contactId===contactId&&prior.method===method&&prior.evidence===evidence
        &&prior.consentAt.getTime()===consentAt.getTime();
      return matches?{kind:"duplicate" as const,event:prior,contact}:
        {kind:"conflict" as const};
    }
    if(!contact.doNotCall)return {kind:"already_allowed" as const};
    const [event]=await tx.insert(maxContactConsents).values({
      userId,contactId,method,evidence,consentAt,requestId,action:"reconsent",
    }).onConflictDoNothing().returning();
    if(!event)return {kind:"conflict" as const};
    const [updated]=await tx.update(communicationContacts).set({
      doNotCall:false,optOutReason:"",updatedAt:new Date(),
    }).where(and(
      eq(communicationContacts.id,contactId),
      eq(communicationContacts.userId,userId),
      eq(communicationContacts.doNotCall,true),
    )).returning();
    if(!updated)throw Error("CONSENT_STATE_CONFLICT");
    return {kind:"created" as const,event,contact:updated};
  });
  if(result.kind==="missing"){res.status(404).json({error:"Contact not found"});return;}
  if(result.kind==="conflict"||result.kind==="already_allowed"){
    res.status(409).json({error:result.kind==="conflict"
      ?"Request key already used for different consent details":
      "No current opt-out to lift; do not create an unrelated consent event"});return;
  }
  res.setHeader("Cache-Control","private, no-store");
  res.status(result.kind==="duplicate"?200:201).json({
    duplicate:result.kind==="duplicate",
    contact:{
      id:result.contact.id,
      doNotCall:result.contact.doNotCall,
      updatedAt:result.contact.updatedAt.toISOString(),
    },
    event:{
      id:result.event.id,
      contactId:result.event.contactId,
      method:result.event.method,
      consentAt:result.event.consentAt.toISOString(),
      createdAt:result.event.createdAt.toISOString(),
    },
    caveat:"This is a manually entered permission record, not independently verified evidence.",
  });
});

router.get("/askanus/contacts/:id/consents",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!,contactId=Number(req.params.id);
  if(!idOk(contactId)){res.status(400).json({error:"Invalid contact ID"});return;}
  const [owned]=await db.select({id:communicationContacts.id}).from(communicationContacts)
    .where(and(eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)));
  if(!owned){res.status(404).json({error:"Contact not found"});return;}
  const rows=await db.select().from(maxContactConsents).where(and(
    eq(maxContactConsents.userId,userId),eq(maxContactConsents.contactId,contactId),
  )).orderBy(desc(maxContactConsents.createdAt),desc(maxContactConsents.id)).limit(100);
  res.setHeader("Cache-Control","private, no-store");
  res.json(rows.map(r=>({
    id:r.id,action:r.action,method:r.method,evidence:r.evidence,
    consentAt:r.consentAt.toISOString(),createdAt:r.createdAt.toISOString(),
  })));
});

export default router;
