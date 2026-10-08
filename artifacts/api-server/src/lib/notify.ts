import { db, notificationsTable, usersTable } from "@workspace/db";

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


export async function notifyStaff(
  message: string,
  linkUrl = "/founder",
  type = "admin_inbox",
) {
  const users = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    status: usersTable.status,
  }).from(usersTable);

  const staffIds = users
    .filter(user => user.status === "active" && (user.role === "admin" || user.role === "moderator"))
    .map(user => user.id);

  if (staffIds.length === 0) return;

  await db.insert(notificationsTable).values(
    staffIds.map(userId => ({
      userId,
      type,
      message,
      linkUrl,
      isRead: false,
    }))
  );
}
