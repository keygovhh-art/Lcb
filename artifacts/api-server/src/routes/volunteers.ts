import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { CONNECTION_META_TYPE, parseConnectionState, clearConsentForNewReview } from "../lib/member-connections";
import { notifyUser } from "../lib/notify";
import { db, volunteerProfilesTable, helpRequestsTable, notificationsTable, supportMessagesTable, memberContactMethodsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole, getCurrentSessionUser } from "../middlewares/auth";
import { getMemberIdentity, resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { notifyStaff } from "../lib/notify";
import { parseContactSelection, saveContactValues, getContactSelection } from "../lib/member-contact-methods";

const router: IRouter = Router();
// Prevent a third-party page from approving contacts or editing private
// contact details via a member's authenticated session.
router.use((req,res,next)=>{
  if (["GET","HEAD","OPTIONS"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({error:"Cross-site changes are not allowed"});return;
  }
  const origin=req.get("origin");
  if (!origin) return next(); // non-browser clients; still require a valid session
  try{
    if (new URL(origin).host !== req.get("host")) {
      res.status(403).json({error:"Invalid request origin"});return;
    }
  }catch{
    res.status(403).json({error:"Invalid request origin"});return;
  }
  next();
});


function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator" || role === "super_admin";
}

const validCustomCategory = (value: string) =>
  value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
const HELP_URGENCIES = new Set(["low", "medium", "high", "critical"]);
const HELP_STATUSES = new Set(["pending", "open", "rejected", "resolved"]);
const VOLUNTEER_AVAILABILITY = new Set(["weekdays", "evenings", "weekends", "flexible", "on_call", "anytime", "by_appointment"]);

function publicHelpRequest<T extends { contactInfo?: unknown }>(request: T) {
  const { contactInfo: _contactInfo, ...safe } = request as T & { contactInfo?: unknown };
  return safe;
}

router.get("/featured/volunteers", requireAdmin, async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control","private, no-store");
  const featured = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.isFeatured, true)).limit(4);
  res.json(featured);
});

router.get("/featured/requests", requireAdmin, async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control","private, no-store");
  const featured = await db.select().from(helpRequestsTable).where(and(
    eq(helpRequestsTable.isFeatured, true),
    eq(helpRequestsTable.status, "open"),
  )).limit(4);
  res.json(featured.map(publicHelpRequest));
});

router.get("/volunteers", requireAdmin, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control","private, no-store");
  const { location, search } = req.query as Record<string, string>;
  let all = await db.select().from(volunteerProfilesTable);
  if (location) all = all.filter(v => v.location.toLowerCase().includes(location.toLowerCase()));
  if (search) all = all.filter(v => v.userName.toLowerCase().includes(search.toLowerCase()));
  res.json(all);
});

