import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  useListNews, useCreateNews, getListNewsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { DisplayAsSelector, type DisplayAs, getDisplayName } from "@/components/shared/display-as-selector";
import {
  Search, Plus, Eye, Heart, Star, Globe, ChevronRight,
  AlertTriangle, Clock, Building2, Megaphone, HandHeart, Siren
} from "lucide-react";
import { format } from "date-fns";
import { useLikeArticle } from "@/hooks/use-like-article";

// --- Category config ---
const CATEGORIES = [
  { value: "all", label: "All Updates" },
  { value: "emergency_appeal", label: "Emergency Appeals" },
  { value: "fundraising", label: "Fundraising" },
  { value: "announcement", label: "Announcements" },
  { value: "volunteer_call", label: "Volunteer Calls" },
  { value: "alert", label: "Community Alerts" },
  { value: "org_update", label: "Organization Updates" },
  { value: "bikur_cholim", label: "Bikur Cholim" },
];

const CATEGORY_LABELS: Record<string, string> = {
  emergency_appeal: "Emergency Appeal",
  fundraising: "Fundraising",
  announcement: "Announcement",
  volunteer_call: "Volunteer Call",
  alert: "Community Alert",
  org_update: "Organization Update",
  bikur_cholim: "Bikur Cholim",
  community: "Community",
  medical: "Medical",
  wedding: "Wedding",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  emergency_appeal: <AlertTriangle className="h-3.5 w-3.5" />,
  fundraising: <Heart className="h-3.5 w-3.5" />,
  announcement: <Megaphone className="h-3.5 w-3.5" />,
  volunteer_call: <HandHeart className="h-3.5 w-3.5" />,
  alert: <Siren className="h-3.5 w-3.5" />,
  org_update: <Building2 className="h-3.5 w-3.5" />,
  bikur_cholim: <Heart className="h-3.5 w-3.5" />,
};

const URGENCY_STYLE: Record<string, { badge: string; card: string; label: string }> = {
  breaking: { badge: "bg-red-100 text-red-700 border border-red-200", card: "border-l-4 border-l-red-500", label: "Breaking" },
  high: { badge: "bg-orange-100 text-orange-700 border border-orange-200", card: "border-l-4 border-l-orange-400", label: "Important" },
  normal: { badge: "", card: "", label: "" },
  low: { badge: "", card: "", label: "" },
};

function PostUpdateDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const createNews = useCreateNews();
  const [open, setOpen] = useState(false);
  const [displayAs, setDisplayAs] = useState<DisplayAs>("nickname");
  const [form, setForm] = useState({
    title: "", content: "", summary: "", organization: "", imageUrl: "",
    category: "announcement", urgency: "normal", deadline: "",
  });

  const s = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleTrigger = () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to post updates", description: "Join Gavhah free to share community updates." });
      return;
    }
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.content) return;
    const authorName = getDisplayName(displayAs, user);
    createNews.mutate(
      { data: { ...form, authorName, deadline: form.deadline || undefined, organization: form.organization || undefined, summary: form.summary || undefined } },
      {
        onSuccess: (article) => {
          const listKey = getListNewsQueryKey({});
          qc.setQueryData(listKey, (current: any) => {
            const items = Array.isArray(current) ? current : [];
            return [article, ...items.filter((item: any) => item.id !== article.id)];
          });
          void qc.invalidateQueries({ queryKey: ["/api/news"] });
          setOpen(false);
          setForm({ title: "", content: "", summary: "", organization: "", imageUrl: "", category: "announcement", urgency: "normal", deadline: "" });
          toast({ title: "Update posted", description: "Your community update has been published." });
        },
        onError: () => toast({ title: "Error", description: "Could not post update. Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0" onClick={handleTrigger}>
          <Plus className="h-4 w-4" /> Post Update
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-primary">Post Community Update</DialogTitle>
          <p className="text-sm text-muted-foreground">Share an announcement, alert, campaign, or volunteer call with the community.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-semibold">Category</Label>
              <Select value={form.category} onValueChange={s("category")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.value !== "all").map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Urgency</Label>
              <Select value={form.urgency} onValueChange={s("urgency")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Important</SelectItem>
                  <SelectItem value="breaking">Breaking / Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Title / Headline *</Label>
            <Input value={form.title} onChange={s("title")} placeholder="Clear, descriptive headline" className="h-11" required />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Organization / Department</Label>
            <Input value={form.organization} onChange={s("organization")} placeholder="Who is posting?" className="h-11" />
          </div>

          <DisplayAsSelector value={displayAs} onChange={setDisplayAs} />

          <div className="space-y-1.5">
            <Label className="font-semibold">Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              type="url"
              value={form.imageUrl}
              onChange={s("imageUrl")}
              placeholder="https://..."
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">Paste a direct image link; the image will appear on the news card and article.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">
              Deadline / Expiry Date
              <span className="font-normal text-muted-foreground ml-1">(for time-sensitive items)</span>
            </Label>
            <Input type="date" value={form.deadline} onChange={s("deadline")} className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Summary <span className="font-normal text-muted-foreground">(shown in card view)</span></Label>
            <Input value={form.summary} onChange={s("summary")} placeholder="One sentence — what is this update about?" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Full Details *</Label>
            <Textarea value={form.content} onChange={s("content")} placeholder="All relevant information, context, and action items..." className="min-h-36 resize-none" required />
          </div>

          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={createNews.isPending}>
            <Megaphone className="h-4 w-4" /> {createNews.isPending ? "Publishing..." : "Publish Update"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewsCard({ article, large = false }: { article: any; large?: boolean }) {
  const { isLiked, likeCount, toggle } = useLikeArticle(article.id, article.likeCount ?? 0);
  const urgencyStyle = URGENCY_STYLE[article.urgency ?? "normal"] ?? URGENCY_STYLE.normal;

  const isBreaking = article.urgency === "breaking";
  const isHigh = article.urgency === "high";

  return (
    <Link href={`/news/${article.id}`}>
      <article className={`group cursor-pointer flex flex-col h-full bg-card rounded-xl overflow-hidden border hover:shadow-md transition-all ${
        isBreaking ? "border-red-200 hover:border-red-300" :
        isHigh ? "border-orange-200 hover:border-orange-300" :
        "border-border/50 hover:border-primary/20"
      }`}>
        {/* Urgency strip for breaking/high */}
        {(isBreaking || isHigh) && (
          <div className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
            isBreaking ? "bg-red-600 text-white" : "bg-orange-500 text-white"
          }`}>
            {isBreaking ? <Siren className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {urgencyStyle.label}
          </div>
        )}

        {/* Image or placeholder */}
        <div className={`${large ? "aspect-[16/9]" : "aspect-[4/3]"} bg-muted relative overflow-hidden`}>
          {article.imageUrl ? (
            <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              isBreaking ? "bg-gradient-to-br from-red-50 to-red-100/30" :
              isHigh ? "bg-gradient-to-br from-orange-50 to-amber-100/30" :
              "bg-gradient-to-br from-primary/5 to-secondary/5"
            }`}>
              <div className={`${isBreaking ? "text-red-300" : isHigh ? "text-orange-300" : "text-primary/20"}`}>
                {CATEGORY_ICONS[article.category] ? (
                  <div className="scale-[3]">{CATEGORY_ICONS[article.category]}</div>
                ) : (
                  <Globe className="h-12 w-12" />
                )}
              </div>
            </div>
          )}
          {/* Category + featured badges */}
          <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
            <span className="px-2.5 py-1 bg-background/90 backdrop-blur text-xs font-semibold uppercase tracking-wider rounded-full shadow-sm text-primary flex items-center gap-1">
              {CATEGORY_ICONS[article.category] && <span className="opacity-70">{CATEGORY_ICONS[article.category]}</span>}
              {CATEGORY_LABELS[article.category] ?? article.category}
            </span>
            {article.isFeatured && (
              <span className="px-2.5 py-1 bg-accent/90 backdrop-blur text-xs font-semibold rounded-full shadow-sm text-accent-foreground flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" /> Featured
              </span>
            )}
          </div>
        </div>

        <div className="p-5 flex flex-col flex-1">
          {/* Meta row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 flex-wrap gap-2">
            <span>{format(new Date(article.createdAt), "MMM d, yyyy")}</span>
            <div className="flex items-center gap-3">
              {(article.viewCount ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> {article.viewCount.toLocaleString()}
                </span>
              )}
              {article.organization && (
                <span className="flex items-center gap-1 font-medium text-primary/70">
                  <Building2 className="h-3 w-3" /> {article.organization}
                </span>
              )}
            </div>
          </div>

          {/* Deadline warning */}
          {article.deadline && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-100 rounded-md px-2.5 py-1.5 mb-3">
              <Clock className="h-3.5 w-3.5" /> Deadline: {article.deadline}
            </div>
          )}

          <h3 className={`font-serif font-bold text-primary mb-2 group-hover:text-secondary transition-colors line-clamp-2 ${large ? "text-xl" : "text-lg"} ${isBreaking ? "text-red-900" : ""}`}>
            {article.title}
          </h3>
          <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
            {article.summary || article.content.substring(0, 150) + "..."}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center text-accent font-semibold text-xs group-hover:gap-2 transition-all">
              Read Full Update <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </div>
            <button
              onClick={toggle}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full transition-all ${
                isLiked
                  ? "bg-rose-50 text-rose-600 border border-rose-200"
                  : "text-muted-foreground border border-transparent hover:bg-muted hover:text-rose-500"
              }`}
              aria-label={isLiked ? "Unlike" : "Like"}
            >
              <Heart className={`h-3.5 w-3.5 transition-all ${isLiked ? "fill-rose-500 text-rose-500 scale-110" : ""}`} />
              {likeCount > 0 && <span>{likeCount.toLocaleString()}</span>}
            </button>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function NewsPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: articles, isLoading } = useListNews({}, { query: { queryKey: getListNewsQueryKey({}) } });

  const filtered = (articles ?? []).filter(a => {
    const matchCat = activeCategory === "all" || a.category === activeCategory;
    const term = search.toLowerCase();
    const matchSearch = !search || a.title.toLowerCase().includes(term) ||
      (a.summary ?? "").toLowerCase().includes(term) ||
      (a.organization ?? "").toLowerCase().includes(term);
    return matchCat && matchSearch;
  });

  const breaking = filtered.filter(a => a.urgency === "breaking");
  const important = filtered.filter(a => a.urgency === "high");
  const regular = filtered.filter(a => a.urgency !== "breaking" && a.urgency !== "high");
  const featured = filtered.filter(a => a.isFeatured);
  const withDeadlines = filtered.filter(a => a.deadline && a.urgency !== "breaking");

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/8 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-2">
                <Megaphone className="h-7 w-7 text-secondary" />
                <h1 className="font-serif text-4xl font-bold text-primary">Chesed News Center</h1>
              </div>
              <p className="text-muted-foreground font-serif italic">
                Community updates, emergency campaigns, fundraising appeals, and important alerts.
              </p>
            </div>
            <PostUpdateDialog />
          </div>

          {/* Search */}
          <div className="relative mt-8 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-10 h-12 bg-background border-primary/20 focus-visible:ring-accent"
              placeholder="Search updates, organizations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {/* Category filter */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              variant={activeCategory === cat.value ? "default" : "outline"}
              className="rounded-full shrink-0"
              onClick={() => setActiveCategory(cat.value)}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">
            No updates found. {search ? "Try a different search." : "Be the first to post a community update!"}
          </div>
        ) : (
          <div className="space-y-12">

            {/* Breaking news — top priority */}
            {breaking.length > 0 && !search && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Siren className="h-5 w-5 text-red-600" />
                  <h2 className="font-serif text-xl font-bold text-red-800">Breaking Alerts</h2>
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{breaking.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {breaking.map(a => <NewsCard key={a.id} article={a} large />)}
                </div>
              </div>
            )}

            {/* Important / high urgency */}
            {important.length > 0 && !search && activeCategory === "all" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <h2 className="font-serif text-xl font-bold text-primary">Important Updates</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {important.map(a => <NewsCard key={a.id} article={a} />)}
                </div>
              </div>
            )}

            {/* Deadlines strip */}
            {withDeadlines.length > 0 && !search && activeCategory === "all" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-700" />
                  <h3 className="font-semibold text-amber-800 text-sm uppercase tracking-wide">Upcoming Deadlines</h3>
                </div>
                <div className="space-y-2">
                  {withDeadlines.slice(0, 5).map(a => (
                    <Link key={a.id} href={`/news/${a.id}`}>
                      <div className="flex items-center justify-between gap-4 text-sm hover:bg-amber-100/60 rounded-lg px-2 py-1.5 transition-colors cursor-pointer">
                        <span className="font-medium text-amber-900 line-clamp-1">{a.title}</span>
                        <span className="text-amber-700 font-semibold shrink-0 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {a.deadline}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Featured */}
            {featured.length > 0 && !search && activeCategory === "all" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-accent fill-accent" />
                  <h2 className="font-serif text-xl font-bold text-primary">Featured</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {featured.slice(0, 2).map(a => <NewsCard key={a.id} article={a} large />)}
                </div>
              </div>
            )}

            {/* Main grid */}
            {regular.length > 0 && (
              <div className="space-y-4">
                {(!search && activeCategory === "all") && (
                  <h2 className="font-serif text-xl font-bold text-primary">Latest Updates</h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(search || activeCategory !== "all" ? filtered : regular).map(a => (
                    <NewsCard key={a.id} article={a} />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </Layout>
  );
}
