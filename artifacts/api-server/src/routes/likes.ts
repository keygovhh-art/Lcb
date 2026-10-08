import { Router, type IRouter } from "express";
import { requireAuth, getSessionUserId } from "../middlewares/auth";
import { getLikeState } from "../lib/entity-likes";
import { db, entityLikesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

const LIKE_TYPES = new Set(["news", "discussion", "comment", "group_post", "minyan"]);

router.get("/like-states/:entityType", requireAuth, async (req, res): Promise<void> => {
  const entityType = String(req.params.entityType);
  if (!LIKE_TYPES.has(entityType)) {
    res.status(400).json({ error: "Invalid upvote target" });
    return;
  }

  const ids = String(req.query.ids || "")
    .split(",")
    .map(value => Number(value))
    .filter(value => Number.isSafeInteger(value) && value > 0)
    .slice(0, 250);

  if (ids.length === 0) {
    res.json({ likedIds: [] });
    return;
  }

  const rows = await db.select({ entityId: entityLikesTable.entityId })
    .from(entityLikesTable)
    .where(and(
      eq(entityLikesTable.userId, getSessionUserId(req)!),
      eq(entityLikesTable.entityType, entityType),
      inArray(entityLikesTable.entityId, ids),
    ));

  res.json({ likedIds: rows.map(row => row.entityId) });
});

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
