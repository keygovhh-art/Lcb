import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export async function getMemberIdentity(userId: number) {
  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    nickname: usersTable.nickname,
    email: usersTable.email,
    phone: usersTable.phone,
  }).from(usersTable).where(eq(usersTable.id, userId));

  return user ?? null;
}

export async function resolveMemberDisplayName(userId: number, requested?: string | null) {
  const user = await getMemberIdentity(userId);
  if (!user) return "Community Member";

  const allowed = [user.nickname, user.name].filter((v): v is string => !!v?.trim());
  const cleanRequested = requested?.trim();
  if (cleanRequested === "Anonymous") return "Anonymous";
  if (cleanRequested && allowed.includes(cleanRequested)) return cleanRequested;

  return user.nickname || user.name || "Community Member";
}
