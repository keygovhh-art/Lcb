import { Router } from "express";
import { db } from "@workspace/db";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { askanuscases, caseFollowups, communicationContacts, fundraisingCallReports,
  maxPledges, maxReceipts } from "@workspace/db/schema";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

// Deterministic, source-grounded personal assistant. No hidden model call,
// subjective inferences, other people's records, or invented payment verification.
const router=Router();
const money=(v:unknown)=>Number(v||0);
router.get("/askanus/max/assistant",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const intent=String(req.query.intent||"");
  const contactId=Number(req.query.contactId||0);
  res.setHeader("Cache-Control","private, no-store");
  if(!["last_call","donor_money","overdue","my_projects"].includes(intent)){
    res.status(400).json({error:"Please choose a supported source-grounded question"});return;
  }
  if(intent==="last_call"||intent==="donor_money"){
    if(!Number.isSafeInteger(contactId)||contactId<=0){
      res.status(400).json({error:"Choose one donor first"});return;
    }
    const [person]=await db.select().from(communicationContacts).where(and(
      eq(communicationContacts.id,contactId),eq(communicationContacts.userId,userId)));
    if(!person){res.status(404).json({error:"Contact not found"});return;}
    if(intent==="last_call"){
      const [call]=await db.select().from(fundraisingCallReports).where(and(
        eq(fundraisingCallReports.userId,userId),eq(fundraisingCallReports.contactId,contactId)))
        .orderBy(desc(fundraisingCallReports.createdAt),desc(fundraisingCallReports.id)).limit(1);
      res.json({
        intent,contactId,contactName:person.name,
        found:Boolean(call),
        answer:call
          ? "דער לעצטער מאנועל איינגעשריבענער רוף־באריכט איז פון "+call.createdAt.toISOString()
            +". רעזולטאט: "+call.outcome+". נאטיץ: "+(call.note||"נישטא")
          : "פאר דעם קאנטאקט איז נישטא קיין מאנועל איינגעשריבענער רוף־באריכט.",
        sources:call?[{table:"fundraising_call_reports",id:call.id,caseId:call.caseId}]:[],
        limitation:"דאס ווייזט בלויז איינגעשריבענע רוף־באריכטן; נישט קיין טעכנישע טעלעפאן־היסטאריע.",
      });return;
    }
    const [receipts,pledges]=await Promise.all([
      db.select().from(maxReceipts).where(and(
        eq(maxReceipts.userId,userId),eq(maxReceipts.contactId,contactId)))
        .orderBy(desc(maxReceipts.id)),
      db.select().from(maxPledges).where(and(
        eq(maxPledges.userId,userId),eq(maxPledges.contactId,contactId)))
        .orderBy(desc(maxPledges.id)),
    ]);
    const given=receipts.reduce((n,x)=>n+money(x.amount)-money(x.refundedAmount),0);
    const card=receipts.filter(x=>x.method==="card")
      .reduce((n,x)=>n+money(x.amount)-money(x.refundedAmount),0);
    const outstanding=pledges.filter(x=>x.status!=="cancelled")
      .reduce((n,x)=>n+money(x.amount)-money(x.paidAmount),0);
    res.json({
      intent,contactId,contactName:person.name,found:true,
      answer:person.name+" — מאנועל באריכטעט באקומען: $"+given.toFixed(2)
        +"; פון דעם דורך קארטל באריכטעט: $"+card.toFixed(2)
        +"; אפענע התחייבויות: $"+outstanding.toFixed(2)+".",
      amounts:{reportedNetReceived:given,reportedCardNet:card,outstandingPledges:outstanding},
      sources:[
        ...receipts.map(x=>({table:"max_receipts",id:x.id,caseId:x.caseId})),
        ...pledges.map(x=>({table:"max_pledges",id:x.id,caseId:x.caseId})),
      ],
      limitation:"נאר מאנועל־פארבונדענע פערזענליכע רעקארדס. דאס איז נישט קיין באשטעטיגונג פונעם באצאלונגס־פראוויידער.",
    });return;
  }
  const projects=await db.select().from(askanuscases)
    .where(eq(askanuscases.userId,userId)).orderBy(desc(askanuscases.lastUpdated));
  if(intent==="my_projects"){
    res.json({
      intent,found:projects.length>0,
      answer:"דו האסט "+projects.length+" אפגעהיטענע פראיעקטן. באריכטעט באקומען: $"+
        projects.reduce((n,p)=>n+money(p.fundsReceived),0).toFixed(2)+
        ". נאך אויסשטייענדיגע התחייבויות: $"+
        projects.reduce((n,p)=>n+money(p.fundsPromised),0).toFixed(2)+".",
      sources:projects.map(p=>({table:"askanus_cases",id:p.id})),
      limitation:"פערזענליכע מאנועלע פארוואלטונג, נישט וועריפיצירטע באצאלונגען.",
    });return;
  }
  const today=new Date().toISOString().slice(0,10);
  const ownedIds=projects.map(p=>p.id);
  const open=ownedIds.length?
    await db.select().from(caseFollowups)
      .where(and(inArray(caseFollowups.caseId,ownedIds),eq(caseFollowups.completed,false),
        lt(caseFollowups.dueDate,today)))
      .orderBy(asc(caseFollowups.dueDate),asc(caseFollowups.id)).limit(100)
    : [];
  res.json({
    intent,found:open.length>0,
    answer:open.length
      ? "דא זענען די ערשטע "+open.length+" פארשפעטיגטע נאכפאלגן. יעדער איינס האט א מקור־רעקארד."
      : "קיין פארשפעטיגטע נאכפאלגן געפונען אין דיינע פערזענליכע פראיעקטן.",
    items:open.map(x=>({id:x.id,caseId:x.caseId,note:x.note,dueDate:x.dueDate,
      dueTime:x.dueTime,timeZone:x.timeZone})),
    sources:open.map(x=>({table:"case_followups",id:x.id,caseId:x.caseId})),
    limitation:"דאטום־פארגלייך לויט UTC; שעה/שבת/יום־טוב ווערן נישט אויטאמאטיש באשטעטיגט.",
  });
});
export default router;
