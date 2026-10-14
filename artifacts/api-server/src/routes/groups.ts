import { Router, type IRouter } from "express";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, groupPostsTable, groupPostDownvotesTable, usersTable, entityLikesTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole, getCurrentSessionUser } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { resolveMemberDisplayName, resolvePublicPostingName } from "../lib/user-display";
import { publicPostForViewer } from "../lib/public-posting-identity";
import { deleteManagedMediaUrl } from "../lib/media-cleanup";
import { logActivity } from "../lib/activity";
import { platformGroupGrant, isPlatformSuperAdmin, auditGroupAction } from "../lib/group-staff-access";
import { effectiveGroupSetting, groupPublicSettings, groupMemberCapabilities, groupAdminCan, groupMemberCan, groupSettingLocked } from "../lib/group-feature-controls";
import { notifyUser, notifyStaff, queueStaffReview } from "../lib/notify";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator" || role === "super_admin";
}
const canTransferOwner = (role?: string) => role === "admin" || role === "super_admin";
async function isGroupManager(groupId:number,userId:number,role?:string,ownerId?:number) {
  if(userId===ownerId)return true;
  if((await platformGroupGrant(userId,groupId,role)).canModerate)return true;
  const [member]=await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId,groupId),eq(groupMembersTable.userId,userId),
    eq(groupMembersTable.status,"approved"),inArray(groupMembersTable.role,["admin","moderator"]),
  )).limit(1);
  return !!member;
}
async function groupMemberActive(groupId:number,userId:number) {
  const [member]=await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId,groupId),eq(groupMembersTable.userId,userId),
    eq(groupMembersTable.status,"approved"),
  )).limit(1);
  return !!member;
}


router.get("/groups", async (req, res): Promise<void> => {
  const { search, privacy } = req.query as Record<string, string>;
  let all = await db.select().from(groupsTable).orderBy(desc(groupsTable.createdAt));
  if (privacy) all = all.filter(g => g.privacy === privacy);
  if (search) all = all.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  res.json(all.map(({password: _password,platformFeatureOverrides: _overrides,...g})=>({
    ...g,...Object.fromEntries(groupPublicSettings.map(key=>[key,effectiveGroupSetting(
      { ...g, platformFeatureOverrides: _overrides }, key)])),
  })));
});

router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const { name, description, privacy, imageUrl } = req.body;
  if (!String(name || "").trim() || !String(description || "").trim()) {
    res.status(400).json({ error: "name and description required" });
    return;
  }
  if (privacy && !["public", "private"].includes(privacy)) {
    res.status(400).json({ error: "invalid privacy setting" });
    return;
  }
  const userId = getSessionUserId(req)!;
  const ownerName = await resolveMemberDisplayName(userId);
  const [group] = await db.insert(groupsTable).values({
    name: String(name).trim().slice(0, 200),
    description: String(description).trim().slice(0, 5000),
    privacy: privacy || "public",
    imageUrl: imageUrl || null,
    ownerId: userId,
    ownerName,
    memberCount: 1,
  }).returning();

  await db.insert(groupMembersTable).values({
    userId,
    userName: ownerName,
    groupId: group.id,
    role: "owner",
    status: "approved",
  }).onConflictDoNothing();

  await logActivity("group", `Created community group "${group.name}"`, ownerName);
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await queueStaffReview({
    userId,
    name: ownerName,
    contact: owner?.email || owner?.phone,
    type: "group_creation",
    subject: `New group created: ${group.name}`,
    message: [
      `Owner: ${ownerName}`,
      `Privacy: ${group.privacy}`,
      `Description: ${group.description}`,
    ].join("\n"),
    notificationType: "admin_group_creation",
  });
  res.status(201).json(group);
});

