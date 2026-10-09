import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, supportMessagesTable, usersTable, volunteerProfilesTable } from "@workspace/db";
import { getSessionUserId, getSessionUserRole, requireAdmin, requireAuth } from "../middlewares/auth";
import { notifyStaff, notifyUser } from "../lib/notify";
import { getContactSelection, pointFor, type ContactPoint } from "../lib/member-contact-methods";
import {
  getConnectionMeta, updateConnectionMeta, finishConnection, newConnectionState,
  createConnectionMeta, parseConnectionState, hasMutualConsent, hasReleaseAuthorization,
  clearConsentForNewReview, queuePhoneNotice, CONNECTION_META_TYPE,
  type ConnectionState,
} from "../lib/member-connections";

const router: IRouter = Router();
// Prevent a third-party page from approving contacts or editing private
// contact details via a member's authenticated session.
router.use((req,res,next)=>{
  if (["GET","HEAD","OPTIONS"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({error:"Cross-site changes are not allowed"});return;
  }
  const origin=req.get("origin");
  if (!origin) return next(); // non-browser clients; still require a valid session
  try{
    if (new URL(origin).host !== req.get("host")) {
      res.status(403).json({error:"Invalid request origin"});return;
    }
  }catch{
    res.status(403).json({error:"Invalid request origin"});return;
  }
  next();
});

function validId(raw: unknown): number | null {
  const n=Number(Array.isArray(raw)?raw[0]:raw);
  return Number.isSafeInteger(n)&&n>0?n:null;
}
async function originalRequest(id:number) {
  const [request]=await db.select().from(supportMessagesTable)
    .where(and(eq(supportMessagesTable.id,id),eq(supportMessagesTable.type,"volunteer_contact")));
  return request??null;
}
async function member(id:number) {
  const [user]=await db.select({
    id:usersTable.id,name:usersTable.name,nickname:usersTable.nickname,
    status:usersTable.status,
  }).from(usersTable).where(eq(usersTable.id,id));
  return user??null;
}
async function alertParty(userId:number,kind:string,message:string) {
  await notifyUser(userId,kind,message,"/connections");
}
async function alertApprovalPair(state:ConnectionState,id:number,event:"approval_requested"|"reapproval") {
  const note="Gavhah has reviewed a proposed connection. BOTH members must personally approve before any contact details are released. Open My Connections to accept or decline.";
  await Promise.all([
    alertParty(state.volunteerUserId,"connection_needs_personal_approval",note),
    alertParty(state.requesterUserId,"connection_needs_personal_approval",note),
  ]);
  // Deliberately NOT SENT: no approved telephone/voice/SMS provider is configured.
  // The sender must later enforce separate phone-notification opt-in.
  await Promise.all([
    queuePhoneNotice(id,state.volunteerUserId,event),
    queuePhoneNotice(id,state.requesterUserId,event),
  ]);
}
const ownParty=(state:ConnectionState,userId:number):"requester"|"volunteer"|null=>
  userId===state.requesterUserId?"requester":userId===state.volunteerUserId?"volunteer":null;

/** Privacy: only the two case participants can see the case. */
router.get("/member-connections/mine",requireAuth,async(req,res,next):Promise<void>=>{
  try {
    res.setHeader("Cache-Control","private, no-store");
    const userId=getSessionUserId(req)!;
    const metadata=await db.select().from(supportMessagesTable)
      .where(eq(supportMessagesTable.type,CONNECTION_META_TYPE)).orderBy(desc(supportMessagesTable.id));
    const selected:Array<{id:number;state:ConnectionState}>=[];
    for(const row of metadata) {
      const id=Number(row.subject.match(/^support:(\d+)$/)?.[1]);
      if(!Number.isSafeInteger(id)||id<=0||selected.some(s=>s.id===id))continue;
      const state=parseConnectionState(row.message);
      if(!state||!ownParty(state,userId))continue;
      selected.push({id,state});
    }
    const ids=selected.map(x=>x.id);
    const cases=ids.length?await db.select().from(supportMessagesTable)
      .where(and(inArray(supportMessagesTable.id,ids),eq(supportMessagesTable.type,"volunteer_contact"))):[];
    const byId=new Map(cases.map(r=>[r.id,r]));
    const result=await Promise.all(selected.map(async ({id,state})=>{
      const original=byId.get(id);if(!original)return null;
      const party=ownParty(state,userId)!;
      const other=party==="requester"?"volunteer":"requester";
      const [requester,volunteer,prefs]=await Promise.all([
        member(state.requesterUserId),member(state.volunteerUserId),
        getContactSelection(userId,party==="requester"?"help":"volunteer"),
      ]);
      const choice=party==="requester"?state.requesterChoice:state.volunteerChoice;
      const ownContact=prefs?pointFor(prefs,choice):null;
      const released=["accepted","connected"].includes(state.stage)&&hasReleaseAuthorization(state)&&
        requester?.status==="active"&&volunteer?.status==="active";
      const otherContact=released?state.agreedContacts?.[other]:null;
      return {
        id,stage:state.stage,role:party,createdAt:original.createdAt,subject:original.subject,
        volunteerName:volunteer?.nickname||volunteer?.name||"Volunteer",
        requesterName:requester?.nickname||requester?.name||"Member",
        myApproved:Boolean(state.approvals[party]),otherApproved:Boolean(state.approvals[other]),
        finalStaffApproved:Boolean(state.staffReleasedAt && state.staffReleasedBy),
        myContact:ownContact,needsMyContact:!ownContact,
        contact:otherContact?.value||null,contactMethod:otherContact?.method||null,
        backupAvailable:Boolean(prefs?.backupMethod),
        contactIssue:state.contactIssue,closureReason:state.closureReason,
        phoneNotices:"awaiting_provider",
        policy:"Do not share the other member's contact information with anyone without Gavhah approval and that member's permission.",
      };
    }));
    res.json(result.filter(Boolean));
  }catch(e){next(e);}
});

/** This is staff matching approval ONLY. It never acts as member consent. */
router.post("/admin/member-connections/:id/link",requireAdmin,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id),volunteerId=validId(req.body?.volunteerId);
    if(!id||!volunteerId){res.status(400).json({error:"Valid case and volunteer IDs required"});return;}
    const request=await originalRequest(id);
    if(!request||request.status!=="open"||!request.userId){res.status(404).json({error:"Open member request not found"});return;}
    const existing=await getConnectionMeta(id);
    if(existing.row){res.status(409).json({error:"Case is already linked"});return;}
    const [vol]=await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id,volunteerId));
    const target=vol?await member(vol.userId):null;
    if(!vol||!target||target.status!=="active"||request.userId===vol.userId){
      res.status(409).json({error:"Select an eligible volunteer other than the requester"});return;
    }
    await createConnectionMeta(id,newConnectionState({
      volunteerId,volunteerUserId:vol.userId,requesterUserId:request.userId,
    }));
    res.json({linked:true,consentGranted:false});
  }catch(e){next(e);}
});

