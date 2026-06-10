import { useParams, Link } from "wouter";
import { useGetNews, useListNews, getGetNewsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User, MessageCircle, Share2 } from "lucide-react";
import { format } from "date-fns";

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id ?? "0", 10);
  const { data: article, isLoading } = useGetNews(numId, {
    query: { queryKey: getGetNewsQueryKey(numId), enabled: !!numId },
  });

  const categoryLabel: Record<string, string> = {
    medical: "Medical Assistance",
    wedding: "Wedding Assistance",
    bikur_cholim: "Bikur Cholim",
    community: "Community Support",
    emergency: "Emergency Relief",
    volunteer: "Volunteer Activities",
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8">
          <Link href="/news">
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-primary mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to News
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
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : article ? (
          <article>
            <div className="mb-6">
              <span className="inline-block px-3 py-1 bg-secondary/10 text-secondary text-xs font-semibold uppercase tracking-wider rounded-full mb-4">
                {categoryLabel[article.category] || article.category}
              </span>
              <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary leading-tight mb-6">
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground pb-6 border-b">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{format(new Date(article.createdAt), "MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>By {article.authorName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  <span>{article.commentCount} comments</span>
                </div>
                <Button variant="outline" size="sm" className="ml-auto gap-2">
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

            <div className="prose prose-slate max-w-none text-foreground leading-relaxed text-lg">
              {article.content.split("\n").map((para, i) => (
                <p key={i} className="mb-4">{para}</p>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t">
              <h3 className="font-serif text-2xl font-bold text-primary mb-6">Comments</h3>
              <div className="bg-muted/30 rounded-xl p-8 text-center">
                <p className="font-serif italic text-muted-foreground">
                  Sign in to read and post comments.
                </p>
                <Link href="/login">
                  <Button className="mt-4 bg-secondary hover:bg-secondary/90 text-white">Sign In</Button>
                </Link>
              </div>
            </div>
          </article>
        ) : (
          <div className="text-center py-24">
            <p className="font-serif text-xl text-muted-foreground">Article not found.</p>
            <Link href="/news">
              <Button className="mt-4">Back to News</Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
