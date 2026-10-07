import { Router, type IRouter } from "express";
import { requireAuth, getSessionUserId } from "../middlewares/auth";
import { getLikeState } from "../lib/entity-likes";

const router: IRouter = Router();

const LIKE_TYPES = new Set(["news", "discussion", "comment", "group_post", "minyan"]);

router.get("/likes/:entityType/:entityId", requireAuth, async (req, res): Promise<void> => {
  const entityType = String(req.params.entityType);
  const entityId = Number(req.params.entityId);
  if (!LIKE_TYPES.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ error: "Invalid like target" });
    return;
  }

  const state = await getLikeState(getSessionUserId(req)!, entityType, entityId);
  res.json(state);
});

export default router;
