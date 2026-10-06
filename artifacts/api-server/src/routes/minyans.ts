import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, minyansTable, notificationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";
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
  if (!synagogueName || !city || !country || !shacharis || !mincha || !maariv) {
    res.status(400).json({ error: "Required fields missing" }); return;
  }
  const [minyan] = await db.insert(minyansTable).values({
    submittedByUserId: getSessionUserId(req)!,
    synagogueName: String(synagogueName).trim(),
    community: community || "",
    city: String(city).trim(),
    country: String(country).trim(),
    address: address ? String(address).trim() : null,
    shacharis: String(shacharis).trim(),
    mincha: String(mincha).trim(),
    maariv: String(maariv).trim(),
    notes: notes ? String(notes).trim() : null,
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
    if (userId !== minyan.submittedByUserId && !isStaffRole(getSessionUserRole(req))) {
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
  if (synagogueName !== undefined) updates.synagogueName = String(synagogueName).trim();
  if (community !== undefined) updates.community = String(community);
  if (city !== undefined) updates.city = String(city).trim();
  if (country !== undefined) updates.country = String(country).trim();
  if (address !== undefined) updates.address = address ? String(address).trim() : null;
  if (shacharis !== undefined) updates.shacharis = String(shacharis).trim();
  if (mincha !== undefined) updates.mincha = String(mincha).trim();
  if (maariv !== undefined) updates.maariv = String(maariv).trim();
  if (notes !== undefined) updates.notes = notes ? String(notes).trim() : null;

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
