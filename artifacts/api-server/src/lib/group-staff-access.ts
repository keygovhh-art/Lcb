import {and,eq} from "drizzle-orm";
import {db,groupStaffAccessTable,groupAccessAuditTable,groupMembersTable} from "@workspace/db";

export const isPlatformSuperAdmin=(role?:string)=>role==="super_admin";
export const isPlatformStaffRole=(role?:string)=>
  role==="super_admin"||role==="admin"||role==="moderator"||role==="group_staff";
export const isLegacyStaffRole=(role?:string)=>role==="super_admin"||role==="admin"||role==="moderator";

export async function platformGroupGrant(userId:number,groupId:number,role?:string) {
  if(isPlatformSuperAdmin(role))
    return {staff:true,superAdmin:true,canViewPrivate:true,canModerate:true};
  if(!isPlatformStaffRole(role))
    return {staff:false,superAdmin:false,canViewPrivate:false,canModerate:false};
  const [grant]=await db.select().from(groupStaffAccessTable).where(and(
    eq(groupStaffAccessTable.userId,userId),eq(groupStaffAccessTable.groupId,groupId),
  )).limit(1);
  return {staff:true,superAdmin:false,canViewPrivate:!!grant?.canViewPrivate,
    canModerate:!!grant?.canModerate};
}
export async function verifiedGroupMembership(userId:number,groupId:number) {
  const [member]=await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.userId,userId),eq(groupMembersTable.groupId,groupId),
  )).limit(1);
  return member||null;
}
export async function auditGroupAction(actorId:number,action:string,groupId?:number,targetUserId?:number,details:Record<string,unknown>={}) {
  // Do not log message contents, private member details or plaintext credentials.
  await db.insert(groupAccessAuditTable).values({
    actorId,action,groupId:groupId??null,targetUserId:targetUserId??null,details,
  });
}