router.get("/groups/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Not found" }); return; }
  const [current]=await Promise.all([getCurrentSessionUser(req)]);
  const allowStaff=current?await platformGroupGrant(current.id,id,current.role):null;
  const isOwner=current?.id===group.ownerId;
  const manager=!!current&&(isOwner||!!allowStaff?.canModerate ||
    await isGroupManager(id,current.id,current.role,group.ownerId));
  const {password: _password,platformFeatureOverrides: _overrides,...safe}=group;
  const effective=Object.fromEntries(groupPublicSettings.map(key=>[key,effectiveGroupSetting(group,key)]));
  const allowedCapabilities=Object.fromEntries([
    "manageGroupInfo","manageGroupSettings","deleteGroup","approveMembers",
    "removeMembers","suspendMembers","restoreMembers","manageAdmins","moderatePosts",
    "editOthersPosts","deleteOthersPosts","pinPosts","lockReplies","moderateReplies",
    "deleteOthersReplies","viewGroupReports","resolveGroupReports",
  ].map(key=>[key,manager && groupAdminCan(group,!!allowStaff?.superAdmin,
    key as Parameters<typeof groupAdminCan>[2])]));
  res.setHeader("Cache-Control","private, no-store");
  const memberCapabilities=Object.fromEntries(groupMemberCapabilities.map(
    key=>[key,groupMemberCan(group,!!allowStaff?.superAdmin,key)]));
  res.json({...safe,...effective,
    lockedSettings:manager?groupPublicSettings.filter(k=>groupSettingLocked(group,k)):[],
    allowedCapabilities:{...memberCapabilities,...(manager?allowedCapabilities:{})},
    platformAccess:allowStaff?.canViewPrivate??false,
    platformCanModerate:allowStaff?.canModerate??false,
  });
});

router.patch("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await isGroupManager(id,getSessionUserId(req)!,getSessionUserRole(req),existing.ownerId))) {
    res.status(403).json({ error: "Group admin required" }); return;
  }
  const { name, description, privacy, imageUrl } = req.body;
  const controls = groupPublicSettings;
  const staff=isPlatformSuperAdmin(getSessionUserRole(req));
  const editingInfo=[name,description,privacy,imageUrl].some(v=>v!==undefined);
  const editingSettings=controls.some(key=>req.body[key]!==undefined);
  if(editingInfo&&!groupAdminCan(existing,staff,"manageGroupInfo")){
    res.status(403).json({error:"Group info editing disabled by Gavhah"});return;
  }
  if(editingSettings&&!groupAdminCan(existing,staff,"manageGroupSettings")){
    res.status(403).json({error:"Group settings disabled by Gavhah"});return;
  }
  const updates: Record<string, unknown> = {};
  for (const key of controls) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] !== "boolean") {
        res.status(400).json({ error: key+" must be true or false" }); return;
      }
      if(!staff&&groupSettingLocked(existing,key)){
        res.status(403).json({error:key+" is controlled by Gavhah"});return;
      }
      updates[key] = req.body[key];
    }
  }
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (!cleanName) { res.status(400).json({ error: "name required" }); return; }
    updates.name = cleanName.slice(0, 200);
  }
  if (description !== undefined) {
    const cleanDescription = String(description).trim();
    if (!cleanDescription) { res.status(400).json({ error: "description required" }); return; }
    updates.description = cleanDescription.slice(0, 5000);
  }
  if (privacy !== undefined) {
    if (!["public", "private"].includes(privacy)) {
      res.status(400).json({ error: "invalid privacy setting" }); return;
    }
    updates.privacy = privacy;
  }
  if (imageUrl !== undefined) updates.imageUrl = imageUrl || null;

  const [group] = await db.update(groupsTable).set(updates).where(eq(groupsTable.id, id)).returning();
  if (!group) { res.status(404).json({ error: "Not found" }); return; }

  if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== group.imageUrl) {
    await deleteManagedMediaUrl(existing.imageUrl);
  }

  if (privacy !== undefined && existing.privacy === "private" && group.privacy === "public") {
    const approvedNow = await db.update(groupMembersTable)
      .set({ status: "approved" })
      .where(and(
        eq(groupMembersTable.groupId, id),
        eq(groupMembersTable.status, "pending"),
      ))
      .returning();

    if (approvedNow.length > 0) {
      await db.update(groupsTable)
        .set({ memberCount: sql`${groupsTable.memberCount} + ${approvedNow.length}` })
        .where(eq(groupsTable.id, id));

      for (const member of approvedNow) {
        await notifyUser(
          member.userId,
          "group_membership_review",
          `Your request to join "${group.name}" was approved because the group is now public.`,
          `/groups/${id}`,
        );
      }
    }
  }

  res.json(group);
});

