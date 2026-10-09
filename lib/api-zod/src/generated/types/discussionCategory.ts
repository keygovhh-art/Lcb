/** Free-text discussion topics. Kept as an alias for generated API compatibility. */
export type DiscussionCategory = string;

// Old named constants are retained for backwards imports only.
// They are not a fixed list of selectable topics.
export const DiscussionCategory = {
  medical: 'medical',
  shidduchim: 'shidduchim',
  livelihood: 'livelihood',
  education: 'education',
  charity: 'charity',
  community: 'community',
  general: 'general',
} as const;
