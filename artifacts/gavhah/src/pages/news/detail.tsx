import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { useGetNews, getGetNewsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, Eye, Share2, Globe } from "lucide-react";
import { format } from "date-fns";

const CATEGORY_LABELS: Record<string, string> = {
  medical: "Medical Assistance",
  wedding: "Wedding Assistance",
  bikur_cholim: "Bikur Cholim",
  community: "Community Support",
  emergency: "Emergency Relief",
  volunteer: "Volunteer Activities",
};

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id ?? "0", 10);

  const { data: article, isLoading } = useGetNews(numId, {
    query: { queryKey: getGetNewsQueryKey(numId), enabled: !!numId },
  });

  // Track view count when article loads
  useEffect(() => {
    if (!numId) return;
    fetch(`/api/news/${numId}/view`, { method: "POST" }).catch(() => {});
  }, [numId]);

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-6">
          <Link href="/news">
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" /> Back to Chesed News
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <div className="flex gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="w-full aspect-[16/9] rounded-xl" />
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        ) : article ? (
          <article>
            <div className="mb-8">
              <Badge className="bg-secondary/10 text-secondary border-secondary/20 mb-4">
                {CATEGORY_LABELS[article.category] || article.category}
              </Badge>
              <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary leading-tight mb-6">
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pb-6 border-b">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>{format(new Date(article.createdAt), "MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  <span>By {article.authorName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  <span>{(article.viewCount ?? 0).toLocaleString()} {article.viewCount === 1 ? "view" : "views"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="h-4 w-4" />
                  <span className="capitalize">{CATEGORY_LABELS[article.category] ?? article.category}</span>
                </div>
                <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={() => navigator.share?.({ title: article.title, url: window.location.href }).catch(() => {})}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </div>
            </div>

            {article.imageUrl && (
              <div className="aspect-[16/9] rounded-xl overflow-hidden mb-8 bg-muted">
                <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
              </div>
            )}

            {article.summary && (
              <p className="font-serif text-xl italic text-muted-foreground border-l-4 border-accent pl-6 mb-8 leading-relaxed">
                {article.summary}
              </p>
            )}

            <div className="text-foreground leading-relaxed text-lg space-y-4">
              {article.content.split("\n").filter(Boolean).map((para: string, i: number) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-serif font-bold text-primary">{article.authorName}</p>
                <p className="text-sm text-muted-foreground capitalize">{CATEGORY_LABELS[article.category] ?? article.category} · Gavhah Community</p>
              </div>
              <div className="flex gap-3">
                <Link href="/news">
                  <Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> More Stories</Button>
                </Link>
                <Button
                  className="bg-secondary hover:bg-secondary/90 text-white gap-2"
                  onClick={() => document.dispatchEvent(new CustomEvent("open-share-story"))}
                >
                  Share Your Story
                </Button>
              </div>
            </div>
          </article>
        ) : (
          <div className="text-center py-24">
            <p className="font-serif text-xl text-muted-foreground">Article not found.</p>
            <Link href="/news"><Button className="mt-4">Back to News</Button></Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