router.delete("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  // A group can only be deleted by its owner or the platform administration;
  // delegated group admins can NEVER delete the group or its owner.
  if(!groupAdminCan(existing,isPlatformSuperAdmin(getSessionUserRole(req)),"deleteGroup")){
    res.status(403).json({error:"Group deletion disabled by Gavhah"});return;
  }
  if (existing.ownerId !== getSessionUserId(req)! && !canTransferOwner(getSessionUserRole(req))) {
    res.status(403).json({ error: "Only the group owner or Gavhah administration can delete a group" }); return;
  }
  const postIds = (await db.select({ id: groupPostsTable.id })
    .from(groupPostsTable)
    .where(eq(groupPostsTable.groupId, id)))
    .map(row => row.id);

  if (postIds.length > 0) {
    await db.delete(entityLikesTable).where(and(
      eq(entityLikesTable.entityType, "group_post"),
      inArray(entityLikesTable.entityId, postIds),
    ));
  }
  await db.delete(groupPostsTable).where(eq(groupPostsTable.groupId, id));
  await db.delete(groupMembersTable).where(eq(groupMembersTable.groupId, id));
  await db.delete(groupsTable).where(eq(groupsTable.id, id));
  await deleteManagedMediaUrl(existing.imageUrl);
  res.sendStatus(204);
});

router.post("/groups/:id/join", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const userId = getSessionUserId(req)!;

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  if(!groupMemberCan(group,isPlatformSuperAdmin(getSessionUserRole(req)),"joinGroup")){res.status(403).json({error:"Joining this group is disabled by Gavhah"});return;}
  const desiredStatus = group.privacy === "private" ? "pending" : "approved";
  const [existing] = await db.select().from(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId))
  );

  if (existing && ["suspended","removed"].includes(existing.status)) {
    res.status(403).json({ error: "Your membership is inactive; contact the group administration" });
    return;
  }
  if (existing && existing.status === "approved") {
    res.json(existing);
    return;
  }
  if (existing && existing.status === "pending" && desiredStatus === "pending") {
    res.json(existing);
    return;
  }

  const userName = await resolveMemberDisplayName(userId);
  let member;

  if (existing) {
    [member] = await db.update(groupMembersTable)
      .set({ status: desiredStatus, role: "member", userName })
      .where(eq(groupMembersTable.id, existing.id))
      .returning();
  } else {
    [member] = await db.insert(groupMembersTable).values({
      userId,
      userName,
      groupId,
      role: "member",
      status: desiredStatus,
    }).returning();
  }

  if (desiredStatus === "approved") {
    await db.update(groupsTable)
      .set({ memberCount: sql`${groupsTable.memberCount} + 1` })
      .where(eq(groupsTable.id, groupId));
  }

  if (group.ownerId !== userId) {
    await notifyUser(
      group.ownerId,
      desiredStatus === "pending" ? "group_join_request" : "group_join",
      desiredStatus === "pending"
        ? `${userName} requested to join your private group "${group.name}".`
        : `${userName} joined your group "${group.name}".`,
      `/groups/${groupId}`,
    );
  }

  res.json(member);
});

router.get("/groups/:id/members", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const verifiedCurrentUser = await getCurrentSessionUser(req);
  const currentUserId = verifiedCurrentUser?.id;
  if (currentUserId && await isGroupManager(groupId,currentUserId,verifiedCurrentUser.role,group.ownerId)) {
    res.setHeader("Cache-Control","private, no-store");
    res.json(await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId,groupId)));
    return;
  }
  if (group.privacy === "public") {
    const members = await db.select().from(groupMembersTable).where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.status, "approved"),
    ));
    res.json(members);
    return;
  }

  const userId = getSessionUserId(req);
  if (!userId) {
    res.json([]);
    return;
  }

  const currentUser = await getCurrentSessionUser(req);
  if (!currentUser) {
    res.json([]);
    return;
  }

  if (group.ownerId === currentUser.id ||
    (await platformGroupGrant(currentUser.id,groupId,currentUser.role)).canViewPrivate) {
    const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
    res.json(members);
    return;
  }

  const [membership] = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.userId, userId),
  ));

  if (!membership) {
    res.json([]);
    return;
  }

  if (membership.status !== "approved") {
    res.json([membership]);
    return;
  }

  const members = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.status, "approved"),
  ));
  res.json(members);
});

