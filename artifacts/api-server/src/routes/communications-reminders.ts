import { Router } from "express";
import { db } from "@workspace/db";
import { and, asc, eq, sql, gt, lte } from "drizzle-orm";
import { askanuscases, caseFollowups, communicationContacts,
  maxFollowupContacts, maxReminderSnoozes } from "@workspace/db/schema";
import { requireAuth, getSessionUserId } from "../middlewares/auth";
import { localHorizon, reminderStatus, validIanaTimeZone } from "../lib/max-reminder-clock";

/**
 * Per-member inbox, not a background push service. Shows current obligations
 * without changing their original date, notes, donor relationship or identity.
 */
const router=Router();
router.get("/askanus/max/reminders",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const zone=typeof req.query.timeZone==="string"?req.query.timeZone:"America/New_York";
  const limit=Number(req.query.limit??40),offset=Number(req.query.offset??0);
  if(!validIanaTimeZone(zone)||!Number.isSafeInteger(limit)||limit<1||limit>100||
    !Number.isSafeInteger(offset)||offset<0||offset>1000000){
    res.status(400).json({error:"Invalid timezone or page limits"});return;
  }
  const now=new Date();
  // +9 days covers the 7-day window even across UTC/local date boundaries.
  const latest=localHorizon(now,zone,9);
  const records=await db.select({
    followup:caseFollowups,
    projectTitle:askanuscases.title,
    projectUrgency:askanuscases.urgency,
    donorId:maxFollowupContacts.contactId,
    donorName:communicationContacts.name,
    snoozedUntil:maxReminderSnoozes.snoozedUntil,
  }).from(caseFollowups)
    .innerJoin(askanuscases,eq(askanuscases.id,caseFollowups.caseId))
    .leftJoin(maxFollowupContacts,and(
      eq(maxFollowupContacts.followupId,caseFollowups.id),
      eq(maxFollowupContacts.userId,userId),
    ))
    .leftJoin(communicationContacts,and(
      eq(communicationContacts.id,maxFollowupContacts.contactId),
      eq(communicationContacts.userId,userId),
    ))
    .leftJoin(maxReminderSnoozes,and(
      eq(maxReminderSnoozes.followupId,caseFollowups.id),
      eq(maxReminderSnoozes.userId,userId),
    ))
    .where(and(eq(askanuscases.userId,userId),eq(caseFollowups.completed,false),
      sql`${caseFollowups.dueDate} IS NOT NULL`, lte(caseFollowups.dueDate,latest)))
    .orderBy(asc(caseFollowups.dueDate),asc(caseFollowups.dueTime),asc(caseFollowups.id))
    .limit(limit+1).offset(offset);
  const items=records.slice(0,limit).map(row=>{
    const f=row.followup;
    const status=reminderStatus({
      dueDate:f.dueDate,dueTime:f.dueTime,timeZone:f.timeZone,
    },zone,now);
    return {
      id:f.id,caseId:f.caseId,project:row.projectTitle,
      urgency:row.projectUrgency,note:f.note,dueDate:f.dueDate,
      dueTime:f.dueTime,timeZone:f.timeZone,repeatRule:f.repeatRule,
      donorId:row.donorId,donorName:row.donorName,
      status,source:"case_followups",
      snoozedUntil:row.snoozedUntil?.toISOString()??null,
      snoozed:Boolean(row.snoozedUntil&&row.snoozedUntil.getTime()>now.getTime()),
    };
  });
  res.setHeader("Cache-Control","private, no-store");
  res.json({asOf:now.toISOString(),viewTimeZone:zone,items,
    hasMore:records.length>limit,nextOffset:offset+items.length,
    note:"These are your personally recorded follow-ups. Snooze hides the reminder, not the underlying task; no external push/email was sent."});
});

router.post("/askanus/max/reminders/:id/snooze",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const id=Number(req.params.id);
  const clear=req.body?.clear===true;
  const raw=req.body?.until;
  const until=typeof raw==="string"?new Date(raw):new Date(Number.NaN);
  const now=Date.now();
  if(!Number.isSafeInteger(id)||id<=0 || (!clear && (
    typeof raw!=="string"||!Number.isFinite(until.getTime())||
    until.getTime()<now-60_000||until.getTime()>now+30*86400000))){
    res.status(400).json({error:"Choose a valid reminder and snooze within 30 days"});return;
  }
  const result=await db.transaction(async tx=>{
    const [owned]=await tx.select({id:caseFollowups.id,completed:caseFollowups.completed})
      .from(caseFollowups)
      .innerJoin(askanuscases,eq(askanuscases.id,caseFollowups.caseId))
      .where(and(eq(caseFollowups.id,id),eq(askanuscases.userId,userId)));
    if(!owned)return {kind:"missing" as const};
    if(!clear && owned.completed)return {kind:"completed" as const};
    if(clear){
      await tx.delete(maxReminderSnoozes).where(and(
        eq(maxReminderSnoozes.followupId,id),eq(maxReminderSnoozes.userId,userId)));
      return {kind:"cleared" as const};
    }
    const [row]=await tx.insert(maxReminderSnoozes).values({
      userId,followupId:id,snoozedUntil:until,updatedAt:new Date(),
    }).onConflictDoUpdate({
      target:[maxReminderSnoozes.userId,maxReminderSnoozes.followupId],
      set:{snoozedUntil:until,updatedAt:new Date()},
    }).returning();
    return {kind:"saved" as const,row};
  });
  if(result.kind==="missing"){res.status(404).json({error:"Follow-up not found"});return;}
  if(result.kind==="completed"){res.status(409).json({error:"Completed follow-ups cannot be snoozed"});return;}
  res.setHeader("Cache-Control","private, no-store");
  res.json({
    id,snoozedUntil:result.kind==="cleared"?null:result.row.snoozedUntil.toISOString(),
    reminderOnly:true,
    message:"The original MAX and My Askanus follow-up stays unchanged.",
  });
});
export default router;
