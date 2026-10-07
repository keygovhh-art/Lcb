import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Search as SearchIcon, Newspaper, MessageSquare, Users, Clock, HandHeart,
  FolderKanban, Star, Heart, Loader2, ArrowRight,
} from "lucide-react";
import { Layout } from "@/components/layout/layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type SearchResult = {
  type: string;
  id: number;
  title: string;
  description?: string | null;
  meta?: string | null;
  url: string;
};

const ICONS: Record<string, ReactNode> = {
  news: <Newspaper className="h-4 w-4" />,
  discussion: <MessageSquare className="h-4 w-4" />,
  group: <Users className="h-4 w-4" />,
  minyan: <Clock className="h-4 w-4" />,
  volunteer: <HandHeart className="h-4 w-4" />,
  project: <FolderKanban className="h-4 w-4" />,
  cause: <Star className="h-4 w-4" />,
  charity: <Heart className="h-4 w-4" />,
};

const LABELS: Record<string, string> = {
  news: "News",
  discussion: "Forum",
  group: "Group",
  minyan: "Minyan",
  volunteer: "Volunteer",
  project: "Project",
  cause: "Featured Cause",
  charity: "Charity",
};

export default function SearchPage() {
  const initial = useMemo(() => new URLSearchParams(window.location.search).get("q") ?? "", []);
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/search?q=" + encodeURIComponent(q), {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search failed");
        setResults(await res.json());
        setSearched(true);
        window.history.replaceState(null, "", "/search?q=" + encodeURIComponent(q));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-2">
            <SearchIcon className="h-7 w-7 text-secondary" />
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary">Search Gavhah</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Search public community content. Private cases, private group posts, contact details, and pending submissions are never included.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="relative mb-8">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search news, forum, groups, minyans, volunteers..."
            className="h-14 pl-12 text-base"
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="text-center text-sm text-muted-foreground py-10">Type at least 2 characters.</p>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center border rounded-xl bg-muted/20 py-14">
            <SearchIcon className="h-9 w-9 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-serif text-lg font-semibold text-primary">No public results found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different name, place, topic, or organization.</p>
          </div>
        )}

        <div className="space-y-3">
          {results.map((item, index) => (
            <Link key={item.type + "-" + item.id + "-" + index} href={item.url}>
              <div className="bg-card border rounded-xl p-4 sm:p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {ICONS[item.type] ?? <SearchIcon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="font-semibold text-foreground">{item.title}</h2>
                    <Badge variant="outline" className="text-xs">{LABELS[item.type] ?? item.type}</Badge>
                  </div>
                  {item.description && <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>}
                  {item.meta && <p className="text-xs text-muted-foreground mt-2 capitalize">{item.meta.replaceAll("_", " ")}</p>}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
