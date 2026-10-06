import { Router, type IRouter } from "express";
import { db, usersTable, discussionsTable, volunteerProfilesTable, helpRequestsTable, groupsTable, donationsTable, activityLogTable, newsTable } from "@workspace/db";
import { desc, count, sum, sql, ne } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats/community", async (_req, res): Promise<void> => {
  const [userCount] = await db.select({ count: count() }).from(usersTable);
  const [discCount] = await db.select({ count: count() }).from(discussionsTable);
  const [volCount] = await db.select({ count: count() }).from(volunteerProfilesTable);
  const [reqCount] = await db.select({ count: count() }).from(helpRequestsTable);
  const [helpedCount] = await db.select({ count: count() }).from(helpRequestsTable).where(ne(helpRequestsTable.status, "open"));
  const [groupCount] = await db.select({ count: count() }).from(groupsTable);
  const [donationSum] = await db.select({ total: sum(donationsTable.amount) }).from(donationsTable);
  const [newsCount] = await db.select({ count: count() }).from(newsTable);

  res.json({
    totalPeopleHelped: helpedCount?.count ?? 0,
    volunteerRequests: reqCount?.count ?? 0,
    donationsRaised: Number(donationSum?.total ?? 0),
    callsHandled: 0,
    activeVolunteers: volCount?.count ?? 0,
    activeGroups: groupCount?.count ?? 0,
    totalDiscussions: discCount?.count ?? 0,
    totalMembers: userCount?.count ?? 0,
    totalNewsArticles: newsCount?.count ?? 0,
  });
});

router.get("/stats/activity", async (req, res): Promise<void> => {
  const { period } = req.query as { period?: string };
  const isMonthly = period === "monthly";

  if (isMonthly) {
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // Count records created per month this year
    const discByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM created_at)::int`,
      count: count(),
    }).from(discussionsTable)
      .where(sql`created_at > NOW() - INTERVAL '12 months'`)
      .groupBy(sql`EXTRACT(MONTH FROM created_at)`);

    const reqByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM created_at)::int`,
      count: count(),
    }).from(helpRequestsTable)
      .where(sql`created_at > NOW() - INTERVAL '12 months'`)
      .groupBy(sql`EXTRACT(MONTH FROM created_at)`);

    const donationsByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM created_at)::int`,
      count: count(),
    }).from(donationsTable)
      .where(sql`created_at > NOW() - INTERVAL '12 months'`)
      .groupBy(sql`EXTRACT(MONTH FROM created_at)`);

    const volunteersByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM created_at)::int`,
      count: count(),
    }).from(volunteerProfilesTable)
      .where(sql`created_at > NOW() - INTERVAL '12 months'`)
      .groupBy(sql`EXTRACT(MONTH FROM created_at)`);

    const data = labels.map((label, idx) => {
      const m = idx + 1;
      return {
        label,
        discussions: discByMonth.find(r => r.month === m)?.count ?? 0,
        helpRequests: reqByMonth.find(r => r.month === m)?.count ?? 0,
        donations: donationsByMonth.find(r => r.month === m)?.count ?? 0,
        volunteers: volunteersByMonth.find(r => r.month === m)?.count ?? 0,
      };
    });
    res.json(data);
    return;
  }

  // Weekly: Sun=0 … Sat=6, but we label Mon–Sun
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Shabbos"];

  const discByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(discussionsTable)
    .where(sql`created_at > NOW() - INTERVAL '28 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const reqByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(helpRequestsTable)
    .where(sql`created_at > NOW() - INTERVAL '28 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const donationsByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(donationsTable)
    .where(sql`created_at > NOW() - INTERVAL '28 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const volunteersByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(volunteerProfilesTable)
    .where(sql`created_at > NOW() - INTERVAL '28 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const data = DAYS.map((label, idx) => ({
    label,
    discussions: discByDay.find(r => r.dow === idx)?.count ?? 0,
    helpRequests: reqByDay.find(r => r.dow === idx)?.count ?? 0,
    donations: donationsByDay.find(r => r.dow === idx)?.count ?? 0,
    volunteers: volunteersByDay.find(r => r.dow === idx)?.count ?? 0,
  }));

  res.json(data);
});

router.get("/stats/recent-activity", async (_req, res): Promise<void> => {
  const activities = await db.select().from(activityLogTable).orderBy(desc(activityLogTable.createdAt)).limit(20);
  res.json(activities);
});

export default router;
