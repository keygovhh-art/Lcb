import {Router,type Request,type Response} from "express";
import {and,eq,desc,sql,inArray} from "drizzle-orm";
import {db,usersTable,groupsTable,groupMembersTable,groupPostsTable,
  groupStaffAccessTable,groupAccessAuditTable,groupPostRepliesTable} from "@workspace/db";
import {requireAuth,getCurrentSessionUser} from "../middlewares/auth";
import {groupFeatureKeys,validatedGroupOverrides} from "../lib/group-feature-controls";
import {auditGroupAction,isPlatformSuperAdmin,platformGroupGrant,isPlatformStaffRole} from "../lib/group-staff-access";
import {RESERVED_SUPER_ADMIN_ID} from "../lib/super-admin";

const router=Router();
const asId=(value:unknown)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;};
const current=async(req:Request)=>getCurrentSessionUser(req);
const err=(res:Response,code:number,message:string)=>{res.status(code).json({error:message});};

function sameOrigin(req:Request,res:Response):boolean {
  const origin=req.get("origin");
  if(!origin)return true;
  try{
    if(new URL(origin).host===req.get("host"))return true;
  }catch{}
  err(res,403,"Same-origin request required");
  return false;
}
async function staffCheck(req:Request,res:Response){
  const u=await current(req);
  if(!u||!isPlatformStaffRole(u.role)){err(res,403,"Platform group staff required");return null;}
  return u;
}
async function superCheck(req:Request,res:Response){
  const u=await staffCheck(req,res);
  if(!u)return null;
  if(!isPlatformSuperAdmin(u.role)){err(res,403,"Super administrator only");return null;}
  return u;
}
async function allowedGroup(req:Request,res:Response,mod:boolean) {
  const u=await staffCheck(req,res);if(!u)return null;
  const gid=asId(req.params.id);
  if(!gid){err(res,400,"Invalid group");return null;}
  const [group]=await db.select().from(groupsTable).where(eq(groupsTable.id,gid)).limit(1);
  if(!group){err(res,404,"Group not found");return null;}
  const grant=await platformGroupGrant(u.id,gid,u.role);
  if(mod?!grant.canModerate:!grant.canViewPrivate){
    err(res,403,"Explicit super-admin group permission required");return null;
  }
  return {user:u,group,grant};
}

// The super-admin sees all groups; other platform staff see only explicitly
// assigned groups. A normal group founder does not automatically get platform privileges.
router.get("/admin/group-control/groups",requireAuth,async(req,res):Promise<void>=>{
  const user=await staffCheck(req,res);if(!user)return;
  const all=await db.select({
    id:groupsTable.id,name:groupsTable.name,description:groupsTable.description,
    ownerId:groupsTable.ownerId,privacy:groupsTable.privacy,
    memberCount:groupsTable.memberCount,postCount:groupsTable.postCount,
    platformFeatureOverrides:groupsTable.platformFeatureOverrides,
  }).from(groupsTable).orderBy(desc(groupsTable.createdAt)).limit(300);
  let grants=new Map<number,{canViewPrivate:boolean;canModerate:boolean}>();
  if(!isPlatformSuperAdmin(user.role)){
    const rows=await db.select().from(groupStaffAccessTable)
      .where(eq(groupStaffAccessTable.userId,user.id));
    grants=new Map(rows.map(r=>[r.groupId,{canViewPrivate:r.canViewPrivate,canModerate:r.canModerate}]));
  }
  res.setHeader("Cache-Control","private, no-store");
  res.json(all.filter(g=>isPlatformSuperAdmin(user.role)||grants.get(g.id)?.canViewPrivate)
    .map(g=>({...g,access:isPlatformSuperAdmin(user.role)?
      {canViewPrivate:true,canModerate:true}:grants.get(g.id)})));
});

