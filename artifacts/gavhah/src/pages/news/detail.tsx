import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { useGetNews, getGetNewsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, Eye, Share2, Heart } from "lucide-react";
import { SaveButton } from "@/components/shared/save-button";
import { ReportButton } from "@/components/shared/report-button";
import { format } from "date-fns";
import { useLikeArticle } from "@/hooks/use-like-article";

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
          <ArticleBody article={article} />
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

function ArticleBody({ article }: { article: any }) {
  const { isLiked, likeCount, toggle, pending } = useLikeArticle(article.id, article.likeCount ?? 0);

  return (
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
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              disabled={pending}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border font-medium text-sm transition-all ${
                isLiked
                  ? "bg-rose-50 border-rose-300 text-rose-600"
                  : "border-border text-muted-foreground hover:border-rose-300 hover:text-rose-500"
              }`}
            >
              <Heart className={`h-4 w-4 transition-all ${isLiked ? "fill-rose-500 text-rose-500" : ""}`} />
              {isLiked ? "Liked" : "Like this story"}
              {likeCount > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isLiked ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground"}`}>
                  {likeCount.toLocaleString()}
                </span>
              )}
            </button>
            <SaveButton
              contentType="news"
              contentId={article.id}
              contentTitle={article.title}
              contentUrl={`/news/${article.id}`}
              size="sm"
              showLabel
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigator.share?.({ title: article.title, url: window.location.href }).catch(() => {})}
            >
              <Share2 className="h-4 w-4" /> Share
            </Button>
            <ReportButton contentType="news" contentId={article.id} variant="ghost" />
          </div>
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
      <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="flex-1">
          <p className="font-serif font-bold text-primary">{article.authorName}</p>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[article.category] ?? article.category} · Gavhah Community
          </p>
        </div>
        {/* Like summary */}
        {likeCount > 0 && (
          <div className="text-sm text-muted-foreground font-serif italic">
            {likeCount.toLocaleString()} {likeCount === 1 ? "person appreciated" : "people appreciated"} this story
          </div>
        )}
        <Link href="/news">
          <Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> More Stories</Button>
        </Link>
      </div>
    </article>
  );
}
