/** Public byline choice must never authorize an account or an arbitrary name. */
export const ANONYMOUS_POSTING_NAME = "Anonymous";

export function resolveRequestedPublicName(
  member: { name?: string | null; nickname?: string | null } | null,
  requested: unknown,
): string {
  const full = member?.name?.trim() || "";
  const nick = member?.nickname?.trim() || "";
  const fallback = nick || full || "Community Member";
  if (typeof requested !== "string") return fallback;
  const selected = requested.trim();
  if (selected === ANONYMOUS_POSTING_NAME) return ANONYMOUS_POSTING_NAME;
  if (selected && (selected === full || selected === nick)) return selected;
  return fallback;
}

/** Keep authorId inside the database but hide it in anonymous public responses. */
export function publicPostForViewer<T extends { authorId: number | null; authorName: string }>(
  row: T,
  viewerId?: number | null,
  viewerRole?: string | null,
): T | (Omit<T, "authorId"> & { authorId: null }) {
  if (row.authorName !== ANONYMOUS_POSTING_NAME ||
      (viewerId != null && row.authorId === viewerId) ||
      viewerRole === "admin" || viewerRole === "moderator" || viewerRole === "super_admin") {
    return row;
  }
  return { ...row, authorId: null };
}
