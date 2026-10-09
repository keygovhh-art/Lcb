import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetGroup, useListGroupMembers, useListGroupPosts, useJoinGroup, useCreateGroupPost,
  getGetGroupQueryKey, getListGroupMembersQueryKey, getListGroupPostsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, Lock, Globe, KeyRound, MessageCircle, Pencil, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { MemberGate } from "@/components/shared/member-gate";
import { DisplayAsSelector, type DisplayAs, getDisplayName } from "@/components/shared/display-as-selector";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/shared/image-upload-field";
import { UpvoteButton } from "@/components/shared/upvote-button";
import { useUpvoteStates } from "@/hooks/use-upvote-states";

const privacyIcon = (p: string) => {
  if (p === "private") return <Lock className="h-4 w-4" />;
  if (p === "password_protected") return <KeyRound className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
};

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id ?? "0", 10);
  const qc = useQueryClient();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [newPost, setNewPost] = useState("");
  const [displayAs, setDisplayAs] = useState<DisplayAs>("nickname");
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({ name: "", description: "", privacy: "public", imageUrl: "" });

  const { data: group, isLoading } = useGetGroup(numId, {
    query: { queryKey: getGetGroupQueryKey(numId), enabled: !!numId },
  });
  const { data: members } = useListGroupMembers(numId, {
    query: { queryKey: getListGroupMembersQueryKey(numId), enabled: !!numId && !!group },
  });

  const join = useJoinGroup();
  const createPost = useCreateGroupPost();

  const isOwner = !!user && group?.ownerId === user.id;
  const canManageGroup = !!user && (isOwner || isAdmin);
  const ownMembership = !!user ? (members ?? []).find((member: any) => member.userId === user.id) : undefined;
  const isPendingMember = ownMembership?.status === "pending";
  const isMember = !!user && (isOwner || ownMembership?.status === "approved");
  const canReadPosts = !!group && (group.privacy === "public" || isMember || isAdmin);

  const { data: posts } = useListGroupPosts(numId, {
    query: { queryKey: getListGroupPostsQueryKey(numId), enabled: !!numId && canReadPosts },
  });
  const postUpvotes = useUpvoteStates(
    "group_post",
    Array.isArray(posts) ? posts.map((post: any) => post.id) : [],
    isAuthenticated && canReadPosts,
  );

  const openGroupEdit = () => {
    if (!group) return;
    setEditGroupForm({
      name: group.name ?? "",
      description: group.description ?? "",
      privacy: group.privacy ?? "public",
      imageUrl: group.imageUrl ?? "",
    });
    setEditGroupOpen(true);
  };

  const saveGroupEdit = async () => {
    if (!group || !editGroupForm.name.trim() || !editGroupForm.description.trim()) return;
    setSavingGroup(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editGroupForm.name.trim(),
          description: editGroupForm.description.trim(),
          privacy: editGroupForm.privacy,
          imageUrl: editGroupForm.imageUrl.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueryData(getGetGroupQueryKey(numId), updated);
      void qc.invalidateQueries({ queryKey: ["/api/groups"] });
      setEditGroupOpen(false);
      toast({ title: "Group updated" });
    } catch {
      toast({ title: "Could not update group", variant: "destructive" });
    } finally {
      setSavingGroup(false);
    }
  };

  const deleteGroup = async () => {
    if (!group || !window.confirm("Delete this group and its group page?")) return;
    setDeletingGroup(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      void qc.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Group deleted" });
      navigate("/groups");
    } catch {
      toast({ title: "Could not delete group", variant: "destructive" });
      setDeletingGroup(false);
    }
  };

  const handleJoin = () => {
    join.mutate(
      { id: numId },
      {
        onSuccess: (member: any) => {
          void qc.invalidateQueries({ queryKey: getListGroupMembersQueryKey(numId) });
          void qc.invalidateQueries({ queryKey: getGetGroupQueryKey(numId) });
          toast({
            title: member.status === "pending" ? "Join request sent" : "Joined group",
            description: member.status === "pending"
              ? "The group owner will review your request."
              : "You can now participate in the group.",
          });
        },
        onError: () => toast({ title: "Could not join group", variant: "destructive" }),
      }
    );
  };

  const reviewMembership = async (memberId: number, status: "approved" | "rejected") => {
    const res = await fetch(`/api/groups/${numId}/members/${memberId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast({ title: "Could not review membership request", variant: "destructive" });
      return;
    }
    const updated = await res.json();
    qc.setQueryData(getListGroupMembersQueryKey(numId), (current: any) =>
      Array.isArray(current)
        ? current.map((member: any) => member.id === memberId ? updated : member)
        : current
    );
    void qc.invalidateQueries({ queryKey: getGetGroupQueryKey(numId) });
    toast({ title: status === "approved" ? "Member approved" : "Request rejected" });
  };

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    const authorName = getDisplayName(displayAs, user);
    createPost.mutate({ id: numId, data: { content: newPost, authorName } }, {
      onSuccess: (post) => {
        setNewPost("");
        qc.setQueryData(getListGroupPostsQueryKey(numId), (current: any) => {
          const items = Array.isArray(current) ? current : [];
          return [post, ...items.filter((item: any) => item.id !== post.id)];
        });
        void qc.invalidateQueries({ queryKey: getGetGroupQueryKey(numId) });
        toast({ title: "Post published", description: "It is now live in the group." });
      },
      onError: (error: any) => toast({
        title: "Could not publish post",
        description: error?.message?.includes("403") ? "Join this group before posting." : "Please try again.",
        variant: "destructive",
      }),
    });
  };

  const savePostEdit = async (postId: number) => {
    const content = editingPostContent.trim();
    if (!content) return;
    const res = await fetch(`/api/groups/${numId}/posts/${postId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      toast({ title: "Could not update post", variant: "destructive" });
      return;
    }
    const updated = await res.json();
    qc.setQueryData(getListGroupPostsQueryKey(numId), (current: any) =>
      Array.isArray(current) ? current.map((item: any) => item.id === postId ? updated : item) : current
    );
    setEditingPostId(null);
    setEditingPostContent("");
    toast({ title: "Post updated" });
  };

  const deletePost = async (postId: number) => {
    if (!window.confirm("Delete this group post?")) return;
    const res = await fetch(`/api/groups/${numId}/posts/${postId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast({ title: "Could not delete post", variant: "destructive" });
      return;
    }
    qc.setQueryData(getListGroupPostsQueryKey(numId), (current: any) =>
      Array.isArray(current) ? current.filter((item: any) => item.id !== postId) : current
    );
    void qc.invalidateQueries({ queryKey: getGetGroupQueryKey(numId) });
    toast({ title: "Post deleted" });
  };

  const handlePostLike = async (postId: number) => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to upvote posts", description: "Join Gavhah free to participate." });
      return;
    }
    const res = await fetch(`/api/groups/${numId}/posts/${postId}/like`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const result = await res.json().catch(() => ({}));
      if (typeof result?.liked === "boolean") postUpvotes.setLiked(postId, result.liked);
      void qc.invalidateQueries({ queryKey: getListGroupPostsQueryKey(numId) });
    }
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8">
          <Link href="/groups">
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-primary mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to Groups
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : group ? (
          <>
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm mb-8">
              {group.imageUrl && (
                <div className="aspect-[4/1] bg-muted overflow-hidden">
                  <img src={group.imageUrl} alt={group.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                      {privacyIcon(group.privacy)}
                      <span className="capitalize">{group.privacy.replace("_", " ")}</span>
                    </div>
                    <h1 className="font-serif text-3xl font-bold text-primary">{group.name}</h1>
                    <p className="text-muted-foreground mt-2">Created by {group.ownerName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                  {canManageGroup && (
                    <>
                      <Button variant="outline" onClick={openGroupEdit} className="gap-2">
                        <Pencil className="h-4 w-4" /> Edit Group
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 text-destructive border-destructive/20"
                        onClick={() => void deleteGroup()}
                        disabled={deletingGroup}
                      >
                        <Trash2 className="h-4 w-4" /> {deletingGroup ? "Deleting..." : "Delete Group"}
                      </Button>
                    </>
                  )}
                  {isMember ? (
                    <Button variant="outline" className="shrink-0" disabled>
                      <Users className="h-4 w-4 mr-2" /> {isOwner ? "Group Owner" : "Member"}
                    </Button>
                  ) : isPendingMember ? (
                    <Button variant="outline" className="shrink-0" disabled>
                      <Clock className="h-4 w-4 mr-2" /> Request Pending
                    </Button>
                  ) : (
                    <MemberGate gate="groups" action="join this group" compact>
                      <Button
                        onClick={handleJoin}
                        className="bg-secondary hover:bg-secondary/90 text-white shrink-0"
                        disabled={join.isPending}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {join.isPending ? "Joining..." : group.privacy === "private" ? "Request to Join" : "Join Group"}
                      </Button>
                    </MemberGate>
                  )}
                  </div>
                </div>
                <p className="text-foreground mt-4 leading-relaxed">{group.description}</p>
                <div className="flex gap-6 mt-6 pt-6 border-t text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {group.memberCount} members</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4" /> {group.postCount} posts</span>
                  <span>Since {format(new Date(group.createdAt), "MMMM yyyy")}</span>
                </div>
              </div>
            </div>

            <Dialog open={editGroupOpen} onOpenChange={setEditGroupOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Edit Group</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Group Name</Label><Input value={editGroupForm.name} onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label>Description</Label><Textarea className="min-h-32" value={editGroupForm.description} onChange={e => setEditGroupForm(f => ({ ...f, description: e.target.value }))} /></div>
                  <div>
                    <Label>Privacy</Label>
                    <Select value={editGroupForm.privacy} onValueChange={privacy => setEditGroupForm(f => ({ ...f, privacy }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ImageUploadField
                    label="Group image"
                    value={editGroupForm.imageUrl}
                    onChange={imageUrl => setEditGroupForm(f => ({ ...f, imageUrl }))}
                  />
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveGroupEdit()} disabled={savingGroup || !editGroupForm.name.trim() || !editGroupForm.description.trim()}>
                    {savingGroup ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

                        <Tabs defaultValue="posts" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="posts">Posts</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
              </TabsList>

              <TabsContent value="posts" className="space-y-6">
                <MemberGate gate="groups" action="post in this group" compact>
                  {isMember ? (
                    <div className="bg-card border rounded-xl p-6">
                      <h3 className="font-semibold text-foreground mb-4">Share with the group</h3>
                      <form onSubmit={handlePost} className="space-y-4">
                        <Textarea
                          value={newPost}
                          onChange={e => setNewPost(e.target.value)}
                          placeholder="Write a post..."
                          className="min-h-24 resize-none"
                        />
                        <DisplayAsSelector value={displayAs} onChange={setDisplayAs} />
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            className="bg-secondary hover:bg-secondary/90 text-white"
                            disabled={createPost.isPending || !newPost.trim()}
                          >
                            {createPost.isPending ? "Posting..." : "Post"}
                          </Button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="bg-muted/30 border rounded-xl p-5 text-sm text-muted-foreground">
                      Join this group before posting.
                    </div>
                  )}
                </MemberGate>

                {posts?.map(post => (
                  <div key={post.id} className="bg-card border rounded-xl p-6">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="font-semibold text-foreground">{post.authorName}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(post.createdAt), "MMM d, yyyy")}
                        </span>
                        {!!user && (post.authorId === user.id || user.role === "admin" || user.role === "moderator") && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingPostId(post.id);
                                setEditingPostContent(post.content);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => void deletePost(post.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingPostId === post.id ? (
                      <div className="space-y-2">
                        <Textarea value={editingPostContent} onChange={e => setEditingPostContent(e.target.value)} className="min-h-24" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void savePostEdit(post.id)} disabled={!editingPostContent.trim()}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingPostId(null); setEditingPostContent(""); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
                    )}
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t text-sm text-muted-foreground">
                      <UpvoteButton
                        active={postUpvotes.isLiked(post.id)}
                        count={post.likes}
                        onClick={() => void handlePostLike(post.id)}
                        title={postUpvotes.isLiked(post.id) ? "Remove upvote" : "Upvote post"}
                      />
                    </div>
                  </div>
                ))}
                {posts?.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">
                    No posts yet. Be the first to share.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="members">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {members?.filter((member: any) => member.status !== "rejected").map((member: any) => (
                    <div key={member.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-lg">
                        {member.userName?.[0] ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">{member.userName}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {member.status === "pending" ? "Membership request pending" : `${member.role} · Joined ${format(new Date(member.joinedAt), "MMM yyyy")}`}
                        </div>
                      </div>
                      {canManageGroup && member.status === "pending" && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void reviewMembership(member.id, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20" onClick={() => void reviewMembership(member.id, "rejected")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {members?.length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground font-serif italic">
                      No members yet.
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="text-center py-24">
            <p className="font-serif text-xl text-muted-foreground">Group not found.</p>
            <Link href="/groups"><Button className="mt-4">Back to Groups</Button></Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
