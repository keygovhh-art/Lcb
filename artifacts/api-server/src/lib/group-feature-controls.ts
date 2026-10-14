/** Per-group rules. Only the Gavhah system team may write overrides.
 * For public settings: true/false forces that setting irrespective of the group admin's
 * saved preference; absent means ordinary group-admin control.
 * For administrative capabilities: false removes that power from all group admins,
 * including the founder, but NOT from authorized Gavhah platform staff.
 */
export const groupPublicSettings = [
  "allowReplies","replyApproval","postApproval","membersCanPost",
  "membersCanReply","showViewCounts","allowDownvotes",
] as const;
export const groupAdminCapabilities = [
  "manageGroupInfo","manageGroupSettings","deleteGroup",
  "approveMembers","removeMembers","suspendMembers","restoreMembers",
  "manageAdmins","moderatePosts","editOthersPosts","deleteOthersPosts",
  "pinPosts","lockReplies","moderateReplies","deleteOthersReplies",
  "viewGroupReports","resolveGroupReports",
] as const;
export type PublicGroupSetting=typeof groupPublicSettings[number];
export type AdminGroupCapability=typeof groupAdminCapabilities[number];
export type GroupFeatureKey=PublicGroupSetting|AdminGroupCapability;
export const groupFeatureKeys: readonly GroupFeatureKey[]=[...groupPublicSettings,...groupAdminCapabilities];
type WithOverrides={platformFeatureOverrides?:Record<string,boolean>|null};

export function effectiveGroupSetting<T extends WithOverrides & Record<PublicGroupSetting,boolean>>(group:T,key:PublicGroupSetting) {
  const override=group.platformFeatureOverrides?.[key];
  return typeof override==="boolean" ? override : group[key];
}
export function groupAdminCan(group:WithOverrides,isPlatformStaff:boolean,capability:AdminGroupCapability) {
  return isPlatformStaff || group.platformFeatureOverrides?.[capability]!==false;
}
export function groupSettingLocked(group:WithOverrides,key:PublicGroupSetting) {
  return typeof group.platformFeatureOverrides?.[key]==="boolean";
}
export function validatedGroupOverrides(input:unknown):Record<string,boolean>|null {
  if(!input||typeof input!=="object"||Array.isArray(input))return null;
  const data=input as Record<string,unknown>;
  if(Object.keys(data).some(key=>!groupFeatureKeys.includes(key as GroupFeatureKey)))return null;
  if(Object.values(data).some(value=>typeof value!=="boolean"))return null;
  return data as Record<string,boolean>;
}