router.post("/admin/member-connections/:id/invite",requireAdmin,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id);if(!id){res.status(400).json({error:"Invalid case"});return;}
    const request=await originalRequest(id);
    const {row,state}=await getConnectionMeta(id);
    if(!request||request.status!=="open"||!row||!state){
      res.status(404).json({error:"Open linked case not found"});return;
    }
    if(!["new","needs_reapproval"].includes(state.stage)){
      res.status(409).json({error:"Case is not awaiting staff matching approval"});return;
    }
    const nextState=clearConsentForNewReview(state,{
      requesterChoice:"primary",volunteerChoice:"primary",
    });
    nextState.updatedBy=getSessionUserId(req)!;
    if(!await updateConnectionMeta(row,nextState)){res.status(409).json({error:"Case changed; refresh"});return;}
    await alertApprovalPair(nextState,id,"approval_requested");
    res.json({stage:"invited",contactShared:false,phoneNotice:"queued_but_not_sent"});
  }catch(e){next(e);}
});

/** Retire the unsafe staff-as-member consent override. */
router.post("/admin/member-connections/:id/record-consent",requireAdmin,(_req,res):void=>{
  res.status(410).json({error:"Staff may review a connection but cannot grant consent for either member. Both must respond themselves."});
});

router.post("/member-connections/:id/respond",requireAuth,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id),decision=String(req.body?.decision||"");
    if(!id||!["accept","decline"].includes(decision)){res.status(400).json({error:"Accept or decline required"});return;}
    const {row,state}=await getConnectionMeta(id);
    const request=await originalRequest(id);
    if(!row||!state||!request||request.status!=="open"){
      res.status(404).json({error:"Open connection case not found"});return;
    }
    const [requesterAccount,volunteerAccount]=await Promise.all([
      member(state.requesterUserId),member(state.volunteerUserId),
    ]);
    if(requesterAccount?.status!=="active"||volunteerAccount?.status!=="active"){
      res.status(409).json({error:"Both participants must have active membership accounts"});return;
    }
    const actor=getSessionUserId(req)!;
    const party=ownParty(state,actor);
    if(!party){res.status(403).json({error:"Only the two matched members may decide"});return;}
    if(state.stage!=="invited"){res.status(409).json({error:"This connection is not awaiting consent"});return;}
    if(state.approvals[party]){res.status(409).json({error:"You already approved this introduction"});return;}
    if(decision==="decline") {
      const nextState:ConnectionState={...state,stage:"declined",agreedContacts:null,proposedContacts:{},
        approvals:{requester:null,volunteer:null},updatedBy:actor};
      if(!await updateConnectionMeta(row,nextState)){res.status(409).json({error:"Case changed; refresh"});return;}
      await alertParty(party==="requester"?state.volunteerUserId:state.requesterUserId,
        "connection_declined","The proposed introduction was declined. Contact details were not disclosed.");
      await notifyStaff(`Case #${id}: ${party} declined. No contact disclosed.`,"/founder","admin_member_connection");
      res.json({stage:"declined",contactShared:false});return;
    }
    if(req.body?.confirmedPersonalPermission!==true || req.body?.agreedNoRedistribution!==true){
      res.status(400).json({error:"Confirm personal consent AND no-redistribution conditions explicitly"});return;
    }
    const preferences=await getContactSelection(actor,party==="requester"?"help":"volunteer");
    const selection=party==="requester"?state.requesterChoice:state.volunteerChoice;
    if(preferences?.mayConsiderSharing!=="yes"){
      res.status(409).json({error:"You chose Gavhah-only mediation. Change your private sharing preference before giving direct-contact consent."});return;
    }
    const point=preferences?pointFor(preferences,selection):null;
    if(!point){
      res.status(409).json({error:"Add your contact method in My Profile before approving. No contact has been released."});return;
    }
    const otherParty=party==="requester"?"volunteer":"requester";
    const approvals={...state.approvals,[party]:new Date().toISOString()};
    const proposedContacts={...state.proposedContacts,[party]:point};
    const bothApproved=Boolean(approvals[otherParty] && proposedContacts.requester && proposedContacts.volunteer);
    // Even after BOTH individuals agree, Gavhah must separately authorize
    // the actual release. There is NO contact snapshot to disclose yet.
    const finalState:ConnectionState={...state,approvals,proposedContacts,
      agreedContacts:null,staffReleasedAt:null,staffReleasedBy:null,
      stage:bothApproved?"awaiting_staff_release":"invited",
      respondedAt:new Date().toISOString(),updatedBy:actor,
      consentMethod:"in_app",consentNote:null,consentVerifiedBy:null};
    if(!await updateConnectionMeta(row,finalState)){res.status(409).json({error:"Case changed; refresh"});return;}
    if(bothApproved){
      await Promise.all([
        alertParty(state.requesterUserId,"connection_waiting_staff_release",
          "Both participants consented, but Gavhah must still give FINAL authorization. Contact details remain hidden."),
        alertParty(state.volunteerUserId,"connection_waiting_staff_release",
          "Both participants consented, but Gavhah must still give FINAL authorization. Contact details remain hidden."),
      ]);
      await notifyStaff(`Case #${id}: both people consented; final Gavhah authorization is REQUIRED before sharing any contact.`,
        "/founder","admin_member_connection");
    }else{
      await alertParty(state.requesterUserId===actor?state.volunteerUserId:state.requesterUserId,
        "connection_waiting_second_approval","One participant approved this Gavhah proposal. Please respond in My Connections; no contact has been shared.");
      await notifyStaff(`Case #${id}: first personal approval received; other person's permission and FINAL Gavhah approval are still needed. Contact remains hidden.`,
        "/founder","admin_member_connection");
    }
    res.json({stage:finalState.stage,myApproved:true,otherApproved:Boolean(approvals[otherParty]),
      contactShared:false,requiresFinalGavhahApproval:bothApproved});
  }catch(e){next(e);}
});

