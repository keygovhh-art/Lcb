import { Router, type IRouter } from "express";
import { db, usersTable, discussionsTable, volunteerProfilesTable, helpRequestsTable, groupsTable, donationsTable, activityLogTable } from "@workspace/db";
import { desc, count, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats/community", async (_req, res): Promise<void> => {
  const [userCount] = await db.select({ count: count() }).from(usersTable);
  const [discCount] = await db.select({ count: count() }).from(discussionsTable);
  const [volCount] = await db.select({ count: count() }).from(volunteerProfilesTable);
  const [reqCount] = await db.select({ count: count() }).from(helpRequestsTable);
  const [groupCount] = await db.select({ count: count() }).from(groupsTable);
  const [donationSum] = await db.select({ total: sum(donationsTable.amount) }).from(donationsTable);

  res.json({
    totalPeopleHelped: reqCount?.count ?? 0,
    volunteerRequests: reqCount?.count ?? 0,
    donationsRaised: Number(donationSum?.total ?? 0),
    callsHandled: 0,
    activeVolunteers: volCount?.count ?? 0,
    activeGroups: groupCount?.count ?? 0,
    totalDiscussions: discCount?.count ?? 0,
    totalMembers: userCount?.count ?? 0,
  });
});

router.get("/stats/activity", async (req, res): Promise<void> => {
  const { period } = req.query as { period?: string };
  const isMonthly = period === "monthly";
  const labels = isMonthly
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Shabbos", "Sun"];
  const data = labels.map(label => ({
    label,
    discussions: Math.floor(Math.random() * 20) + 2,
    helpRequests: Math.floor(Math.random() * 15) + 1,
    donations: Math.floor(Math.random() * 10) + 1,
    volunteers: Math.floor(Math.random() * 8) + 1,
  }));
  res.json(data);
});

router.get("/stats/recent-activity", async (_req, res): Promise<void> => {
  const activities = await db.select().from(activityLogTable).orderBy(desc(activityLogTable.createdAt)).limit(20);
  res.json(activities);
});

export default router;
