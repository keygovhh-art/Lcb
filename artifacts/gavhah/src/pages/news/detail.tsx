import { useParams, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useGetNews, getGetNewsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, Eye, Share2, Heart, Pencil, Trash2 } from "lucide-react";
import { SaveButton } from "@/components/shared/save-button";
import { ReportButton } from "@/components/shared/report-button";
import { format } from "date-fns";
import { useLikeArticle } from "@/hooks/use-like-article";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useEngagementSettings, settingFor } from "@/lib/engagement-settings";
import { ImageUploadField } from "@/components/shared/image-upload-field";

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
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: engagementSettings } = useEngagementSettings();
  const newsEngagement = settingFor(engagementSettings, "news");
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    title: article.title ?? "",
    content: article.content ?? "",
    summary: article.summary ?? "",
    imageUrl: article.imageUrl ?? "",
    category: article.category ?? "announcement",
    urgency: article.urgency ?? "normal",
    deadline: article.deadline ?? "",
    organization: article.organization ?? "",
  });

  const canManage = !!user && (article.authorId === user.id || isAdmin);

  const openEdit = () => {
    setEditForm({
      title: article.title ?? "",
      content: article.content ?? "",
      summary: article.summary ?? "",
      imageUrl: article.imageUrl ?? "",
      category: article.category ?? "announcement",
      urgency: article.urgency ?? "normal",
      deadline: article.deadline ?? "",
      organization: article.organization ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editForm.title.trim() || !editForm.content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/news/${article.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          title: editForm.title.trim(),
          content: editForm.content.trim(),
          summary: editForm.summary.trim() || null,
          imageUrl: editForm.imageUrl.trim() || null,
          organization: editForm.organization.trim() || null,
          deadline: editForm.deadline || null,
        }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueryData(getGetNewsQueryKey(article.id), updated);
      void qc.invalidateQueries({ queryKey: ["/api/news"] });
      setEditOpen(false);
      toast({ title: "Update saved", description: "The published story has been updated." });
    } catch {
      toast({ title: "Could not save changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async () => {
    if (!window.confirm("Delete this published update?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/news/${article.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      void qc.invalidateQueries({ queryKey: ["/api/news"] });
      toast({ title: "Update deleted" });
      setLocation("/news");
    } catch {
      toast({ title: "Could not delete update", variant: "destructive" });
      setDeleting(false);
    }
  };

  const handleLike = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      toast({ title: "Sign in to like stories", description: "Join Gavhah free to show appreciation for chesed stories." });
      setLocation("/login");
      return;
    }
    toggle(e);
  };

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
              onClick={handleLike}
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
            {canManage && (
              <>
                <Button variant="outline" size="sm" className="gap-2" onClick={openEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive border-destructive/20"
                  onClick={() => void deleteArticle()}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" /> {deleting ? "Deleting..." : "Delete"}
                </Button>
              </>
            )}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Published Update</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Content</Label><Textarea className="min-h-40" value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} /></div>
            <div><Label>Summary</Label><Textarea value={editForm.summary} onChange={e => setEditForm(f => ({ ...f, summary: e.target.value }))} /></div>
            <ImageUploadField
              label="Image"
              value={editForm.imageUrl}
              onChange={imageUrl => setEditForm(f => ({ ...f, imageUrl }))}
            />
            <div><Label>Organization</Label><Input value={editForm.organization} onChange={e => setEditForm(f => ({ ...f, organization: e.target.value }))} /></div>
            <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveEdit()} disabled={saving || !editForm.title.trim() || !editForm.content.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="flex-1">
          <p className="font-serif font-bold text-primary">{article.authorName}</p>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[article.category] ?? article.category} · Gavhah Community
          </p>
        </div>
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