router.post("/volunteers", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const { userName, skills, availability, location, bio, areasOfInterest } = req.body;
  const contact = parseContactSelection(req.body?.contactMethods);
  if (!contact.value) { res.status(400).json({ error: contact.error || "Contact method required" }); return; }
  const cleanAvailability = "anytime"; // Only current signup choice; legacy values remain stored safely.
  const cleanLocation = String(location || "").trim();
  if (!cleanLocation) {
    res.status(400).json({ error: "valid availability and location required" });
    return;
  }

  const [existing] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.userId, userId));
  if (existing) {
    res.status(409).json({ error: "You are already registered as a volunteer" });
    return;
  }

  const safeUserName = await resolveMemberDisplayName(userId, userName);
  const vol = await db.transaction(async tx => {
    const [created] = await tx.insert(volunteerProfilesTable).values({
    userId,
    userName: safeUserName,
    skills: Array.isArray(skills) ? skills.slice(0, 30).map(v => String(v).slice(0, 100)) : [],
    availability: cleanAvailability,
    bio: bio ? String(bio).trim().slice(0, 3000) : null,
    location: cleanLocation.slice(0, 200),
    areasOfInterest: Array.isArray(areasOfInterest) ? areasOfInterest.slice(0, 30).map(v => String(v).slice(0, 100)) : [],
    labels: [],
    isFeatured: false,
  }).returning();
    await tx.insert(memberContactMethodsTable).values(saveContactValues(userId, "volunteer", contact.value!))
      .onConflictDoUpdate({
        target:[memberContactMethodsTable.userId,memberContactMethodsTable.purpose],
        set:{...contact.value!,updatedAt:new Date()},
      });
    return created;
  });
  // Deliberately no public activity record for confidential volunteer signup.

  const volunteerUser = await getMemberIdentity(userId);
  await db.insert(supportMessagesTable).values({
    userId,
    name: safeUserName,
    email: volunteerUser?.email || volunteerUser?.phone || "Gavhah member",
    type: "volunteer_registration",
    subject: `New volunteer registration: ${safeUserName}`,
    message: [
      `Location: ${cleanLocation}`,
      `Availability: ${cleanAvailability}`,
      Array.isArray(skills) && skills.length ? `Skills: ${skills.join(", ")}` : "",
      Array.isArray(areasOfInterest) && areasOfInterest.length ? `Areas: ${areasOfInterest.join(", ")}` : "",
      bio ? `Bio: ${String(bio).trim()}` : "",
    ].filter(Boolean).join("\n"),
    status: "open",
  });
  await notifyStaff(`New volunteer registration: ${safeUserName}`, "/founder", "admin_volunteer");

  res.setHeader("Cache-Control","private, no-store");
  res.status(201).json(vol);
});

router.get("/volunteers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [vol] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  if (!vol) { res.status(404).json({ error: "Not found" }); return; }
  if (vol.userId !== getSessionUserId(req) && !isStaffRole(getSessionUserRole(req))) {
    res.status(404).json({ error: "Not found" }); return;
  }
  res.setHeader("Cache-Control","private, no-store");
  res.json(vol);
});

router.patch("/volunteers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const { userName, skills, availability, location, bio, areasOfInterest, isFeatured } = req.body;
  const updates: Record<string, unknown> = {};
  if (userName !== undefined) updates.userName = await resolveMemberDisplayName(existing.userId, userName);
  if (Array.isArray(skills)) updates.skills = skills;
  if (availability !== undefined) updates.availability = String(availability);
  if (location !== undefined) {
    if (!String(location).trim()) { res.status(400).json({ error: "location required" }); return; }
    updates.location = String(location).trim();
  }
  if (bio !== undefined) updates.bio = bio ? String(bio).trim() : null;
  if (Array.isArray(areasOfInterest)) updates.areasOfInterest = areasOfInterest;
  if (isStaffRole(getSessionUserRole(req)) && isFeatured !== undefined) updates.isFeatured = !!isFeatured;

  const [updated] = await db.update(volunteerProfilesTable)
    .set(updates)
    .where(eq(volunteerProfilesTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/volunteers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(volunteerProfilesTable).where(eq(volunteerProfilesTable.id, id));
  res.sendStatus(204);
});

router.get("/admin/help-requests", requireAdmin, async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control","private, no-store");
  const all = await db.select().from(helpRequestsTable);
  res.json(all);
});

router.get("/help-requests", requireAdmin, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control","private, no-store");
  const { type, urgency } = req.query as Record<string, string>;
  let all = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.status, "open"));
  if (type) all = all.filter(r => r.needType === type);
  if (urgency) all = all.filter(r => r.urgency === urgency);
  res.json(all.map(publicHelpRequest));
});

