/** A completed follow-up is retained in history until the owner explicitly deletes it. */
export function partitionCaseFollowups<T extends { completed: boolean }>(items: readonly T[]) {
  return {
    open: items.filter(item => !item.completed),
    history: items.filter(item => item.completed),
  };
}

export function updateCaseFollowupCompletion<T extends { id: number; completed: boolean }>(
  items: readonly T[], id: number, completed: boolean,
): T[] {
  return items.map(item => item.id === id ? { ...item, completed } : item);
}

/** Delete exactly one selected follow-up. Never touch a different case's items. */
export function removeCaseFollowup<T extends { id: number }>(items: readonly T[], id: number): T[] {
  return items.filter(item => item.id !== id);
}
