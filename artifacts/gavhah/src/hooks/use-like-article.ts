import { useState, useCallback } from "react";

const STORAGE_KEY = "gavhah:liked-articles";

function getLikedSet(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveLikedSet(s: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

export function useLikeArticle(articleId: number, initialLikeCount: number) {
  const liked = getLikedSet().has(articleId);
  const [isLiked, setIsLiked] = useState(liked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [pending, setPending] = useState(false);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const nextLiked = !isLiked;
    // Optimistic update
    setIsLiked(nextLiked);
    setLikeCount(c => Math.max(0, c + (nextLiked ? 1 : -1)));

    // Persist in localStorage
    const set = getLikedSet();
    if (nextLiked) set.add(articleId); else set.delete(articleId);
    saveLikedSet(set);

    setPending(true);
    try {
      const res = await fetch(`/api/news/${articleId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: nextLiked }),
      });
      if (res.ok) {
        const data = await res.json() as { likeCount: number };
        setLikeCount(data.likeCount);
      }
    } catch {
      // Revert on failure
      setIsLiked(isLiked);
      setLikeCount(initialLikeCount);
    } finally {
      setPending(false);
    }
  }, [articleId, isLiked, initialLikeCount, pending]);

  return { isLiked, likeCount, toggle, pending };
}
