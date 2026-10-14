import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, minyansTable, notificationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getCurrentSessionUser } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { logActivity } from "../lib/activity";
import { notifyStaff } from "../lib/notify";
import { normalizeMinyanTimes, hasAtLeastOneMinyanTime } from "../lib/minyan-times";
import { legacySchedule, validateSchedule, scheduleStrings, resolvedSchedule } from "../lib/minyan-weekdays";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator" || role === "super_admin";
}

router.get("/admin/minyans", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(minyansTable).orderBy(desc(minyansTable.createdAt));
  res.json(all);
});

router.get("/minyans", async (req, res): Promise<void> => {
  const { city, country, synagogue } = req.query as Record<string, string>;
  let all = await db.select().from(minyansTable).where(eq(minyansTable.status, "approved"));
  if (city) all = all.filter(m => m.city.toLowerCase().includes(city.toLowerCase()));
  if (country) all = all.filter(m => m.country.toLowerCase().includes(country.toLowerCase()));
  if (synagogue) all = all.filter(m => m.synagogueName.toLowerCase().includes(synagogue.toLowerCase()));
  res.json(all.map(m=>({...m,weekdaySchedules:resolvedSchedule(m)})));
});

router.post("/minyans", requireAuth, async (req, res): Promise<void> => {
  const { synagogueName, city, country, address, shacharis, mincha, maariv, notes, weekdaySchedules } = req.body;
  const cleanName = String(synagogueName || "").trim();
  const cleanCity = String(city || "").trim();
  const cleanCountry = String(country || "").trim();
  let cleanShacharis: string, cleanMincha: string, cleanMaariv: string;
  try {
    cleanShacharis = normalizeMinyanTimes(shacharis);
    cleanMincha = normalizeMinyanTimes(mincha);
    cleanMaariv = normalizeMinyanTimes(maariv);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message }); return;
  }
  if (!cleanName || !cleanCity || !cleanCountry) {
    res.status(400).json({ error: "Synagogue, city and country are required" }); return;
  }
  if (!hasAtLeastOneMinyanTime(cleanShacharis, cleanMincha, cleanMaariv)) {
    res.status(400).json({ error: "Please provide at least one Shacharis, Mincha or Maariv time" }); return;
  }
  let chosenSchedule;
  try {
    chosenSchedule=validateSchedule(weekdaySchedules===undefined
      ? legacySchedule({shacharis:cleanShacharis,mincha:cleanMincha,maariv:cleanMaariv})
      : weekdaySchedules);
    const serialized=scheduleStrings(chosenSchedule);
    if(serialized.shacharis!==cleanShacharis || serialized.mincha!==cleanMincha || serialized.maariv!==cleanMaariv)
      throw Error("Weekday schedule times do not match prayer times");
  } catch(error) {res.status(400).json({error:(error as Error).message});return;}
  const [minyan] = await db.insert(minyansTable).values({
    submittedByUserId: getSessionUserId(req)!,
    synagogueName: cleanName.slice(0, 240),
    community: "", // legacy non-null storage only; no community classification
    city: cleanCity.slice(0, 160),
    country: cleanCountry.slice(0, 160),
    address: address ? String(address).trim().slice(0, 300) : null,
    shacharis: cleanShacharis,
    mincha: cleanMincha,
    maariv: cleanMaariv,
    weekdaySchedules:chosenSchedule,
    notes: notes ? String(notes).trim().slice(0, 3000) : null,
    status: "pending",
  }).returning();
  await notifyStaff(`New minyan submission: ${minyan.synagogueName} — ${minyan.city}`, "/founder", "admin_minyan");
  res.status(201).json(minyan);
});

