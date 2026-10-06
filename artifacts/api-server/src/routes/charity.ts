import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, charitiesTable, donationsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/charity/today", async (_req, res): Promise<void> => {
  const [charity] = await db.select().from(charitiesTable).where(eq(charitiesTable.isTodaysFeatured, true)).limit(1);
  if (!charity) { res.status(404).json({ error: "No featured charity today" }); return; }
  res.json(charity);
});

router.get("/charity", async (_req, res): Promise<void> => {
  const all = await db.select().from(charitiesTable);
  res.json(all);
});

router.get("/charity/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [charity] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, id));
  if (!charity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(charity);
});

router.patch("/charity/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, description, successStories, imageUrl, goalAmount, isTodaysFeatured } = req.body;
  const [charity] = await db.update(charitiesTable).set({ name, description, successStories, imageUrl, goalAmount, isTodaysFeatured }).where(eq(charitiesTable.id, id)).returning();
  if (!charity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(charity);
});

router.post("/charity/:id/donate", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const charityId = parseInt(raw, 10);
  const { amount, donorName } = req.body;
  if (!amount) { res.status(400).json({ error: "amount required" }); return; }
  const [donation] = await db.insert(donationsTable).values({ charityId, amount, donorName }).returning();
  await db.update(charitiesTable).set({ raisedAmount: sql`${charitiesTable.raisedAmount} + ${amount}` }).where(eq(charitiesTable.id, charityId));
  res.status(201).json(donation);
});

export default router;
