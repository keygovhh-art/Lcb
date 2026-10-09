import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, supportMessagesTable, usersTable, volunteerProfilesTable } from "@workspace/db";
import { getSessionUserId, requireAdmin, requireAuth } from "../middlewares/auth";
import { notifyStaff, notifyUser } from "../lib/notify";
import {
  createConnectionMeta, getConnectionMeta, updateConnectionMeta, finishConnection, newConnectionState, CONNECTION_META_TYPE,
  type ConnectionState,
} from "../lib/member-connections";

const router: IRouter = Router();

function idFromRequest(raw: unknown): number | null {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function originalRequest(requestId: number) {
  const [item] = await db.select().from(supportMessagesTable).where(and(
    eq(supportMessagesTable.id, requestId),
    eq(supportMessagesTable.type, "volunteer_contact"),
  ));
  return item ?? null;
}

function noContactMessage(stage: string) {
  if (stage === "declined" || stage === "closed_unfulfilled") {
    return "This volunteer has not agreed to the connection. No contact details were shared.";
  }
  return "Contact details are private until the volunteer agrees.";
}

async function contactFor(userId: number) {
  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    nickname: usersTable.nickname,
    email: usersTable.email,
    phone: usersTable.phone,
    status: usersTable.status,
  }).from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

// Only the requester and the specifically named volunteer may see a
// connection. The volunteer's contact details are revealed to the requester
// only AFTER explicit consent has been recorded.
router.get("/member-connections/mine", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = getSessionUserId(req)!;
    const metadata = await db.select().from(supportMessagesTable)
      .where(eq(supportMessagesTable.type, CONNECTION_META_TYPE))
      .orderBy(desc(supportMessagesTable.createdAt));
    const selected: Array<{ id: number; state: ConnectionState }> = [];
    for (const row of metadata) {
      const requestId = Number(row.subject.match(/^support:(\d+)$/)?.[1]);
      if (!Number.isSafeInteger(requestId) || requestId <= 0) continue;
      let state: ConnectionState | null = null;
      try { state = JSON.parse(row.message) as ConnectionState; } catch { continue; }
      if (!state || !["new", "invited", "accepted", "contact_problem", "consent_revoked", "declined", "connected", "closed_unfulfilled"].includes(state.stage)) continue;
      if (state.requesterUserId !== userId && state.volunteerUserId !== userId) continue;
      if (selected.some(x => x.id === requestId)) continue;
      selected.push({ id: requestId, state });
    }
    const ids = selected.map(item => item.id);
    const cases = ids.length ? await db.select().from(supportMessagesTable)
      .where(and(inArray(supportMessagesTable.id, ids), eq(supportMessagesTable.type, "volunteer_contact"))) : [];
    const byId = new Map(cases.map(item => [item.id, item]));
    const results = await Promise.all(selected.map(async item => {
      const original = byId.get(item.id);
      if (!original) return null;
      const requester = await contactFor(item.state.requesterUserId);
      const volunteer = await contactFor(item.state.volunteerUserId);
      const isRequester = item.state.requesterUserId === userId;
      const allowed = ["accepted", "connected"].includes(item.state.stage);
      return {
        id: item.id,
        stage: item.state.stage,
        role: isRequester ? "requester" : "volunteer",
        subject: original.subject,
        createdAt: original.createdAt,
        volunteerName: volunteer?.nickname || volunteer?.name || "Volunteer",
        requesterName: requester?.nickname || requester?.name || "Member",
        contact: allowed
          ? (isRequester
            ? (volunteer?.status === "active" ? volunteer.phone || volunteer.email : null)
            : (requester?.status === "active" ? requester.phone || requester.email : null))
          : null,
        guidance: noContactMessage(item.state.stage),
        closureReason: item.state.stage === "closed_unfulfilled" ? item.state.closureReason : null,
        contactIssue: item.state.stage === "contact_problem" ? item.state.contactIssue : null,
      };
    }));
    res.json(results.filter(Boolean));
  } catch (error) { next(error); }
});

