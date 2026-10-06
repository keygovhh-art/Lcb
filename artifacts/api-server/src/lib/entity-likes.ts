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

  if (nextLiked && !current.liked) {
    await db.insert(entityLikesTable).values({ userId, entityType, entityId }).onConflictDoNothing();
  } else if (!nextLiked && current.liked) {
    await db.delete(entityLikesTable).where(and(
      eq(entityLikesTable.userId, userId),
      eq(entityLikesTable.entityType, entityType),
      eq(entityLikesTable.entityId, entityId),
    ));
  }

  return getLikeState(userId, entityType, entityId);
}
