import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, volunteerProfilesTable, communityProjectsTable, askanuscases,
  featuredCausesTable, discussionsTable, reportsTable, newsTable, groupsTable,
  followsTable, savedItemsTable, supportMessagesTable, helpRequestsTable,
  groupMembersTable, causeSubmissionsTable, minyansTable, reservationsTable,
} from "@workspace/db/schema";
import { count, eq, desc } from "drizzle-orm";
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


router.get("/admin/operations-inbox", requireAdmin, async (_req, res) => {
  const [
    reports,
    helpRequests,
    groupMembers,
    groups,
    causeSubmissions,
    minyans,
    supportMessages,
    reservations,
  ] = await Promise.all([
    db.select().from(reportsTable).where(eq(reportsTable.status, "pending")).orderBy(desc(reportsTable.createdAt)),
    db.select().from(helpRequestsTable).where(eq(helpRequestsTable.status, "pending")).orderBy(desc(helpRequestsTable.createdAt)),
    db.select().from(groupMembersTable).where(eq(groupMembersTable.status, "pending")).orderBy(desc(groupMembersTable.joinedAt)),
    db.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable),
    db.select().from(causeSubmissionsTable).where(eq(causeSubmissionsTable.status, "pending")).orderBy(desc(causeSubmissionsTable.createdAt)),
    db.select().from(minyansTable).where(eq(minyansTable.status, "pending")).orderBy(desc(minyansTable.createdAt)),
    db.select().from(supportMessagesTable).where(eq(supportMessagesTable.status, "open")).orderBy(desc(supportMessagesTable.createdAt)),
    db.select().from(reservationsTable).where(eq(reservationsTable.status, "confirmed")).orderBy(desc(reservationsTable.createdAt)),
  ]);

  const groupNames = new Map(groups.map(g => [g.id, g.name]));
  const items = [
    ...reports.map(r => ({
      key: `report:${r.id}`,
      kind: "report",
      id: r.id,
      priority: "high",
      title: `Reported ${r.contentType}`,
      summary: r.reason + (r.description ? ` — ${r.description}` : ""),
      createdAt: r.createdAt,
      meta: { contentType: r.contentType, contentId: r.contentId, reporterId: r.reporterId },
    })),
    ...helpRequests.map(r => ({
      key: `help:${r.id}`,
      kind: "help_request",
      id: r.id,
      priority: r.urgency === "critical" ? "critical" : r.urgency === "high" ? "high" : "normal",
      title: `Help request: ${r.name}`,
      summary: r.description,
      createdAt: r.createdAt,
      meta: { needType: r.needType, urgency: r.urgency, location: r.location, userId: r.userId },
    })),
    ...groupMembers.map(m => ({
      key: `group:${m.id}`,
      kind: "group_join",
      id: m.id,
      priority: "normal",
      title: `Group join request: ${m.userName}`,
      summary: `Wants to join ${groupNames.get(m.groupId) || "a private group"}`,
      createdAt: m.joinedAt,
      meta: { groupId: m.groupId, groupName: groupNames.get(m.groupId) || "", userId: m.userId },
    })),
    ...causeSubmissions.map(s => ({
      key: `cause:${s.id}`,
      kind: "cause_submission",
      id: s.id,
      priority: s.urgency === "urgent" ? "high" : "normal",
      title: `Cause submission: ${s.title}`,
      summary: s.description,
      createdAt: s.createdAt,
      meta: { urgency: s.urgency, location: s.location, userId: s.userId, submittedBy: s.submittedBy },
    })),
    ...minyans.map(m => ({
      key: `minyan:${m.id}`,
      kind: "minyan_submission",
      id: m.id,
      priority: "normal",
      title: `Minyan submission: ${m.synagogueName}`,
      summary: [m.community, m.city, m.country].filter(Boolean).join(", "),
      createdAt: m.createdAt,
      meta: { userId: m.submittedByUserId },
    })),
    ...supportMessages.map(m => ({
      key: `support:${m.id}`,
      kind: m.type === "volunteer_contact" || m.type === "help_offer" ? "member_connection" : m.type,
      id: m.id,
      priority: m.type === "report" ? "high" : "normal",
      title: m.subject,
      summary: m.message,
      createdAt: m.createdAt,
      meta: { type: m.type, userId: m.userId, name: m.name, contact: m.email },
    })),
    ...reservations.map(r => ({
      key: `reservation:${r.id}`,
      kind: "reservation",
      id: r.id,
      priority: "normal",
      title: `Office reservation: ${r.name}`,
      summary: `${r.reservationDate} at ${r.reservationTime} — ${r.purpose}`,
      createdAt: r.createdAt,
      meta: { userId: r.userId, reservationDate: r.reservationDate, reservationTime: r.reservationTime },
    })),
  ].sort((a, b) => {
    const rank = (p: string) => p === "critical" ? 3 : p === "high" ? 2 : 1;
    const diff = rank(b.priority) - rank(a.priority);
    if (diff) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  res.json({
    counts: {
      total: items.length,
      reports: reports.length,
      helpRequests: helpRequests.length,
      groupJoins: groupMembers.length,
      causeSubmissions: causeSubmissions.length,
      minyans: minyans.length,
      support: supportMessages.length,
      reservations: reservations.length,
    },
    items,
  });
});

export default router;
