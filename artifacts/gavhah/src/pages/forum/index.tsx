import { useState } from "react";
import { Link } from "wouter";
import { useListDiscussions, useGetTrendingDiscussions, getListDiscussionsQueryKey, getGetTrendingDiscussionsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Heart, Eye, MessageCircle, Lock, TrendingUp, Pin } from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = [
  { value: "", label: "All Topics" },
  { value: "medical", label: "Medical" },
  { value: "shidduchim", label: "Shidduchim" },
  { value: "livelihood", label: "Livelihood" },
  { value: "education", label: "Education" },
  { value: "charity", label: "Charity" },
  { value: "community", label: "Community" },
  { value: "general", label: "General" },
];

export default function ForumList() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  const params = { category: category || undefined, search: search || undefined };
  const { data: discussions, isLoading } = useListDiscussions(params, {
    query: { queryKey: getListDiscussionsQueryKey(params) },
  });
  const { data: trending } = useGetTrendingDiscussions({
    query: { queryKey: getGetTrendingDiscussionsQueryKey() },
  });

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Askanim Forum</h1>
              <p className="text-muted-foreground font-serif italic">
                A space for community members to discuss, advise, and support one another.
              </p>
            </div>
            <Link href="/forum/new">
              <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Start Discussion
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10 h-11"
                  placeholder="Search discussions..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(cat => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? "default" : "outline"}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setCategory(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-card border rounded-xl p-6 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {discussions?.map(disc => (
                  <Link key={disc.id} href={`/forum/${disc.id}`}>
                    <div className="bg-card border rounded-xl p-5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {disc.isPinned && (
                              <span className="text-xs bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Pin className="h-2.5 w-2.5" /> Pinned
                              </span>
                            )}
                            <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full capitalize">
                              {disc.category.replace("_", " ")}
                            </span>
                            {disc.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </div>
                          <h3 className="font-serif font-bold text-primary group-hover:text-secondary transition-colors line-clamp-1 text-lg mb-1">
                            {disc.title}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {disc.content.substring(0, 120)}...
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span>By <span className="font-medium text-foreground">{disc.authorName}</span></span>
                            <span>{format(new Date(disc.createdAt), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground shrink-0">
                          <div className="flex items-center gap-1"><Heart className="h-3 w-3" /> {disc.likes}</div>
                          {forumEngagement.showViews && <div className="flex items-center gap-1"><Eye className="h-3 w-3" /> {disc.views}</div>}
                          <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {disc.commentCount}</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {discussions?.length === 0 && (
                  <div className="text-center py-16 border rounded-xl bg-muted/20">
                    <p className="font-serif italic text-muted-foreground mb-4">No discussions found.</p>
                    <Link href="/forum/new">
                      <Button className="bg-secondary hover:bg-secondary/90 text-white">Start the first discussion</Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-card border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-secondary" />
                <h3 className="font-serif font-bold text-primary">Trending Topics</h3>
              </div>
              <div className="space-y-3">
                {trending?.slice(0, 5).map((disc, i) => (
                  <Link key={disc.id} href={`/forum/${disc.id}`}>
                    <div className="flex items-start gap-3 group cursor-pointer">
                      <span className="text-2xl font-serif font-bold text-muted-foreground/40 leading-none mt-0.5 w-6 shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground group-hover:text-secondary transition-colors line-clamp-2">
                          {disc.title}
                        </p>
                        {forumEngagement.showViews && <p className="text-xs text-muted-foreground mt-0.5">{disc.views} views</p>}
                      </div>
                    </div>
                  </Link>
                ))}
                {(trending?.length === 0 || !trending) && (
                  <p className="text-sm text-muted-foreground font-serif italic">No trending topics yet.</p>
                )}
              </div>
            </div>

            <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-5">
              <h3 className="font-serif font-bold text-primary mb-2">Community Guidelines</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All discussions must be respectful and Torah-appropriate. Content is subject to moderation by community administrators.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