/**
 * FINAL authorization is a separate decision, always taken AFTER the last
 * participant consents. Staff cannot substitute for either person's consent.
 * Only full admins may authorize the actual exchange of contact details.
 */
router.post("/admin/member-connections/:id/final-release",requireAdmin,async(req,res,next):Promise<void>=>{
  try {
    if(!["admin","super_admin"].includes(String(getSessionUserRole(req)))){
      res.status(403).json({error:"Final contact-release approval requires a full Gavhah administrator"});return;
    }
    const id=validId(req.params.id);
    const note=typeof req.body?.note==="string"?req.body.note.trim():"";
    if(!id||note.length<10||note.length>1000||req.body?.confirmRelease!==true){
      res.status(400).json({error:"Confirm final permission and document the Gavhah decision (10–1000 characters)"});return;
    }
    const request=await originalRequest(id);
    const {row,state}=await getConnectionMeta(id);
    if(!request||request.status!=="open"||!row||!state){
      res.status(404).json({error:"Open approved connection not found"});return;
    }
    if(state.stage!=="awaiting_staff_release"||!hasMutualConsent(state)||state.staffReleasedAt){
      res.status(409).json({error:"Both people must approve first; final release may not be repeated"});return;
    }
    const [requesterAccount,volunteerAccount,requesterPrefs,volunteerPrefs]=await Promise.all([
      member(state.requesterUserId),member(state.volunteerUserId),
      getContactSelection(state.requesterUserId,"help"),
      getContactSelection(state.volunteerUserId,"volunteer"),
    ]);
    if(requesterAccount?.status!=="active"||volunteerAccount?.status!=="active"){
      res.status(409).json({error:"Both participants must still be active members"});return;
    }
    if(!requesterPrefs||!volunteerPrefs||
       requesterPrefs.mayConsiderSharing!=="yes"||volunteerPrefs.mayConsiderSharing!=="yes"){
      res.status(409).json({error:"One participant has not permitted consideration of direct contact sharing"});return;
    }
    const requesterPoint=pointFor(requesterPrefs,state.requesterChoice);
    const volunteerPoint=pointFor(volunteerPrefs,state.volunteerChoice);
    if(!requesterPoint||!volunteerPoint||
       JSON.stringify(requesterPoint)!==JSON.stringify(state.proposedContacts.requester)||
       JSON.stringify(volunteerPoint)!==JSON.stringify(state.proposedContacts.volunteer)){
      res.status(409).json({error:"A member's contact details changed; request fresh consent for both sides"});return;
    }
    const adminId=getSessionUserId(req)!;
    const nextState:ConnectionState={
      ...state,stage:"accepted",
      agreedContacts:{requester:requesterPoint,volunteer:volunteerPoint},
      staffReleasedAt:new Date().toISOString(),staffReleasedBy:adminId,
      staffReleaseReason:note,updatedBy:adminId,
    };
    if(!await updateConnectionMeta(row,nextState)){
      res.status(409).json({error:"Case changed before final authorization; refresh it"});return;
    }
    const message="BOTH people approved, and Gavhah has now given FINAL permission to share the chosen contact details for this case only. Open My Connections. Do not forward details to anyone without Gavhah and that person's permission.";
    await Promise.all([
      alertParty(state.requesterUserId,"connection_finally_authorized",message),
      alertParty(state.volunteerUserId,"connection_finally_authorized",message),
    ]);
    // These are NOT transmitted telephone notices. Keep pending until
    // a delivery provider AND telephone notification permission are configured.
    await Promise.all([
      queuePhoneNotice(id,state.requesterUserId,"mutual_consent"),
      queuePhoneNotice(id,state.volunteerUserId,"mutual_consent"),
    ]);
    res.json({stage:"accepted",contactShared:true,finalApprovedBy:adminId,
      phoneNotice:"queued_but_not_sent"});
  }catch(e){next(e);}
});

