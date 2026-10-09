import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, helpRequestsTable, volunteerProfilesTable, usersTable, supportMessagesTable, memberContactMethodsTable } from "@workspace/db";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";
import { newConnectionState, CONNECTION_META_TYPE } from "../lib/member-connections";
import { notifyStaff, notifyUser } from "../lib/notify";

const router:IRouter=Router();
type Volunteer = typeof volunteerProfilesTable.$inferSelect;
type Request = typeof helpRequestsTable.$inferSelect;
const KEYWORDS:Record<string,string[]>={
  medical:["medical","hospital","bikur cholim","doctor","patient","health","medical transport"],
  wedding:["wedding","kallah","simcha","hachnosas kallah"],
  food:["food","meals","distribution","groceries","pantry"],
  housing:["housing","rental","home","shelter","apartment"],
  transportation:["driver","transport","driving","car","rides","vehicle"],
  financial:["financial","fundraising","charity","aid","donation","money"],
  other:[],
};
function compatible(req:Request,vol:Volunteer){
  const text=[...vol.skills,...vol.areasOfInterest,vol.bio||""].join(" ").toLowerCase();
  // Custom Yiddish / English categories must remain matchable; do not assume
  // everyone selected one of the retired predefined categories.
  const category=req.needType.toLocaleLowerCase().trim();
  const ownWords=category.split(/[^\\p{L}\\p{N}]+/u).filter(token=>token.length>=2);
  const tokens=[...new Set([category,...ownWords,...(KEYWORDS[category]||[])])]
    .filter(Boolean).slice(0,30);
  let score=0;
  const reasons:string[]=[];
  const found=tokens.filter(token=>text.includes(token));
  if(found.length){score+=Math.min(60,30+found.length*10);reasons.push("Skills: "+found.slice(0,3).join(", "));}
  if(req.location&&vol.location){
    const a=req.location.toLowerCase().trim(),b=vol.location.toLowerCase().trim();
    if(a===b||a.includes(b)||b.includes(a)){score+=30;reasons.push("Same or overlapping location");}
  }
  if(["anytime","flexible","on_call"].includes(vol.availability)){score+=10;reasons.push("Flexible availability");}
  return {score,reasons};
}
router.get("/admin/private-assistance",requireAdmin,async(_req,res,next):Promise<void>=>{
  try {
    res.setHeader("Cache-Control","private, no-store");
    const [helps,volunteers,profiles,contacts,activeCases]=await Promise.all([
      db.select().from(helpRequestsTable).orderBy(desc(helpRequestsTable.createdAt)),
      db.select().from(volunteerProfilesTable).orderBy(desc(volunteerProfilesTable.createdAt)),
      db.select({id:usersTable.id,status:usersTable.status,name:usersTable.name,nickname:usersTable.nickname})
        .from(usersTable),
      db.select().from(memberContactMethodsTable),
      db.select({id:supportMessagesTable.id,subject:supportMessagesTable.subject,status:supportMessagesTable.status})
        .from(supportMessagesTable).where(eq(supportMessagesTable.type,"volunteer_contact")),
    ]);
    const byUser=new Map(profiles.map(u=>[u.id,u]));
    const byContact=new Map(contacts.map(m=>[m.userId+":"+m.purpose,m]));
    const eligible=volunteers.filter(v=>byUser.get(v.userId)?.status==="active");
    const available=eligible.map(v=>{
      const methods=byContact.get(v.userId+":volunteer");
      return {id:v.id,userId:v.userId,userName:v.userName,location:v.location,
        skills:v.skills,areasOfInterest:v.areasOfInterest,availability:v.availability,
        bio:v.bio,privateContact:methods?{
          primaryMethod:methods.primaryMethod,primaryValue:methods.primaryValue,
          backupMethod:methods.backupMethod,backupValue:methods.backupValue,
          mayConsiderSharing:methods.mayConsiderSharing,
        }:null};
    });
    const reqs=helps.map(req=>{
      const methods=byContact.get(req.userId+":help");
      const matches=eligible
        .filter(v=>v.userId!==req.userId)
        .map(v=>({volunteerId:v.id,volunteerName:v.userName,
          location:v.location,...compatible(req,v)}))
        .sort((a,b)=>b.score-a.score||a.volunteerId-b.volunteerId)
        .slice(0,6);
      const cases=activeCases
        .filter(c=>c.subject.startsWith(`private-help:${req.id}:`) && c.status==="open")
        .map(c=>({caseId:c.id,status:c.status}));
      return {id:req.id,userId:req.userId,name:req.name,description:req.description,
        needType:req.needType,urgency:req.urgency,location:req.location,
        status:req.status,createdAt:req.createdAt,
        privateContact:methods?{
          primaryMethod:methods.primaryMethod,primaryValue:methods.primaryValue,
          backupMethod:methods.backupMethod,backupValue:methods.backupValue,
          mayConsiderSharing:methods.mayConsiderSharing,
        }:null,
        activeConnections:cases, suggestions:matches,
      };
    });
    res.json({requests:reqs,volunteers:available,
      note:"Internal-only staff matching. Scores are suggestions, not guarantees. Never publish a request or expose personal contact details until bilateral consent and separate final Gavhah authorization."});
  }catch(e){next(e);}
});

