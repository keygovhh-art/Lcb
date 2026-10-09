import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Megaphone, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type PinnedAnnouncement = {
  id: number;
  newsId: number;
  label: string;
  headline: string;
  summary: string;
  priority: number;
  rotationSeconds: number;
  news: {
    id: number;
    title: string;
    summary: string | null;
    category: string;
    urgency: string;
  };
};

async function loadPinnedAnnouncements(): Promise<PinnedAnnouncement[]> {
  const res = await fetch("/api/pinned-announcements", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not load pinned announcements");
  return res.json();
}

export function PinnedAnnouncementBar() {
  const { data = [] } = useQuery({
    queryKey: ["/api/pinned-announcements"],
    queryFn: loadPinnedAnnouncements,
    staleTime: 30_000,
  });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= data.length) setIndex(0);
  }, [data.length, index]);

  useEffect(() => {
    if (data.length <= 1) return;
    const current = data[index % data.length];
    const timer = window.setTimeout(() => {
      setIndex(value => (value + 1) % data.length);
    }, Math.max(2, Math.min(30, current?.rotationSeconds ?? 5)) * 1000);
    return () => window.clearTimeout(timer);
  }, [data, index]);

  if (!data.length) return null;
  const current = data[index % data.length];

  return (
    <section className="border-b bg-accent/10">
      <Link href={`/news/${current.newsId}`}>
        <div className="group container mx-auto flex min-w-0 cursor-pointer items-center gap-3 px-4 py-4 sm:py-5">
          <div className="flex shrink-0 items-center gap-2 rounded-full bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent-foreground">
            <Megaphone className="h-3.5 w-3.5" />
            <span>{current.label || "Announcement"}</span>
          </div>

          <div className="min-w-0 flex-1">
            <p
              key={current.id}
              className="truncate text-sm font-medium text-foreground animate-in fade-in duration-300"
            >
              {current.headline}
              {current.summary ? <span className="font-normal text-muted-foreground"> — {current.summary}</span> : null}
            </p>
          </div>

          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-secondary" />
        </div>
      </Link>

      {data.length > 1 && (
        <div className="container mx-auto flex justify-center gap-1.5 px-4 pb-2">
          {data.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show pinned announcement ${itemIndex + 1}`}
              onClick={() => setIndex(itemIndex)}
              className={`h-1.5 rounded-full transition-all ${
                itemIndex === index ? "w-5 bg-secondary" : "w-1.5 bg-secondary/25"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