router.post("/help-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const { name, needType, description, urgency, location } = req.body;
  const cleanName = String(name || "").trim();
  const cleanNeedType = String(needType || "").trim();
  const cleanDescription = String(description || "").trim();
  const cleanUrgency = String(urgency || "medium");
  if (!cleanName || !cleanDescription || !validCustomCategory(cleanNeedType)) {
    res.status(400).json({ error: "name, custom category (1–120 characters), and description are required" });
    return;
  }
  if (!HELP_URGENCIES.has(cleanUrgency)) {
    res.status(400).json({ error: "invalid urgency" });
    return;
  }

  const user = await getMemberIdentity(userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const contact = parseContactSelection(req.body?.contactMethods);
  if (!contact.value) { res.status(400).json({ error: contact.error || "Contact method required" }); return; }
  const contactInfo = user.email || user.phone || `Gavhah member #${userId}`;

  const request = await db.transaction(async tx => {
    const [created] = await tx.insert(helpRequestsTable).values({
    userId,
    name: cleanName.slice(0, 200),
    contactInfo,
    location: location ? String(location).trim().slice(0, 200) : null,
    needType: cleanNeedType,
    description: cleanDescription.slice(0, 5000),
    urgency: cleanUrgency,
    isFeatured: false,
    status: "pending",
  }).returning();
    await tx.insert(memberContactMethodsTable).values(saveContactValues(userId, "help", contact.value!))
      .onConflictDoUpdate({
        target:[memberContactMethodsTable.userId,memberContactMethodsTable.purpose],
        set:{...contact.value!,updatedAt:new Date()},
      });
    return created;
  });

  await notifyStaff(
    `New help request: ${request.name} — ${request.urgency} ${request.needType}`,
    "/founder",
    "admin_help_request",
  );
  res.setHeader("Cache-Control","private, no-store");
  res.status(201).json(publicHelpRequest(request));
});

router.get("/help-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [request] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }

  // Requests are private irrespective of review status.
  const currentUser = await getCurrentSessionUser(req);
  if (!currentUser || (currentUser.id !== request.userId && !isStaffRole(currentUser.role))) {
    res.status(404).json({ error: "Not found" }); return;
  }
  res.setHeader("Cache-Control","private, no-store");
  res.json(isStaffRole(currentUser.role) ? request : publicHelpRequest(request));
});

router.patch("/help-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const role = getSessionUserRole(req);
  const [existing] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(role)) {
    res.status(403).json({ error: "Not allowed" }); return;
  }

  const { name, location, needType, description, urgency, status, isFeatured } = req.body;
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (!String(name).trim()) { res.status(400).json({ error: "name required" }); return; }
    updates.name = String(name).trim();
  }
  if (location !== undefined) updates.location = location ? String(location).trim().slice(0, 200) : null;
  if (needType !== undefined) {
    const clean = String(needType);
    if (!HELP_TYPES.has(clean)) { res.status(400).json({ error: "invalid needType" }); return; }
    updates.needType = clean;
  }
  if (description !== undefined) {
    if (!String(description).trim()) { res.status(400).json({ error: "description required" }); return; }
    updates.description = String(description).trim().slice(0, 5000);
  }
  if (urgency !== undefined) {
    const clean = String(urgency);
    if (!HELP_URGENCIES.has(clean)) { res.status(400).json({ error: "invalid urgency" }); return; }
    updates.urgency = clean;
  }

  if (isStaffRole(role)) {
    if (status !== undefined) {
      const clean = String(status);
      if (!HELP_STATUSES.has(clean)) { res.status(400).json({ error: "invalid status" }); return; }
      if (clean === "resolved" && existing.status !== "resolved") {
        const resolutionNote = String(req.body?.resolutionNote || "").trim();
        if (resolutionNote.length < 10 || resolutionNote.length > 2000) {
          res.status(400).json({ error: "Describe the assistance actually delivered before marking this request fulfilled" }); return;
        }
      }
      updates.status = clean;
    }
    if (isFeatured !== undefined) updates.isFeatured = !!isFeatured;
  }

  const [request] = await db.update(helpRequestsTable)
    .set(updates)
    .where(eq(helpRequestsTable.id, id))
    .returning();

  if (isStaffRole(role) && status === "resolved" && existing.status !== "resolved") {
    await db.insert(supportMessagesTable).values({
      userId, name: "Help Fulfillment Audit", email: "audit@internal.invalid",
      type: "__help_resolution__", subject: `help:${id}`,
      message: String(req.body?.resolutionNote || "").trim(), status: "resolved",
    });
  }

  if (isStaffRole(role) && status !== undefined && status !== existing.status) {
    const decisionMessage =
      status === "open" ? `Your private help request "${request.name}" has been accepted for confidential staff follow-up. It is NOT public.` :
      status === "rejected" ? `Your private help request "${request.name}" could not be accepted for internal follow-up.` :
      status === "resolved" ? `Your help request "${request.name}" was marked resolved.` :
      null;

    if (decisionMessage) {
      await db.insert(notificationsTable).values({
        userId: request.userId,
        type: "help_request",
        message: decisionMessage,
        linkUrl: "/directory",
        isRead: false,
      });
    }
  }

  res.setHeader("Cache-Control","private, no-store");
  res.json(isStaffRole(role) ? request : publicHelpRequest(request));
});

