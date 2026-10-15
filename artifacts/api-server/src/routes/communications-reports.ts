import { Router } from "express";
import { db } from "@workspace/db";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { askanuscases, maxPledges, maxReceipts, fundraisingCallReports } from "@workspace/db/schema";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

const router=Router();
const WINDOWS=new Set([7,30,90,365]);
const aggregate=sql<number>`cast(count(*) as integer)`;
const num=(v:unknown)=>Number(v||0);

router.get("/askanus/max/reports",requireAuth,async(req,res)=>{
  const days=Number(req.query.days??30);
  if(!WINDOWS.has(days)){
    res.status(400).json({error:"Choose 7, 30, 90 or 365 days"});return;
  }
  const userId=getSessionUserId(req)!;
  const now=new Date(),since=new Date(now.getTime()-days*86400000);
  // Each table is aggregated separately. Joining payment and pledge events
  // into one SELECT would multiply amounts when a case has multiple rows.
  const [projects,receipts,pledges,calls]=await Promise.all([
    db.select().from(askanuscases)
      .where(eq(askanuscases.userId,userId))
      .orderBy(desc(askanuscases.lastUpdated)),
    db.select({
      caseId:maxReceipts.caseId,count:aggregate,
      gross:sql<string>`coalesce(sum(${maxReceipts.amount}),0)::text`,
      currentNet:sql<string>`coalesce(sum(${maxReceipts.amount} - ${maxReceipts.refundedAmount}),0)::text`,
      verifiedNet:sql<string>`coalesce(sum(case when ${maxReceipts.verification}='verified'
        then ${maxReceipts.amount} - ${maxReceipts.refundedAmount} else 0 end),0)::text`,
    }).from(maxReceipts).where(and(
      eq(maxReceipts.userId,userId),gte(maxReceipts.createdAt,since)))
      .groupBy(maxReceipts.caseId),
    db.select({
      caseId:maxPledges.caseId,count:aggregate,
      newPromises:sql<string>`coalesce(sum(${maxPledges.amount}),0)::text`,
    }).from(maxPledges).where(and(
      eq(maxPledges.userId,userId),gte(maxPledges.createdAt,since)))
      .groupBy(maxPledges.caseId),
    db.select({
      caseId:fundraisingCallReports.caseId,
      outcome:fundraisingCallReports.outcome,count:aggregate,
    }).from(fundraisingCallReports).where(and(
      eq(fundraisingCallReports.userId,userId),gte(fundraisingCallReports.createdAt,since)))
      .groupBy(fundraisingCallReports.caseId,fundraisingCallReports.outcome),
  ]);
  const byReceipt=new Map(receipts.map(r=>[r.caseId,r]));
  const byPledge=new Map(pledges.map(r=>[r.caseId,r]));
  const callsByCase=new Map<number,Record<string,number>>();
  for(const c of calls){
    const counts=callsByCase.get(c.caseId)||{};
    counts[c.outcome]=(counts[c.outcome]||0)+c.count;
    callsByCase.set(c.caseId,counts);
  }
  const result=projects.map(p=>{
    const rec=byReceipt.get(p.id),pledge=byPledge.get(p.id),outcomes=callsByCase.get(p.id)||{};
    return {
      caseId:p.id,title:p.title,status:p.status,urgency:p.urgency,
      lifetime:{
        goal:num(p.goalAmount),
        manuallyReportedReceived:num(p.fundsReceived),
        outstandingPromises:num(p.fundsPromised),
      },
      period:{
        receiptCount:rec?.count||0,
        manuallyReportedGross:num(rec?.gross),
        manuallyReportedNetAsOfNow:num(rec?.currentNet),
        externallyMarkedVerifiedNet:num(rec?.verifiedNet),
        newPledgeCount:pledge?.count||0,
        newlyRecordedPledges:num(pledge?.newPromises),
        callReportCount:Object.values(outcomes).reduce((a,b)=>a+b,0),
        callOutcomes:outcomes,
      },
      source:{cases:"askanus_cases",receipts:"max_receipts",
        pledges:"max_pledges",calls:"fundraising_call_reports"},
    };
  });
  const summary=result.reduce((total,p)=>({
    lifetimeReceived:total.lifetimeReceived+p.lifetime.manuallyReportedReceived,
    lifetimeOutstanding:total.lifetimeOutstanding+p.lifetime.outstandingPromises,
    periodReportedNet:total.periodReportedNet+p.period.manuallyReportedNetAsOfNow,
    periodVerifiedNet:total.periodVerifiedNet+p.period.externallyMarkedVerifiedNet,
    periodNewPledges:total.periodNewPledges+p.period.newlyRecordedPledges,
    periodCallReports:total.periodCallReports+p.period.callReportCount,
  }),{lifetimeReceived:0,lifetimeOutstanding:0,periodReportedNet:0,
    periodVerifiedNet:0,periodNewPledges:0,periodCallReports:0});
  res.setHeader("Cache-Control","private, no-store");
  res.json({
    days,fromUtc:since.toISOString(),asOfUtc:now.toISOString(),summary,projects:result,
    limitations:[
      "Historical case totals may include old manual entries without itemized receipts.",
      "Window totals are for records entered in the preceding rolling days (UTC), with receipt reversals netted as of now.",
      "Manually reported payments are not proven bank/card deposits. The verified column is only for receipts separately marked verified.",
      "The same receipt is counted once even when visible in My Askanus and MAX.",
    ],
  });
});
export default router;