router.post("/member-connections/:id/confirm",requireAuth,async(req,res,next):Promise<void>=>{
  try{
    const id=validId(req.params.id);if(!id){res.status(400).json({error:"Invalid case ID"});return;}
    const request=await originalRequest(id),{row,state}=await getConnectionMeta(id);
    if(!request||!row||!state){res.status(404).json({error:"Case not found"});return;}
    if(state.requesterUserId!==getSessionUserId(req)){res.status(403).json({error:"Only requester confirms real contact"});return;}
    if(state.stage==="connected"&&hasReleaseAuthorization(state)){res.json({stage:"connected"});return;}
    if(request.status!=="open"||state.stage!=="accepted"||!hasReleaseAuthorization(state)){
      res.status(409).json({error:"Both members must explicitly approve before any successful contact is recorded"});return;
    }
    if(!await finishConnection(id,row,{...state,stage:"connected",confirmedAt:new Date().toISOString(),updatedBy:getSessionUserId(req)!})){
      res.status(409).json({error:"Case changed; refresh"});return;
    }
    await alertParty(state.volunteerUserId,"connection_confirmed","Requester confirmed real contact through Gavhah.");
    await notifyStaff(`Case #${id}: requester confirmed real contact.`,"/founder","admin_member_connection");
    res.json({stage:"connected"});
  }catch(e){next(e);}
});

