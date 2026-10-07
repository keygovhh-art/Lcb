import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, minyansTable, notificationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getCurrentSessionUser } from "../middlewares/auth";
import { setLikeState } from "../lib/entity-likes";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function isStaffRole(role?: string) {
  return role === "admin" || role === "moderator";
}

router.get("/admin/minyans", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(minyansTable).orderBy(desc(minyansTable.createdAt));
  res.json(all);
});

router.get("/minyans", async (req, res): Promise<void> => {
  const { city, country, community, synagogue } = req.query as Record<string, string>;
  let all = await db.select().from(minyansTable).where(eq(minyansTable.status, "approved"));
  if (city) all = all.filter(m => m.city.toLowerCase().includes(city.toLowerCase()));
  if (country) all = all.filter(m => m.country.toLowerCase().includes(country.toLowerCase()));
  if (community) all = all.filter(m => m.community.toLowerCase().includes(community.toLowerCase()));
  if (synagogue) all = all.filter(m => m.synagogueName.toLowerCase().includes(synagogue.toLowerCase()));
  res.json(all);
});

router.post("/minyans", requireAuth, async (req, res): Promise<void> => {
  const { synagogueName, community, city, country, address, shacharis, mincha, maariv, notes } = req.body;
  const cleanName = String(synagogueName || "").trim();
  const cleanCity = String(city || "").trim();
  const cleanCountry = String(country || "").trim();
  const cleanShacharis = String(shacharis || "").trim();
  const cleanMincha = String(mincha || "").trim();
  const cleanMaariv = String(maariv || "").trim();
  if (!cleanName || !cleanCity || !cleanCountry || !cleanShacharis || !cleanMincha || !cleanMaariv) {
    res.status(400).json({ error: "Synagogue, city, country, and all three minyan times are required" }); return;
  }
  const [minyan] = await db.insert(minyansTable).values({
    submittedByUserId: getSessionUserId(req)!,
    synagogueName: cleanName.slice(0, 240),
    community: community ? String(community).trim().slice(0, 200) : "",
    city: cleanCity.slice(0, 160),
    country: cleanCountry.slice(0, 160),
    address: address ? String(address).trim().slice(0, 300) : null,
    shacharis: cleanShacharis.slice(0, 160),
    mincha: cleanMincha.slice(0, 160),
    maariv: cleanMaariv.slice(0, 160),
    notes: notes ? String(notes).trim().slice(0, 3000) : null,
    status: "pending",
  }).returning();
  res.status(201).json(minyan);
});

router.get("/minyans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [minyan] = await db.select().from(minyansTable).where(eq(minyansTable.id, id));
  if (!minyan) { res.status(404).json({ error: "Not found" }); return; }

  if (minyan.status !== "approved") {
    const userId = getSessionUserId(req);
    const currentUser = await getCurrentSessionUser(req);
    if (userId !== minyan.submittedByUserId && !isStaffRole(currentUser?.role)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  res.json(minyan);
});

router.patch("/minyans/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(minyansTable).where(eq(minyansTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { synagogueName, shacharis, mincha, maariv, notes, status, community, city, country, address } = req.body;
  const updates: Record<string, unknown> = {};
  if (synagogueName !== undefined) {
    const clean = String(synagogueName).trim();
    if (!clean) { res.status(400).json({ error: "synagogueName required" }); return; }
    updates.synagogueName = clean.slice(0, 240);
  }
  if (community !== undefined) updates.community = String(community ?? "").trim().slice(0, 200);
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
  if (shacharis !== undefined) {
    const clean = String(shacharis).trim();
    if (!clean) { res.status(400).json({ error: "shacharis required" }); return; }
    updates.shacharis = clean.slice(0, 160);
  }
  if (mincha !== undefined) {
    const clean = String(mincha).trim();
    if (!clean) { res.status(400).json({ error: "mincha required" }); return; }
    updates.mincha = clean.slice(0, 160);
  }
  if (maariv !== undefined) {
    const clean = String(maariv).trim();
    if (!clean) { res.status(400).json({ error: "maariv required" }); return; }
    updates.maariv = clean.slice(0, 160);
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

  res.json(minyan);
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