router.post("/admin/member-connections/:id/link", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    const volunteerId = idFromRequest(req.body?.volunteerId);
    if (!id || !volunteerId) { res.status(400).json({ error: "Valid request and volunteer IDs are required" }); return; }
    const request = await originalRequest(id);
    if (!request || request.status !== "open" || !request.userId) {
      res.status(404).json({ error: "Open request with a member account not found" }); return;
    }
    const existing = await getConnectionMeta(id);
    if (existing.row) { res.status(409).json({ error: "Request is already linked to a volunteer" }); return; }
    const [volunteer] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, volunteerId));
    if (!volunteer) { res.status(404).json({ error: "Volunteer profile not found" }); return; }
    const account = await contactFor(volunteer.userId);
    if (!account || account.status !== "active" || !(account.phone || account.email)) {
      res.status(409).json({ error: "Volunteer needs an active account with contact details" }); return;
    }
    if (volunteer.userId === request.userId) {
      res.status(400).json({ error: "A member cannot request their own contact information" }); return;
    }
    await createConnectionMeta(id, newConnectionState({
      volunteerId, volunteerUserId: volunteer.userId, requesterUserId: request.userId,
    }));
    res.json({ linked: true });
  } catch (error) { next(error); }
});

router.post("/admin/member-connections/:id/invite", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid request ID" }); return; }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!request || request.status !== "open" || !row || !state) {
      res.status(404).json({ error: "Linked open connection request not found" }); return;
    }
    if (state.stage !== "new") { res.status(409).json({ error: "Invitation was already sent or this request has progressed" }); return; }
    const target = await contactFor(state.volunteerUserId);
    if (!target || target.status !== "active" || !(target.phone || target.email)) {
      res.status(409).json({ error: "Volunteer account is not available for contact" }); return;
    }
    const nextState: ConnectionState = {
      ...state, stage: "invited", invitedAt: new Date().toISOString(), updatedBy: getSessionUserId(req)!,
    };
    if (!await updateConnectionMeta(row, nextState)) {
      res.status(409).json({ error: "Request was updated by someone else; refresh it" }); return;
    }
    await notifyUser(state.volunteerUserId, "volunteer_connection_consent",
      "Someone requests permission to contact you. Please accept or decline in My Connections.", "/connections");
    await notifyUser(state.requesterUserId, "connection_request_update",
      "Your request has been forwarded for the volunteer's permission.", "/connections");
    res.json({ stage: "invited", notice: "An in-app notification was sent; no SMS or email has been sent." });
  } catch (error) { next(error); }
});

// A staff member who personally obtained explicit permission can document
// verified phone/in-person consent; a mere "Reviewed" click is never consent.
router.post("/admin/member-connections/:id/record-consent", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    const method = String(req.body?.method || "");
    const note = String(req.body?.note || "").trim();
    if (!id || !["phone", "in_person"].includes(method) ||
        req.body?.confirmedPermission !== true || note.length < 20 || note.length > 1000) {
      res.status(400).json({
        error: "Choose phone/in-person verification, document 20–1000 characters, and explicitly confirm the volunteer granted permission to share their contact details",
      });
      return;
    }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!request || request.status !== "open" || !row || !state) {
      res.status(404).json({ error: "Linked open connection request not found" }); return;
    }
    if (!["new", "invited"].includes(state.stage)) {
      res.status(409).json({ error: "Consent already decided; refresh this case" }); return;
    }
    const volunteer = await contactFor(state.volunteerUserId);
    if (!volunteer || volunteer.status !== "active" || !(volunteer.phone || volunteer.email)) {
      res.status(409).json({ error: "Volunteer must have an active account with a contact method" }); return;
    }
    const verifierId = getSessionUserId(req)!;
    const nextState: ConnectionState = {
      ...state, stage: "accepted", respondedAt: new Date().toISOString(),
      consentMethod: method === "phone" ? "staff_verified_phone" : "staff_verified_in_person",
      consentNote: note, consentVerifiedBy: verifierId, updatedBy: verifierId,
    };
    if (!await updateConnectionMeta(row, nextState)) {
      res.status(409).json({ error: "Request changed; refresh and retry" }); return;
    }
    await notifyUser(state.requesterUserId, "connection_request_update",
      "An administrator personally verified the volunteer's permission. Open My Connections to contact the volunteer and confirm whether contact succeeded.", "/connections");
    await notifyUser(state.volunteerUserId, "connection_request_update",
      "An administrator recorded your permission to share your contact details after personal verification. If this was not authorized, contact administration immediately.", "/connections");
    res.json({ stage: "accepted", consentMethod: nextState.consentMethod });
  } catch (error) { next(error); }
});

