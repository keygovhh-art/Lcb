import { Link } from "wouter";
import { useListNews, getListNewsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight } from "lucide-react";
import { format } from "date-fns";

export default function NewsList() {
  const { data: news, isLoading } = useListNews({}, { query: { queryKey: getListNewsQueryKey({}) } });

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl font-bold text-primary mb-4">Global Chesed News</h1>
            <p className="text-muted-foreground text-lg mb-8 font-serif italic">
              Inspiring stories of kindness and community action from around the world.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                className="pl-10 h-12 bg-background border-primary/20 focus-visible:ring-accent" 
                placeholder="Search articles..." 
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="flex gap-4 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {["All", "Medical", "Wedding", "Bikur Cholim", "Community", "Emergency", "Volunteer"].map(cat => (
            <Button key={cat} variant={cat === "All" ? "default" : "outline"} className="rounded-full">
              {cat}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="w-full aspect-[4/3] rounded-lg" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {news?.map(article => (
              <Link key={article.id} href={`/news/${article.id}`}>
                <article className="group cursor-pointer flex flex-col h-full bg-card rounded-xl overflow-hidden border border-border/50 hover:border-primary/20 hover:shadow-md transition-all">
                  <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                    {article.imageUrl ? (
                      <img 
                        src={article.imageUrl} 
                        alt={article.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary/5 text-secondary font-serif italic">
                        No Image
                      </div>
                    )}
                    <div className="absolute top-4 left-4">
                      <span className="px-3 py-1 bg-background/90 backdrop-blur text-xs font-semibold uppercase tracking-wider rounded-full shadow-sm text-primary">
                        {article.category.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="text-sm text-muted-foreground mb-3 flex items-center justify-between">
                      <span>{format(new Date(article.createdAt), "MMM d, yyyy")}</span>
                      <span>By {article.authorName}</span>
                    </div>
                    <h3 className="font-serif text-xl font-bold text-primary mb-3 group-hover:text-secondary transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-muted-foreground text-sm line-clamp-3 mb-6 flex-1">
                      {article.summary || article.content.substring(0, 150) + "..."}
                    </p>
                    <div className="flex items-center text-accent font-semibold text-sm group-hover:gap-2 transition-all">
                      Read Article <ChevronRight className="h-4 w-4 ml-1" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
            
            {news?.length === 0 && (
              <div className="col-span-full text-center py-24 text-muted-foreground font-serif italic">
                No articles found matching your criteria.
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
