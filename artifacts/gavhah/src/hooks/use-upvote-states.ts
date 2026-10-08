import { useEffect, useMemo, useState } from "react";

export function useUpvoteStates(
  entityType: string,
  ids: number[],
  enabled: boolean,
) {
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const key = useMemo(
    () => Array.from(new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))).sort((a,b) => a-b).join(","),
    [ids],
  );

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !key) {
      setLikedIds(new Set());
      return () => { cancelled = true; };
    }

    fetch(`/api/like-states/${encodeURIComponent(entityType)}?ids=${encodeURIComponent(key)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async res => {
        if (!res.ok) return { likedIds: [] as number[] };
        return res.json() as Promise<{ likedIds?: number[] }>;
      })
      .then(data => {
        if (!cancelled) setLikedIds(new Set(Array.isArray(data.likedIds) ? data.likedIds : []));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [enabled, entityType, key]);

  const setLiked = (id: number, liked: boolean) => {
    setLikedIds(current => {
      const next = new Set(current);
      if (liked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return {
    likedIds,
    isLiked: (id: number) => likedIds.has(id),
    setLiked,
  };
}