router.patch("/groups/:id/members/:memberId",requireAuth,async(req,res):Promise<void>=>{
  const groupId=Number(req.params.id),memberId=Number(req.params.memberId);
  if(!Number.isSafeInteger(groupId)||!Number.isSafeInteger(memberId)){res.status(400).json({error:"Invalid member"});return;}
  const [group]=await db.select().from(groupsTable).where(eq(groupsTable.id,groupId));
  if(!group){res.status(404).json({error:"Group not found"});return;}
  const actor=getSessionUserId(req)!;
  const staffRole=getSessionUserRole(req);
  const manager=await isGroupManager(groupId,actor,staffRole,group.ownerId);
  if(!manager){res.status(403).json({error:"Group admin required"});return;}
  const staff=isPlatformSuperAdmin(staffRole);
  const roleRequested=req.body?.role;
  const statusRequested=req.body?.status;
  const [target]=await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.id,memberId),eq(groupMembersTable.groupId,groupId),
  ));
  if(!target){res.status(404).json({error:"Member not found"});return;}
  const capability=roleRequested!==undefined?"manageAdmins"
    :statusRequested==="suspended"?"suspendMembers"
    :statusRequested==="removed"?"removeMembers"
    :statusRequested==="approved"&&target.status==="pending"?"approveMembers"
    :statusRequested==="approved"?"restoreMembers":"approveMembers";
  if(!groupAdminCan(group,staff,capability)){
    res.status(403).json({error:"Member-management feature disabled by Gavhah"});return;
  }
  // The owner may not be demoted, suspended, rejected or removed by group admins.
  // Even the owner cannot silently replace themselves. Only staff-admins may
  // transfer ownership through the separate privileged route.
  if(target.userId===group.ownerId||target.role==="owner"){
    res.status(403).json({error:"Group founder protected; only Gavhah system administration may transfer ownership"});return;
  }
  if(!staff&&(statusRequested==="removed"||statusRequested==="suspended"||statusRequested==="rejected")&&target.protectedByPlatform){
    res.status(403).json({error:"This member is protected by Gavhah"});return;
  }
  const actorIsOwner=group.ownerId===actor;
  const systemAdmin=canTransferOwner(staffRole);
  const actorMember=await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId,groupId),eq(groupMembersTable.userId,actor),
  )).limit(1);
  const actorGroupAdmin=actorMember[0]?.role==="admin";
  const targetAdmin=["admin","moderator"].includes(target.role);
  const role=req.body?.role;
  const status=req.body?.status;
  if(role===undefined&&status===undefined){res.status(400).json({error:"Choose a role or membership status"});return;}
  if(role!==undefined){
    if(!["member","admin"].includes(role)){res.status(400).json({error:"Invalid role"});return;}
    if(!actorIsOwner&&!systemAdmin){res.status(403).json({error:"Only the group founder may add/remove admins"});return;}
    if(target.status!=="approved"){res.status(409).json({error:"Only active members can be administrators"});return;}
  }
  if(status!==undefined){
    if(!["approved","rejected","suspended","removed"].includes(status)){
      res.status(400).json({error:"Invalid membership status"});return;
    }
    if(targetAdmin&&!actorIsOwner&&!systemAdmin){
      res.status(403).json({error:"Delegated admins may only moderate ordinary members"});return;
    }
    if(status==="approved"&&target.status==="removed"&&!actorIsOwner&&!systemAdmin){
      res.status(403).json({error:"Founder approval required to restore removed members"});return;
    }
  }
  if(actor===target.userId && (status!==undefined||role!==undefined)){
    res.status(403).json({error:"Cannot change your own group administrative role or membership"});return;
  }
  const nextRole=role!==undefined?role:(status==="suspended"||status==="removed"?"member":target.role);
  const nextStatus=status??target.status;
  const [updated]=await db.transaction(async tx=>{
    const [member]=await tx.update(groupMembersTable).set({role:nextRole,status:nextStatus})
      .where(eq(groupMembersTable.id,memberId)).returning();
    if((target.status==="approved")!==(nextStatus==="approved"))
      await tx.update(groupsTable).set({memberCount:sql`GREATEST(0,${groupsTable.memberCount}+${nextStatus==="approved"?1:-1})`})
        .where(eq(groupsTable.id,groupId));
    return [member];
  });
  res.setHeader("Cache-Control","private, no-store");
  res.json(updated);
});

