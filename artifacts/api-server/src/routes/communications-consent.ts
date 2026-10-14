import { Router } from "express";
import { db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { communicationContacts, maxContactConsents } from "@workspace/db/schema";
import { getSessionUserId, requireAuth } from "../middlewares/auth";

const router=Router();
const consentMethods=new Set(["written","in_person","incoming_call","other"]);
const idOk=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;

/**
 * Human is in control: a private do-not-call flag is normally respected.
 * There are two distinct, auditable ways to remove that flag:
 *  - reconsent: the contact personally provided renewed permission
 *  - owner_override: account holder deliberately overrides their CRM marker
 * The second action must never be represented as the contact's consent.
 * No outbound calls are placed from this endpoint.
 */
const changePermission=async(req:any,res:any)=>{
  const userId=getSessionUserId(req)!;
  const contactId=Number(req.params.id);
  if(req.body?.action!==undefined &&
     req.body.action!=="reconsent"&&req.body.action!=="owner_override"){
    res.status(400).json({error:"Invalid permission action"});return;
  }
  const action=req.body?.action==="owner_override"?"owner_override":"reconsent";
  const method=action==="owner_override"?"owner_decision":String(req.body?.method??"").trim();
  const rawEvidence=String(req.body?.evidence??"").trim();
  const evidence=action==="owner_override"
    ? rawEvidence||"דער עסקן האט אליין באשלאסן אראפצונעמען דעם רופן־צייכן."
    : rawEvidence;
  const requestId=String(req.body?.requestId??"").trim();
  const rawAt=req.body?.consentAt;
  const consentAt=action==="owner_override"?new Date():
    typeof rawAt==="string"?new Date(rawAt):new Date(Number.NaN);
  const now=Date.now();
  if(!idOk(contactId)||requestId.length<12||requestId.length>128||
    evidence.length<12||evidence.length>1500||
    (action==="owner_override"
      ? req.body?.ownerConfirmedOverride!==true
      : (!consentMethods.has(method)||req.body?.userConfirmedDirectConsent!==true||
        !Number.isFinite(consentAt.getTime())||consentAt.getTime()>now+5*60*1000||
        consentAt.getTime()<now-366*24*60*60*1000))){
    res.status(400).json({error:action==="owner_override"
      ?"Owner confirmation and unique request ID are required"
      :"Renewed permission, evidence, method, date and request ID required"});return;
  }
  const result=await db.transaction(async tx=>{
    const [contact]=await tx.select().from(communicationContacts).where(and(
      eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)
    )).for("update");
    if(!contact)return {kind:"missing" as const};
    const [prior]=await tx.select().from(maxContactConsents).where(and(
      eq(maxContactConsents.userId,userId),eq(maxContactConsents.requestId,requestId)
    ));
    if(prior){
      const matches=prior.contactId===contactId&&prior.action===action&&
        prior.method===method&&prior.evidence===evidence&&
        (action==="owner_override"||prior.consentAt.getTime()===consentAt.getTime());
      return matches?{kind:"duplicate" as const,event:prior,contact}:
        {kind:"conflict" as const};
    }
    if(!contact.doNotCall)return {kind:"already_allowed" as const};
    const [event]=await tx.insert(maxContactConsents).values({
      userId,contactId,action,method,evidence,consentAt,requestId,
      priorOptOutReason:contact.optOutReason,
    }).onConflictDoNothing().returning();
    if(!event)return {kind:"conflict" as const};
    const [updated]=await tx.update(communicationContacts).set({
      doNotCall:false,optOutReason:"",updatedAt:new Date(),
    }).where(and(
      eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId),
      eq(communicationContacts.doNotCall,true),
    )).returning();
    if(!updated)throw Error("CONTACT_STATUS_CHANGED");
    return {kind:"created" as const,event,contact:updated};
  });
  if(result.kind==="missing"){res.status(404).json({error:"Contact not found"});return;}
  if(result.kind==="conflict"||result.kind==="already_allowed"){
    res.status(409).json({error:result.kind==="conflict"
      ?"Request key belongs to different details"
      :"Do-not-call flag is already removed"});return;
  }
  res.setHeader("Cache-Control","private, no-store");
  res.status(result.kind==="duplicate"?200:201).json({
    duplicate:result.kind==="duplicate",
    contact:{id:result.contact.id,doNotCall:result.contact.doNotCall,
      updatedAt:result.contact.updatedAt.toISOString()},
    event:{id:result.event.id,action:result.event.action,
      method:result.event.method,contactId:result.event.contactId,
      consentAt:result.event.consentAt.toISOString(),
      createdAt:result.event.createdAt.toISOString()},
    caveat:action==="owner_override"
      ?"The account owner's override is NOT the contact's consent; applicable calling restrictions may still apply."
      :"Donor permission was manually reported, not independently verified.",
  });
};
// New preferred endpoint and the legacy dedicated reconsent URL.
router.post("/askanus/contacts/:id/call-permission",requireAuth,changePermission);
router.post("/askanus/contacts/:id/reconsent",requireAuth,changePermission);

router.get("/askanus/contacts/:id/consents",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!,contactId=Number(req.params.id);
  if(!idOk(contactId)){res.status(400).json({error:"Invalid contact ID"});return;}
  const [owned]=await db.select({id:communicationContacts.id}).from(communicationContacts)
    .where(and(eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)));
  if(!owned){res.status(404).json({error:"Contact not found"});return;}
  const rows=await db.select().from(maxContactConsents).where(and(
    eq(maxContactConsents.userId,userId),eq(maxContactConsents.contactId,contactId)
  )).orderBy(desc(maxContactConsents.createdAt),desc(maxContactConsents.id)).limit(100);
  res.setHeader("Cache-Control","private, no-store");
  res.json(rows.map(r=>({
    id:r.id,action:r.action,method:r.method,evidence:r.evidence,
    priorOptOutReason:r.priorOptOutReason,
    consentAt:r.consentAt.toISOString(),createdAt:r.createdAt.toISOString(),
  })));
});
export default router;
