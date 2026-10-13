import { Router, type Request, type Response } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db, groupsTable, groupMembersTable, groupPostsTable,
  groupPostRepliesTable, groupPostViewsTable,
  groupPostDownvotesTable, groupReportsTable, usersTable,
  entityLikesTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
import { resolvePublicPostingName } from "../lib/user-display";
import { publicPostForViewer } from "../lib/public-posting-identity";

const router = Router();
const isStaff = (role?: string) => role === "admin" || role === "moderator" || role === "super_admin";
const isSystemAdmin = (role?: string) => role === "admin" || role === "super_admin";
const id = (v: unknown) => {
  const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;
};
const sendNotFound = (res: Response) => res.status(404).json({error:"Not found"});

async function groupAccess(groupId: number, req: Request) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id,groupId));
  if(!group)return null;
  const userId=getSessionUserId(req);
  const role=getSessionUserRole(req);
  const [member]=userId?await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId,groupId),eq(groupMembersTable.userId,userId),
  )).limit(1):[undefined];
  const owner=!!userId && group.ownerId===userId && member?.status!=="suspended";
  const staff=isStaff(role);
  const elevated=isSystemAdmin(role);
  const admin=staff||owner||(member?.role==="admin"&&member.status==="approved");
  const active=admin||(member?.status==="approved");
  const reader=group.privacy==="public"||active;
  return {group,userId,owner,staff,elevated,admin,active,reader,member};
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
  if(!ctx||!ctx.admin){res.status(403).json({error:"Group admin required"});return;}
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
  if(!ctx?.admin){res.status(403).json({error:"Group admin required"});return;}
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
  res.json(list.filter(reply=>reply.moderationStatus==="approved"||ctx.admin||reply.authorId===ctx.userId)
    .map(reply=>safeReply(reply,ctx)));
});
router.post("/groups/:id/posts/:postId/replies",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.active){res.status(403).json({error:"Join this group to reply"});return;}
  if(!ctx.group.allowReplies){res.status(403).json({error:"Replies disabled"});return;}
  if(!ctx.admin&&!ctx.group.membersCanReply){res.status(403).json({error:"Member replies disabled"});return;}
  const post=await postInGroup(gid,pid);
  if(!post||!allowedPost(post,ctx)||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  if(post.isLocked&&!ctx.admin){res.status(403).json({error:"Replies are locked for this post"});return;}
  const content=req.body?.content;
  if(typeof content!=="string"||!content.trim()||content.length>3000){res.status(400).json({error:"Reply must be 1–3000 characters"});return;}
  const authorName=await resolvePublicPostingName(ctx.userId!,req.body?.authorName);
  const [reply]=await db.insert(groupPostRepliesTable).values({
    postId:pid,content:content.trim(),authorId:ctx.userId!,authorName,
    moderationStatus:!ctx.admin&&ctx.group.replyApproval?"pending":"approved",
  }).returning();
  res.status(201).json(publicPostForViewer(reply,ctx.userId,getSessionUserRole(req)));
});
router.patch("/groups/:id/posts/:postId/replies/:replyId/review",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId),rid=id(req.params.replyId);
  if(!gid||!pid||!rid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin){res.status(403).json({error:"Group admin required"});return;}
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
  await db.delete(groupPostRepliesTable).where(eq(groupPostRepliesTable.id,rid));
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
  res.json({ok:true,viewRecorded:true,views:ctx.admin||ctx.group.showViewCounts?views:undefined});
});

// Public downvote totals are NEVER returned; only management sees totals.
router.post("/groups/:id/posts/:postId/downvote",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),pid=id(req.params.postId);if(!gid||!pid)return;
  const ctx=await groupAccess(gid,req);
  const post=ctx?await postInGroup(gid,pid):null;
  if(!ctx?.active||!post||post.moderationStatus!=="approved"){sendNotFound(res);return;}
  if(!ctx.group.allowDownvotes){res.status(403).json({error:"Downvotes disabled"});return;}
  const result=await db.transaction(async tx=>{
    const [existing]=await tx.select().from(groupPostDownvotesTable).where(and(eq(groupPostDownvotesTable.postId,pid),eq(groupPostDownvotesTable.userId,ctx.userId!))).limit(1);
    const downvoted=!existing;
    if(existing) await tx.delete(groupPostDownvotesTable).where(eq(groupPostDownvotesTable.id,existing.id));
    else await tx.insert(groupPostDownvotesTable).values({postId:pid,userId:ctx.userId!});
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
  const destination=String(req.body?.destination||"");
  const reason=String(req.body?.reason||"").trim();
  if(!["group","staff","both"].includes(destination)||!reason||reason.length>2000){
    res.status(400).json({error:"Choose recipient and give a reason (max 2000 characters)"});return;
  }
  await db.insert(groupReportsTable).values({
    groupId:gid,postId:pid,reporterId:ctx.userId!,reason,
    toGroup:destination!=="staff",toStaff:destination!=="group",
  });
  // Recipient choice is not echoed back: group team has no side-channel.
  res.status(201).json({ok:true});
});
router.get("/groups/:id/reports",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res);if(!gid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin){res.status(403).json({error:"Group admin required"});return;}
  const rows=await db.select().from(groupReportsTable).where(and(eq(groupReportsTable.groupId,gid),eq(groupReportsTable.toGroup,true)))
    .orderBy(desc(groupReportsTable.createdAt));
  res.setHeader("Cache-Control","private, no-store");
  // Explicit allowlist, never serialize toStaff or staffStatus, even in nested object.
  res.json(rows.map(r=>({id:r.id,postId:r.postId,reason:r.reason,status:r.groupStatus,createdAt:r.createdAt.toISOString()})));
});
router.patch("/groups/:id/reports/:reportId",requireAuth,async(req,res):Promise<void>=>{
  const gid=getGroup(req,res),rid=id(req.params.reportId);if(!gid||!rid)return;
  const ctx=await groupAccess(gid,req);
  if(!ctx?.admin){res.status(403).json({error:"Group admin required"});return;}
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
    status:r.staffStatus,createdAt:r.createdAt.toISOString()})));
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
