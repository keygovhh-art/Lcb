import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, causeSupportersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/cause-supporters", async (req, res): Promise<void> => {
  const { causeType } = req.query as Record<string, string>;
  let all = await db.select().from(causeSupportersTable).orderBy(desc(causeSupportersTable.createdAt));
  if (causeType) all = all.filter(s => s.causeType === causeType);
  res.json(all);
});

router.post("/cause-supporters", requireAuth, async (req, res): Promise<void> => {
  const { causeType, name, pledgeType, pledgeAmount, message, location } = req.body;
  if (!causeType || !name || !pledgeType) {
    res.status(400).json({ error: "causeType, name, and pledgeType are required" });
    return;
  }
  const [supporter] = await db.insert(causeSupportersTable).values({
    causeType,
    name,
    pledgeType,
    pledgeAmount: pledgeAmount ? String(pledgeAmount) : null,
    message: message || null,
    location: location || null,
  }).returning();
  res.status(201).json(supporter);
});

export default router;