router.post("/member-connections/:id/respond", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    const decision = String(req.body?.decision || "");
    if (!id || !["accept", "decline"].includes(decision)) {
      res.status(400).json({ error: "Valid decision required" }); return;
    }
    const { row, state } = await getConnectionMeta(id);
    const request = await originalRequest(id);
    if (!row || !state || !request || request.status !== "open") {
      res.status(404).json({ error: "Open connection request not found" }); return;
    }
    if (state.volunteerUserId !== getSessionUserId(req)) {
      res.status(403).json({ error: "Only the requested volunteer may decide" }); return;
    }
    if (state.stage !== "invited") {
      res.status(409).json({ error: "This request is not awaiting volunteer consent" }); return;
    }
    if (decision === "accept") {
      const user = await contactFor(state.volunteerUserId);
      if (!user || user.status !== "active" || !(user.phone || user.email)) {
        res.status(409).json({ error: "Add an email or phone number to your profile before approving contact" }); return;
      }
    }
    const stage = decision === "accept" ? "accepted" : "declined";
    if (!await updateConnectionMeta(row, {
      ...state, stage, respondedAt: new Date().toISOString(),
      consentMethod: decision === "accept" ? "in_app" : null,
      consentNote: null, consentVerifiedBy: null,
      updatedBy: getSessionUserId(req)!,
    })) { res.status(409).json({ error: "Another update occurred; refresh the request" }); return; }
    await notifyUser(state.requesterUserId, "connection_request_update",
      decision === "accept"
        ? "The volunteer agreed to share contact details. Open My Connections to contact them and confirm the outcome."
        : "The volunteer could not accept the contact request. Your administrators will follow up.", "/connections");
    await notifyStaff(`Volunteer ${decision === "accept" ? "accepted" : "declined"} request #${id}`, "/founder", "admin_member_connection");
    res.json({ stage });
  } catch (error) { next(error); }
});

router.post("/member-connections/:id/confirm", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid request ID" }); return; }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!row || !state || !request) { res.status(404).json({ error: "Connection request not found" }); return; }
    if (state.requesterUserId !== getSessionUserId(req)) {
      res.status(403).json({ error: "Only the requester can confirm successful contact" }); return;
    }
    if (state.stage === "connected") { res.json({ stage: "connected" }); return; }
    if (state.stage !== "accepted" || request.status !== "open") {
      res.status(409).json({ error: "The volunteer must accept before contact can be confirmed" }); return;
    }
    if (!await finishConnection(id, row, {
      ...state, stage: "connected", confirmedAt: new Date().toISOString(),
      updatedBy: getSessionUserId(req)!,
    })) { res.status(409).json({ error: "Request changed; refresh and retry" }); return; }
    await notifyStaff(`Requester confirmed successful contact for request #${id}`, "/founder", "admin_member_connection");
    await notifyUser(state.volunteerUserId, "connection_request_update",
      "The requester confirmed that contact was successful. Thank you!", "/connections");
    res.json({ stage: "connected" });
  } catch (error) { next(error); }
});

// The requester can flag a failed attempt without pretending the introduction
// succeeded. The case remains open for staff follow-up.
// The volunteer may withdraw consent while the introduction is still open.
// Staff and the requester are immediately told not to proceed.
router.post("/member-connections/:id/revoke", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid connection ID" }); return; }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!request || request.status !== "open" || !row || !state) {
      res.status(404).json({ error: "Open connection request not found" }); return;
    }
    if (state.volunteerUserId !== getSessionUserId(req)) {
      res.status(403).json({ error: "Only the volunteer can withdraw consent" }); return;
    }
    if (!["accepted", "contact_problem"].includes(state.stage)) {
      res.status(409).json({ error: "There is no active consent to withdraw" }); return;
    }
    if (!await updateConnectionMeta(row, {
      ...state, stage: "consent_revoked", updatedBy: getSessionUserId(req)!,
    })) { res.status(409).json({ error: "Request changed; refresh" }); return; }
    await notifyUser(state.requesterUserId, "connection_permission_withdrawn",
      "The volunteer withdrew permission to share contact details. Do not attempt further contact. Administration will follow up.", "/connections");
    await notifyStaff(`Volunteer withdrew consent for connection request #${id}`, "/founder", "admin_member_connection");
    res.json({ stage: "consent_revoked" });
  } catch (error) { next(error); }
});