router.delete("/help-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const [existing] = await db.select().from(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaffRole(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  await db.delete(helpRequestsTable).where(eq(helpRequestsTable.id, id));
  res.sendStatus(204);
});

/**
 * Account owners can update the contact methods used in their applications.
 * Updating those methods immediately invalidates any open case's approval;
 * previously displayed contact information must not be re-released without
 * new permission from BOTH participants.
 */
router.get("/me/contact-methods/:purpose", requireAuth, async(req,res):Promise<void>=>{
  const purpose=String(req.params.purpose);
  if(purpose!=="volunteer"&&purpose!=="help"){res.status(400).json({error:"Invalid contact context"});return;}
  res.setHeader("Cache-Control","private, no-store");
  res.json({methods:await getContactSelection(getSessionUserId(req)!,purpose)});
});
router.put("/me/contact-methods/:purpose", requireAuth, async(req,res,next):Promise<void>=>{
  try{
    const purpose=String(req.params.purpose);
    if(purpose!=="volunteer"&&purpose!=="help"){res.status(400).json({error:"Invalid contact context"});return;}
    const parsed=parseContactSelection(req.body);
    if(!parsed.value){res.status(400).json({error:parsed.error});return;}
    const userId=getSessionUserId(req)!;
    const before=await getContactSelection(userId,purpose);
    const changed=JSON.stringify(before)!==JSON.stringify(parsed.value);
    await db.transaction(async tx=>{
      await tx.insert(memberContactMethodsTable).values(saveContactValues(userId,purpose,parsed.value!))
        .onConflictDoUpdate({
          target:[memberContactMethodsTable.userId,memberContactMethodsTable.purpose],
          set:{...parsed.value!,updatedAt:new Date()},
        });
      if(!changed)return;
      const rows=await tx.select().from(supportMessagesTable)
        .where(eq(supportMessagesTable.type,CONNECTION_META_TYPE));
      for(const row of rows){
        const state=parseConnectionState(row.message);
        if(!state||!["invited","accepted","contact_problem"].includes(state.stage))continue;
        if(state.requesterUserId!==userId&&state.volunteerUserId!==userId)continue;
        if(purpose==="volunteer"&&state.volunteerUserId!==userId)continue;
        if(purpose==="help"&&state.requesterUserId!==userId)continue;
        const updated={...clearConsentForNewReview(state),stage:"needs_reapproval" as const,
          invitedAt:null,updatedBy:userId};
        const [saved]=await tx.update(supportMessagesTable).set({message:JSON.stringify(updated)})
          .where(and(eq(supportMessagesTable.id,row.id),eq(supportMessagesTable.message,row.message)))
          .returning({id:supportMessagesTable.id});
        if(!saved)throw Error("A connection was updated concurrently. Please retry.");
      }
    });
    if(changed){
      await notifyStaff("A member updated private contact channels. Open introductions require renewed personal approvals.",
        "/founder","admin_member_connection");
    }
    res.json({saved:true,approvalsInvalidated:changed});
  }catch(e){next(e);}
});

export default router;
