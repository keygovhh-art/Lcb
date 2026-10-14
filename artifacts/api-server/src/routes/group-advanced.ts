import { Router, type Request, type Response } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db, groupsTable, groupMembersTable, groupPostsTable,
  groupPostRepliesTable, groupPostViewsTable,
  groupPostDownvotesTable, groupReportsTable, usersTable,
  entityLikesTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole, getCurrentSessionUser } from "../middlewares/auth";
import { resolvePublicPostingName } from "../lib/user-display";
import { publicPostForViewer } from "../lib/public-posting-identity";
import {platformGroupGrant,auditGroupAction} from "../lib/group-staff-access";
import { effectiveGroupSetting, groupAdminCan, groupMemberCan } from "../lib/group-feature-controls";

const router = Router();
const isStaff = (role?: string) => role === "admin" || role === "moderator" || role === "super_admin";
const isSystemAdmin = (role?: string) => role === "super_admin";
const id = (v: unknown) => {
  const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;
};
const sendNotFound = (res: Response) => res.status(404).json({error:"Not found"});

async function groupAccess(groupId: number, req: Request) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id,groupId));
  if(!group)return null;
  // A stored session ID/role is NOT enough: banned or suspended
  // platform members must never be treated as group staff or active members.
  const current=await getCurrentSessionUser(req);
  const userId=current?.id;
  const role=current?.role;
  const [member]=userId?await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId,groupId),eq(groupMembersTable.userId,userId),
  )).limit(1):[undefined];
  const owner=!!userId && group.ownerId===userId && member?.status!=="suspended";
  const grant=userId?await platformGroupGrant(userId,groupId,role):{
    staff:false,superAdmin:false,canViewPrivate:false,canModerate:false,
  };
  const staff=grant.superAdmin;
  const elevated=grant.superAdmin;
  const admin=grant.canModerate||owner||(["admin","moderator"].includes(member?.role||"")&&member?.status==="approved");
  const active=admin||(member?.status==="approved");
  const reader=group.privacy==="public"||active||grant.canViewPrivate;
  return {group,userId,owner,staff,elevated,admin,active,reader,member,grant};
}
async function postInGroup(groupId:number,postId:number) {
  const [post]=await db.select().from(groupPostsTable).where(and(
    eq(groupPostsTable.groupId,groupId),eq(groupPostsTable.id,postId),
  )).limit(1);
  return post||null;
}
function allowedPost(post: {moderationStatus:string;authorId:number}, ctx: {admin:boolean;userId?:number}) {
  return post.moderationStatus==="approved"||ctx.admin||post.authorId===ctx.userId;
}
function safeReply(row: typeof groupPostRepliesTable.$inferSelect, ctx:{admin:boolean;userId?:number}) {
  if(row.deletedAt){
    return {id:row.id,postId:row.postId,parentReplyId:row.parentReplyId,
      authorId:null,authorName:"אויסגעמעקט",content:"דער רעפליי איז אויסגעמעקט געווארן",
      moderationStatus:"approved",deletedAt:row.deletedAt,createdAt:row.createdAt};
  }
  const post=publicPostForViewer(row,ctx.userId);
  return post;
}
const getGroup=(req:Request,res:Response) => {
  const groupId=id(req.params.id);
  if(!groupId){res.status(400).json({error:"Invalid group"});return null;}
  return groupId;
};

// Group administrators can pin and lock a post. Moderation decisions remain separate.
router.patch("/groups/:id/posts/:postId/options", requireAuth, async (req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin){res.status(403).json({error:"Group admin required"});return;}
  if(!await postInGroup(gid,pid)){sendNotFound(res);return;}
  if(req.body?.isPinned!==undefined&&!groupAdminCan(ctx.group,ctx.staff,"pinPosts")){
    res.status(403).json({error:"Pinning posts disabled by Gavhah"});return;
  }
  if(req.body?.isLocked!==undefined&&!groupAdminCan(ctx.group,ctx.staff,"lockReplies")){
    res.status(403).json({error:"Locking replies disabled by Gavhah"});return;
  }
  const values:Record<string,boolean>={};
  for(const setting of ["isPinned","isLocked"] as const){
    if(req.body?.[setting]!==undefined){
      if(typeof req.body[setting]!=="boolean"){res.status(400).json({error:"Invalid post setting"});return;}
      values[setting]=req.body[setting];
    }
  }
  if(!Object.keys(values).length){res.status(400).json({error:"No changes"});return;}
  const [updated]=await db.update(groupPostsTable).set(values).where(eq(groupPostsTable.id,pid)).returning();
  res.json(updated);
});

