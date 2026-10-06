import { useState, useCallback, useEffect } from "react";

export function useLikeArticle(articleId: number, initialLikeCount: number) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLikeCount(initialLikeCount);
  }, [initialLikeCount]);

  useEffect(() => {
    let active = true;
    fetch(`/api/likes/news/${articleId}`, { credentials: "include" })
      .then(async res => {
        if (!res.ok || !active) return;
        const data = await res.json() as { liked: boolean };
        setIsLiked(data.liked);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [articleId]);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const previousLiked = isLiked;
    const previousCount = likeCount;
    const nextLiked = !previousLiked;
    setIsLiked(nextLiked);
    setLikeCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    setPending(true);

    try {
      const res = await fetch(`/api/news/${articleId}/like`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: nextLiked }),
      });
      if (!res.ok) throw new Error("Like failed");
      const data = await res.json() as { likeCount: number; liked?: boolean };
      setLikeCount(data.likeCount);
      if (typeof data.liked === "boolean") setIsLiked(data.liked);
    } catch {
      setIsLiked(previousLiked);
      setLikeCount(previousCount);
    } finally {
      setPending(false);
    }
  }, [articleId, isLiked, likeCount, pending]);

  return { isLiked, likeCount, toggle, pending };
}