router.get("/minyans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [minyan] = await db.select().from(minyansTable).where(eq(minyansTable.id, id));
  if (!minyan) { res.status(404).json({ error: "Not found" }); return; }

  if (minyan.status !== "approved") {
    const currentUser = await getCurrentSessionUser(req);
    if (!currentUser || (currentUser.id !== minyan.submittedByUserId && !isStaffRole(currentUser.role))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  res.json({...minyan,weekdaySchedules:resolvedSchedule(minyan)});
});

router.patch("/minyans/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(minyansTable).where(eq(minyansTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { synagogueName, shacharis, mincha, maariv, notes, status, city, country, address, weekdaySchedules } = req.body;
  const updates: Record<string, unknown> = {};
  if (synagogueName !== undefined) {
    const clean = String(synagogueName).trim();
    if (!clean) { res.status(400).json({ error: "synagogueName required" }); return; }
    updates.synagogueName = clean.slice(0, 240);
  }
  if (city !== undefined) {
    const clean = String(city).trim();
    if (!clean) { res.status(400).json({ error: "city required" }); return; }
    updates.city = clean.slice(0, 160);
  }
  if (country !== undefined) {
    const clean = String(country).trim();
    if (!clean) { res.status(400).json({ error: "country required" }); return; }
    updates.country = clean.slice(0, 160);
  }
  if (address !== undefined) updates.address = address ? String(address).trim().slice(0, 300) : null;
  if (shacharis !== undefined || mincha !== undefined || maariv !== undefined || weekdaySchedules !== undefined) {
    let nextShacharis: string, nextMincha: string, nextMaariv: string;
    try {
      nextShacharis = normalizeMinyanTimes(shacharis === undefined ? existing.shacharis : shacharis);
      nextMincha = normalizeMinyanTimes(mincha === undefined ? existing.mincha : mincha);
      nextMaariv = normalizeMinyanTimes(maariv === undefined ? existing.maariv : maariv);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message }); return;
    }
    if (!hasAtLeastOneMinyanTime(nextShacharis, nextMincha, nextMaariv)) {
      res.status(400).json({ error: "At least one Shacharis, Mincha or Maariv time is required" }); return;
    }
    try {
      const chosen=validateSchedule(weekdaySchedules===undefined
        ? legacySchedule({shacharis:nextShacharis,mincha:nextMincha,maariv:nextMaariv})
        : weekdaySchedules);
      const serialized=scheduleStrings(chosen);
      if(serialized.shacharis!==nextShacharis || serialized.mincha!==nextMincha || serialized.maariv!==nextMaariv)
        throw Error("Weekday schedule times do not match prayer times");
      updates.weekdaySchedules=chosen;
    } catch(error) {res.status(400).json({error:(error as Error).message});return;}
    updates.shacharis = nextShacharis;
    updates.mincha = nextMincha;
    updates.maariv = nextMaariv;
  }
  if (notes !== undefined) updates.notes = notes ? String(notes).trim().slice(0, 3000) : null;

  if (status !== undefined) {
    if (!["pending", "approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    if (existing.status !== "pending" && status !== existing.status) {
      res.status(409).json({ error: "This submission has already been reviewed" });
      return;
    }
    updates.status = status;
  }

  const [minyan] = await db.update(minyansTable).set(updates).where(eq(minyansTable.id, id)).returning();

  if (existing.status === "pending" && (status === "approved" || status === "rejected")) {
    if (status === "approved") {
      await logActivity("minyan", `Approved minyan "${minyan.synagogueName}" in ${minyan.city}`, "Gavhah Administration");
    }
    await db.insert(notificationsTable).values({
      userId: minyan.submittedByUserId,
      type: "minyan_review",
      message: status === "approved"
        ? `Your minyan submission "${minyan.synagogueName}" was approved and is now public.`
        : `Your minyan submission "${minyan.synagogueName}" was not approved.`,
      linkUrl: status === "approved" ? "/minyans" : null,
      isRead: false,
    });
  }

  res.json({...minyan,weekdaySchedules:resolvedSchedule(minyan)});
});

router.post("/minyans/:id/like", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select({
    id: minyansTable.id,
    likes: minyansTable.likes,
    status: minyansTable.status,
  }).from(minyansTable).where(eq(minyansTable.id, id));
  if (!existing || existing.status !== "approved") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const state = await setLikeState(getSessionUserId(req)!, "minyan", id);
  let likes = existing.likes;
  if (state.changed) {
    const [updated] = await db.update(minyansTable)
      .set({ likes: sql`GREATEST(0, ${minyansTable.likes} + ${state.delta})` })
      .where(eq(minyansTable.id, id))
      .returning({ likes: minyansTable.likes });
    likes = updated.likes;
  }
  res.json({ likes, liked: state.liked });
});

export default router;
