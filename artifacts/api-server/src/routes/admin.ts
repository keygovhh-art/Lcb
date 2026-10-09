import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, volunteerProfilesTable, communityProjectsTable, askanuscases,
  featuredCausesTable, discussionsTable, reportsTable, newsTable, groupsTable,
  followsTable, savedItemsTable, supportMessagesTable, helpRequestsTable,
  groupMembersTable, causeSubmissionsTable, minyansTable, reservationsTable,
} from "@workspace/db/schema";
import { count, eq, desc, inArray } from "drizzle-orm";
import { CONNECTION_META_TYPE, type ConnectionState } from "../lib/member-connections";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";

const router = Router();

const WORKFLOW_META_TYPE = "__workflow_meta__";

type WorkflowNote = { text: string; authorId: number; createdAt: string };
type WorkflowState = {
  assignedTo: number | null;
  workflowStatus: "new" | "in_review" | "waiting";
  dueAt: string | null;
  notes: WorkflowNote[];
  updatedAt: string | null;
  updatedBy: number | null;
};

function defaultWorkflow(): WorkflowState {
  return { assignedTo: null, workflowStatus: "new", dueAt: null, notes: [], updatedAt: null, updatedBy: null };
}

function parseWorkflow(message: unknown): WorkflowState {
  try {
    const parsed = JSON.parse(String(message));
    return {
      assignedTo: Number.isInteger(parsed.assignedTo) ? Number(parsed.assignedTo) : null,
      workflowStatus: ["new","in_review","waiting"].includes(parsed.workflowStatus) ? parsed.workflowStatus : "new",
      dueAt: typeof parsed.dueAt === "string" && parsed.dueAt ? parsed.dueAt : null,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((n: any) => n && typeof n.text === "string" && Number.isInteger(n.authorId) && typeof n.createdAt === "string").slice(-100)
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: Number.isInteger(parsed.updatedBy) ? Number(parsed.updatedBy) : null,
    };
  } catch {
    return defaultWorkflow();
  }
}

