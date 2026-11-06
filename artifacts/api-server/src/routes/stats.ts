import { Router, type IRouter } from "express";
import { db, usersTable, discussionsTable, volunteerProfilesTable, helpRequestsTable, groupsTable, donationsTable, activityLogTable, newsTable, pool } from "@workspace/db";
import { desc, count, sum, sql, eq, notInArray } from "drizzle-orm";

const router: IRouter = Router();
import {requireAuth,getSessionUserId} from "../middlewares/auth";

router.get("/stats/community", async (_req, res): Promise<void> => {
  const [userCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "active"));
  const [discCount] = await db.select({ count: count() }).from(discussionsTable);
  const [groupCount] = await db.select({ count: count() }).from(groupsTable);
  const [donationSum] = await db.select({ total: sum(donationsTable.amount) }).from(donationsTable);
  const [newsCount] = await db.select({ count: count() }).from(newsTable);
  // Exact cash recorded by signed-in Gavhah members, not pledges or payment
  // intents. Refunds are subtracted to avoid inflating totals. Publish only
  // this one number: no receipt IDs, staff/member identity or donor details.
  const recorded = await pool.query<{total:string}>(
    "SELECT COALESCE(SUM(GREATEST(amount-COALESCE(refunded_amount,0),0)),0)::text AS total "+
    "FROM public.max_receipts WHERE user_id IS NOT NULL"
  );

  res.json({
    // Confidential internal figures belong in /admin/stats, never public APIs.
    totalPeopleHelped: 0,
    volunteerRequests: 0,
    donationsRaised: Number(donationSum?.total ?? 0),
    memberRecordedDonations: Number(recorded.rows[0]?.total || 0),
    callsHandled: 0,
    activeVolunteers: 0,
    activeGroups: groupCount?.count ?? 0,
    totalDiscussions: discCount?.count ?? 0,
    totalMembers: userCount?.count ?? 0,
    totalNewsArticles: newsCount?.count ?? 0,
  });
});

router.get("/stats/activity", async (req, res): Promise<void> => {
  // These timelines are public: no private volunteer/help applicant activity may leave staff tools.

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
        helpRequests: 0,
        donations: donationsByMonth.find(r => r.month === m)?.count ?? 0,
        volunteers: 0,
      };
    });
    res.json(data);
    return;
  }

  // Weekly activity over the last 7 days, grouped by weekday (Sun=0 … Sat=6).
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Shabbos"];

  const discByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(discussionsTable)
    .where(sql`created_at > NOW() - INTERVAL '7 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const reqByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(helpRequestsTable)
    .where(sql`created_at > NOW() - INTERVAL '7 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const donationsByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(donationsTable)
    .where(sql`created_at > NOW() - INTERVAL '7 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const volunteersByDay = await db.select({
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    count: count(),
  }).from(volunteerProfilesTable)
    .where(sql`created_at > NOW() - INTERVAL '7 days'`)
    .groupBy(sql`EXTRACT(DOW FROM created_at)`);

  const data = DAYS.map((label, idx) => ({
    label,
    discussions: discByDay.find(r => r.dow === idx)?.count ?? 0,
    helpRequests: 0,
    donations: donationsByDay.find(r => r.dow === idx)?.count ?? 0,
    volunteers: 0,
  }));

  res.json(data);
});

// A member's actual private activity, scoped by authenticated account ID.
// Never expose platform member history in the public platform-wide statistics.
router.get("/stats/my-activity",requireAuth,async(req,res,next):Promise<void>=>{
 try{
  const userId=getSessionUserId(req);
  if(!userId){res.status(401).json({error:"Member account required"});return;}
  const r=await pool.query<{id:number;entity_type:string;action:string;title:string;happened_at:string}>(
   "SELECT id,entity_type,action,title,happened_at FROM public.max_history_events "+
   "WHERE user_id=$1 ORDER BY happened_at DESC,id DESC LIMIT 25",[userId]);
  res.setHeader("Cache-Control","private,no-store").json(r.rows.map(x=>({
   id:x.id,type:x.entity_type,action:x.action,title:x.title,createdAt:x.happened_at
  })));
 }catch(e){next(e);}
});

router.get("/stats/recent-activity", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control","no-store");
  // Filter earlier public activity records created before this privacy change, too.
  const activities = await db.select().from(activityLogTable)
    .where(notInArray(activityLogTable.type, ["volunteer", "help_request"]))
    .orderBy(desc(activityLogTable.createdAt)).limit(20);
  res.json(activities);
});

export default router;
