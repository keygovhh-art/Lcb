import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, causeSupportersTable, supportMessagesTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName, getMemberIdentity } from "../lib/user-display";
import { notifyStaff } from "../lib/notify";

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
  const supporterMessage = req.body?.message ? String(req.body.message).trim().slice(0, 1500) : null;
  const supporterLocation = req.body?.location ? String(req.body.location).trim().slice(0, 200) : null;
  const [supporter] = await db.insert(causeSupportersTable).values({
    causeType,
    name: safeName,
    pledgeType,
    pledgeAmount: pledgeAmount === null ? null : String(pledgeAmount),
    message: supporterMessage,
    location: supporterLocation,
  }).returning();

  const joiningUser = await getMemberIdentity(userId);
  await db.insert(supportMessagesTable).values({
    userId,
    name: safeName,
    email: joiningUser?.email || joiningUser?.phone || "Gavhah member",
    type: "cause_support",
    subject: `Cause response: ${causeType}`,
    message: [
      `Member: ${safeName}`,
      `Pledge type: ${pledgeType}`,
      pledgeAmount !== null ? `Amount: ${pledgeAmount}` : "",
      supporterLocation ? `Location: ${supporterLocation}` : "",
      supporterMessage ? `Message: ${supporterMessage}` : "",
    ].filter(Boolean).join("\n"),
    status: "open",
  });

  res.status(201).json(supporter);
});

export default router;