router.post("/member-connections/:id/problem", requireAuth, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    const description = String(req.body?.description || "").trim();
    if (!id || description.length < 10 || description.length > 500) {
      res.status(400).json({ error: "Explain the contact problem (10–500 characters)" }); return;
    }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!request || request.status !== "open" || !row || !state) {
      res.status(404).json({ error: "Open connection request not found" }); return;
    }
    if (state.requesterUserId !== getSessionUserId(req)) {
      res.status(403).json({ error: "Only the requester can report a failed contact attempt" }); return;
    }
    if (state.stage !== "accepted") {
      res.status(409).json({ error: "Contact must first be approved by the volunteer" }); return;
    }
    if (!await updateConnectionMeta(row, {
      ...state, stage: "contact_problem", contactIssue: description,
      updatedBy: getSessionUserId(req)!,
    })) { res.status(409).json({ error: "Request changed; refresh it" }); return; }
    await notifyStaff(`Requester needs help contacting volunteer for case #${id}: ${description}`, "/founder", "admin_member_connection");
    res.json({ stage: "contact_problem" });
  } catch (error) { next(error); }
});

// After staff has actually followed up and corrected the issue, the same
// requester may attempt contact and confirm the real result.
router.post("/admin/member-connections/:id/retry-contact", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid request ID" }); return; }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!request || request.status !== "open" || !row || !state) {
      res.status(404).json({ error: "Open connection request not found" }); return;
    }
    if (state.stage !== "contact_problem") {
      res.status(409).json({ error: "Request is not awaiting help with a failed contact attempt" }); return;
    }
    const followup = String(req.body?.followup || "").trim();
    if (followup.length < 10 || followup.length > 500) {
      res.status(400).json({ error: "Record what was fixed before inviting another attempt" }); return;
    }
    if (!await updateConnectionMeta(row, {
      ...state, stage: "accepted", contactIssue: null,
      contactFollowups: [...(state.contactFollowups || []), {
        note: followup, actorId: getSessionUserId(req)!, at: new Date().toISOString(),
      }].slice(-50),
      updatedBy: getSessionUserId(req)!,
    })) { res.status(409).json({ error: "Request changed; refresh it" }); return; }
    await notifyUser(state.requesterUserId, "connection_request_update",
      "The team followed up on your connection problem. Please try again and confirm the result.", "/connections");
    res.json({ stage: "accepted" });
  } catch (error) { next(error); }
});

router.post("/admin/member-connections/:id/close-unfulfilled", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = idFromRequest(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (!id || reason.length < 10 || reason.length > 1000) {
      res.status(400).json({ error: "Provide a reason of 10–1000 characters for an unsuccessful closure" }); return;
    }
    const request = await originalRequest(id);
    const { row, state } = await getConnectionMeta(id);
    if (!row || !state || !request || request.status !== "open") {
      res.status(404).json({ error: "Open connection request not found" }); return;
    }
    if (state.stage === "connected" || state.stage === "closed_unfulfilled") {
      res.status(409).json({ error: "Request was already closed" }); return;
    }
    if (!await finishConnection(id, row, {
      ...state, stage: "closed_unfulfilled", closedAt: new Date().toISOString(),
      closureReason: reason, updatedBy: getSessionUserId(req)!,
    })) { res.status(409).json({ error: "Request changed; refresh and retry" }); return; }
    await notifyUser(state.requesterUserId, "connection_request_update",
      "Your connection request could not be completed. Please check My Connections for an explanation.", "/connections");
    res.json({ stage: "closed_unfulfilled" });
  } catch (error) { next(error); }
});

export default router;
