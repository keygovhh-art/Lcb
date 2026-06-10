import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, minyansTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/minyans", async (req, res): Promise<void> => {
  const { city, country, community, synagogue } = req.query as Record<string, string>;
  let all = await db.select().from(minyansTable).where(eq(minyansTable.status, "approved"));
  if (city) all = all.filter(m => m.city.toLowerCase().includes(city.toLowerCase()));
  if (country) all = all.filter(m => m.country.toLowerCase().includes(country.toLowerCase()));
  if (community) all = all.filter(m => m.community.toLowerCase().includes(community.toLowerCase()));
  if (synagogue) all = all.filter(m => m.synagogueName.toLowerCase().includes(synagogue.toLowerCase()));
  res.json(all);
});

router.post("/minyans", async (req, res): Promise<void> => {
  const { synagogueName, community, city, country, address, shacharis, mincha, maariv, notes } = req.body;
  if (!synagogueName || !city || !country || !shacharis || !mincha || !maariv) {
    res.status(400).json({ error: "Required fields missing" }); return;
  }
  const [minyan] = await db.insert(minyansTable).values({
    synagogueName, community: community || "", city, country, address, shacharis, mincha, maariv, notes,
    status: "pending",
  }).returning();
  res.status(201).json(minyan);
});

router.get("/minyans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [minyan] = await db.select().from(minyansTable).where(eq(minyansTable.id, id));
  if (!minyan) { res.status(404).json({ error: "Not found" }); return; }
  res.json(minyan);
});

router.patch("/minyans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { synagogueName, shacharis, mincha, maariv, notes, status } = req.body;
  const [minyan] = await db.update(minyansTable).set({ synagogueName, shacharis, mincha, maariv, notes, status }).where(eq(minyansTable.id, id)).returning();
  if (!minyan) { res.status(404).json({ error: "Not found" }); return; }
  res.json(minyan);
});

router.post("/minyans/:id/like", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [minyan] = await db.update(minyansTable).set({ likes: sql`${minyansTable.likes} + 1` }).where(eq(minyansTable.id, id)).returning();
  if (!minyan) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ likes: minyan.likes });
});

export default router;
