import { useState } from "react";
import { Link } from "wouter";
import {
  useListNews, useCreateNews,
  getListNewsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, ChevronRight, Eye, Plus, Globe, Star } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "medical", label: "Medical" },
  { value: "wedding", label: "Wedding" },
  { value: "bikur_cholim", label: "Bikur Cholim" },
  { value: "community", label: "Community" },
  { value: "emergency", label: "Emergency" },
  { value: "volunteer", label: "Volunteer" },
];

const CATEGORY_LABELS: Record<string, string> = {
  medical: "Medical", wedding: "Wedding", bikur_cholim: "Bikur Cholim",
  community: "Community", emergency: "Emergency", volunteer: "Volunteer",
};

export default function NewsList() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", content: "", summary: "", category: "community", authorName: "",
  });

  const { data: news, isLoading } = useListNews(
    { category: activeCategory !== "all" ? activeCategory : undefined },
    { query: { queryKey: getListNewsQueryKey({ category: activeCategory !== "all" ? activeCategory : undefined }) } }
  );

  const createNews = useCreateNews();

  const filtered = news?.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.summary ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const featured = filtered.filter(a => a.isFeatured);
  const regular = filtered.filter(a => !a.isFeatured);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.content) return;
    createNews.mutate(
      { data: { title: form.title, content: form.content, summary: form.summary || undefined, category: form.category, authorName: form.authorName || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListNewsQueryKey({}) });
          setDialogOpen(false);
          setForm({ title: "", content: "", summary: "", category: "community", authorName: "" });
          toast({ title: "Story submitted", description: "Your story will appear in the news center." });
        },
        onError: () => toast({ title: "Error", description: "Could not submit. Please try again.", variant: "destructive" }),
      }
    );
  };

  const s = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/8 to-transparent border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-2">
                <Globe className="h-7 w-7 text-secondary" />
                <h1 className="font-serif text-4xl font-bold text-primary">Chesed News Center</h1>
              </div>
              <p className="text-muted-foreground font-serif italic">
                Inspiring stories of kindness and community action from around the world.
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0">
                  <Plus className="h-4 w-4" /> Share Your Story
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl text-primary">Share a Chesed Story</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Title *</Label>
                    <Input value={form.title} onChange={s("title")} placeholder="Headline for your story" className="h-11" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Your Name</Label>
                    <Input value={form.authorName} onChange={s("authorName")} placeholder="How should we credit you?" className="h-11" />
                  </div>
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
                    <Label className="font-semibold">Summary <span className="text-muted-foreground font-normal">(optional — shown in card view)</span></Label>
                    <Input value={form.summary} onChange={s("summary")} placeholder="One-line summary of the story" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Story *</Label>
                    <Textarea value={form.content} onChange={s("content")} placeholder="Tell the full story here..." className="min-h-40 resize-none" required />
                  </div>
                  <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold gap-2" disabled={createNews.isPending}>
                    <Globe className="h-4 w-4" /> {createNews.isPending ? "Submitting..." : "Submit Story"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative mt-8 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-10 h-12 bg-background border-primary/20 focus-visible:ring-accent"
              placeholder="Search articles..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {/* Category filter */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              variant={activeCategory === cat.value ? "default" : "outline"}
              className="rounded-full shrink-0"
              onClick={() => setActiveCategory(cat.value)}
            >
              {cat.label}
              {activeCategory === cat.value && cat.value !== "all" && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({filtered.length})
                </span>
              )}
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
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">
            No articles found. {search ? "Try a different search term." : "Be the first to share a story!"}
          </div>
        ) : (
          <div className="space-y-12">
            {/* Featured */}
            {featured.length > 0 && !search && activeCategory === "all" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-accent fill-accent" />
                  <h2 className="font-serif text-xl font-bold text-primary">Featured Stories</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {featured.slice(0, 2).map(article => (
                    <NewsCard key={article.id} article={article} large />
                  ))}
                </div>
              </div>
            )}

            {/* All articles */}
            <div className="space-y-4">
              {(search || activeCategory !== "all" || featured.length === 0) ? null : (
                <h2 className="font-serif text-xl font-bold text-primary">Latest Stories</h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(search || activeCategory !== "all" ? filtered : regular).map(article => (
                  <NewsCard key={article.id} article={article} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function NewsCard({ article, large = false }: { article: any; large?: boolean }) {
  return (
    <Link href={`/news/${article.id}`}>
      <article className={`group cursor-pointer flex flex-col h-full bg-card rounded-xl overflow-hidden border border-border/50 hover:border-primary/20 hover:shadow-md transition-all`}>
        <div className={`${large ? "aspect-[16/9]" : "aspect-[4/3]"} bg-muted relative overflow-hidden`}>
          {article.imageUrl ? (
            <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
              <Globe className="h-12 w-12 text-primary/20" />
            </div>
          )}
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="px-2.5 py-1 bg-background/90 backdrop-blur text-xs font-semibold uppercase tracking-wider rounded-full shadow-sm text-primary">
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
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>{format(new Date(article.createdAt), "MMM d, yyyy")}</span>
            <div className="flex items-center gap-3">
              {article.viewCount > 0 && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> {article.viewCount.toLocaleString()}
                </span>
              )}
              <span>By {article.authorName}</span>
            </div>
          </div>
          <h3 className={`font-serif font-bold text-primary mb-2 group-hover:text-secondary transition-colors line-clamp-2 ${large ? "text-xl" : "text-lg"}`}>
            {article.title}
          </h3>
          <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
            {article.summary || article.content.substring(0, 150) + "..."}
          </p>
          <div className="flex items-center text-accent font-semibold text-xs group-hover:gap-2 transition-all">
            Read Article <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </div>
        </div>
      </article>
    </Link>
  );
}
