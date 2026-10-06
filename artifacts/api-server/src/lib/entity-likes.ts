import { and, count, eq } from "drizzle-orm";
import { db, entityLikesTable } from "@workspace/db";

export async function getLikeState(userId: number, entityType: string, entityId: number) {
  const [existing] = await db.select({ id: entityLikesTable.id })
    .from(entityLikesTable)
    .where(and(
      eq(entityLikesTable.userId, userId),
      eq(entityLikesTable.entityType, entityType),
      eq(entityLikesTable.entityId, entityId),
    ))
    .limit(1);

  const [total] = await db.select({ count: count() })
    .from(entityLikesTable)
    .where(and(
      eq(entityLikesTable.entityType, entityType),
      eq(entityLikesTable.entityId, entityId),
    ));

  return { liked: !!existing, count: total?.count ?? 0 };
}

export async function setLikeState(
  userId: number,
  entityType: string,
  entityId: number,
  desired?: boolean,
) {
  const current = await getLikeState(userId, entityType, entityId);
  const nextLiked = desired ?? !current.liked;
  let changed = false;

  if (nextLiked && !current.liked) {
    const inserted = await db.insert(entityLikesTable)
      .values({ userId, entityType, entityId })
      .onConflictDoNothing()
      .returning({ id: entityLikesTable.id });
    changed = inserted.length > 0;
  } else if (!nextLiked && current.liked) {
    const deleted = await db.delete(entityLikesTable).where(and(
      eq(entityLikesTable.userId, userId),
      eq(entityLikesTable.entityType, entityType),
      eq(entityLikesTable.entityId, entityId),
    )).returning({ id: entityLikesTable.id });
    changed = deleted.length > 0;
  }

  const state = await getLikeState(userId, entityType, entityId);
  return { ...state, changed, delta: changed ? (state.liked ? 1 : -1) : 0 };
}
