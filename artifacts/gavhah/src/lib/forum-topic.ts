/** Legacy fixed categories should not appear as forced topics after the free-text update. */
const LEGACY_PRESETS = new Set(["medical", "shidduchim", "livelihood", "education", "charity", "community", "general"]);
export function visibleForumTopic(value: string | null | undefined): string {
  const topic = String(value ?? "").trim();
  return !topic || LEGACY_PRESETS.has(topic.toLowerCase()) ? "" : topic;
}
