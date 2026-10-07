import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink, History, Languages, Pencil, RefreshCcw, RotateCcw,
  Save, Search, Send, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CopyEntry = {
  id: number;
  page: string;
  lang: "en" | "yi";
  source: string;
  publishedValue: string | null;
  draftValue: string | null;
  updatedBy: number | null;
  publishedBy: number | null;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
};

type HistoryEntry = {
  id: number;
  previousValue: string | null;
  newValue: string | null;
  actorId: number;
  action: string;
  version: number;
  createdAt: string;
};

const KNOWN_PAGES = [
  { path: "/", label: "Home" },
  { path: "/news", label: "Chesed News" },
  { path: "/forum", label: "Askanim Forum" },
  { path: "/directory", label: "Activists Directory" },
  { path: "/united", label: "United In Kindness" },
  { path: "/communications", label: "Communications" },
  { path: "/charity", label: "Today's Cause" },
  { path: "/minyans", label: "Minyan Center" },
  { path: "/groups", label: "Groups" },
  { path: "/my", label: "My Askanus" },
  { path: "/reservations", label: "Reservations" },
  { path: "/system", label: "System Center" },
  { path: "/dashboard", label: "Koach Harabim" },
  { path: "/notifications", label: "Notifications" },
  { path: "/profile", label: "Profile" },
  { path: "/search", label: "Search" },
  { path: "/privacy", label: "Privacy" },
  { path: "/terms", label: "Terms" },
  { path: "/login", label: "Login" },
  { path: "/register", label: "Register" },
  { path: "/founder", label: "Founder Dashboard" },
];

function editorUrl(page: string, lang: "en" | "yi") {
  const base = lang === "yi" ? (page === "/" ? "/yi" : `/yi${page}`) : page;
  return `${base}?siteEdit=1`;
}