/** Either person may withdraw permission until real contact has been closed. */
router.post("/member-connections/:id/revoke",requireAuth,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id),{row,state}=id?await getConnectionMeta(id):{row:null,state:null};
    const request=id?await originalRequest(id):null;
    if(!id||!row||!state||!request||request.status!=="open"){res.status(404).json({error:"Open case not found"});return;}
    const actor=getSessionUserId(req)!,party=ownParty(state,actor);
    if(!party){res.status(403).json({error:"Only the two participants can withdraw"});return;}
    if(!["invited","awaiting_staff_release","accepted","contact_problem"].includes(state.stage)){
      res.status(409).json({error:"No active consent in this case"});return;
    }
    if(!await updateConnectionMeta(row,{...state,stage:"consent_revoked",
      approvals:{requester:null,volunteer:null},agreedContacts:null,proposedContacts:{},
      staffReleasedAt:null,staffReleasedBy:null,updatedBy:actor})){res.status(409).json({error:"Case changed; refresh"});return;}
    const other=party==="requester"?state.volunteerUserId:state.requesterUserId;
    await alertParty(other,"connection_consent_revoked",
      "Permission for this Gavhah connection was withdrawn. Do not share or use contact information. Gavhah will follow up.");
    await notifyStaff(`Case #${id}: ${party} withdrew consent.`,"/founder","admin_member_connection");
    res.json({stage:"consent_revoked",contactShared:false});
  }catch(e){next(e);}
});

router.post("/member-connections/:id/problem",requireAuth,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id);
    const code=String(req.body?.code||"other");
    const codes=new Set(["no_sms","no_email","no_phone","could_not_connect","other"]);
    const description=String(req.body?.description||"").trim().slice(0,500);
    if(!id||!codes.has(code)||(code==="other"&&description.length<5)){
      res.status(400).json({error:"Choose a contact limitation or explain the problem"});return;
    }
    const request=await originalRequest(id),{row,state}=await getConnectionMeta(id);
    if(!request||request.status!=="open"||!row||!state){
      res.status(404).json({error:"Open case not found"});return;
    }
    const party=ownParty(state,getSessionUserId(req)!);
    if(!party){res.status(403).json({error:"Only the two participants can flag a channel problem"});return;}
    if(state.stage!=="accepted"||!hasReleaseAuthorization(state)){
      res.status(409).json({error:"A contact exchange must first be approved by both members"});return;
    }
    const issue=`${party}:${code}${description?": "+description:""}`;
    const nextState:ConnectionState={...state,stage:"contact_problem",contactIssue:issue,
      approvals:{requester:null,volunteer:null},agreedContacts:null,proposedContacts:{},
      staffReleasedAt:null,staffReleasedBy:null,updatedBy:getSessionUserId(req)!};
    if(!await updateConnectionMeta(row,nextState)){res.status(409).json({error:"Case changed; refresh"});return;}
    const other=party==="requester"?state.volunteerUserId:state.requesterUserId;
    await alertParty(other,"connection_contact_issue",
      "The participant reported a contact limitation. Previous details are no longer displayed; wait for fresh matching and approval.");
    await notifyStaff(`Case #${id}: ${issue}. Please review optional backup; both members must reapprove.`,
      "/founder","admin_member_connection");
    await queuePhoneNotice(id,other,"channel_problem");
    res.json({stage:"contact_problem",staffReviewRequired:true,contactShared:false});
  }catch(e){next(e);}
});

