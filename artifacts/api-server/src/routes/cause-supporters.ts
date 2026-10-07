import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, causeSupportersTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName } from "../lib/user-display";

const router: IRouter = Router();

router.get("/cause-supporters", requireAdmin, async (req, res): Promise<void> => {
  const { causeType } = req.query as Record<string, string>;
  let all = await db.select().from(causeSupportersTable).orderBy(desc(causeSupportersTable.createdAt));
  if (causeType) all = all.filter(s => s.causeType === causeType);
  res.json(all);
});

router.post("/cause-supporters", requireAuth, async (req, res): Promise<void> => {
  const causeType = String(req.body?.causeType || "").trim();
  const pledgeType = String(req.body?.pledgeType || "");
  const rawPledgeAmount = req.body?.pledgeAmount;

  if (!causeType || causeType.length > 120) {
    res.status(400).json({ error: "valid causeType is required" });
    return;
  }
  if (!["financial", "volunteer", "both", "items", "coordination"].includes(pledgeType)) {
    res.status(400).json({ error: "invalid pledgeType" });
    return;
  }

  let pledgeAmount: number | null = null;
  if (pledgeType === "financial" || pledgeType === "both") {
    if (rawPledgeAmount !== undefined && rawPledgeAmount !== null && rawPledgeAmount !== "") {
      const parsed = Number(rawPledgeAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        res.status(400).json({ error: "pledgeAmount must be greater than zero" });
        return;
      }
      pledgeAmount = parsed;
    }
  }

  const userId = getSessionUserId(req)!;
  const safeName = await resolveMemberDisplayName(userId, req.body?.name);
  const [supporter] = await db.insert(causeSupportersTable).values({
    causeType,
    name: safeName,
    pledgeType,
    pledgeAmount: pledgeAmount === null ? null : String(pledgeAmount),
    message: req.body?.message ? String(req.body.message).trim().slice(0, 1500) : null,
    location: req.body?.location ? String(req.body.location).trim().slice(0, 200) : null,
  }).returning();

  res.status(201).json(supporter);
});

export default router;