router.get("/groups/:id/posts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Not found" }); return; }

  if (group.privacy !== "public") {
    const userId = getSessionUserId(req);
    if (!userId) { res.status(401).json({ error: "Sign in required" }); return; }

    const currentUser = await getCurrentSessionUser(req);
    if (!currentUser) { res.status(401).json({ error: "Sign in required" }); return; }

    const [membership] = await db.select().from(groupMembersTable).where(and(
      eq(groupMembersTable.groupId, id),
      eq(groupMembersTable.userId, currentUser.id),
      eq(groupMembersTable.status, "approved"),
    ));
    if (!membership && group.ownerId !== currentUser.id &&
      !(await platformGroupGrant(currentUser.id,id,currentUser.role)).canViewPrivate) {
      res.status(403).json({ error: "Private group" }); return;
    }
    if((await platformGroupGrant(currentUser.id,id,currentUser.role)).canViewPrivate)
      await auditGroupAction(currentUser.id,"private_group_posts_read",id);
  }

  const viewer = await getCurrentSessionUser(req);
  const manager = viewer ? await isGroupManager(id,viewer.id,viewer.role,group.ownerId) : false;
  const rows = await db.select().from(groupPostsTable).where(eq(groupPostsTable.groupId,id)).orderBy(desc(groupPostsTable.isPinned),desc(groupPostsTable.createdAt));
  res.setHeader("Cache-Control","private, no-store");
  res.json(rows.filter(row => row.moderationStatus==="approved"||manager||row.authorId===viewer?.id).map(row=>{
    const safe=publicPostForViewer(row,viewer?.id,viewer?.role);
    const {downvotes, ...withoutDownvotes}=safe;
    return {...withoutDownvotes,moderationStatus:manager||row.authorId===viewer?.id?row.moderationStatus:"approved",
      views:effectiveGroupSetting(group,"showViewCounts")||manager?row.views:null,
      // Downvote counts are accessible only to group admins or Gavhah staff.
      ...(manager?{downvotes}:{}),
    };
  }));
});

router.patch("/groups/:id/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const postId = Number(req.params.postId);
  const [post] = await db.select().from(groupPostsTable).where(and(
    eq(groupPostsTable.id, postId),
    eq(groupPostsTable.groupId, groupId),
  ));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [group]=await db.select().from(groupsTable).where(eq(groupsTable.id,groupId));
  if(!group){res.status(404).json({error:"Group not found"});return;}
  const manager=await isGroupManager(groupId,getSessionUserId(req)!,getSessionUserRole(req),group.ownerId);
  if (post.authorId !== getSessionUserId(req)! && !manager) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  if(post.authorId!==getSessionUserId(req)! && !groupAdminCan(group,isPlatformSuperAdmin(getSessionUserRole(req)),"editOthersPosts")){
    res.status(403).json({error:"Admin post editing disabled by Gavhah"});return;
  }
  if(post.authorId===getSessionUserId(req)! && !groupMemberCan(group,isPlatformSuperAdmin(getSessionUserRole(req)),"editOwnPosts")){
    res.status(403).json({error:"Post editing disabled by Gavhah"});return;
  }
  const content = String(req.body?.content || "").trim();
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  if (content.length > 10000) { res.status(400).json({ error: "content is too long" }); return; }

  const nextStatus=!manager&&effectiveGroupSetting(group,"postApproval")?"pending":post.moderationStatus;
  const [updated]=await db.transaction(async tx=>{
    const [updated]=await tx.update(groupPostsTable)
      .set({content,moderationStatus:nextStatus}).where(eq(groupPostsTable.id,postId)).returning();
    if(post.moderationStatus==="approved"&&nextStatus!=="approved")
      await tx.update(groupsTable).set({postCount:sql`GREATEST(0,${groupsTable.postCount}-1)`})
        .where(eq(groupsTable.id,groupId));
    return [updated];
  });
  if(manager){
    res.json(publicPostForViewer(updated,getSessionUserId(req)!,getSessionUserRole(req)));return;
  }
  // A post author is not necessarily a group admin; never leak hidden downvote
  // counts through the edit response.
  const safe=publicPostForViewer(updated,getSessionUserId(req)!,getSessionUserRole(req));
  const {downvotes, ...publicRecord}=safe;
  res.json({...publicRecord,views:effectiveGroupSetting(group,"showViewCounts")?updated.views:null});
});

router.delete("/groups/:id/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const postId = Number(req.params.postId);
  const [post] = await db.select().from(groupPostsTable).where(and(
    eq(groupPostsTable.id, postId),
    eq(groupPostsTable.groupId, groupId),
  ));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [group]=await db.select().from(groupsTable).where(eq(groupsTable.id,groupId));
  if(!group){res.status(404).json({error:"Group not found"});return;}
  const ownPost=post.authorId===getSessionUserId(req)!;
  const staff=isPlatformSuperAdmin(getSessionUserRole(req));
  if(!ownPost && !(await isGroupManager(groupId,getSessionUserId(req)!,getSessionUserRole(req),group.ownerId))){
    res.status(403).json({error:"Not allowed"});return;
  }
  if(ownPost&&!groupMemberCan(group,staff,"deleteOwnPosts")){
    res.status(403).json({error:"Deleting your own posts disabled by Gavhah"});return;
  }
  if(!ownPost&&!groupAdminCan(group,staff,"deleteOthersPosts")){
    res.status(403).json({error:"Deleting other posts disabled by Gavhah"});return;
  }
  await db.delete(entityLikesTable).where(and(
    eq(entityLikesTable.entityType, "group_post"),
    eq(entityLikesTable.entityId, postId),
  ));
  await db.delete(groupPostsTable).where(eq(groupPostsTable.id, postId));
  if(post.moderationStatus==="approved") await db.update(groupsTable)
    .set({postCount:sql`GREATEST(0,${groupsTable.postCount}-1)`})
    .where(eq(groupsTable.id,groupId));
  res.sendStatus(204);
});

