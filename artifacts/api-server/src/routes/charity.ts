import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, charitiesTable, donationsTable } from "@workspace/db";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { deleteManagedMediaUrl } from "../lib/media-cleanup";

const router: IRouter = Router();

router.get("/charity/today", async (_req, res): Promise<void> => {
  const [charity] = await db.select().from(charitiesTable).where(and(
    eq(charitiesTable.isTodaysFeatured, true),
    eq(charitiesTable.isActive, true),
  )).limit(1);
  if (!charity) { res.status(404).json({ error: "No featured charity today" }); return; }
  res.json(charity);
});

router.get("/charity", async (_req, res): Promise<void> => {
  const all = await db.select().from(charitiesTable).where(eq(charitiesTable.isActive, true));
  res.json(all);
});

router.get("/admin/charity", requireAdmin, async (_req, res): Promise<void> => {
  const all = await db.select().from(charitiesTable);
  res.json(all);
});

router.post("/charity", requireAdmin, async (req, res): Promise<void> => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const successStories = req.body?.successStories ? String(req.body.successStories).trim() : null;
  const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl).trim() : null;
  const goalAmount = Number(req.body?.goalAmount ?? 0);
  const isTodaysFeatured = !!req.body?.isTodaysFeatured;

  if (!name || !description) {
    res.status(400).json({ error: "name and description are required" });
    return;
  }
  if (!Number.isInteger(goalAmount) || goalAmount < 0) {
    res.status(400).json({ error: "goalAmount must be a non-negative whole number" });
    return;
  }

  if (isTodaysFeatured) {
    await db.update(charitiesTable).set({ isTodaysFeatured: false });
  }

  const [charity] = await db.insert(charitiesTable).values({
    name,
    description,
    successStories,
    imageUrl,
    goalAmount,
    raisedAmount: 0,
    isTodaysFeatured,
    isActive: true,
  }).returning();

  const actorName = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("charity", `Created charity spotlight "${charity.name}"`, actorName);
  res.status(201).json(charity);
});

router.get("/charity/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [charity] = await db.select().from(charitiesTable).where(and(
    eq(charitiesTable.id, id),
    eq(charitiesTable.isActive, true),
  ));
  if (!charity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(charity);
});

router.patch("/charity/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { name, description, successStories, imageUrl, goalAmount, isTodaysFeatured, isActive } = req.body;
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) { res.status(400).json({ error: "name required" }); return; }
    updates.name = clean;
  }
  if (description !== undefined) {
    const clean = String(description).trim();
    if (!clean) { res.status(400).json({ error: "description required" }); return; }
    updates.description = clean;
  }
  if (successStories !== undefined) updates.successStories = successStories ? String(successStories).trim() : null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl ? String(imageUrl).trim() : null;
  if (goalAmount !== undefined) {
    const goal = Number(goalAmount);
    if (!Number.isInteger(goal) || goal < 0) {
      res.status(400).json({ error: "goalAmount must be a non-negative whole number" });
      return;
    }
    updates.goalAmount = goal;
  }
  if (isActive !== undefined) {
    const active = !!isActive;
    updates.isActive = active;
    if (!active) updates.isTodaysFeatured = false;
  }

  if (isTodaysFeatured !== undefined) {
    const featured = !!isTodaysFeatured;
    if (featured) {
      if (isActive === false) {
        res.status(400).json({ error: "Archived charity cannot be featured" });
        return;
      }
      await db.update(charitiesTable).set({ isTodaysFeatured: false });
      updates.isActive = true;
    }
    updates.isTodaysFeatured = featured;
  }

  const [charity] = await db.update(charitiesTable)
    .set(updates)
    .where(eq(charitiesTable.id, id))
    .returning();

  if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== charity.imageUrl) {
    await deleteManagedMediaUrl(existing.imageUrl);
  }

  const actorName = await resolveMemberDisplayName(getSessionUserId(req)!);
  if (isActive !== undefined && !!isActive !== existing.isActive) {
    await logActivity(
      "charity",
      !!isActive ? `Reactivated charity spotlight "${charity.name}"` : `Archived charity spotlight "${charity.name}"`,
      actorName,
    );
  }

  res.json(charity);
});

router.post("/charity/:id/donate", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const charityId = parseInt(raw, 10);
  const amount = Number(req.body?.amount);
  const donorName = req.body?.donorName ? String(req.body.donorName).trim().slice(0, 160) : null;

  if (!Number.isInteger(amount) || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive whole-dollar number" });
    return;
  }

  const [charity] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, charityId));
  if (!charity) { res.status(404).json({ error: "Charity not found" }); return; }

  const [donation] = await db.insert(donationsTable).values({
    charityId,
    amount,
    donorName,
  }).returning();

  await db.update(charitiesTable)
    .set({ raisedAmount: sql`${charitiesTable.raisedAmount} + ${amount}` })
    .where(eq(charitiesTable.id, charityId));

  const actorName = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("donation", `Recorded a $${amount.toLocaleString()} offline donation for "${charity.name}"`, actorName);

  res.status(201).json(donation);
});

export default router;
