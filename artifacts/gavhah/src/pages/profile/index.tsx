import { useState } from "react";
import { Link } from "wouter";
import {
  useListFollows, useDeleteFollow, useListSavedItems, useDeleteSavedItem,
  getListFollowsQueryKey, getListSavedItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, UserMinus, Bookmark, BookmarkX, ArrowRight, UserPlus, BookmarkCheck, ExternalLink, Pencil, MapPin, LockKeyhole } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/context/auth-context";
import { MemberGate } from "@/components/shared/member-gate";
import { MemberMailingProfile } from "@/components/shared/member-mailing-profile";
import { useToast } from "@/hooks/use-toast";

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
  const { user, isAuthenticated, isLoaded, refresh } = useAuth();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? "",
    nickname: user?.nickname ?? "",
    bio: (user as any)?.bio ?? "",
    location: (user as any)?.location ?? "",
  });

  const { data: follows, isLoading: followsLoading } = useListFollows({ query: { queryKey: getListFollowsQueryKey(), enabled: isAuthenticated } });
  const { data: saved, isLoading: savedLoading } = useListSavedItems({ query: { queryKey: getListSavedItemsQueryKey(), enabled: isAuthenticated } });

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

  const changePassword = async () => {
    if (!passwordForm.current || passwordForm.next.length < 8 || passwordForm.next !== passwordForm.confirm) {
      toast({
        title: "Check the password fields",
        description: passwordForm.next.length < 8 ? "New password must be at least 8 characters." : "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.next,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not change password");
      }

      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordOpen(false);
      toast({ title: "Password changed" });
    } catch (err) {
      toast({
        title: "Could not change password",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const openProfileEdit = () => {
    setProfileForm({
      name: user?.name ?? "",
      nickname: user?.nickname ?? "",
      bio: (user as any)?.bio ?? "",
      location: (user as any)?.location ?? "",
    });
    setEditOpen(true);
  };

  const saveProfile = async () => {
    if (!user?.id || !profileForm.name.trim() || !profileForm.nickname.trim()) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name.trim(),
          nickname: profileForm.nickname.trim(),
          bio: profileForm.bio.trim(),
          location: profileForm.location.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save profile");
      }
      await refresh();
      setEditOpen(false);
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({
        title: "Could not update profile",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  if (isLoaded && !isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <MemberGate gate="profile" action="view your profile">{null}</MemberGate>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                value={passwordForm.current}
                onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                value={passwordForm.next}
                onChange={e => setPasswordForm(f => ({ ...f, next: e.target.value }))}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={passwordForm.confirm}
                onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <Button
              className="w-full bg-secondary hover:bg-secondary/90 text-white"
              onClick={() => void changePassword()}
              disabled={savingPassword || !passwordForm.current || !passwordForm.next || !passwordForm.confirm}
            >
              {savingPassword ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Nickname / Display Name</Label>
              <Input value={profileForm.nickname} onChange={e => setProfileForm(f => ({ ...f, nickname: e.target.value }))} />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f, location: e.target.value }))} placeholder="City or community" />
            </div>
            <div>
              <Label>About Me</Label>
              <Textarea value={profileForm.bio} onChange={e => setProfileForm(f => ({ ...f, bio: e.target.value }))} className="min-h-28" placeholder="A short bio..." />
            </div>
            <Button
              className="w-full bg-secondary hover:bg-secondary/90 text-white"
              onClick={() => void saveProfile()}
              disabled={savingProfile || !profileForm.name.trim() || !profileForm.nickname.trim()}
            >
              {savingProfile ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="font-serif text-3xl font-bold text-primary">My Profile</h1>
                <p className="text-muted-foreground font-serif italic">{user?.nickname || user?.name || "Community Member"}</p>
                {(user as any)?.location && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {(user as any).location}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={openProfileEdit}>
                <Pencil className="h-4 w-4" /> Edit Profile
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setPasswordOpen(true)}>
                <LockKeyhole className="h-4 w-4" /> Change Password
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-4xl mb-6">
        <MemberMailingProfile />
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
