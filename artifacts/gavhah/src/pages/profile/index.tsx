import { Link } from "wouter";
import {
  useListFollows, useDeleteFollow, useListSavedItems, useDeleteSavedItem,
  getListFollowsQueryKey, getListSavedItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, UserMinus, Bookmark, BookmarkX, ArrowRight, UserPlus, BookmarkCheck, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const ENTITY_TYPE_LABEL: Record<string, string> = {
  volunteer: "Volunteer",
  group: "Group",
  project: "Project",
  cause: "Cause",
  discussion: "Forum Post",
  news: "Article",
  user: "Member",
};

const CONTENT_TYPE_LABEL: Record<string, string> = {
  discussion: "Forum Post",
  news: "Article",
  cause: "Cause",
  group: "Group",
  project: "Project",
  volunteer: "Volunteer",
  minyan: "Minyan",
};

export default function ProfilePage() {
  const qc = useQueryClient();

  const { data: follows, isLoading: followsLoading } = useListFollows({ query: { queryKey: getListFollowsQueryKey() } });
  const { data: saved, isLoading: savedLoading } = useListSavedItems({ query: { queryKey: getListSavedItemsQueryKey() } });

  const deleteFollow = useDeleteFollow();
  const deleteSaved = useDeleteSavedItem();

  const handleUnfollow = (id: number) => {
    deleteFollow.mutate({ id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListFollowsQueryKey() })
    });
  };

  const handleUnsave = (id: number) => {
    deleteSaved.mutate({ id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListSavedItemsQueryKey() })
    });
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-bold text-primary">My Profile</h1>
              <p className="text-muted-foreground font-serif italic">Community Member</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="following" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="following" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Following
              {follows && follows.length > 0 && (
                <span className="bg-primary/10 text-primary text-xs rounded-full px-1.5 py-0.5">{follows.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="saved" className="gap-2">
              <BookmarkCheck className="h-4 w-4" />
              Saved
              {saved && saved.length > 0 && (
                <span className="bg-primary/10 text-primary text-xs rounded-full px-1.5 py-0.5">{saved.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── Following ─── */}
          <TabsContent value="following" className="space-y-3">
            {followsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
              </div>
            )}
            {!followsLoading && (!follows || follows.length === 0) && (
              <div className="text-center py-16 border rounded-xl bg-muted/20">
                <UserPlus className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="font-serif text-lg font-semibold text-primary mb-1">No follows yet</p>
                <p className="text-sm text-muted-foreground mb-4">Follow volunteers, groups, projects, and more.</p>
                <Link href="/directory">
                  <Button variant="outline" size="sm" className="gap-2">
                    Browse the Directory <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )}
            {follows?.map(follow => (
              <div key={follow.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <UserPlus className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-foreground truncate">{follow.entityTitle || `${follow.entityType} #${follow.entityId}`}</span>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {ENTITY_TYPE_LABEL[follow.entityType] ?? follow.entityType}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Followed {format(new Date(follow.createdAt), "MMM d, yyyy")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {follow.entityUrl && (
                    <Link href={follow.entityUrl}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnfollow(follow.id)}
                    disabled={deleteFollow.isPending}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Unfollow
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ─── Saved ─── */}
          <TabsContent value="saved" className="space-y-3">
            {savedLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
              </div>
            )}
            {!savedLoading && (!saved || saved.length === 0) && (
              <div className="text-center py-16 border rounded-xl bg-muted/20">
                <Bookmark className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="font-serif text-lg font-semibold text-primary mb-1">No saved items yet</p>
                <p className="text-sm text-muted-foreground mb-4">Save forum posts, news articles, causes, and more for later.</p>
                <Link href="/forum">
                  <Button variant="outline" size="sm" className="gap-2">
                    Browse the Forum <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )}
            {saved?.map(item => (
              <div key={item.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                  <Bookmark className="h-4 w-4 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-foreground truncate">{item.contentTitle || `${item.contentType} #${item.contentId}`}</span>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {CONTENT_TYPE_LABEL[item.contentType] ?? item.contentType}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Saved {format(new Date(item.createdAt), "MMM d, yyyy")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.contentUrl && (
                    <Link href={item.contentUrl}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnsave(item.id)}
                    disabled={deleteSaved.isPending}
                  >
                    <BookmarkX className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
