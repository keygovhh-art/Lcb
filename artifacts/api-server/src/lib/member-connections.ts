import { and, desc, eq } from "drizzle-orm";
import { db, supportMessagesTable } from "@workspace/db";
import type { ContactPoint } from "./member-contact-methods";

export const CONNECTION_META_TYPE = "__member_connection_meta__";
export const PHONE_NOTICE_TYPE = "__connection_phone_notice__";
export type ConnectionStage =
  | "new" | "invited" | "needs_reapproval" | "awaiting_staff_release" | "accepted"
  | "contact_problem" | "consent_revoked" | "declined"
  | "connected" | "closed_unfulfilled";
type Approvals = { requester: string | null; volunteer: string | null };
type Shared = { requester: ContactPoint; volunteer: ContactPoint };
export type ConnectionState = {
  volunteerId: number;
  volunteerUserId: number;
  requesterUserId: number;
  stage: ConnectionStage;
  invitedAt: string | null;
  respondedAt: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  closureReason: string | null;
  contactIssue: string | null;
  contactFollowups: Array<{ note: string; actorId: number; at: string }>;
  // Staff chooses which of the member's own methods to propose. The member,
  // not staff, must explicitly approve disclosure anew for this case.
  requesterChoice: "primary" | "backup";
  volunteerChoice: "primary" | "backup";
  approvals: Approvals;
  agreedContacts: Shared | null;
  /** Final, case-specific Gavhah permission AFTER both members approve. */
  staffReleasedAt: string | null;
  staffReleasedBy: number | null;
  staffReleaseReason: string | null;
  proposedContacts: Partial<Shared>;
  // Former staff-recorded consent fields are retained ONLY for audit, and
  // can NEVER authorize disclosure to the other person.
  consentMethod: "in_app" | "staff_verified_phone" | "staff_verified_in_person" | null;
  consentNote: string | null;
  consentVerifiedBy: number | null;
  updatedBy: number | null;
};

