import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, volunteerProfilesTable, communityProjectsTable, askanuscases,
  featuredCausesTable, discussionsTable, reportsTable, newsTable, groupsTable,
  followsTable, savedItemsTable,
} from "@workspace/db/schema";
import { count, eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const [[members], [active], [volunteers], [projects], [causes], [discussions], [reports], [pending], [news], [groups], [follows], [saved]] =
    await Promise.all([
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "active")),
      db.select({ count: count() }).from(volunteerProfilesTable),
      db.select({ count: count() }).from(communityProjectsTable),
      db.select({ count: count() }).from(featuredCausesTable),
      db.select({ count: count() }).from(discussionsTable),
      db.select({ count: count() }).from(reportsTable),
      db.select({ count: count() }).from(reportsTable).where(eq(reportsTable.status, "pending")),
      db.select({ count: count() }).from(newsTable),
      db.select({ count: count() }).from(groupsTable),
      db.select({ count: count() }).from(followsTable),
      db.select({ count: count() }).from(savedItemsTable),
    ]);

  res.json({
    totalMembers: members.count,
    activeMembers: active.count,
    totalVolunteers: volunteers.count,
    totalProjects: projects.count,
    totalCauses: causes.count,
    totalDiscussions: discussions.count,
    totalReports: reports.count,
    pendingReports: pending.count,
    totalNews: news.count,
    totalGroups: groups.count,
    totalFollows: follows.count,
    totalSaved: saved.count,
  });
});

export default router;