router.get("/admin/group-control/groups/:id/posts",requireAuth,async(req,res):Promise<void>=>{
  const access=await allowedGroup(req,res,false);if(!access)return;
  const page=Math.max(0,Math.min(10000,Number(req.query.page)||0));
  if(!Number.isSafeInteger(page)){err(res,400,"Invalid page");return;}
  const posts=await db.select({
    id:groupPostsTable.id,authorName:groupPostsTable.authorName,content:groupPostsTable.content,
    moderationStatus:groupPostsTable.moderationStatus,createdAt:groupPostsTable.createdAt,
    isPinned:groupPostsTable.isPinned,isLocked:groupPostsTable.isLocked,
    views:groupPostsTable.views,
  }).from(groupPostsTable).where(eq(groupPostsTable.groupId,access.group.id))
    .orderBy(desc(groupPostsTable.createdAt)).limit(101).offset(page*100);
  const records=posts.slice(0,100).filter(p=>p.moderationStatus==="approved"||access.grant.canModerate);
  if(access.group.privacy!=="public")
    await auditGroupAction(access.user.id,"private_group_posts_viewed",access.group.id,undefined,{count:records.length});
  res.setHeader("Cache-Control","private, no-store");
  res.json({groupId:access.group.id,posts:records,hasMore:posts.length>100,nextPage:page+1});
});
router.get("/admin/group-control/groups/:id/members",requireAuth,async(req,res):Promise<void>=>{
  const a=await allowedGroup(req,res,false);if(!a)return;
  const members=await db.select({
    id:groupMembersTable.id,userId:groupMembersTable.userId,
    userName:groupMembersTable.userName,
    role:groupMembersTable.role,status:groupMembersTable.status,
    protectedByPlatform:groupMembersTable.protectedByPlatform,
  }).from(groupMembersTable).where(eq(groupMembersTable.groupId,a.group.id));
  res.setHeader("Cache-Control","private, no-store");
  res.json(members);
});
// Review of individual independent platform controls; null clears a forced override.
router.patch("/admin/group-control/groups/:id/overrides",requireAuth,async(req,res):Promise<void>=>{
  if(!sameOrigin(req,res))return;
  const u=await superCheck(req,res);if(!u)return;
  const gid=asId(req.params.id);if(!gid){err(res,400,"Invalid group");return;}
  const [g]=await db.select().from(groupsTable).where(eq(groupsTable.id,gid));
  if(!g){err(res,404,"Group not found");return;}
  const input=req.body?.overrides;
  if(!input||typeof input!=="object"||Array.isArray(input)){err(res,400,"Invalid overrides");return;}
  const changes=input as Record<string,unknown>;
  if(Object.keys(changes).some(k=>!groupFeatureKeys.includes(k as typeof groupFeatureKeys[number])) ||
     Object.values(changes).some(v=>v!==null&&typeof v!=="boolean")){
    err(res,400,"Only recognized individual feature keys and boolean/null values accepted");return;
  }
  const overrides={...g.platformFeatureOverrides};
  for(const [key,value] of Object.entries(changes)){
    if(value===null)delete overrides[key];
    else overrides[key]=value as boolean;
  }
  if(!validatedGroupOverrides(overrides)){err(res,400,"Invalid feature controls");return;}
  await db.transaction(async tx=>{
    await tx.update(groupsTable).set({platformFeatureOverrides:overrides}).where(eq(groupsTable.id,gid));
    await tx.insert(groupAccessAuditTable).values({
      actorId:u.id,groupId:gid,action:"platform_group_feature_override",
      details:{changes:changes,previousKeys:Object.keys(g.platformFeatureOverrides??{})},
    });
  });
  res.setHeader("Cache-Control","private, no-store");
  res.json({ok:true,overrides});
});

// Protected membership: only platform super admin may pin/unpin.
// Group owners and delegated group admins may never remove protected members.
router.patch("/admin/group-control/groups/:id/members/:memberId/protection",requireAuth,async(req,res):Promise<void>=>{
  if(!sameOrigin(req,res))return;
  const u=await superCheck(req,res);if(!u)return;
  const gid=asId(req.params.id),mid=asId(req.params.memberId);
  if(!gid||!mid||typeof req.body?.protected!=="boolean"){err(res,400,"Invalid protection update");return;}
  const [m]=await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.id,mid),eq(groupMembersTable.groupId,gid)));
  if(!m){err(res,404,"Member not found");return;}
  await db.transaction(async tx=>{
    await tx.update(groupMembersTable).set({protectedByPlatform:req.body.protected})
      .where(eq(groupMembersTable.id,mid));
    await tx.insert(groupAccessAuditTable).values({
      actorId:u.id,targetUserId:m.userId,groupId:gid,
      action:req.body.protected?"platform_member_protected":"platform_member_unprotected",
    });
  });
  res.json({ok:true,protected:req.body.protected});
});