// Mod/admin view, edit post approval — status changes must adjust public post count.
router.patch("/groups/:id/posts/:postId/review",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);
  if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx||!ctx.admin||!groupAdminCan(ctx.group,ctx.staff,"moderatePosts")){
    res.status(403).json({error:"Post moderation disabled"});return;
  }
  const post=await postInGroup(gid,pid);
  if(!post){sendNotFound(res);return;}
  const status=req.body?.status;
  if(status!=="approved"&&status!=="rejected"){res.status(400).json({error:"Choose approve or reject"});return;}
  const [updated]=await db.transaction(async tx=>{
    const [saved]=await tx.update(groupPostsTable).set({moderationStatus:status})
      .where(and(eq(groupPostsTable.id,pid),eq(groupPostsTable.groupId,gid))).returning();
    if((post.moderationStatus==="approved")!==(status==="approved")){
      await tx.update(groupsTable).set({postCount:sql`GREATEST(0,${groupsTable.postCount} + ${status==="approved"?1:-1})`})
        .where(eq(groupsTable.id,gid));
    }
    return [saved];
  });
  res.json(updated);
});

router.get("/groups/:id/moderation",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res);if(!gid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin||!groupAdminCan(ctx.group,ctx.staff,"moderatePosts")){
    res.status(403).json({error:"Moderation dashboard disabled"});return;
  }
  const [posts,replies]=await Promise.all([
    db.select().from(groupPostsTable).where(and(eq(groupPostsTable.groupId,gid),eq(groupPostsTable.moderationStatus,"pending"))).orderBy(desc(groupPostsTable.createdAt)),
    db.select({id:groupPostRepliesTable.id,postId:groupPostRepliesTable.postId,content:groupPostRepliesTable.content,
      authorName:groupPostRepliesTable.authorName,createdAt:groupPostRepliesTable.createdAt})
      .from(groupPostRepliesTable).innerJoin(groupPostsTable,eq(groupPostRepliesTable.postId,groupPostsTable.id))
      .where(and(eq(groupPostsTable.groupId,gid),eq(groupPostRepliesTable.moderationStatus,"pending")))
      .orderBy(desc(groupPostRepliesTable.createdAt)),
  ]);
  res.setHeader("Cache-Control","private, no-store");
  res.json({posts:posts.map(post=>publicPostForViewer(post,ctx.userId,getSessionUserRole(req))),replies});
});