router.post("/admin/private-assistance/:helpId/match",requireAdmin,async(req,res,next):Promise<void>=>{
  try{
    const helpId=Number(req.params.helpId),volunteerId=Number(req.body?.volunteerId);
    const note=typeof req.body?.note==="string"?req.body.note.trim():"";
    if(!Number.isSafeInteger(helpId)||helpId<=0||!Number.isSafeInteger(volunteerId)||
       volunteerId<=0||note.length<10||note.length>1000){
      res.status(400).json({error:"Choose a request, volunteer and staff matching note of 10–1000 characters"});return;
    }
    const outcome=await db.transaction(async tx=>{
      // Lock by request ID to prevent two staff members matching the same open
      // request at the same time.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(CAST(${helpId} AS bigint))`);
      const [help]=await tx.select().from(helpRequestsTable).where(eq(helpRequestsTable.id,helpId));
      const [vol]=await tx.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id,volunteerId));
      if(!help||!vol)return {status:404 as const,error:"Help request or volunteer not found"};
      if(!["pending","open"].includes(help.status))
        return {status:409 as const,error:"Help request is no longer active"};
      if(help.userId===vol.userId)return {status:400 as const,error:"Cannot match a member to themselves"};
      const [a,b]=await Promise.all([
        tx.select({status:usersTable.status}).from(usersTable).where(eq(usersTable.id,help.userId)),
        tx.select({status:usersTable.status}).from(usersTable).where(eq(usersTable.id,vol.userId)),
      ]);
      if(a[0]?.status!=="active"||b[0]?.status!=="active")
        return {status:409 as const,error:"Both members must be active"};
      // We only match one current helper at a time; a failed case may later be replaced.
      const existing=await tx.select({id:supportMessagesTable.id,subject:supportMessagesTable.subject})
        .from(supportMessagesTable)
        .where(and(eq(supportMessagesTable.type,"volunteer_contact"),
          eq(supportMessagesTable.status,"open")));
      if(existing.some(item=>item.subject.startsWith(`private-help:${helpId}:`)))
        return {status:409 as const,error:"This help request already has an open staff-managed introduction"};
      const [created]=await tx.insert(supportMessagesTable).values({
        userId:help.userId,name:help.name,email:"private-help@internal.invalid",
        type:"volunteer_contact",subject:`private-help:${helpId}:${volunteerId}`,
        message:`PRIVATE assistance #${helpId}. Staff matched candidate volunteer #${volunteerId}. Decision note: ${note}. Never publish.`,
        status:"open",
      }).returning({id:supportMessagesTable.id});
      const state=newConnectionState({
        volunteerId:vol.id,volunteerUserId:vol.userId,requesterUserId:help.userId,
      });
      await tx.insert(supportMessagesTable).values({
        userId:help.userId,name:"Private Connection Workflow",
        email:"connections@internal.invalid",type:CONNECTION_META_TYPE,
        subject:`support:${created.id}`,message:JSON.stringify(state),status:"resolved",
      });
      if(help.status==="pending"){
        await tx.update(helpRequestsTable).set({status:"open",isFeatured:false})
          .where(eq(helpRequestsTable.id,helpId));
      }
      return {status:201 as const,caseId:created.id,helpId,volunteerId};
    });
    if(outcome.status!==201){res.status(outcome.status).json({error:outcome.error});return;}
    await notifyStaff(`Private help request #${helpId} matched with volunteer #${volunteerId}; ask BOTH members for personal consent from Operations Inbox.`,
      "/founder","admin_member_connection");
    await notifyUser((await db.select({userId:helpRequestsTable.userId})
      .from(helpRequestsTable).where(eq(helpRequestsTable.id,helpId)))[0].userId,
      "help_request_review","Gavhah is reviewing a potential helper for your private request. No contact details were disclosed.","/connections");
    res.status(201).json({created:true,caseId:outcome.caseId,
      nextAction:"Open Operations Inbox and request personal consent from both participants. Final Gavhah approval is required AFTER both consent."});
  }catch(e){next(e);}
});
export default router;
