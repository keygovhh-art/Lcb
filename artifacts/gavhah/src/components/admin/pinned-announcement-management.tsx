import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Megaphone, Pin, PinOff, RefreshCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type NewsItem = {
  id: number;
  title: string;
  summary: string | null;
  category: string;
  urgency: string;
  createdAt: string;
};

type PinItem = {
  id: number;
  newsId: number;
  label: string;
  headline: string;
  summary: string;
  priority: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  rotationSeconds: number;
  updatedAt: string;
  updatedBy: number;
  activeNow: boolean;
  news: NewsItem | null;
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function displayTitle(pin: PinItem, newsTitle?: string) {
  return pin.headline || newsTitle || pin.news?.title || "Pinned announcement";
}

export function PinnedAnnouncementManagement() {
  const { toast } = useToast();
  const [pins, setPins] = useState<PinItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [editing, setEditing] = useState<Record<number, PinItem>>({});

  const [newsId, setNewsId] = useState("");
  const [label, setLabel] = useState("Announcement");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [priority, setPriority] = useState("50");
  const [rotationSeconds, setRotationSeconds] = useState("5");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [enabled, setEnabled] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [pinsRes, newsRes] = await Promise.all([
        fetch("/api/admin/pinned-announcements", { credentials: "include", cache: "no-store" }),
        fetch("/api/news", { credentials: "include", cache: "no-store" }),
      ]);
      if (!pinsRes.ok) throw new Error("Could not load pinned announcements");
      if (!newsRes.ok) throw new Error("Could not load News posts");

      const pinRows = await pinsRes.json() as PinItem[];
      const newsRows = await newsRes.json() as NewsItem[];
      setPins(pinRows);
      setNews(newsRows);

      const nextEditing: Record<number, PinItem> = {};
      for (const pin of pinRows) nextEditing[pin.id] = { ...pin };
      setEditing(nextEditing);
    } catch (error) {
      toast({
        title: "Could not load pinned announcements",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const pinnedNewsIds = useMemo(() => new Set(pins.map(pin => pin.newsId)), [pins]);
  const availableNews = useMemo(
    () => news.filter(item => !pinnedNewsIds.has(item.id)),
    [news, pinnedNewsIds],
  );

  const selectedNews = news.find(item => item.id === Number(newsId)) ?? null;

  useEffect(() => {
    if (!selectedNews) return;
    if (!headline.trim()) setHeadline(selectedNews.title);
    if (!summary.trim() && selectedNews.summary) setSummary(selectedNews.summary);
  }, [newsId]);

  const create = async () => {
    if (!newsId) {
      toast({ title: "Choose an official News post first", variant: "destructive" });
      return;
    }
    setBusyId("new");
    try {
      const res = await fetch("/api/admin/pinned-announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsId: Number(newsId),
          label: label.trim() || "Announcement",
          headline: headline.trim(),
          summary: summary.trim(),
          priority: Number(priority) || 0,
          rotationSeconds: Number(rotationSeconds) || 5,
          startAt: toIsoOrNull(startAt),
          endAt: toIsoOrNull(endAt),
          enabled,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not pin announcement");

      toast({ title: "Pinned announcement created", description: "It is ready for the home announcement bar." });
      setNewsId("");
      setLabel("Announcement");
      setHeadline("");
      setSummary("");
      setPriority("50");
      setRotationSeconds("5");
      setStartAt("");
      setEndAt("");
      setEnabled(true);
      await load();
    } catch (error) {
      toast({
        title: "Could not pin announcement",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const patch = async (id: number, changes?: Partial<PinItem>) => {
    const current = editing[id] || pins.find(pin => pin.id === id);
    if (!current) return;
    const next = { ...current, ...changes };
    setBusyId(id);

    try {
      const res = await fetch(`/api/admin/pinned-announcements/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsId: next.newsId,
          label: next.label,
          headline: next.headline,
          summary: next.summary,
          priority: next.priority,
          enabled: next.enabled,
          startAt: next.startAt,
          endAt: next.endAt,
          rotationSeconds: next.rotationSeconds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save pin");
      toast({ title: changes?.enabled !== undefined ? (next.enabled ? "Pin activated" : "Pin paused") : "Pinned announcement saved" });
      await load();
    } catch (error) {
      toast({
        title: "Could not save pinned announcement",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/pinned-announcements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not unpin announcement");
      }
      toast({ title: "Announcement unpinned" });
      await load();
    } catch (error) {
      toast({
        title: "Could not unpin announcement",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const updateDraft = (id: number, patch: Partial<PinItem>) => {
    setEditing(current => ({
      ...current,
      [id]: { ...(current[id] || pins.find(pin => pin.id === id)!), ...patch },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Pin className="h-5 w-5 text-secondary" />
              <h3 className="font-semibold text-lg">Pinned Home Announcements</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Pin an official News post to the announcement bar on the home page. The bar is clickable and always opens the original News post.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2 shrink-0">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Official News post</label>
            <select
              value={newsId}
              onChange={event => {
                setNewsId(event.target.value);
                setHeadline("");
                setSummary("");
              }}
              className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose a News post...</option>
              {availableNews.map(item => (
                <option key={item.id} value={item.id}>
                  #{item.id} · {item.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Badge / label</label>
            <Input value={label} onChange={event => setLabel(event.target.value)} className="mt-1 h-11" placeholder="Announcement" />
          </div>

          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Home-bar headline</label>
            <Input
              value={headline}
              onChange={event => setHeadline(event.target.value)}
              className="mt-1 h-11"
              placeholder={selectedNews?.title || "Leave blank to use the News title"}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Short home-bar text</label>
            <Textarea
              value={summary}
              onChange={event => setSummary(event.target.value)}
              className="mt-1 min-h-20 resize-none"
              placeholder={selectedNews?.summary || "Optional short text"}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Priority (0–100)</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={priority}
              onChange={event => setPriority(event.target.value)}
              className="mt-1 h-11"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Higher priority appears first.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Seconds before next pinned announcement</label>
            <Input
              type="number"
              min={2}
              max={30}
              value={rotationSeconds}
              onChange={event => setRotationSeconds(event.target.value)}
              className="mt-1 h-11"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Start showing</label>
            <Input type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} className="mt-1 h-11" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Stop showing</label>
            <Input type="datetime-local" value={endAt} onChange={event => setEndAt(event.target.value)} className="mt-1 h-11" />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={enabled ? "secondary" : "outline"}
            onClick={() => setEnabled(value => !value)}
            className="gap-2"
          >
            {enabled ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            {enabled ? "Active when schedule allows" : "Create paused"}
          </Button>

          <Button
            type="button"
            onClick={() => void create()}
            disabled={busyId === "new" || !newsId}
            className="gap-2"
          >
            <Megaphone className="h-4 w-4" />
            {busyId === "new" ? "Pinning..." : "Pin to Home"}
          </Button>
        </div>

        {selectedNews && (
          <div className="mt-5 rounded-xl border bg-accent/5 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Preview</p>
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded-full bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent-foreground">
                {label || "Announcement"}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{headline || selectedNews.title}</span>
                {(summary || selectedNews.summary) ? <span className="text-muted-foreground"> — {summary || selectedNews.summary}</span> : null}
              </p>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {pins.map(pin => {
          const draft = editing[pin.id] || pin;
          const draftNews = news.find(item => item.id === draft.newsId) ?? pin.news;
          return (
            <div key={pin.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-col xl:flex-row xl:items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Badge variant={pin.activeNow ? "default" : "outline"}>
                      {pin.activeNow ? "LIVE NOW" : pin.enabled ? "SCHEDULED / INACTIVE" : "PAUSED"}
                    </Badge>
                    <Badge variant="secondary">Priority {pin.priority}</Badge>
                    {!pin.news && <Badge variant="destructive">News post missing</Badge>}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="text-xs text-muted-foreground">
                      Official News post
                      <select
                        value={draft.newsId}
                        onChange={event => updateDraft(pin.id, { newsId: Number(event.target.value) })}
                        className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                      >
                        {news.map(item => (
                          <option key={item.id} value={item.id}>#{item.id} · {item.title}</option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs text-muted-foreground">
                      Badge / label
                      <Input value={draft.label} onChange={event => updateDraft(pin.id, { label: event.target.value })} className="mt-1 h-10" />
                    </label>

                    <label className="md:col-span-2 text-xs text-muted-foreground">
                      Home-bar headline
                      <Input value={draft.headline} onChange={event => updateDraft(pin.id, { headline: event.target.value })} className="mt-1 h-10" />
                    </label>

                    <label className="md:col-span-2 text-xs text-muted-foreground">
                      Short text
                      <Textarea value={draft.summary} onChange={event => updateDraft(pin.id, { summary: event.target.value })} className="mt-1 min-h-16 resize-none" />
                    </label>

                    <label className="text-xs text-muted-foreground">
                      Priority
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.priority}
                        onChange={event => updateDraft(pin.id, { priority: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
                        className="mt-1 h-10"
                      />
                    </label>

                    <label className="text-xs text-muted-foreground">
                      Rotation seconds
                      <Input
                        type="number"
                        min={2}
                        max={30}
                        value={draft.rotationSeconds}
                        onChange={event => updateDraft(pin.id, { rotationSeconds: Math.max(2, Math.min(30, Number(event.target.value) || 5)) })}
                        className="mt-1 h-10"
                      />
                    </label>

                    <label className="text-xs text-muted-foreground">
                      Start
                      <Input
                        type="datetime-local"
                        value={toLocalInput(draft.startAt)}
                        onChange={event => updateDraft(pin.id, { startAt: toIsoOrNull(event.target.value) })}
                        className="mt-1 h-10"
                      />
                    </label>

                    <label className="text-xs text-muted-foreground">
                      End
                      <Input
                        type="datetime-local"
                        value={toLocalInput(draft.endAt)}
                        onChange={event => updateDraft(pin.id, { endAt: toIsoOrNull(event.target.value) })}
                        className="mt-1 h-10"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-xl border bg-accent/5 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 rounded-full bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent-foreground">
                        {draft.label || "Announcement"}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm">
                        <span className="font-medium">{displayTitle(draft, draftNews?.title)}</span>
                        {draft.summary ? <span className="text-muted-foreground"> — {draft.summary}</span> : null}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex xl:w-44 flex-row xl:flex-col flex-wrap gap-2 shrink-0">
                  <Button
                    type="button"
                    variant={draft.enabled ? "secondary" : "outline"}
                    size="sm"
                    disabled={busyId === pin.id}
                    onClick={() => {
                      updateDraft(pin.id, { enabled: !draft.enabled });
                      void patch(pin.id, { enabled: !draft.enabled });
                    }}
                    className="gap-1.5"
                  >
                    {draft.enabled ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                    {draft.enabled ? "Active" : "Paused"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === pin.id || !draftNews}
                    onClick={() => void patch(pin.id)}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {busyId === pin.id ? "Saving..." : "Save"}
                  </Button>

                  {draftNews && (
                    <a href={`/news/${draft.newsId}`} target="_blank" rel="noreferrer">
                      <Button type="button" variant="outline" size="sm" className="w-full gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Open News
                      </Button>
                    </a>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === pin.id}
                    onClick={() => void remove(pin.id)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Unpin
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && pins.length === 0 && (
          <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            No pinned home announcements yet. Choose an official News post above.
          </div>
        )}
      </div>
    </div>
  );
}