router.get("/groups/:id/posts/:postId/replies",async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);
  if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.reader){res.status(403).json({error:"Private group"});return;}
  const post=await postInGroup(gid,pid);
  if(!post||!allowedPost(post,ctx)){sendNotFound(res);return;}
  const list=await db.select().from(groupPostRepliesTable)
    .where(eq(groupPostRepliesTable.postId,pid)).orderBy(groupPostRepliesTable.createdAt);
  res.setHeader("Cache-Control","private, no-store");
  // Hide children whose ancestors are still pending or rejected. Deleted
  // approved ancestors appear as privacy-safe placeholders preserving threads.
  const allById=new Map(list.map(row=>[row.id,row]));
  const visible=(row:typeof groupPostRepliesTable.$inferSelect) => {
    if(row.moderationStatus!=="approved"&&!ctx.admin&&row.authorId!==ctx.userId)return false;
    const visited=new Set<number>([row.id]);
    let parentId=row.parentReplyId;
    while(parentId!==null){
      if(visited.has(parentId))return false;
      visited.add(parentId);
      const parent=allById.get(parentId);
      if(!parent)return false;
      if(parent.moderationStatus!=="approved"&&!ctx.admin&&parent.authorId!==ctx.userId)return false;
      parentId=parent.parentReplyId;
    }
    return true;
  };
  res.json(list.filter(visible).map(reply=>safeReply(reply,ctx)));
});
router.post("/groups/:id/posts/:postId/replies",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.active){res.status(403).json({error:"Join this group to reply"});return;}
  if(!effectiveGroupSetting(ctx.group,"allowReplies")){res.status(403).json({error:"Replies disabled"});return;}
  if(!ctx.admin&&!effectiveGroupSetting(ctx.group,"membersCanReply")){res.status(403).json({error:"Member replies disabled"});return;}
  const post=await postInGroup(gid,pid);
  if(!post||!allowedPost(post,ctx)||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  if(post.isLocked&&!ctx.admin){res.status(403).json({error:"Replies are locked for this post"});return;}
  const content=req.body?.content;
  if(typeof content!=="string"||!content.trim()||content.length>3000){res.status(400).json({error:"Reply must be 1–3000 characters"});return;}
  const parentId=req.body?.parentReplyId===undefined||req.body?.parentReplyId===null?null:id(req.body.parentReplyId);
  if(req.body?.parentReplyId!==undefined&&req.body?.parentReplyId!==null&&!parentId){
    res.status(400).json({error:"Invalid parent reply"});return;
  }
  if(parentId){
    const [parent]=await db.select().from(groupPostRepliesTable)
      .where(and(eq(groupPostRepliesTable.id,parentId),eq(groupPostRepliesTable.postId,pid))).limit(1);
    if(!parent||parent.deletedAt||parent.moderationStatus!=="approved"){
      res.status(404).json({error:"Parent reply is not publicly available"});return;
    }
  }
  const authorName=await resolvePublicPostingName(ctx.userId!,req.body?.authorName);
  const [reply]=await db.insert(groupPostRepliesTable).values({
    postId:pid,parentReplyId:parentId,content:content.trim(),authorId:ctx.userId!,authorName,
    moderationStatus:!ctx.admin&&effectiveGroupSetting(ctx.group,"replyApproval")?"pending":"approved",
  }).returning();
  res.status(201).json(publicPostForViewer(reply,ctx.userId,getSessionUserRole(req)));
});
router.patch("/groups/:id/posts/:postId/replies/:replyId/review",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId),rid=id(req.params.replyId);
  if(!gid||!pid||!rid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin||!groupAdminCan(ctx.group,ctx.staff,"moderateReplies")){
    res.status(403).json({error:"Reply moderation disabled"});return;
  }
  const post=await postInGroup(gid,pid);if(!post){sendNotFound(res);return;}
  const status=req.body?.status;
  if(!["approved","rejected"].includes(status)){res.status(400).json({error:"Invalid reply status"});return;}
  const [updated]=await db.update(groupPostRepliesTable).set({moderationStatus:status})
    .where(and(eq(groupPostRepliesTable.id,rid),eq(groupPostRepliesTable.postId,pid))).returning();
  if(!updated){sendNotFound(res);return;}
  res.json(updated);
});
router.delete("/groups/:id/posts/:postId/replies/:replyId",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId),rid=id(req.params.replyId);
  if(!gid||!pid||!rid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx){sendNotFound(res);return;}
  const post=await postInGroup(gid,pid);if(!post){sendNotFound(res);return;}
  const [reply]=await db.select().from(groupPostRepliesTable).where(and(eq(groupPostRepliesTable.id,rid),eq(groupPostRepliesTable.postId,pid)));
  if(!reply){sendNotFound(res);return;}
  if(!ctx.admin&&reply.authorId!==ctx.userId){res.status(403).json({error:"Not allowed"});return;}
  if(reply.authorId!==ctx.userId&&!groupAdminCan(ctx.group,ctx.staff,"deleteOthersReplies")){
    res.status(403).json({error:"Admin reply deletion disabled by Gavhah"});return;
  }
  if(reply.authorId===ctx.userId&&!groupMemberCan(ctx.group,ctx.staff,"deleteOwnReplies")){
    res.status(403).json({error:"Own reply deletion disabled by Gavhah"});return;
  }
  // Keep the reply ID/parent reference alive so child discussions do not get
  // destroyed or orphaned when a parent is deleted.
  await db.update(groupPostRepliesTable).set({deletedAt:new Date(),content:"",authorName:"אויסגעמעקט"})
    .where(eq(groupPostRepliesTable.id,rid));
  res.json({ok:true});
});

