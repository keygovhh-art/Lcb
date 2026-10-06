import { Router, type IRouter } from "express";
import { requireAuth, getSessionUserId } from "../middlewares/auth";
import { getLikeState } from "../lib/entity-likes";

const router: IRouter = Router();

router.get("/likes/:entityType/:entityId", requireAuth, async (req, res): Promise<void> => {
  const entityType = String(req.params.entityType);
  const entityId = Number(req.params.entityId);
  if (!entityType || !Number.isFinite(entityId)) {
    res.status(400).json({ error: "Invalid like target" });
    return;
  }

  const state = await getLikeState(getSessionUserId(req)!, entityType, entityId);
  res.json(state);
});

export default router;