function formatStamp(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function SiteCopyManagement() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<CopyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<"all" | "en" | "yi">("all");
  const [page, setPage] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [historyFor, setHistoryFor] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [quickPage, setQuickPage] = useState("/");
  const [quickLang, setQuickLang] = useState<"en" | "yi">("en");
  const [quickSource, setQuickSource] = useState("");
  const [quickValue, setQuickValue] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/site-copy", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Could not load site copy");
      setEntries(await res.json());
    } catch (error) {
      toast({
        title: "Could not load site editor",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(item => {
      if (lang !== "all" && item.lang !== lang) return false;
      if (page !== "all" && item.page !== page) return false;
      if (!q) return true;
      return [
        item.page,
        item.source,
        item.publishedValue ?? "",
        item.draftValue ?? "",
      ].some(value => value.toLowerCase().includes(q));
    });
  }, [entries, lang, page, search]);

  const stats = useMemo(() => ({
    total: entries.length,
    published: entries.filter(item => item.publishedValue !== null).length,
    drafts: entries.filter(item => item.draftValue !== null && item.draftValue !== item.publishedValue).length,
    yiddish: entries.filter(item => item.lang === "yi").length,
    english: entries.filter(item => item.lang === "en").length,
  }), [entries]);

  const saveDraft = async (item: Pick<CopyEntry, "page" | "lang" | "source">, value: string) => {
    const res = await fetch("/api/admin/site-copy", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: item.page, lang: item.lang, source: item.source, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not save draft");
    }
  };

  const publish = async (item: Pick<CopyEntry, "page" | "lang" | "source">) => {
    const res = await fetch("/api/admin/site-copy/publish", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: item.page, lang: item.lang, source: item.source }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not publish");
    }
  };

  const saveRow = async (entry: CopyEntry, publishNow: boolean) => {
    const value = editingId === entry.id ? editingValue : (entry.draftValue ?? entry.publishedValue ?? entry.source);
    if (!value.trim()) return;

    setBusyId(entry.id);
    try {
      await saveDraft(entry, value);
      if (publishNow) await publish(entry);
      toast({ title: publishNow ? "Published live" : "Draft saved" });
      setEditingId(null);
      await load();
    } catch (error) {
      toast({
        title: "Could not save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const publishExistingDraft = async (entry: CopyEntry) => {
    setBusyId(entry.id);
    try {
      await publish(entry);
      toast({ title: "Published live" });
      await load();
    } catch (error) {
      toast({
        title: "Could not publish",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const reset = async (entry: CopyEntry) => {
    setBusyId(entry.id);
    try {
      const res = await fetch("/api/admin/site-copy/reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: entry.page, lang: entry.lang, source: entry.source }),
      });
      if (!res.ok) throw new Error("Could not restore original text");
      toast({ title: "Original text restored" });
      await load();
    } catch (error) {
      toast({
        title: "Could not restore",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const loadHistory = async (entry: CopyEntry) => {
    if (historyFor === entry.id) {
      setHistoryFor(null);
      setHistory([]);
      return;
    }
    const res = await fetch(`/api/admin/site-copy/history/${entry.id}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    setHistory(await res.json());
    setHistoryFor(entry.id);
  };

  const restoreHistory = async (entry: CopyEntry, historyId: number) => {
    setBusyId(entry.id);
    try {
      const res = await fetch("/api/admin/site-copy/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, historyId }),
      });
      if (!res.ok) throw new Error("Could not restore version");
      toast({ title: "Older version restored live" });
      await load();
      await loadHistory(entry);
    } catch (error) {
      toast({
        title: "Could not restore",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const quickSave = async (publishNow: boolean) => {
    if (!quickSource.trim() || !quickValue.trim()) return;
    try {
      const item = { page: quickPage.trim() || "/", lang: quickLang, source: quickSource.trim() };
      await saveDraft(item as CopyEntry, quickValue);
      if (publishNow) await publish(item as CopyEntry);
      toast({ title: publishNow ? "Text published live" : "Draft saved" });
      setQuickSource("");
      setQuickValue("");
      await load();
    } catch (error) {
      toast({
        title: "Could not save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Pencil className="h-6 w-6 text-secondary" />
            <h2 className="font-serif text-2xl font-bold text-primary">Live Site Editor</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Edit English and Yiddish independently. Open any page in visual edit mode, click visible text, save a draft, publish it live, or restore an older version.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 shrink-0">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["All edits", stats.total],
          ["Published", stats.published],
          ["Open drafts", stats.drafts],
          ["English", stats.english],
          ["אידיש", stats.yiddish],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-primary mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-secondary" />
          <h3 className="font-semibold">Open a page and edit it visually</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {KNOWN_PAGES.map(item => (
            <div key={item.path} className="rounded-xl border p-3">
              <p className="font-medium text-sm mb-2">{item.label}</p>
              <p className="text-[11px] text-muted-foreground mb-3 font-mono">{item.path}</p>
              <div className="flex gap-2">
                <a href={editorUrl(item.path, "en")} className="flex-1" target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> English
                  </Button>
                </a>
                <a href={editorUrl(item.path, "yi")} className="flex-1" target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> אידיש
                  </Button>
                </a>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Detail pages such as a specific news article, group, or forum thread can also be edited: open that exact page while logged in and add <span className="font-mono">?siteEdit=1</span>.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Languages className="h-4 w-4" /> Manual text override</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Useful when you know the exact current text. Use <span className="font-mono">*</span> as the page to change the same wording across the entire site.
          </p>
        </div>
        <div className="grid md:grid-cols-[1fr_130px] gap-3">
          <Input value={quickPage} onChange={event => setQuickPage(event.target.value)} placeholder="/news or *" />
          <select value={quickLang} onChange={event => setQuickLang(event.target.value as "en" | "yi")} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="en">English</option>
            <option value="yi">אידיש</option>
          </select>
        </div>
        <Input value={quickSource} onChange={event => setQuickSource(event.target.value)} placeholder="Exact current text on the site" />
        <Textarea value={quickValue} onChange={event => setQuickValue(event.target.value)} placeholder="New text" className="min-h-24" dir={quickLang === "yi" ? "rtl" : "ltr"} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void quickSave(false)} disabled={!quickSource.trim() || !quickValue.trim()} className="gap-2">
            <Save className="h-4 w-4" /> Save Draft
          </Button>
          <Button onClick={() => void quickSave(true)} disabled={!quickSource.trim() || !quickValue.trim()} className="gap-2">
            <Send className="h-4 w-4" /> Publish Live
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid lg:grid-cols-[1fr_140px_220px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search original, draft, published text, or page..." className="pl-9" />
          </div>
          <select value={lang} onChange={event => setLang(event.target.value as "all" | "en" | "yi")} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="all">Both languages</option>
            <option value="en">English</option>
            <option value="yi">אידיש</option>
          </select>
          <select value={page} onChange={event => setPage(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="all">All pages</option>
            <option value="*">Global / every page</option>
            {KNOWN_PAGES.map(item => <option key={item.path} value={item.path}>{item.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="rounded-xl border p-10 text-center text-muted-foreground">Loading site text...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border p-10 text-center text-muted-foreground">
            No saved overrides yet. Open a page in Live Editor and click any text to begin.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => {
              const isEditing = editingId === entry.id;
              const hasDraft = entry.draftValue !== null && entry.draftValue !== entry.publishedValue;
              return (
                <div key={entry.id} className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Badge variant="outline">{entry.lang === "yi" ? "אידיש" : "English"}</Badge>
                    <Badge variant="secondary">{entry.page === "*" ? "Every page" : entry.page}</Badge>
                    {hasDraft && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Draft waiting</Badge>}
                    {entry.publishedValue !== null && <Badge className="bg-green-100 text-green-800 border-green-200">Live</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">v{entry.version} · {formatStamp(entry.updatedAt)}</span>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Original</p>
                      <div className="rounded-lg bg-muted/30 border p-3 whitespace-pre-wrap break-words">{entry.source}</div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Live now</p>
                      <div className="rounded-lg bg-muted/30 border p-3 whitespace-pre-wrap break-words">
                        {entry.publishedValue ?? <span className="text-muted-foreground italic">Original text</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Draft</p>
                      {isEditing ? (
                        <Textarea
                          value={editingValue}
                          onChange={event => setEditingValue(event.target.value)}
                          className="min-h-24"
                          dir={entry.lang === "yi" ? "rtl" : "ltr"}
                        />
                      ) : (
                        <div className="rounded-lg bg-muted/30 border p-3 min-h-[46px] whitespace-pre-wrap break-words">
                          {entry.draftValue ?? <span className="text-muted-foreground italic">No draft</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!isEditing ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditingValue(entry.draftValue ?? entry.publishedValue ?? entry.source);
                        }}
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" disabled={busyId === entry.id} onClick={() => void saveRow(entry, false)} className="gap-1.5">
                          <Save className="h-3.5 w-3.5" /> Save Draft
                        </Button>
                        <Button size="sm" disabled={busyId === entry.id} onClick={() => void saveRow(entry, true)} className="gap-1.5">
                          <Send className="h-3.5 w-3.5" /> Publish Live
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </>
                    )}

                    {hasDraft && !isEditing && (
                      <Button size="sm" onClick={() => void publishExistingDraft(entry)} disabled={busyId === entry.id} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Publish Draft
                      </Button>
                    )}

                    <Button size="sm" variant="ghost" onClick={() => void loadHistory(entry)} className="gap-1.5">
                      <History className="h-3.5 w-3.5" /> History
                    </Button>

                    <Button size="sm" variant="ghost" onClick={() => void reset(entry)} disabled={busyId === entry.id} className="gap-1.5 text-destructive">
                      <RotateCcw className="h-3.5 w-3.5" /> Restore Original
                    </Button>

                    {entry.page !== "*" && (
                      <a href={editorUrl(entry.page, entry.lang)} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" className="gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" /> Open Page
                        </Button>
                      </a>
                    )}
                  </div>

                  {historyFor === entry.id && (
                    <div className="mt-4 border-t pt-4 space-y-2">
                      <p className="font-semibold text-sm">Version history</p>
                      {history.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No history yet.</p>
                      ) : history.map(item => (
                        <div key={item.id} className="rounded-lg border bg-muted/20 p-3 flex flex-col md:flex-row md:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold capitalize">{item.action} · v{item.version}</p>
                            <p className="text-[11px] text-muted-foreground">{formatStamp(item.createdAt)}</p>
                            <p className="text-xs mt-1 break-words">
                              {item.newValue ?? <span className="italic text-muted-foreground">Original text</span>}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" disabled={busyId === entry.id} onClick={() => void restoreHistory(entry, item.id)} className="gap-1.5 shrink-0">
                            <RefreshCcw className="h-3.5 w-3.5" /> Restore this version
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
