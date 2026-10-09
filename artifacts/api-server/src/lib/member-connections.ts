import { and, desc, eq } from "drizzle-orm";
import { db, supportMessagesTable } from "@workspace/db";

export const CONNECTION_META_TYPE = "__member_connection_meta__";

export type ConnectionStage =
  | "new"
  | "invited"
  | "accepted"
  | "contact_problem"
  | "declined"
  | "connected"
  | "closed_unfulfilled";

export type ConnectionState = {
  volunteerId: number;
  volunteerUserId: number;
  requesterUserId: number;
  stage: ConnectionStage;
  invitedAt: string | null;
  respondedAt: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  closureReason: string | null;
  contactIssue: string | null;
  contactFollowups: Array<{ note: string; actorId: number; at: string }>;
  consentMethod: "in_app" | "staff_verified_phone" | "staff_verified_in_person" | null;
  consentNote: string | null;
  consentVerifiedBy: number | null;
  updatedBy: number | null;
};

export function newConnectionState(input: {
  volunteerId: number;
  volunteerUserId: number;
  requesterUserId: number;
}): ConnectionState {
  return {
    ...input,
    stage: "new",
    invitedAt: null,
    respondedAt: null,
    confirmedAt: null,
    closedAt: null,
    closureReason: null,
    contactIssue: null,
    contactFollowups: [],
    consentMethod: null,
    consentNote: null,
    consentVerifiedBy: null,
    updatedBy: null,
  };
}

function parseConnectionState(raw: string): ConnectionState | null {
  try {
    const value = JSON.parse(raw);
    if (
      !Number.isSafeInteger(value.volunteerId) || value.volunteerId <= 0 ||
      !Number.isSafeInteger(value.volunteerUserId) || value.volunteerUserId <= 0 ||
      !Number.isSafeInteger(value.requesterUserId) || value.requesterUserId <= 0 ||
      !["new", "invited", "accepted", "contact_problem", "declined", "connected", "closed_unfulfilled"].includes(value.stage)
    ) return null;
    return {
      volunteerId: value.volunteerId,
      volunteerUserId: value.volunteerUserId,
      requesterUserId: value.requesterUserId,
      stage: value.stage,
      invitedAt: typeof value.invitedAt === "string" ? value.invitedAt : null,
      respondedAt: typeof value.respondedAt === "string" ? value.respondedAt : null,
      confirmedAt: typeof value.confirmedAt === "string" ? value.confirmedAt : null,
      closedAt: typeof value.closedAt === "string" ? value.closedAt : null,
      closureReason: typeof value.closureReason === "string" ? value.closureReason : null,
      contactIssue: typeof value.contactIssue === "string" ? value.contactIssue : null,
      contactFollowups: Array.isArray(value.contactFollowups)
        ? value.contactFollowups.filter((entry: any) => entry && typeof entry.note === "string" &&
          Number.isSafeInteger(entry.actorId) && typeof entry.at === "string").slice(-50)
        : [],
      consentMethod: ["in_app", "staff_verified_phone", "staff_verified_in_person"].includes(value.consentMethod)
        ? value.consentMethod : null,
      consentNote: typeof value.consentNote === "string" ? value.consentNote : null,
      consentVerifiedBy: Number.isSafeInteger(value.consentVerifiedBy) ? value.consentVerifiedBy : null,
      updatedBy: Number.isSafeInteger(value.updatedBy) ? value.updatedBy : null,
    };
  } catch { return null; }
}

export async function getConnectionMeta(requestId: number) {
  const [row] = await db.select().from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.type, CONNECTION_META_TYPE),
      eq(supportMessagesTable.subject, `support:${requestId}`),
    ))
    .orderBy(desc(supportMessagesTable.id))
    .limit(1);
  return { row: row ?? null, state: row ? parseConnectionState(row.message) : null };
}

export async function createConnectionMeta(requestId: number, state: ConnectionState) {
  await db.insert(supportMessagesTable).values({
    userId: state.requesterUserId,
    name: "Member Connection Workflow",
    email: "connections@internal.invalid",
    type: CONNECTION_META_TYPE,
    subject: `support:${requestId}`,
    message: JSON.stringify(state),
    status: "resolved",
  });
}

/**
 * Compare-and-swap guards against two people answering or closing the same
 * request at the same time. Return false on a conflicting update.
 */
export async function updateConnectionMeta(
  row: typeof supportMessagesTable.$inferSelect,
  next: ConnectionState,
): Promise<boolean> {
  const [changed] = await db.update(supportMessagesTable)
    .set({ message: JSON.stringify(next) })
    .where(and(
      eq(supportMessagesTable.id, row.id),
      eq(supportMessagesTable.message, row.message),
      eq(supportMessagesTable.type, CONNECTION_META_TYPE),
    ))
    .returning({ id: supportMessagesTable.id });
  return Boolean(changed);
}

/**
 * Close the staff work item in the same transaction as the consent-state
 * change. A network interruption cannot leave an apparently successful
 * connection in the still-open staff queue.
 */
export async function finishConnection(
  requestId: number,
  metaRow: typeof supportMessagesTable.$inferSelect,
  next: ConnectionState,
): Promise<boolean> {
  return db.transaction(async tx => {
    const [updated] = await tx.update(supportMessagesTable)
      .set({ message: JSON.stringify(next) })
      .where(and(
        eq(supportMessagesTable.id, metaRow.id),
        eq(supportMessagesTable.message, metaRow.message),
        eq(supportMessagesTable.type, CONNECTION_META_TYPE),
      ))
      .returning({ id: supportMessagesTable.id });
    if (!updated) return false;

    const [closed] = await tx.update(supportMessagesTable)
      .set({ status: "resolved" })
      .where(and(
        eq(supportMessagesTable.id, requestId),
        eq(supportMessagesTable.type, "volunteer_contact"),
        eq(supportMessagesTable.status, "open"),
      ))
      .returning({ id: supportMessagesTable.id });
    if (!closed) throw new Error("Request was already closed; state update rolled back");
    return true;
  });
}
