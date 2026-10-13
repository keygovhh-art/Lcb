import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db, groupsTable, communityProjectsTable, causeSubmissionsTable,
  charitiesTable, minyansTable, discussionsTable, groupPostsTable,
  askanuscases, volunteerProfilesTable, helpRequestsTable,
} from "@workspace/db";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

const router: IRouter = Router();

export type OwnedItemType =
  | "campaign" | "community_project" | "cause_submission" | "charity_campaign"
  | "group" | "case" | "minyan" | "forum_post" | "group_post"
  | "volunteer_registration" | "help_request";
export type OwnedItem = {
  type: OwnedItemType;
  id: number;
  title: string;
  status: string;
  url: string;
  private: boolean;
  createdAt: string;
};

router.get("/me/created-content", requireAuth, async (req, res): Promise<void> => {
  // Never trust a caller-supplied user ID. This is a private, per-session view.
  const userId = getSessionUserId(req)!;
  const [
    groups, projects, submittedCauses, charities, minyanim,
    discussions, posts, cases, volunteerProfiles, helpRequests,
  ] = await Promise.all([
    db.select({ id:groupsTable.id, name:groupsTable.name, privacy:groupsTable.privacy,
      createdAt:groupsTable.createdAt })
      .from(groupsTable).where(eq(groupsTable.ownerId,userId)).orderBy(desc(groupsTable.createdAt)),
    db.select({ id:communityProjectsTable.id, title:communityProjectsTable.title,
      type:communityProjectsTable.type, status:communityProjectsTable.status,
      createdAt:communityProjectsTable.createdAt })
      .from(communityProjectsTable).where(eq(communityProjectsTable.ownerId,userId))
      .orderBy(desc(communityProjectsTable.createdAt)),
    db.select({ id:causeSubmissionsTable.id, title:causeSubmissionsTable.title,
      status:causeSubmissionsTable.status, createdAt:causeSubmissionsTable.createdAt })
      .from(causeSubmissionsTable).where(eq(causeSubmissionsTable.userId,userId))
      .orderBy(desc(causeSubmissionsTable.createdAt)),
    db.select({ id:charitiesTable.id, name:charitiesTable.name,
      publicationState:charitiesTable.publicationState, createdAt:charitiesTable.createdAt })
      .from(charitiesTable).where(eq(charitiesTable.createdByUserId,userId))
      .orderBy(desc(charitiesTable.createdAt)),
    db.select({ id:minyansTable.id, synagogueName:minyansTable.synagogueName,
      status:minyansTable.status, createdAt:minyansTable.createdAt })
      .from(minyansTable).where(eq(minyansTable.submittedByUserId,userId))
      .orderBy(desc(minyansTable.createdAt)),
    db.select({ id:discussionsTable.id,title:discussionsTable.title,
      createdAt:discussionsTable.createdAt })
      .from(discussionsTable).where(eq(discussionsTable.authorId,userId))
      .orderBy(desc(discussionsTable.createdAt)),
    db.select({ id:groupPostsTable.id, groupId:groupPostsTable.groupId,
      content:groupPostsTable.content, moderationStatus:groupPostsTable.moderationStatus,
      createdAt:groupPostsTable.createdAt })
      .from(groupPostsTable).where(eq(groupPostsTable.authorId,userId))
      .orderBy(desc(groupPostsTable.createdAt)),
    db.select({ id:askanuscases.id,title:askanuscases.title,
      status:askanuscases.status, createdAt:askanuscases.createdAt })
      .from(askanuscases).where(eq(askanuscases.userId,userId))
      .orderBy(desc(askanuscases.createdAt)),
    db.select({ id:volunteerProfilesTable.id, createdAt:volunteerProfilesTable.createdAt })
      .from(volunteerProfilesTable).where(eq(volunteerProfilesTable.userId,userId))
      .orderBy(desc(volunteerProfilesTable.createdAt)),
    db.select({ id:helpRequestsTable.id, needType:helpRequestsTable.needType,
      status:helpRequestsTable.status, createdAt:helpRequestsTable.createdAt })
      .from(helpRequestsTable).where(eq(helpRequestsTable.userId,userId))
      .orderBy(desc(helpRequestsTable.createdAt)),
  ]);

  const items: OwnedItem[] = [];
  const add = (type: OwnedItemType,id:number,title:string,status:string,url:string,
    createdAt:Date,privateItem=false) =>
    items.push({type,id,title,status,url,private:privateItem,createdAt:createdAt.toISOString()});

  groups.forEach(g=>add("group",g.id,g.name,g.privacy,`/groups/${g.id}`,g.createdAt));
  projects.forEach(p=>add(
    p.type==="campaign"?"campaign":"community_project",p.id,p.title,p.status,
    "/community-projects",p.createdAt,
  ));
  submittedCauses.forEach(c=>add("cause_submission",c.id,c.title,c.status,
    "/united",c.createdAt,true));
  charities.forEach(c=>add("charity_campaign",c.id,c.name,c.publicationState,
    "/charity",c.createdAt,true));
  minyanim.forEach(m=>add("minyan",m.id,m.synagogueName,m.status,
    "/minyans",m.createdAt));
  discussions.forEach(d=>add("forum_post",d.id,d.title,"created",
    `/forum/${d.id}`,d.createdAt));
  posts.forEach(p=>add("group_post",p.id,p.content.slice(0,90),p.moderationStatus,
    `/groups/${p.groupId}`,p.createdAt));
  cases.forEach(c=>add("case",c.id,c.title,c.status,
    "/my",c.createdAt,true));
  volunteerProfiles.forEach(v=>add("volunteer_registration",v.id,
    "איך וויל העלפן — מיין אנמעלדונג","registered","/directory#help-center",v.createdAt,true));
  helpRequests.forEach(r=>add("help_request",r.id,
    `פריוואטע בקשה: ${r.needType}`,r.status,"/directory#help-center",r.createdAt,true));

  items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id);
  res.setHeader("Cache-Control","private, no-store");
  res.json({
    items,
    roles: {
      offersHelp: volunteerProfiles.length>0,
      needsHelp: helpRequests.length>0,
      helpRequestCount: helpRequests.length,
      // Both statuses are independent; registering for one never disables the other.
    },
    total:items.length,
  });
});
export default router;
