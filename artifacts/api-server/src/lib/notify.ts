import { db, notificationsTable, usersTable, supportMessagesTable } from "@workspace/db";

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


export async function queueStaffReview(input: {
  userId?: number | null;
  name: string;
  contact?: string | null;
  type: string;
  subject: string;
  message: string;
  notificationType?: string;
}) {
  const [created] = await db.insert(supportMessagesTable).values({
    userId: input.userId ?? null,
    name: input.name.slice(0, 120),
    email: (input.contact || "Gavhah member").slice(0, 200),
    type: input.type.slice(0, 40),
    subject: input.subject.slice(0, 200),
    message: input.message.slice(0, 5000),
    status: "open",
  }).returning();

  await notifyStaff(
    input.subject,
    "/founder",
    input.notificationType || "admin_inbox",
  );

  return created;
}