// Super-admin only staff directory: name/role, never contact information.
router.get("/admin/group-control/users",requireAuth,async(req,res):Promise<void>=>{
  const u=await superCheck(req,res);if(!u)return;
  const term=String(req.query.search||"").trim().toLowerCase().slice(0,70);
  if(term.length<2){res.json([]);return;}
  const rows=await db.select({
    id:usersTable.id,name:usersTable.name,nickname:usersTable.nickname,
    role:usersTable.role,status:usersTable.status,
  }).from(usersTable).orderBy(desc(usersTable.id)).limit(1500);
  res.setHeader("Cache-Control","private, no-store");
  res.json(rows.filter(v=>String(v.id)===term||v.name.toLowerCase().includes(term)||
    (v.nickname||"").toLowerCase().includes(term)).slice(0,40));
});
router.patch("/admin/group-control/users/:userId/role",requireAuth,async(req,res):Promise<void>=>{
  if(!sameOrigin(req,res))return;
  const u=await superCheck(req,res);if(!u)return;
  const uid=asId(req.params.userId),role=req.body?.role;
  if(!uid||!["member","group_staff","moderator","admin"].includes(role)){
    err(res,400,"Choose a supported non-super-admin role");return;
  }
  if(uid===u.id||uid===RESERVED_SUPER_ADMIN_ID){err(res,403,"Super-admin account may not be reassigned");return;}
  const [target]=await db.select().from(usersTable).where(eq(usersTable.id,uid));
  if(!target||target.status!=="active"){err(res,404,"Active user not found");return;}
  if(target.role==="super_admin"){err(res,403,"Cannot change another super-admin");return;}
  await db.transaction(async tx=>{
    await tx.update(usersTable).set({role}).where(eq(usersTable.id,uid));
    if(role==="member")await tx.delete(groupStaffAccessTable)
      .where(eq(groupStaffAccessTable.userId,uid));
    await tx.insert(groupAccessAuditTable).values({
      actorId:u.id,targetUserId:uid,action:"platform_staff_role_changed",
      details:{previous:target.role,next:role},
    });
  });
  res.json({ok:true,userId:uid,role});
});

// Grant specific group viewing/moderation to a named platform staff member.
// No implicit private access is awarded to broad old admin/moderator roles.
router.patch("/admin/group-control/groups/:id/staff/:userId",requireAuth,async(req,res):Promise<void>=>{
  if(!sameOrigin(req,res))return;
  const u=await superCheck(req,res);if(!u)return;
  const gid=asId(req.params.id),uid=asId(req.params.userId);
  const view=req.body?.canViewPrivate,mod=req.body?.canModerate;
  if(!gid||!uid||typeof view!=="boolean"||typeof mod!=="boolean"||(mod&&!view)){
    err(res,400,"Valid view/moderation permissions required");return;
  }
  const [[group],[target]]=await Promise.all([
    db.select().from(groupsTable).where(eq(groupsTable.id,gid)).limit(1),
    db.select().from(usersTable).where(eq(usersTable.id,uid)).limit(1),
  ]);
  if(!group||!target){err(res,404,"User or group not found");return;}
  if(target.status!=="active"||!["admin","moderator","group_staff"].includes(target.role)){
    err(res,403,"Assign group_staff/moderator/admin role before granting access");return;
  }
  if(view){
    await db.transaction(async tx=>{
      await tx.insert(groupStaffAccessTable).values({
        userId:uid,groupId:gid,canViewPrivate:view,canModerate:mod,grantedBy:u.id,
      }).onConflictDoUpdate({
        target:[groupStaffAccessTable.userId,groupStaffAccessTable.groupId],
        set:{canViewPrivate:view,canModerate:mod,grantedBy:u.id,updatedAt:new Date()},
      });
      await tx.insert(groupAccessAuditTable).values({
        actorId:u.id,targetUserId:uid,groupId:gid,action:"private_group_staff_permission_changed",
        details:{canViewPrivate:view,canModerate:mod},
      });
    });
  }else{
    await db.transaction(async tx=>{
      await tx.delete(groupStaffAccessTable).where(and(
        eq(groupStaffAccessTable.groupId,gid),eq(groupStaffAccessTable.userId,uid)));
      await tx.insert(groupAccessAuditTable).values({
        actorId:u.id,targetUserId:uid,groupId:gid,action:"private_group_staff_permission_revoked",
      });
    });
  }
  res.json({ok:true,userId:uid,groupId:gid,canViewPrivate:view,canModerate:mod});
});
router.get("/admin/group-control/groups/:id/staff",requireAuth,async(req,res):Promise<void>=>{
  const u=await superCheck(req,res);if(!u)return;
  const gid=asId(req.params.id);if(!gid){err(res,400,"Invalid group");return;}
  const grants=await db.select().from(groupStaffAccessTable)
    .where(eq(groupStaffAccessTable.groupId,gid));
  res.setHeader("Cache-Control","private, no-store");
  res.json(grants.map(g=>({userId:g.userId,canViewPrivate:g.canViewPrivate,
    canModerate:g.canModerate,grantedBy:g.grantedBy,updatedAt:g.updatedAt})));
});
router.get("/admin/group-control/audit",requireAuth,async(req,res):Promise<void>=>{
  const u=await superCheck(req,res);if(!u)return;
  const rows=await db.select().from(groupAccessAuditTable)
    .orderBy(desc(groupAccessAuditTable.createdAt)).limit(100);
  res.setHeader("Cache-Control","private, no-store");
  res.json(rows);
});
export default router;