function escalationFor(createdAt: unknown, priority: string, dueAt: string | null) {
  const now = Date.now();
  const created = new Date(String(createdAt)).getTime();
  const ageHours = Number.isFinite(created) ? Math.max(0, (now - created) / 3600000) : 0;
  const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;
  const pastDue = Number.isFinite(dueMs) && dueMs < now;
  const threshold = priority === "critical" ? 2 : priority === "high" ? 8 : 24;
  return { overdue: pastDue, escalated: pastDue || ageHours >= threshold, ageHours: Math.round(ageHours * 10) / 10 };
}

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
    supportRows,
    reservations,
    workflowRows,
    connectionRows,
  ] = await Promise.all([
    db.select().from(reportsTable).where(eq(reportsTable.status, "pending")).orderBy(desc(reportsTable.createdAt)),
    db.select().from(helpRequestsTable).where(eq(helpRequestsTable.status, "pending")).orderBy(desc(helpRequestsTable.createdAt)),
    db.select().from(groupMembersTable).where(eq(groupMembersTable.status, "pending")).orderBy(desc(groupMembersTable.joinedAt)),
    db.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable),
    db.select().from(causeSubmissionsTable).where(eq(causeSubmissionsTable.status, "pending")).orderBy(desc(causeSubmissionsTable.createdAt)),
    db.select().from(minyansTable).where(eq(minyansTable.status, "pending")).orderBy(desc(minyansTable.createdAt)),
    db.select().from(supportMessagesTable).where(eq(supportMessagesTable.status, "open")).orderBy(desc(supportMessagesTable.createdAt)),
    db.select().from(reservationsTable).where(eq(reservationsTable.status, "confirmed")).orderBy(desc(reservationsTable.createdAt)),
    db.select().from(supportMessagesTable).where(eq(supportMessagesTable.type, WORKFLOW_META_TYPE)).orderBy(desc(supportMessagesTable.createdAt)),
    db.select().from(supportMessagesTable).where(eq(supportMessagesTable.type, CONNECTION_META_TYPE)).orderBy(desc(supportMessagesTable.id)),
  ]);

  const connectionsByRequest = new Map<number, ConnectionState>();
  for (const row of connectionRows) {
    const id = Number(row.subject.match(/^support:(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(id) || id <= 0 || connectionsByRequest.has(id)) continue;
    try {
      const state = JSON.parse(row.message) as ConnectionState;
      if (Number.isSafeInteger(state.volunteerId) && Number.isSafeInteger(state.volunteerUserId) &&
          Number.isSafeInteger(state.requesterUserId) && typeof state.stage === "string") {
        connectionsByRequest.set(id, state);
      }
    } catch { /* Malformed metadata stays unavailable; the case remains open. */ }
  }
  const contactIds = [...new Set([...connectionsByRequest.values()].map(s => s.volunteerUserId))];
  const contactUsers = contactIds.length
    ? await db.select({
        id: usersTable.id, name: usersTable.name, nickname: usersTable.nickname,
        email: usersTable.email, phone: usersTable.phone,
      }).from(usersTable).where(inArray(usersTable.id, contactIds))
    : [];
  const volunteersById = new Map(contactUsers.map(u => [u.id, u]));

  const groupNames = new Map(groups.map(g => [g.id, g.name]));
  const pendingComments = supportRows.filter(m => m.type === "__pending_comment__");
  const supportMessages = supportRows.filter(m => !String(m.type).startsWith("__"));

  const rawItems = [
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
    ...pendingComments.map(m => {
      let payload: any = {};
      try { payload = JSON.parse(m.message); } catch {}
      return {
        key: `comment_review:${m.id}`,
        kind: "comment_review",
        id: m.id,
        priority: "normal",
        title: `Reply awaiting review: ${payload.authorName || m.name}`,
        summary: String(payload.content || "Pending forum reply"),
        createdAt: m.createdAt,
        meta: {
          discussionId: Number(payload.discussionId) || null,
          parentId: payload.parentId ?? null,
          authorId: Number(payload.authorId) || m.userId,
          authorName: payload.authorName || m.name,
        },
      };
    }),
    ...supportMessages.map(m => ({
      key: `support:${m.id}`,
      kind: m.type === "volunteer_contact" ? "member_connection" : m.type,
      id: m.id,
      priority: m.type === "report" || m.type === "system_error" ? "high" : "normal",
      title: m.subject,
      summary: m.message,
      createdAt: m.createdAt,
      meta: {
        type: m.type, userId: m.userId, name: m.name, contact: m.email,
        connectionStage: m.type === "volunteer_contact"
          ? (connectionsByRequest.get(m.id)?.stage ?? "legacy")
          : null,
        volunteerId: connectionsByRequest.get(m.id)?.volunteerId ?? null,
        volunteerName: connectionsByRequest.get(m.id)?.volunteerUserId
          ? (volunteersById.get(connectionsByRequest.get(m.id)!.volunteerUserId)?.nickname ||
             volunteersById.get(connectionsByRequest.get(m.id)!.volunteerUserId)?.name ||
             "Volunteer")
          : null,
        volunteerContact: connectionsByRequest.get(m.id)?.volunteerUserId
          ? (volunteersById.get(connectionsByRequest.get(m.id)!.volunteerUserId)?.phone ||
             volunteersById.get(connectionsByRequest.get(m.id)!.volunteerUserId)?.email ||
             null)
          : null,
      },
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
  ];

  const workflowByKey = new Map<string, WorkflowState>();
  for (const row of workflowRows) {
    if (!workflowByKey.has(row.subject)) workflowByKey.set(row.subject, parseWorkflow(row.message));
  }

  const items = rawItems.map(item => {
    const workflow = workflowByKey.get(item.key) ?? defaultWorkflow();
    const escalation = escalationFor(item.createdAt, item.priority, workflow.dueAt);
    return { ...item, workflow, ...escalation };
  }).sort((a, b) => {
    if (a.escalated !== b.escalated) return a.escalated ? -1 : 1;
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
      pendingComments: pendingComments.length,
    },
    items,
  });
});

router.patch("/admin/operations-workflow", requireAdmin, async (req, res): Promise<void> => {
  const actorId = getSessionUserId(req)!;
  const key = String(req.body?.key || "").trim();
  if (!key || key.length > 200 || !/^[a-z_]+:[0-9]+$/i.test(key)) {
    res.status(400).json({ error: "Invalid operation key" });
    return;
  }

  const [existing] = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.subject, key))
    .orderBy(desc(supportMessagesTable.id));

  let state = existing?.type === WORKFLOW_META_TYPE ? parseWorkflow(existing.message) : defaultWorkflow();

  if (req.body?.assignedTo !== undefined) {
    if (req.body.assignedTo === null || req.body.assignedTo === "") {
      state.assignedTo = null;
    } else {
      const targetId = Number(req.body.assignedTo);
      if (!Number.isSafeInteger(targetId) || targetId <= 0) {
        res.status(400).json({ error: "Invalid staff member" }); return;
      }
      const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
      if (!target || !["moderator","admin","super_admin"].includes(target.role) || target.status !== "active") {
        res.status(400).json({ error: "Assigned user must be active staff" }); return;
      }
      state.assignedTo = targetId;
    }
  }

  if (req.body?.workflowStatus !== undefined) {
    const status = String(req.body.workflowStatus);
    if (!["new","in_review","waiting"].includes(status)) {
      res.status(400).json({ error: "Invalid workflow status" }); return;
    }
    state.workflowStatus = status as WorkflowState["workflowStatus"];
  }

  if (req.body?.dueAt !== undefined) {
    if (req.body.dueAt === null || req.body.dueAt === "") {
      state.dueAt = null;
    } else {
      const parsed = new Date(String(req.body.dueAt));
      if (!Number.isFinite(parsed.getTime())) {
        res.status(400).json({ error: "Invalid due date" }); return;
      }
      state.dueAt = parsed.toISOString();
    }
  }

  const note = String(req.body?.note || "").trim();
  if (note) {
    state.notes = [
      ...state.notes,
      { text: note.slice(0, 2000), authorId: actorId, createdAt: new Date().toISOString() },
    ].slice(-100);
  }

  state.updatedAt = new Date().toISOString();
  state.updatedBy = actorId;

  const message = JSON.stringify(state);
  if (existing?.type === WORKFLOW_META_TYPE) {
    await db.update(supportMessagesTable)
      .set({ message, userId: actorId, status: "resolved" })
      .where(eq(supportMessagesTable.id, existing.id));
  } else {
    await db.insert(supportMessagesTable).values({
      userId: actorId,
      name: "Operations Workflow",
      email: "workflow@internal.invalid",
      type: WORKFLOW_META_TYPE,
      subject: key,
      message,
      status: "resolved",
    });
  }

  res.json({ key, workflow: state });
});

export default router;
