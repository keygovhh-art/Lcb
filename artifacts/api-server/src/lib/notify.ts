import { db, notificationsTable } from "@workspace/db";

export async function notifyUser(
  userId: number,
  type: string,
  message: string,
  linkUrl?: string | null,
) {
  await db.insert(notificationsTable).values({
    userId,
    type,
    message,
    linkUrl: linkUrl ?? null,
    isRead: false,
  });
}
