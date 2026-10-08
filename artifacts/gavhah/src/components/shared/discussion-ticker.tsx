import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowBigUp, MessageCircle, MessagesSquare } from "lucide-react";
import { useListDiscussions } from "@workspace/api-client-react";
import { useLanguage } from "@/context/language-context";

export function DiscussionTicker({ excludeId }: { excludeId?: number }) {
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const { data } = useListDiscussions({});
  const items = useMemo(
    () => (Array.isArray(data) ? data : [])
      .filter((item: any) => !excludeId || item.id !== excludeId)
      .slice(0, 20),
    [data, excludeId],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex(current => (current + 1) % items.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;
  const item: any = items[index % items.length];

  return (
    <div className="border-y bg-card/75">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0 text-sm">
          <div className="hidden sm:flex items-center gap-1.5 text-secondary font-semibold shrink-0">
            <MessagesSquare className="h-4 w-4" />
            <span>{yi ? "אנדערע דיסקוסיעס" : "Other Discussions"}</span>
          </div>
          <span className="hidden sm:block text-border">|</span>
          <Link
            key={item.id}
            href={`/forum/${item.id}`}
            className="min-w-0 flex-1 flex items-center gap-2 hover:text-secondary transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <span className="shrink-0 rounded-full bg-secondary/10 text-secondary px-2 py-0.5 text-[11px] font-semibold">
              {String(item.category || (yi ? "שמועס" : "Discussion")).replaceAll("_", " ")}
            </span>
            <span className="font-semibold truncate">{item.title}</span>
            <span className="ml-auto shrink-0 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ArrowBigUp className="h-3.5 w-3.5" /> {item.likes ?? 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" /> {item.commentCount ?? 0}
              </span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