// Count one view per signed-in member for each published post, not per reload.
router.post("/groups/:id/posts/:postId/view",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  const post=ctx?await postInGroup(gid,pid):null;
  if(!ctx?.reader||!post||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  const views=await db.transaction(async tx=>{
    const [added]=await tx.insert(groupPostViewsTable).values({postId:pid,userId:ctx.userId!}).onConflictDoNothing().returning();
    if(added) await tx.update(groupPostsTable).set({views:sql`${groupPostsTable.views}+1`}).where(eq(groupPostsTable.id,pid));
    const [current]=await tx.select({views:groupPostsTable.views}).from(groupPostsTable).where(eq(groupPostsTable.id,pid));
    return current?.views??0;
  });
  res.json({ok:true,viewRecorded:true,views:ctx.admin||effectiveGroupSetting(ctx.group,"showViewCounts")?views:undefined});
});

// Return the current member's own vote, never the public total.
router.get("/groups/:id/posts/:postId/downvote",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  const post=ctx?await postInGroup(gid,pid):null;
  if(!ctx?.active||!post||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  if(!effectiveGroupSetting(ctx.group,"allowDownvotes")){res.json({downvoted:false});return;}
  const [existing]=await db.select({id:groupPostDownvotesTable.id}).from(groupPostDownvotesTable)
    .where(and(eq(groupPostDownvotesTable.postId,pid),eq(groupPostDownvotesTable.userId,ctx.userId!))).limit(1);
  res.setHeader("Cache-Control","private, no-store");
  res.json({downvoted:!!existing});
});

// Public downvote totals are NEVER returned; only management sees totals.
router.post("/groups/:id/posts/:postId/downvote",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  const post=ctx?await postInGroup(gid,pid):null;
  if(!ctx?.active||!post||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  if(!effectiveGroupSetting(ctx.group,"allowDownvotes")){res.status(403).json({error:"Downvotes disabled"});return;}
  const result=await db.transaction(async tx=>{
    const [existing]=await tx.select().from(groupPostDownvotesTable).where(and(eq(groupPostDownvotesTable.postId,pid),eq(groupPostDownvotesTable.userId,ctx.userId!))).limit(1);
    const downvoted=!existing;
    if(existing) await tx.delete(groupPostDownvotesTable).where(eq(groupPostDownvotesTable.id,existing.id));
    else {
      await tx.insert(groupPostDownvotesTable).values({postId:pid,userId:ctx.userId!});
      // Downvoting cancels a prior upvote on the same post.
      const removed=await tx.delete(entityLikesTable).where(and(
        eq(entityLikesTable.userId,ctx.userId!),
        eq(entityLikesTable.entityType,"group_post"),
        eq(entityLikesTable.entityId,pid),
      )).returning({id:entityLikesTable.id});
      if(removed.length) await tx.update(groupPostsTable).set({
        likes:sql`GREATEST(0,${groupPostsTable.likes}-1)`,
      }).where(eq(groupPostsTable.id,pid));
    }
    await tx.update(groupPostsTable).set({downvotes:sql`GREATEST(0,${groupPostsTable.downvotes} + ${downvoted?1:-1})`})
      .where(eq(groupPostsTable.id,pid));
    return downvoted;
  });
  res.json({downvoted:result});
});

