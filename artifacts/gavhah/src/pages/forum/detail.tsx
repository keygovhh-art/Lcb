import { useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetDiscussion, useListDiscussionComments, useLikeDiscussion,
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
import { ArrowLeft, Eye, MessageCircle, Lock, Pin, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ReportButton } from "@/components/shared/report-button";
import { SaveButton } from "@/components/shared/save-button";
import { MemberGate } from "@/components/shared/member-gate";
import { DisplayAsSelector, type DisplayAs, getDisplayName } from "@/components/shared/display-as-selector";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useEngagementSettings, settingFor } from "@/lib/engagement-settings";
import { DiscussionTicker } from "@/components/shared/discussion-ticker";
import { UpvoteButton } from "@/components/shared/upvote-button";
import { useUpvoteStates } from "@/hooks/use-upvote-states";
import { visibleForumTopic } from "@/lib/forum-topic";

export default function ForumDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id ?? "0", 10);
  const qc = useQueryClient();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [reply, setReply] = useState("");
  const [replyParentId, setReplyParentId] = useState<number | null>(null);
  const [nestedReply, setNestedReply] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [displayAs, setDisplayAs] = useState<DisplayAs>("nickname");

  const { data: discussion, isLoading } = useGetDiscussion(numId, {
    query: { queryKey: getGetDiscussionQueryKey(numId), enabled: !!numId },
  });
  const { data: comments } = useListDiscussionComments(numId, {
    query: { queryKey: getListDiscussionCommentsQueryKey(numId), enabled: !!numId },
  });
  const like = useLikeDiscussion();
  const discussionUpvotes = useUpvoteStates("discussion", numId ? [numId] : [], isAuthenticated && !!numId);
  const commentUpvotes = useUpvoteStates(
    "comment",
    Array.isArray(comments) ? comments.map((comment: any) => comment.id) : [],
    isAuthenticated,
  );
  const { data: engagementSettings } = useEngagementSettings();
  const forumEngagement = settingFor(engagementSettings, "forum");

  const commentTree = useMemo(() => {
    const items = Array.isArray(comments) ? comments : [];
    const byId = new Map<number, any>();
    const roots: any[] = [];
    for (const item of items) byId.set(item.id, { ...item, children: [] });
    for (const item of byId.values()) {
      if (item.parentId && byId.has(item.parentId)) byId.get(item.parentId).children.push(item);
      else roots.push(item);
    }
    return roots;
  }, [comments]);

  const handleLike = () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to like discussions", description: "Join Gavhah free to participate." });
      return;
    }
    like.mutate({ id: numId }, {
      onSuccess: (result: any) => {
        if (typeof result?.liked === "boolean") discussionUpvotes.setLiked(numId, result.liked);
        void qc.invalidateQueries({ queryKey: getGetDiscussionQueryKey(numId) });
      },
    });
  };

  const saveCommentEdit = async (commentId: number) => {
    const content = editingCommentContent.trim();
    if (!content) return;
    const res = await fetch(`/api/discussions/${numId}/comments/${commentId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      toast({ title: "Could not update reply", variant: "destructive" });
      return;
    }
    const updated = await res.json();
    qc.setQueryData(getListDiscussionCommentsQueryKey(numId), (current: any) =>
      Array.isArray(current) ? current.map((item: any) => item.id === commentId ? updated : item) : current
    );
    setEditingCommentId(null);
    setEditingCommentContent("");
    toast({ title: "Reply updated" });
  };

  const deleteComment = async (commentId: number) => {
    if (!window.confirm("Delete this reply?")) return;
    const res = await fetch(`/api/discussions/${numId}/comments/${commentId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast({ title: "Could not delete reply", variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: getListDiscussionCommentsQueryKey(numId) });
    await qc.invalidateQueries({ queryKey: getGetDiscussionQueryKey(numId) });
    toast({ title: "Reply deleted" });
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
      const result = await res.json().catch(() => ({}));
      if (typeof result?.liked === "boolean") commentUpvotes.setLiked(commentId, result.liked);
      void qc.invalidateQueries({ queryKey: getListDiscussionCommentsQueryKey(numId) });
    }
  };

  const canManage = !!user && !!discussion && (discussion.authorId === user.id || isAdmin);

  const openEditDiscussion = () => {
    if (!discussion) return;
    setEditTitle(discussion.title);
    setEditContent(discussion.content);
    setEditCategory(visibleForumTopic(discussion.category));
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
          category: editCategory.trim(),
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

  const submitComment = async (content: string, parentId: number | null) => {
    const clean = content.trim();
    if (!clean || postingComment) return;
    const authorName = getDisplayName(displayAs, user);
    setPostingComment(true);
    try {
      const res = await fetch(`/api/discussions/${numId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: clean, parentId, authorName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && forumEngagement.replyMode === "off") {
          toast({ title: "Replies are currently turned off", variant: "destructive" });
          return;
        }
        throw new Error(body.error || "Could not post reply");
      }

      if (res.status === 202 || body.pending) {
        toast({
          title: "Sent for review",
          description: "Your reply will appear after the team approves it.",
        });
      } else {
        toast({ title: "Reply posted", description: "Your reply is now live." });
        await qc.invalidateQueries({ queryKey: getListDiscussionCommentsQueryKey(numId) });
        await qc.invalidateQueries({ queryKey: getGetDiscussionQueryKey(numId) });
      }

      if (parentId === null) setReply("");
      else {
        setNestedReply("");
        setReplyParentId(null);
      }
    } catch (error) {
      toast({
        title: "Could not post reply",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPostingComment(false);
    }
  };

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    void submitComment(reply, null);
  };

  const renderComment = (comment: any, depth = 0): React.ReactNode => {
    const visualDepth = Math.min(depth, 5);
    return (
      <div key={comment.id} className={depth === 0 ? "" : "mt-3"}>
        <div
          className="bg-card border rounded-xl p-4 sm:p-5"
          style={{ marginInlineStart: visualDepth * 14 }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="font-semibold text-foreground text-sm">{comment.authorName}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {format(new Date(comment.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
              {!!user && (comment.authorId === user.id || isAdmin) && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingCommentId(comment.id);
                      setEditingCommentContent(comment.content);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => void deleteComment(comment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {editingCommentId === comment.id ? (
            <div className="space-y-2">
              <Textarea
                value={editingCommentContent}
                onChange={e => setEditingCommentContent(e.target.value)}
                className="min-h-24"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void saveCommentEdit(comment.id)} disabled={!editingCommentContent.trim()}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingCommentId(null); setEditingCommentContent(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          )}

          <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <UpvoteButton
              active={commentUpvotes.isLiked(comment.id)}
              count={comment.likes}
              onClick={() => void handleCommentLike(comment.id)}
              title={commentUpvotes.isLiked(comment.id) ? "Remove upvote" : "Upvote comment"}
            />
            {forumEngagement.replyMode !== "off" && (
              <button
                className="flex items-center gap-1 hover:text-secondary transition-colors"
                onClick={() => {
                  setReplyParentId(current => current === comment.id ? null : comment.id);
                  setNestedReply("");
                }}
              >
                <MessageCircle className="h-3 w-3" /> Reply
              </button>
            )}
          </div>

          {replyParentId === comment.id && forumEngagement.replyMode !== "off" && (
            <MemberGate gate="forum" action="reply to this comment" compact={!user}>
              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                <Textarea
                  value={nestedReply}
                  onChange={e => setNestedReply(e.target.value)}
                  placeholder={forumEngagement.replyMode === "review" ? "Write a reply — it will wait for review..." : "Write a reply..."}
                  className="min-h-20 resize-none"
                />
                <div className="mt-2">
                  <DisplayAsSelector value={displayAs} onChange={setDisplayAs} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {forumEngagement.replyMode === "review" ? "This reply will be reviewed before it goes live." : ""}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setReplyParentId(null); setNestedReply(""); }}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => void submitComment(nestedReply, comment.id)}
                      disabled={postingComment || !nestedReply.trim()}
                    >
                      {postingComment ? "Sending..." : "Reply"}
                    </Button>
                  </div>
                </div>
              </div>
            </MemberGate>
          )}
        </div>

        {Array.isArray(comment.children) && comment.children.map((child: any) => renderComment(child, depth + 1))}
      </div>
    );
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

      <DiscussionTicker excludeId={numId} />

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
                  {visibleForumTopic(discussion.category) && (
                    <span className="px-3 py-1 bg-secondary/10 text-secondary text-xs font-semibold rounded-full break-words">
                      {visibleForumTopic(discussion.category)}
                    </span>
                  )}
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
                <UpvoteButton
                  active={discussionUpvotes.isLiked(numId)}
                  count={discussion.likes}
                  pending={like.isPending}
                  onClick={() => handleLike()}
                  label="upvotes"
                  title={discussionUpvotes.isLiked(numId) ? "Remove upvote" : "Upvote discussion"}
                />
                {forumEngagement.showViews && (
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>{discussion.views} views</span>
                  </div>
                )}
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
              {commentTree.map(comment => renderComment(comment))}
              {(comments?.length === 0) && (
                <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">
                  No comments yet. Be the first to respond.
                </div>
              )}
            </div>

            {!discussion.isLocked && forumEngagement.replyMode !== "off" && (
              <MemberGate gate="forum" action="leave a reply" compact={!user}>
                <div className="bg-card border rounded-xl p-6 shadow-sm">
                  <h3 className="font-serif font-bold text-primary mb-2">Leave a Reply</h3>
                  {forumEngagement.replyMode === "review" && (
                    <p className="text-xs text-amber-700 mb-4">
                      Replies in this section are reviewed by the team before they appear publicly.
                    </p>
                  )}
                  <form onSubmit={handleComment} className="space-y-4">
                    <Textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      placeholder={forumEngagement.replyMode === "review" ? "Share your thoughts — this will wait for review..." : "Share your thoughts or advice..."}
                      className="min-h-28 resize-none"
                    />
                    <DisplayAsSelector value={displayAs} onChange={setDisplayAs} />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        className="bg-secondary hover:bg-secondary/90 text-white"
                        disabled={postingComment || !reply.trim()}
                      >
                        {postingComment ? "Sending..." : forumEngagement.replyMode === "review" ? "Send for Review" : "Post Reply"}
                      </Button>
                    </div>
                  </form>
                </div>
              </MemberGate>
            )}
            {!discussion.isLocked && forumEngagement.replyMode === "off" && (
              <div className="rounded-xl border bg-muted/20 p-5 text-center text-sm text-muted-foreground">
                Replies are currently turned off for this section.
              </div>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Edit Discussion</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Title</Label><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} /></div>
                  <div><Label>Message</Label><Textarea className="min-h-40" value={editContent} onChange={e => setEditContent(e.target.value)} /></div>
                  <div><Label>Topic (optional) / טעמע</Label><Input value={editCategory} onChange={e => setEditCategory(e.target.value)} maxLength={100} placeholder="אייגענע טעמע אדער ליידיג" /></div>
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