const stages = new Set<ConnectionStage>([
  "new","invited","needs_reapproval","awaiting_staff_release","accepted","contact_problem",
  "consent_revoked","declined","connected","closed_unfulfilled",
]);
const validPoint = (raw: unknown): ContactPoint | null => {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string,unknown>;
  if (!["phone","email","sms"].includes(String(x.method)) ||
      typeof x.value !== "string" || x.value.length < 7 || x.value.length > 200) return null;
  return { method:x.method as ContactPoint["method"],value:x.value };
};
export function newConnectionState(input: {
  volunteerId: number;volunteerUserId: number;requesterUserId: number;
}): ConnectionState {
  return {
    ...input, stage:"new", invitedAt:null,respondedAt:null,confirmedAt:null,closedAt:null,
    closureReason:null,contactIssue:null,contactFollowups:[],
    requesterChoice:"primary",volunteerChoice:"primary",
    approvals:{requester:null,volunteer:null},agreedContacts:null,
    staffReleasedAt:null,staffReleasedBy:null,staffReleaseReason:null,proposedContacts:{},
    consentMethod:null,consentNote:null,consentVerifiedBy:null,updatedBy:null,
  };
}
export function parseConnectionState(raw: string): ConnectionState | null {
  try {
    const v=JSON.parse(raw) as Record<string,any>;
    if (!Number.isSafeInteger(v.volunteerId)||v.volunteerId<=0||
        !Number.isSafeInteger(v.volunteerUserId)||v.volunteerUserId<=0||
        !Number.isSafeInteger(v.requesterUserId)||v.requesterUserId<=0||
        !stages.has(v.stage)) return null;
    const approvals:Approvals = {
      requester:typeof v.approvals?.requester==="string"?v.approvals.requester:null,
      volunteer:typeof v.approvals?.volunteer==="string"?v.approvals.volunteer:null,
    };
    const requester = validPoint(v.agreedContacts?.requester);
    const volunteer = validPoint(v.agreedContacts?.volunteer);
    const staffReleasedAt = typeof v.staffReleasedAt === "string" ? v.staffReleasedAt : null;
    const staffReleasedBy = Number.isSafeInteger(v.staffReleasedBy) && v.staffReleasedBy > 0 ? v.staffReleasedBy : null;
    const released = Boolean(approvals.requester && approvals.volunteer && requester && volunteer && staffReleasedAt && staffReleasedBy);
    // Earlier single/dual approvals NEVER authorize release without separate, later staff approval.
    const stage:ConnectionStage = ["accepted","connected","contact_problem"].includes(v.stage)&&!released
      ? "needs_reapproval" : v.stage;
    return {
      volunteerId:v.volunteerId, volunteerUserId:v.volunteerUserId,requesterUserId:v.requesterUserId,
      stage,invitedAt:typeof v.invitedAt==="string"?v.invitedAt:null,
      respondedAt:typeof v.respondedAt==="string"?v.respondedAt:null,
      confirmedAt:typeof v.confirmedAt==="string"?v.confirmedAt:null,
      closedAt:typeof v.closedAt==="string"?v.closedAt:null,
      closureReason:typeof v.closureReason==="string"?v.closureReason:null,
      contactIssue:typeof v.contactIssue==="string"?v.contactIssue:null,
      contactFollowups:Array.isArray(v.contactFollowups)?v.contactFollowups.filter((a:any)=>
        typeof a?.note==="string"&&Number.isSafeInteger(a.actorId)&&typeof a.at==="string").slice(-50):[],
      requesterChoice:v.requesterChoice==="backup"?"backup":"primary",
      volunteerChoice:v.volunteerChoice==="backup"?"backup":"primary",
      approvals,agreedContacts:released?{requester:requester!,volunteer:volunteer!}:null,
      staffReleasedAt:released?staffReleasedAt:null,staffReleasedBy:released?staffReleasedBy:null,
      staffReleaseReason:released && typeof v.staffReleaseReason === "string" ? v.staffReleaseReason : null,
      proposedContacts:{
        ...(validPoint(v.proposedContacts?.requester)?{requester:validPoint(v.proposedContacts.requester)!}:{}),
        ...(validPoint(v.proposedContacts?.volunteer)?{volunteer:validPoint(v.proposedContacts.volunteer)!}:{}),
      },
      consentMethod:["in_app","staff_verified_phone","staff_verified_in_person"].includes(v.consentMethod)?v.consentMethod:null,
      consentNote:typeof v.consentNote==="string"?v.consentNote:null,
      consentVerifiedBy:Number.isSafeInteger(v.consentVerifiedBy)?v.consentVerifiedBy:null,
      updatedBy:Number.isSafeInteger(v.updatedBy)?v.updatedBy:null,
    };
  } catch { return null; }
}
export function hasMutualConsent(state: ConnectionState): boolean {
  return Boolean(state.approvals.requester && state.approvals.volunteer &&
    state.proposedContacts.requester && state.proposedContacts.volunteer);
}
/** Only this predicate permits disclosure or a completed introduction. */
export function hasReleaseAuthorization(state: ConnectionState): boolean {
  return Boolean(hasMutualConsent(state) && state.staffReleasedAt && state.staffReleasedBy &&
    state.agreedContacts?.requester && state.agreedContacts?.volunteer);
}
export function clearConsentForNewReview(state: ConnectionState, choices?:{
  requesterChoice?:"primary"|"backup";volunteerChoice?:"primary"|"backup";
}): ConnectionState {
  return {...state,
    stage:"invited",invitedAt:new Date().toISOString(),respondedAt:null,
    approvals:{requester:null,volunteer:null},agreedContacts:null,proposedContacts:{},
    staffReleasedAt:null,staffReleasedBy:null,staffReleaseReason:null,
    requesterChoice:choices?.requesterChoice??state.requesterChoice,
    volunteerChoice:choices?.volunteerChoice??state.volunteerChoice,
    consentMethod:null,consentNote:null,consentVerifiedBy:null,
  };
}
export async function getConnectionMeta(requestId:number) {
  const [row] = await db.select().from(supportMessagesTable)
    .where(and(eq(supportMessagesTable.type,CONNECTION_META_TYPE),
      eq(supportMessagesTable.subject,`support:${requestId}`)))
    .orderBy(desc(supportMessagesTable.id)).limit(1);
  return {row:row??null,state:row?parseConnectionState(row.message):null};
}
export async function createConnectionMeta(requestId:number,state:ConnectionState) {
  await db.insert(supportMessagesTable).values({
    userId:state.requesterUserId,name:"Member Connection Workflow",
    email:"connections@internal.invalid",type:CONNECTION_META_TYPE,
    subject:`support:${requestId}`,message:JSON.stringify(state),status:"resolved",
  });
}
export async function updateConnectionMeta(row:typeof supportMessagesTable.$inferSelect,next:ConnectionState):Promise<boolean> {
  const [changed] = await db.update(supportMessagesTable).set({message:JSON.stringify(next)})
    .where(and(eq(supportMessagesTable.id,row.id),eq(supportMessagesTable.message,row.message),
      eq(supportMessagesTable.type,CONNECTION_META_TYPE)))
    .returning({id:supportMessagesTable.id});
  return Boolean(changed);
}
export async function finishConnection(requestId:number,metaRow:typeof supportMessagesTable.$inferSelect,next:ConnectionState):Promise<boolean> {
  return db.transaction(async tx=>{
    const [updated]=await tx.update(supportMessagesTable).set({message:JSON.stringify(next)})
      .where(and(eq(supportMessagesTable.id,metaRow.id),eq(supportMessagesTable.message,metaRow.message),
        eq(supportMessagesTable.type,CONNECTION_META_TYPE))).returning({id:supportMessagesTable.id});
    if(!updated)return false;
    const [closed]=await tx.update(supportMessagesTable).set({status:"resolved"})
      .where(and(eq(supportMessagesTable.id,requestId),eq(supportMessagesTable.type,"volunteer_contact"),
        eq(supportMessagesTable.status,"open"))).returning({id:supportMessagesTable.id});
    if(!closed)throw Error("Request closed concurrently; transaction rolled back");
    return true;
  });
}

/** No delivery provider is connected. An outbox entry is NOT a sent text/call. */
export async function queuePhoneNotice(caseId:number,userId:number,event:"approval_requested"|"mutual_consent"|"channel_problem"|"reapproval") {
  await db.insert(supportMessagesTable).values({
    userId,name:"Phone Notice Awaiting Integration",email:"outbox@internal.invalid",
    type:PHONE_NOTICE_TYPE,subject:`connection:${caseId}:${event}:${userId}`,
    message:JSON.stringify({caseId,userId,event,status:"awaiting_provider_and_notification_opt_in",
      link:"/connections",createdAt:new Date().toISOString()}),
    status:"open",
  });
}