router.post("/groups/:id/posts/:postId/like", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  const postId = Number(req.params.postId);
  const [post] = await db.select({ id: groupPostsTable.id, likes: groupPostsTable.likes, moderationStatus:groupPostsTable.moderationStatus })
    .from(groupPostsTable)
    .where(and(eq(groupPostsTable.id, postId), eq(groupPostsTable.groupId, groupId)));
  if (!post || post.moderationStatus!=="approved") { res.status(404).json({ error: "Not found" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Not found" }); return; }

  const userId = getSessionUserId(req)!;
  if (group.privacy === "private" && group.ownerId !== userId &&
    !(await platformGroupGrant(userId,groupId,getSessionUserRole(req))).canViewPrivate) {
    const [membership] = await db.select().from(groupMembersTable).where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.userId, userId),
      eq(groupMembersTable.status, "approved"),
    ));
    if (!membership) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  if(!groupMemberCan(group,isPlatformSuperAdmin(getSessionUserRole(req)),"upvotePosts")){
    res.status(403).json({error:"Upvotes disabled by Gavhah"});return;
  }
  const state = await setLikeState(userId, "group_post", postId);
  let likes = post.likes;
  if (state.changed) {
    const [updated] = await db.update(groupPostsTable)
      .set({ likes: sql`GREATEST(0, ${groupPostsTable.likes} + ${state.delta})` })
      .where(eq(groupPostsTable.id, postId))
      .returning({ likes: groupPostsTable.likes });
    likes = updated.likes;
  }
  if(state.liked) {
    const removed=await db.delete(groupPostDownvotesTable).where(and(
      eq(groupPostDownvotesTable.postId,postId),
      eq(groupPostDownvotesTable.userId,userId),
    )).returning({id:groupPostDownvotesTable.id});
    if(removed.length)await db.update(groupPostsTable).set({
      downvotes:sql`GREATEST(0,${groupPostsTable.downvotes}-1)`,
    }).where(eq(groupPostsTable.id,postId));
  }
  res.json({ likes, liked: state.liked });
});

router.post("/groups/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const groupId = parseInt(raw, 10);
  const userId = getSessionUserId(req)!;
  const { content, authorName } = req.body;
  const cleanContent = String(content || "").trim();
  if (!cleanContent) { res.status(400).json({ error: "content required" }); return; }
  if (cleanContent.length > 10000) { res.status(400).json({ error: "content is too long" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const [membership] = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.userId, userId),
    eq(groupMembersTable.status, "approved"),
  ));
  if (!membership && group.ownerId !== userId &&
    !(await platformGroupGrant(userId,groupId,getSessionUserRole(req))).canModerate) {
    res.status(403).json({ error: "Join this group before posting" });
    return;
  }
  const manager=await isGroupManager(groupId,userId,getSessionUserRole(req),group.ownerId);
  if(!manager&&!effectiveGroupSetting(group,"membersCanPost")){res.status(403).json({error:"Only group admins can publish right now"});return;}

  const safeAuthorName = await resolvePublicPostingName(userId, authorName);
  const [post] = await db.insert(groupPostsTable).values({
    content: cleanContent,
    groupId,
    authorId: userId,
    authorName: safeAuthorName,
    moderationStatus:!manager&&effectiveGroupSetting(group,"postApproval")?"pending":"approved",
  }).returning();

  if(post.moderationStatus==="approved") await db.update(groupsTable)
    .set({ postCount: sql`${groupsTable.postCount} + 1` })
    .where(eq(groupsTable.id, groupId));

  if(manager){
    res.status(201).json(post);return;
  }
  const {downvotes, ...publicRecord}=post;
  res.status(201).json({...publicRecord,views:effectiveGroupSetting(group,"showViewCounts")?post.views:null});
});

export default router;
