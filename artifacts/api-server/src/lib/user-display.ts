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

/**
 * Posting identity must come from the authenticated owner, not any
 * client-provided name. Beneficiary/reference fields on confidential
 * help requests remain separate, freely editable content.
 */
export async function resolveMemberDisplayName(userId: number, _requested?: string | null) {
  const user = await getMemberIdentity(userId);
  if (!user) return "Community Member";
  return user.nickname?.trim() || user.name?.trim() || "Community Member";
}