router.post("/admin/member-connections/:id/retry-contact",requireAdmin,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id),followup=String(req.body?.followup||"").trim();
    const choices=["primary","backup"];
    const requesterChoice=String(req.body?.requesterChoice||"primary");
    const volunteerChoice=String(req.body?.volunteerChoice||"primary");
    if(!id||followup.length<10||followup.length>1000||
       !choices.includes(requesterChoice)||!choices.includes(volunteerChoice)){
      res.status(400).json({error:"Record follow-up and choose primary or available backup for each member"});return;
    }
    const request=await originalRequest(id),{row,state}=await getConnectionMeta(id);
    if(!request||request.status!=="open"||!row||!state){res.status(404).json({error:"Open case not found"});return;}
    if(!["contact_problem","consent_revoked","declined","needs_reapproval"].includes(state.stage)){
      res.status(409).json({error:"Case is not awaiting staff re-review"});return;
    }
    const [requester,volunteer]=await Promise.all([
      getContactSelection(state.requesterUserId,"help"),
      getContactSelection(state.volunteerUserId,"volunteer"),
    ]);
    if(!requester||!volunteer||!pointFor(requester,requesterChoice as "primary"|"backup")||
       !pointFor(volunteer,volunteerChoice as "primary"|"backup")){
      res.status(409).json({error:"Both members need the selected method on their private contact profiles; optional backup may be missing"});return;
    }
    const nextState=clearConsentForNewReview(state,{
      requesterChoice:requesterChoice as "primary"|"backup",
      volunteerChoice:volunteerChoice as "primary"|"backup",
    });
    nextState.contactFollowups=[...state.contactFollowups,{
      note:followup,actorId:getSessionUserId(req)!,at:new Date().toISOString(),
    }].slice(-50);
    nextState.contactIssue=null;nextState.updatedBy=getSessionUserId(req)!;
    if(!await updateConnectionMeta(row,nextState)){res.status(409).json({error:"Case changed; refresh"});return;}
    await alertApprovalPair(nextState,id,"reapproval");
    res.json({stage:"invited",bothMustApproveAgain:true,phoneNotice:"queued_but_not_sent"});
  }catch(e){next(e);}
});

router.post("/admin/member-connections/:id/close-unfulfilled",requireAdmin,async(req,res,next):Promise<void>=>{
  try {
    const id=validId(req.params.id),reason=String(req.body?.reason||"").trim();
    if(!id||reason.length<10||reason.length>1000){
      res.status(400).json({error:"Explain unsuccessful closure (10–1000 characters)"});return;
    }
    const request=await originalRequest(id),{row,state}=await getConnectionMeta(id);
    if(!request||request.status!=="open"||!row||!state){
      res.status(404).json({error:"Open case not found"});return;
    }
    if(["connected","closed_unfulfilled"].includes(state.stage)){
      res.status(409).json({error:"Case is already closed"});return;
    }
    if(!await finishConnection(id,row,{...state,stage:"closed_unfulfilled",
      approvals:{requester:null,volunteer:null},agreedContacts:null,proposedContacts:{},
      staffReleasedAt:null,staffReleasedBy:null,closedAt:new Date().toISOString(),closureReason:reason,updatedBy:getSessionUserId(req)!})){
      res.status(409).json({error:"Case changed; refresh"});return;
    }
    await Promise.all([
      alertParty(state.requesterUserId,"connection_unfulfilled","Gavhah closed this case as unsuccessful; see My Connections for the explanation."),
      alertParty(state.volunteerUserId,"connection_unfulfilled","Gavhah closed this connection as unsuccessful."),
    ]);
    res.json({stage:"closed_unfulfilled",success:false});
  }catch(e){next(e);}
});

export default router;