// Report routing is private. Group owners may not know whether staff also got a report.
router.post("/groups/:id/posts/:postId/report",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  const post=ctx?await postInGroup(gid,pid):null;
  if(!ctx?.reader||!post||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  if(!groupMemberCan(ctx.group,ctx.staff,"reportPosts")){res.status(403).json({error:"Reporting disabled by Gavhah"});return;}
  const destination=String(req.body?.destination||"");
  const reason=String(req.body?.reason||"").trim();
  if(!["group","staff","both"].includes(destination)||!reason||reason.length>2000){
    res.status(400).json({error:"Choose recipient and give a reason (max 2000 characters)"});return;
  }
  // At most one report per member/post; repeated submissions can safely
  // escalate a group report to the platform team, without exposing that to group admins.
  await db.insert(groupReportsTable).values({
    groupId:gid,postId:pid,reporterId:ctx.userId!,reason,
    postExcerpt:post.content.slice(0,4000),
    toGroup:destination!=="staff",toStaff:destination!=="group",
  }).onConflictDoUpdate({
    target:[groupReportsTable.postId,groupReportsTable.reporterId],
    set:{
      toGroup:sql`${groupReportsTable.toGroup} OR ${destination!=="staff"}`,
      toStaff:sql`${groupReportsTable.toStaff} OR ${destination!=="group"}`,
    },
  });
  // Recipient choice is not echoed back: group team has no side-channel.
  res.status(201).json({ok:true});
});
router.get("/groups/:id/reports",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res);if(!gid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin||!groupAdminCan(ctx.group,ctx.staff,"viewGroupReports")){
    res.status(403).json({error:"Group reports disabled"});return;
  }
  const rows=await db.select().from(groupReportsTable).where(and(eq(groupReportsTable.groupId,gid),eq(groupReportsTable.toGroup,true)))
    .orderBy(desc(groupReportsTable.createdAt));
  res.setHeader("Cache-Control","private, no-store");
  // Explicit allowlist, never serialize toStaff or staffStatus, even in nested object.
  res.json(rows.map(r=>({id:r.id,postId:r.postId,reason:r.reason,
    postExcerpt:r.postExcerpt,status:r.groupStatus,createdAt:r.createdAt.toISOString()})));
});
router.patch("/groups/:id/reports/:reportId",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),rid=id(req.params.reportId);if(!gid||!rid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin||!groupAdminCan(ctx.group,ctx.staff,"resolveGroupReports")){
    res.status(403).json({error:"Report resolution disabled"});return;
  }
  const status=req.body?.status;if(!["open","resolved"].includes(status)){res.status(400).json({error:"Invalid status"});return;}
  const [r]=await db.update(groupReportsTable).set({groupStatus:status}).where(and(
    eq(groupReportsTable.id,rid),eq(groupReportsTable.groupId,gid),eq(groupReportsTable.toGroup,true),
  )).returning();
  if(!r){sendNotFound(res);return;}
  res.json({id:r.id,status:r.groupStatus});
});
router.get("/admin/group-reports",requireAdmin,async(req,res):Promise<void>=>{
  const reports=await db.select().from(groupReportsTable).where(eq(groupReportsTable.toStaff,true))
    .orderBy(desc(groupReportsTable.createdAt)).limit(200);
  res.setHeader("Cache-Control","private, no-store");
  res.json(reports.map(r=>({id:r.id,groupId:r.groupId,postId:r.postId,reason:r.reason,
    postExcerpt:r.postExcerpt,status:r.staffStatus,createdAt:r.createdAt.toISOString()})));
});
router.patch("/admin/group-reports/:id",requireAdmin,async(req,res):Promise<void>=>{
  const rid=id(req.params.id);if(!rid)return;
  const status=req.body?.status;
  if(!["open","resolved"].includes(status)){res.status(400).json({error:"Invalid status"});return;}
  const [r]=await db.update(groupReportsTable).set({staffStatus:status})
    .where(and(eq(groupReportsTable.id,rid),eq(groupReportsTable.toStaff,true))).returning();
  if(!r){sendNotFound(res);return;}
  res.json({id:r.id,status:r.staffStatus});
});
// ONLY elevated system admins may transfer ownership; never a group admin or team moderator.
router.patch("/admin/groups/:id/owner",requireAdmin,async(req,res):Promise<void>=>{
  if(!isSystemAdmin(getSessionUserRole(req))){res.status(403).json({error:"System administration required"});return;}
  const gid=getGroup(req,res),newOwner=id(req.body?.userId);if(!gid||!newOwner)return;
  const ctx=await groupAccess(gid,req);if(!ctx){sendNotFound(res);return;}
  const [member]=await db.select().from(groupMembersTable).where(and(eq(groupMembersTable.groupId,gid),eq(groupMembersTable.userId,newOwner),eq(groupMembersTable.status,"approved")));
  const [user]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.id,newOwner));
  if(!member||!user){res.status(400).json({error:"New owner must be an approved group member"});return;}
  await db.transaction(async tx=>{
    await tx.update(groupMembersTable).set({role:"member"}).where(and(eq(groupMembersTable.groupId,gid),eq(groupMembersTable.userId,ctx.group.ownerId)));
    await tx.update(groupMembersTable).set({role:"owner"}).where(eq(groupMembersTable.id,member.id));
    await tx.update(groupsTable).set({ownerId:newOwner,ownerName:member.userName}).where(eq(groupsTable.id,gid));
  });
  res.json({ok:true});
});

export default router;
