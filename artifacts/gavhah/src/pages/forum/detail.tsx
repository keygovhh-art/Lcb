import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetDiscussion, useListDiscussionComments, useLikeDiscussion, useCreateDiscussionComment,
  getGetDiscussionQueryKey, getListDiscussionCommentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Heart, Eye, MessageCircle, Lock, Pin, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ReportButton } from "@/components/shared/report-button";
import { SaveButton } from "@/components/shared/save-button";
import { MemberGate } from "@/components/shared/member-gate";
import { DisplayAsSelector, type DisplayAs, getDisplayName } from "@/components/shared/display-as-selector";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_LABELS: Record<string, string> = {
  medical: "Medical Assistance", shidduchim: "Shidduchim",
  livelihood: "Livelihood", education: "Education",
  charity: "Charity", community: "Community Affairs", general: "General Discussion",
};

export default function ForumDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id ?? "0", 10);
  const qc = useQueryClient();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [reply, setReply] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [displayAs, setDisplayAs] = useState<DisplayAs>("nickname");

  const { data: discussion, isLoading } = useGetDiscussion(numId, {
    query: { queryKey: getGetDiscussionQueryKey(numId), enabled: !!numId },
  });
  const { data: comments } = useListDiscussionComments(numId, {
    query: { queryKey: getListDiscussionCommentsQueryKey(numId), enabled: !!numId },
  });
  const like = useLikeDiscussion();
  const addComment = useCreateDiscussionComment();

  const handleLike = () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to like discussions", description: "Join Gavhah free to participate." });
      return;
    }
    like.mutate({ id: numId }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetDiscussionQueryKey(numId) }),
    });
  };

  const handleCommentLike = async (commentId: number) => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to like replies", description: "Join Gavhah free to participate." });
      return;
    }
    const res = await fetch(`/api/discussions/${numId}/comments/${commentId}/like`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      void qc.invalidateQueries({ queryKey: getListDiscussionCommentsQueryKey(numId) });
    }
  };

  const canManage = !!user && !!discussion && (discussion.authorId === user.id || isAdmin);

  const openEditDiscussion = () => {
    if (!discussion) return;
    setEditTitle(discussion.title);
    setEditContent(discussion.content);
    setEditCategory(discussion.category);
    setEditOpen(true);
  };

  const saveDiscussion = async () => {
    if (!discussion || !editTitle.trim() || !editContent.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/discussions/${discussion.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
          category: editCategory,
          isPinned: discussion.isPinned,
        }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueryData(getGetDiscussionQueryKey(numId), updated);
      void qc.invalidateQueries({ queryKey: ["/api/discussions"] });
      setEditOpen(false);
      toast({ title: "Discussion updated" });
    } catch {
      toast({ title: "Could not update discussion", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteDiscussion = async () => {
    if (!discussion || !window.confirm("Delete this discussion?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/discussions/${discussion.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      void qc.invalidateQueries({ queryKey: ["/api/discussions"] });
      toast({ title: "Discussion deleted" });
      navigate("/forum");
    } catch {
      toast({ title: "Could not delete discussion", variant: "destructive" });
      setDeleting(false);
    }
  };

    const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    const authorName = getDisplayName(displayAs, user);
    addComment.mutate({ id: numId, data: { content: reply.trim(), authorName } }, {
      onSuccess: (comment) => {
        setReply("");
        qc.setQueryData(getListDiscussionCommentsQueryKey(numId), (current: any) => {
          const items = Array.isArray(current) ? current : [];
          return [...items.filter((item: any) => item.id !== comment.id), comment];
        });
        void qc.invalidateQueries({ queryKey: getGetDiscussionQueryKey(numId) });
        toast({ title: "Reply posted", description: "Your reply is now live." });
      },
      onError: () => toast({
        title: "Could not post reply",
        description: "Please try again.",
        variant: "destructive",
      }),
    });
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8">
          <Link href="/forum">
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-primary mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to Forum
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : discussion ? (
          <>
            <div className="bg-card border rounded-xl p-8 shadow-sm mb-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-secondary/10 text-secondary text-xs font-semibold uppercase tracking-wider rounded-full">
                    {CATEGORY_LABELS[discussion.category] || discussion.category}
                  </span>
                  {discussion.isPinned && (
                    <span className="px-3 py-1 bg-accent/20 text-accent-foreground text-xs font-semibold rounded-full flex items-center gap-1">
                      <Pin className="h-3 w-3" /> Pinned
                    </span>
                  )}
                  {discussion.isLocked && (
                    <span className="px-3 py-1 bg-muted text-muted-foreground text-xs font-semibold rounded-full flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" onClick={openEditDiscussion} title="Edit discussion">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => void deleteDiscussion()}
                        disabled={deleting}
                        title="Delete discussion"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <SaveButton
                    contentType="discussion"
                    contentId={discussion.id}
                    contentTitle={discussion.title}
                    contentUrl={`/forum/${discussion.id}`}
                  />
                  <ReportButton contentType="discussion" contentId={discussion.id} />
                </div>
              </div>

              <h1 className="font-serif text-3xl font-bold text-primary mb-4 leading-tight">
                {discussion.title}
              </h1>

              <div className="text-sm text-muted-foreground mb-6 flex flex-wrap gap-4">
                <span>Posted by <span className="font-semibold text-foreground">{discussion.authorName}</span></span>
                <span>{format(new Date(discussion.createdAt), "MMMM d, yyyy")}</span>
              </div>

              <div className="prose prose-slate max-w-none text-foreground leading-relaxed mb-8">
                {discussion.content.split("\n").map((para, i) => (
                  <p key={i} className="mb-3">{para}</p>
                ))}
              </div>

              <div className="flex items-center gap-6 pt-4 border-t text-sm text-muted-foreground">
                <button
                  onClick={handleLike}
                  className="flex items-center gap-2 hover:text-secondary transition-colors"
                  disabled={like.isPending}
                >
                  <Heart className="h-4 w-4" />
                  <span>{discussion.likes} likes</span>
                </button>
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span>{discussion.views} views</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  <span>{discussion.commentCount} comments</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h2 className="font-serif text-2xl font-bold text-primary">
                Comments ({comments?.length ?? 0})
              </h2>
              {comments?.map(comment => (
                <div key={comment.id} className="bg-card border rounded-xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-foreground text-sm">{comment.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                  <p className="text-foreground leading-relaxed">{comment.content}</p>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <button
                      className="flex items-center gap-1 hover:text-secondary transition-colors"
                      onClick={() => void handleCommentLike(comment.id)}
                    >
                      <Heart className="h-3 w-3" /> {comment.likes}
                    </button>
                  </div>
                </div>
              ))}
              {(comments?.length === 0) && (
                <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">
                  No comments yet. Be the first to respond.
                </div>
              )}
            </div>

            {!discussion.isLocked && (
              <MemberGate action="leave a reply" compact={!user}>
                <div className="bg-card border rounded-xl p-6 shadow-sm">
                  <h3 className="font-serif font-bold text-primary mb-4">Leave a Reply</h3>
                  <form onSubmit={handleComment} className="space-y-4">
                    <Textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      placeholder="Share your thoughts or advice..."
                      className="min-h-28 resize-none"
                    />
                    <DisplayAsSelector value={displayAs} onChange={setDisplayAs} />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        className="bg-secondary hover:bg-secondary/90 text-white"
                        disabled={addComment.isPending || !reply.trim()}
                      >
                        {addComment.isPending ? "Posting..." : "Post Reply"}
                      </Button>
                    </div>
                  </form>
                </div>
              </MemberGate>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Edit Discussion</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Title</Label><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} /></div>
                  <div><Label>Message</Label><Textarea className="min-h-40" value={editContent} onChange={e => setEditContent(e.target.value)} /></div>
                  <div><Label>Category</Label><Input value={editCategory} onChange={e => setEditCategory(e.target.value)} /></div>
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveDiscussion()} disabled={savingEdit || !editTitle.trim() || !editContent.trim()}>
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="text-center py-24">
            <p className="font-serif text-xl text-muted-foreground">Discussion not found.</p>
            <Link href="/forum"><Button className="mt-4">Back to Forum</Button></Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
