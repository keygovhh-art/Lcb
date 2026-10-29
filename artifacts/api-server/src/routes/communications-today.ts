import { Router } from "express";
import { db } from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getSessionUserId, requireAuth } from "../middlewares/auth";
import { askanuscases, askanustasks, caseFollowups, maxPledges, fundraisingCallReports } from "@workspace/db/schema";

/**
 * Source-grounded second-brain foundation: personal TODAY summary only.
 * No LLM guesses, no unrelated user's data, no telephony claims.
 * AI may later cite these IDs but must NEVER infer a payment is verified.
 */
const router=Router();
router.get("/askanus/max/today",requireAuth,async(_req,res)=>{
  const userId=getSessionUserId(_req)!;
  const now=new Date();
  // Date-only deadlines use local-date semantics in the UI; return UTC today explicitly.
  const todayUtc=now.toISOString().slice(0,10);
  const projects=await db.select().from(askanuscases)
    .where(eq(askanuscases.userId,userId))
    .orderBy(desc(askanuscases.lastUpdated));
  const caseIds=projects.map(p=>p.id);
  const [tasks,followups,pledges,calls]=await Promise.all([
    db.select().from(askanustasks).where(and(eq(askanustasks.userId,userId),eq(askanustasks.completed,false)))
      .orderBy(asc(askanustasks.deadline)).limit(200),
    caseIds.length ? db.select().from(caseFollowups)
      .where(and(inArray(caseFollowups.caseId,caseIds),eq(caseFollowups.completed,false)))
      .orderBy(asc(caseFollowups.dueDate)).limit(500) : Promise.resolve([]),
    caseIds.length ? db.select().from(maxPledges)
      .where(and(eq(maxPledges.userId,userId),eq(maxPledges.status,"open")))
      .orderBy(desc(maxPledges.createdAt)).limit(200) : Promise.resolve([]),
    db.select().from(fundraisingCallReports).where(eq(fundraisingCallReports.userId,userId))
      .orderBy(desc(fundraisingCallReports.createdAt)).limit(10),
  ]);
  // The visible list is intentionally capped for speed, but all summary counts
  // MUST count every record even when a member has thousands of follow-ups.
  const [[followupCounts],[taskCounts],[pledgeCounts]]=await Promise.all([
    db.select({
      total:sql<number>`cast(count(*) as integer)`,
      due:sql<number>`cast(count(*) filter (where ${caseFollowups.dueDate} is not null
        and ${caseFollowups.dueDate} <> '' and ${caseFollowups.dueDate} <= ${todayUtc}) as integer)`,
    }).from(caseFollowups).innerJoin(askanuscases,eq(caseFollowups.caseId,askanuscases.id))
      .where(and(eq(askanuscases.userId,userId),eq(caseFollowups.completed,false))),
    db.select({total:sql<number>`cast(count(*) as integer)`})
      .from(askanustasks).where(and(eq(askanustasks.userId,userId),eq(askanustasks.completed,false))),
    db.select({total:sql<number>`cast(count(*) as integer)`})
      .from(maxPledges).where(and(eq(maxPledges.userId,userId),eq(maxPledges.status,"open"))),
  ]);
  const projectById=new Map(projects.map(p=>[p.id,p.title]));
  const nextFollowups=followups.map(f=>({
    id:f.id,caseId:f.caseId,project:projectById.get(f.caseId)||"",
    note:f.note,dueDate:f.dueDate,dueTime:f.dueTime,timeZone:f.timeZone,source:"case_followups",
    url:"/my?case="+f.caseId,
  })).sort((a,b)=>(a.dueDate||"9999-12-31").localeCompare(b.dueDate||"9999-12-31"));
  const received=projects.reduce((sum,p)=>sum+Number(p.fundsReceived),0);
  const promised=projects.reduce((sum,p)=>sum+Number(p.fundsPromised),0);
  res.setHeader("Cache-Control","private, no-store");
  res.json({
    dateUtc:todayUtc,
    summary:{
      projectCount:projects.length,
      activeProjects:projects.filter(p=>p.status!=="closed").length,
      manuallyReportedReceivedTotal:received,
      openPromiseBalance:promised,
      dueOrOverdueFollowups:followupCounts.due,
      totalOpenFollowups:followupCounts.total,
      loadedOpenFollowups:nextFollowups.length,
      loadedOutstandingPledges:pledges.length,
      totalOutstandingPledges:pledgeCounts.total,
      openTasks:taskCounts.total,
    },
    nextFollowups:nextFollowups.slice(0,40),
    nextTasks:tasks.slice(0,40).map(t=>({
      id:t.id,title:t.title,deadline:t.deadline,priority:t.priority,
      caseTitle:t.caseTitle,source:"askanus_tasks",url:"/my",
    })),
    openPledges:pledges.slice(0,30).map(p=>({
      id:p.id,caseId:p.caseId,project:projectById.get(p.caseId)||"",
      amount:Number(p.amount),paid:Number(p.paidAmount),
      remaining:Number(p.amount)-Number(p.paidAmount),source:"max_pledges",
      url:"/communications",
    })),
    lastCallReports:calls.map(c=>({
      id:c.id,caseId:c.caseId,contactId:c.contactId,
      createdAt:c.createdAt.toISOString(),source:"fundraising_call_reports",
    })),
    advisory:"Dates are UTC-based in this endpoint; the user interface must format according to the member's timezone. These are user-reported financial totals, not externally verified receipts.",
  });
});
export default router;
