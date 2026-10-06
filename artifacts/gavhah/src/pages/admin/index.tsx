import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useListReports, useResolveReport, useDismissReport, useListUsers, useBanUser, useSuspendUser,
  useListAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, useGetAdminStats,
  useListFeaturedCauses, useListCommunityProjects, useUpdateMinyan,
  getListReportsQueryKey, getListUsersQueryKey, getListAnnouncementsQueryKey, getGetAdminStatsQueryKey,
  getListFeaturedCausesQueryKey, getListCommunityProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Users, Flag, Megaphone, CheckCircle, Ban, Clock, Trash2, BarChart3,
  TrendingUp, Heart, MessageSquare, Globe, Star, AlertTriangle, UserCheck, BookmarkCheck, UserPlus,
  Lock, Sparkles, FolderKanban, HandHeart,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-lg bg-primary/8 flex items-center justify-center text-primary shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-2xl font-serif font-bold text-primary">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function FounderDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user, isLoaded, isAdmin } = useAuth();
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [adminMinyans, setAdminMinyans] = useState<any[]>([]);
  const [causeSubmissions, setCauseSubmissions] = useState<any[]>([]);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [adminReservations, setAdminReservations] = useState<any[]>([]);
  const [adminHelpRequests, setAdminHelpRequests] = useState<any[]>([]);
  const [causeActivity, setCauseActivity] = useState<any[]>([]);

  useEffect(() => {
    if (isLoaded && (!user || !isAdmin)) {
      navigate("/");
    }
  }, [isLoaded, user, isAdmin, navigate]);

  const loadAdminMinyans = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/minyans", { credentials: "include" });
      if (res.ok) setAdminMinyans(await res.json());
    } catch {}
  };

  const loadCauseSubmissions = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/cause-submissions", { credentials: "include" });
      if (res.ok) setCauseSubmissions(await res.json());
    } catch {}
  };

  const loadSupportMessages = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/support-messages", { credentials: "include" });
      if (res.ok) setSupportMessages(await res.json());
    } catch {}
  };

  const loadAdminReservations = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/reservations", { credentials: "include" });
      if (res.ok) setAdminReservations(await res.json());
    } catch {}
  };

  const loadAdminHelpRequests = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/help-requests", { credentials: "include" });
      if (res.ok) setAdminHelpRequests(await res.json());
    } catch {}
  };

  const loadCauseActivity = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/cause-activity", { credentials: "include" });
      if (res.ok) setCauseActivity(await res.json());
    } catch {}
  };

  useEffect(() => {
    void loadAdminMinyans();
    void loadCauseSubmissions();
    void loadSupportMessages();
    void loadAdminReservations();
    void loadAdminHelpRequests();
    void loadCauseActivity();
  }, [isAdmin]);

  const { data: stats } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey(), enabled: isAdmin } });
  const { data: reports } = useListReports({}, { query: { queryKey: getListReportsQueryKey({}), enabled: isAdmin } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey({}), enabled: isAdmin } });
  const { data: announcements } = useListAnnouncements({ query: { queryKey: getListAnnouncementsQueryKey() } });
  const { data: featuredCauses } = useListFeaturedCauses({}, { query: { queryKey: getListFeaturedCausesQueryKey({}), enabled: isAdmin } });
  const { data: projects } = useListCommunityProjects({}, { query: { queryKey: getListCommunityProjectsQueryKey({}), enabled: isAdmin } });

  const resolveReport = useResolveReport();
  const dismissReport = useDismissReport();
  const banUser = useBanUser();
  const suspendUser = useSuspendUser();
  const createAnn = useCreateAnnouncement();
  const deleteAnn = useDeleteAnnouncement();
  const updateMinyan = useUpdateMinyan();

  const pendingReports = reports?.filter(r => r.status === "pending") ?? [];

  const statusColor = (status: string) => {
    if (status === "active") return "default";
    if (status === "suspended") return "secondary";
    return "destructive";
  };

  if (!isLoaded) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="font-serif text-muted-foreground">Verifying access...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center">
            <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-serif text-2xl font-bold text-primary mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">This area is for founders and administrators only.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-secondary" />
            <h1 className="font-serif text-4xl font-bold text-primary">Founder Dashboard</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11">
            Platform oversight, management, and administration.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="bg-muted/50 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Support
              {supportMessages.filter(m => m.status === "open").length > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{supportMessages.filter(m => m.status === "open").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="help-requests" className="gap-2">
              <HandHeart className="h-4 w-4" /> Help Requests
              {adminHelpRequests.filter(r => r.status === "open").length > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{adminHelpRequests.filter(r => r.status === "open").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reservations" className="gap-2">
              <Clock className="h-4 w-4" /> Reservations
              {adminReservations.filter(r => r.status === "confirmed").length > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">{adminReservations.filter(r => r.status === "confirmed").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <Flag className="h-4 w-4" /> Reports
              {pendingReports.length > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{pendingReports.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Members</TabsTrigger>
            <TabsTrigger value="featured" className="gap-2"><Sparkles className="h-4 w-4" /> Featured</TabsTrigger>
            <TabsTrigger value="causes" className="gap-2"><HandHeart className="h-4 w-4" /> Causes</TabsTrigger>
            <TabsTrigger value="submissions" className="gap-2">
              <Star className="h-4 w-4" /> Cause Reviews
              {causeSubmissions.filter(c => c.status === "pending").length > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{causeSubmissions.filter(c => c.status === "pending").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2"><FolderKanban className="h-4 w-4" /> Projects</TabsTrigger>
            <TabsTrigger value="minyans" className="gap-2">
              <Clock className="h-4 w-4" /> Minyans
              {adminMinyans.filter(m => m.status === "pending").length > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{adminMinyans.filter(m => m.status === "pending").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2"><Megaphone className="h-4 w-4" /> Announcements</TabsTrigger>
          </TabsList>

          {/* ─── Overview ─── */}
          <TabsContent value="overview" className="space-y-8">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-1">Platform Overview</h2>
              <p className="text-muted-foreground text-sm">Live statistics across all departments.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Community</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<Users className="h-5 w-5" />} label="Total Members" value={stats?.totalMembers ?? "—"} sub={stats ? `${stats.activeMembers} active` : undefined} />
                <StatCard icon={<UserCheck className="h-5 w-5" />} label="Volunteers" value={stats?.totalVolunteers ?? "—"} sub="in directory" />
                <StatCard icon={<UserPlus className="h-5 w-5" />} label="Follows" value={stats?.totalFollows ?? "—"} sub="connections" />
                <StatCard icon={<BookmarkCheck className="h-5 w-5" />} label="Saved Items" value={stats?.totalSaved ?? "—"} sub="bookmarked" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Content</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<MessageSquare className="h-5 w-5" />} label="Forum Posts" value={stats?.totalDiscussions ?? "—"} />
                <StatCard icon={<Globe className="h-5 w-5" />} label="Chesed News" value={stats?.totalNews ?? "—"} />
                <StatCard icon={<Users className="h-5 w-5" />} label="Groups" value={stats?.totalGroups ?? "—"} />
                <StatCard icon={<Heart className="h-5 w-5" />} label="Causes" value={stats?.totalCauses ?? "—"} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Moderation</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<Star className="h-5 w-5" />} label="Projects" value={stats?.totalProjects ?? "—"} sub="community" />
                <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Pending Reports" value={stats?.pendingReports ?? "—"} sub={stats ? `${stats.totalReports ?? 0} total` : undefined} />
                <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Platform Health" value={stats && stats.pendingReports === 0 ? "Clean" : "Needs Review"} sub="moderation status" />
                <StatCard icon={<Shield className="h-5 w-5" />} label="Admin Status" value="Active" sub="operational" />
              </div>
            </div>
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-serif text-xl font-bold text-primary mb-1">Feature Management</h3>
              <p className="text-sm text-muted-foreground mb-6">Active modules across the platform.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "Chesed News Center", sub: "Articles and global news", active: true },
                  { label: "Askanim Forum", sub: "Discussion boards", active: true },
                  { label: "Activists Directory", sub: "Volunteer profiles and projects", active: true },
                  { label: "United In Kindness", sub: "Featured cause system", active: true },
                  { label: "Today's Cause", sub: "Daily charity spotlight", active: true },
                  { label: "Minyan Directory", sub: "Worldwide minyan times", active: true },
                  { label: "Group Center", sub: "Community groups and posts", active: true },
                  { label: "My Askanus", sub: "Case management system", active: true },
                  { label: "Communications", sub: "Olam Hachesed broadcasts", active: true },
                  { label: "Reservations", sub: "Office reservation system", active: false },
                ].map(feat => (
                  <div key={feat.label} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div>
                      <p className="font-medium text-sm text-foreground">{feat.label}</p>
                      <p className="text-xs text-muted-foreground">{feat.sub}</p>
                    </div>
                    <Badge variant={feat.active ? "default" : "secondary"} className={feat.active ? "bg-green-100 text-green-800 border-green-200" : ""}>
                      {feat.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ─── Support Inbox ─── */}
          <TabsContent value="support" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Support Inbox</h2>
              <p className="text-muted-foreground text-sm mt-1">Messages submitted through System Center.</p>
            </div>
            {supportMessages.map(msg => (
              <div key={msg.id} className="bg-card border rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{msg.subject}</h3>
                      <Badge variant={msg.status === "open" ? "destructive" : "secondary"} className="capitalize">{msg.status}</Badge>
                      <Badge variant="outline" className="capitalize">{msg.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{msg.message}</p>
                    <p className="text-xs text-muted-foreground">{msg.name} · {msg.email} · {format(new Date(msg.createdAt), "MMM d, yyyy h:mm a")}</p>
                  </div>
                  {msg.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const res = await fetch(`/api/admin/support-messages/${msg.id}`, {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "resolved" }),
                        });
                        if (res.ok) await loadSupportMessages();
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {supportMessages.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No support messages yet.</div>
            )}
          </TabsContent>

          {/* ─── Help Requests ─── */}
          <TabsContent value="help-requests" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Help Requests</h2>
              <p className="text-muted-foreground text-sm mt-1">Private contact details are visible here only to administrators.</p>
            </div>
            {adminHelpRequests.map(req => (
              <div key={req.id} className="bg-card border rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-semibold text-foreground">{req.name}</h3>
                      <Badge variant={req.status === "open" ? "destructive" : "secondary"} className="capitalize">{req.status}</Badge>
                      <Badge variant="outline" className="capitalize">{req.needType}</Badge>
                      <Badge variant="outline" className="capitalize">{req.urgency}</Badge>
                    </div>
                    <p className="text-sm text-foreground mb-2">{req.description}</p>
                    <p className="text-xs text-muted-foreground">Private contact: {req.contactInfo}</p>
                  </div>
                  {req.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const res = await fetch(`/api/help-requests/${req.id}`, {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "resolved", isFeatured: req.isFeatured }),
                        });
                        if (res.ok) await loadAdminHelpRequests();
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Mark Resolved
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {adminHelpRequests.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No help requests yet.</div>
            )}
          </TabsContent>

          {/* ─── Reservations ─── */}
          <TabsContent value="reservations" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Office Reservations</h2>
              <p className="text-muted-foreground text-sm mt-1">Live appointments booked through the public reservation page.</p>
            </div>
            {adminReservations.map(r => (
              <div key={r.id} className="bg-card border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{r.name}</h3>
                    <Badge variant={r.status === "confirmed" ? "default" : "secondary"} className="capitalize">{r.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(r.reservationDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    {" · "}{r.reservationTime}{" · "}{String(r.purpose).replace("_", " ")}
                  </p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                </div>
                {r.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/20"
                    onClick={async () => {
                      const res = await fetch(`/api/reservations/${r.id}`, {
                        method: "DELETE",
                        credentials: "include",
                      });
                      if (res.ok) await loadAdminReservations();
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ))}
            {adminReservations.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No reservations yet.</div>
            )}
          </TabsContent>

          {/* ─── Reports ─── */}
          <TabsContent value="reports" className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-primary">Content Reports</h2>
            {reports?.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No reports to review.</div>
            )}
            {reports?.map(report => (
              <div key={report.id} className="bg-card border rounded-xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant={report.status === "pending" ? "destructive" : "secondary"}>{report.status}</Badge>
                    <span className="text-sm font-semibold text-foreground capitalize">{report.reason.replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">· {report.contentType} #{report.contentId}</span>
                  </div>
                  {report.description && <p className="text-sm text-muted-foreground">{report.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(report.createdAt), "MMM d, yyyy")}</p>
                </div>
                {report.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="gap-2"
                      onClick={() => resolveReport.mutate({ id: report.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListReportsQueryKey({}) }) })}
                      disabled={resolveReport.isPending}>
                      <CheckCircle className="h-4 w-4 text-green-600" /> Resolve
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground"
                      onClick={() => dismissReport.mutate({ id: report.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListReportsQueryKey({}) }) })}
                      disabled={dismissReport.isPending}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          {/* ─── Members / Users ─── */}
          <TabsContent value="users" className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-primary">Member Management</h2>
            {users?.map(u => (
              <div key={u.id} className="bg-card border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-lg shrink-0">
                  {u.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">{u.name}</span>
                    <Badge variant={statusColor(u.status) as any}>{u.status}</Badge>
                    <Badge variant="outline" className="capitalize">{u.role}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  {u.location && <p className="text-xs text-muted-foreground">{u.location}</p>}
                </div>
                {u.status === "active" && (
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => suspendUser.mutate({ id: u.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) }) })}
                      disabled={suspendUser.isPending}>
                      <Clock className="h-3 w-3" /> Suspend
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/20 hover:bg-destructive/5"
                      onClick={() => banUser.mutate({ id: u.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) }) })}
                      disabled={banUser.isPending}>
                      <Ban className="h-3 w-3" /> Ban
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {users?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">No members yet.</div>
            )}
          </TabsContent>

          {/* ─── Featured Content ─── */}
          <TabsContent value="featured" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Featured Content</h2>
              <p className="text-muted-foreground text-sm mt-1">Manage what appears as featured causes on the platform.</p>
            </div>
            {featuredCauses?.map(fc => (
              <div key={fc.id} className="bg-card border rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-serif font-bold text-primary">{fc.title}</h3>
                      <Badge variant={fc.status === "active" ? "default" : "secondary"} className={fc.status === "active" ? "bg-green-100 text-green-800 border-green-200" : ""}>{fc.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{fc.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>{fc.supporterCount} supporters</span>
                      {fc.goalAmount != null && (
                        <span>Goal: ${fc.goalAmount.toLocaleString()}</span>
                      )}
                      <span>Raised: ${fc.amountRaised.toLocaleString()}</span>
                      {fc.location && <span>{fc.location}</span>}
                      {fc.deadline && (
                        <span>Deadline: {format(new Date(fc.deadline), "MMM d, yyyy")}</span>
                      )}
                    </div>
                  </div>
                  {fc.imageUrl && (
                    <img src={fc.imageUrl} alt={fc.title} className="w-24 h-16 object-cover rounded-lg border shrink-0" />
                  )}
                </div>
              </div>
            ))}
            {featuredCauses?.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No featured causes at this time.</div>
            )}
          </TabsContent>

          {/* ─── Cause Activity ─── */}
          <TabsContent value="causes" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Cause Activity</h2>
              <p className="text-muted-foreground text-sm mt-1">Recent donations and cause support across the platform.</p>
            </div>
            <div className="space-y-3">
              {causeActivity?.map(cs => (
                <div key={cs.id} className="bg-card border rounded-xl p-5 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                    <Heart className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{cs.name}</span>
                      {cs.pledgeAmount != null && (
                        <Badge variant="outline" className="text-green-700 border-green-200">${Number(cs.pledgeAmount).toLocaleString()}</Badge>
                      )}
                      <Badge variant="secondary" className="capitalize">{cs.pledgeType}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate capitalize">{cs.causeType}</p>
                    {cs.message && <p className="text-xs text-muted-foreground mt-1 italic">"{cs.message}"</p>}
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(cs.createdAt), "MMM d, yyyy")}</p>
                  </div>
                </div>
              ))}
            </div>
            {causeActivity?.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No cause activity yet.</div>
            )}
          </TabsContent>

          {/* ─── Cause Submission Reviews ─── */}
          <TabsContent value="submissions" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Cause Submissions</h2>
              <p className="text-muted-foreground text-sm mt-1">Review member suggestions and promote an approved submission to the active featured cause.</p>
            </div>
            {causeSubmissions.map(cs => (
              <div key={cs.id} className="bg-card border rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-serif font-bold text-primary">{cs.title}</h3>
                      <Badge variant={cs.status === "approved" ? "default" : cs.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                        {cs.status}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{cs.urgency}</Badge>
                    </div>
                    <p className="text-sm text-foreground mb-2">{cs.description}</p>
                    <p className="text-xs text-muted-foreground">Submitted by {cs.submittedBy}{cs.location ? ` · ${cs.location}` : ""}</p>
                  </div>
                  {cs.status === "pending" && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-secondary hover:bg-secondary/90 text-white"
                        onClick={async () => {
                          const res = await fetch(`/api/cause-submissions/${cs.id}/approve`, {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({}),
                          });
                          if (res.ok) {
                            await loadCauseSubmissions();
                            void qc.invalidateQueries({ queryKey: getListFeaturedCausesQueryKey({}) });
                          }
                        }}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve as Featured
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/20"
                        onClick={async () => {
                          const res = await fetch(`/api/cause-submissions/${cs.id}/reject`, {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({}),
                          });
                          if (res.ok) await loadCauseSubmissions();
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {causeSubmissions.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No cause submissions yet.</div>
            )}
          </TabsContent>

          {/* ─── Projects ─── */}
          <TabsContent value="projects" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Community Projects</h2>
              <p className="text-muted-foreground text-sm mt-1">All community projects and their current status.</p>
            </div>
            {projects?.map(p => (
              <div key={p.id} className="bg-card border rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-serif font-bold text-primary">{p.title}</h3>
                      <Badge variant="outline" className="capitalize">{p.type}</Badge>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className={p.status === "active" ? "bg-green-100 text-green-800 border-green-200" : ""}>{p.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{p.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Organizer: {p.organizerName}</span>
                      {p.location && <span>Location: {p.location}</span>}
                      <span>Since {format(new Date(p.createdAt), "MMM d, yyyy")}</span>
                    </div>
                    {p.goalDescription && (
                      <p className="text-xs text-muted-foreground mt-2">Goal: {p.goalDescription}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {projects?.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No community projects yet.</div>
            )}
          </TabsContent>

          {/* ─── Minyan Moderation ─── */}
          <TabsContent value="minyans" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Minyan Submissions</h2>
              <p className="text-muted-foreground text-sm mt-1">Review community submissions before they appear publicly.</p>
            </div>
            {adminMinyans.map(m => (
              <div key={m.id} className="bg-card border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-serif font-bold text-primary">{m.synagogueName}</h3>
                    <Badge variant={m.status === "approved" ? "default" : m.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                      {m.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{m.city}, {m.country}{m.community ? ` · ${m.community}` : ""}</p>
                  <p className="text-xs text-muted-foreground mt-1">Shacharis: {m.shacharis} · Mincha: {m.mincha} · Maariv: {m.maariv}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {m.status !== "approved" && (
                    <Button
                      size="sm"
                      className="bg-secondary hover:bg-secondary/90 text-white"
                      disabled={updateMinyan.isPending}
                      onClick={() => updateMinyan.mutate(
                        { id: m.id, data: { status: "approved" } },
                        { onSuccess: loadAdminMinyans }
                      )}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  )}
                  {m.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/20"
                      disabled={updateMinyan.isPending}
                      onClick={() => updateMinyan.mutate(
                        { id: m.id, data: { status: "rejected" } },
                        { onSuccess: loadAdminMinyans }
                      )}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {adminMinyans.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No minyan submissions yet.</div>
            )}
          </TabsContent>

          {/* ─── Announcements ─── */}
          <TabsContent value="announcements" className="space-y-6">
            <h2 className="font-serif text-2xl font-bold text-primary">Announcements</h2>
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Create Announcement</h3>
              <form className="space-y-4" onSubmit={e => {
                e.preventDefault();
                if (!annTitle || !annContent) return;
                createAnn.mutate({ data: { title: annTitle.trim(), content: annContent.trim() } }, {
                  onSuccess: (announcement) => {
                    setAnnTitle("");
                    setAnnContent("");
                    qc.setQueryData(getListAnnouncementsQueryKey(), (current: any) => {
                      const items = Array.isArray(current) ? current : [];
                      return [announcement, ...items.filter((item: any) => item.id !== announcement.id)];
                    });
                    void qc.invalidateQueries({ queryKey: ["/api/announcements"] });
                    toast({ title: "Announcement published", description: "It is now live on the platform." });
                  },
                  onError: () => toast({ title: "Could not publish announcement", variant: "destructive" }),
                });
              }}>
                <Input value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Announcement title" className="h-11" />
                <Textarea value={annContent} onChange={e => setAnnContent(e.target.value)} placeholder="Announcement content..." className="min-h-24 resize-none" />
                <Button type="submit" className="bg-secondary hover:bg-secondary/90 text-white" disabled={createAnn.isPending}>
                  {createAnn.isPending ? "Posting..." : "Post Announcement"}
                </Button>
              </form>
            </div>
            {announcements?.map(ann => (
              <div key={ann.id} className="bg-card border rounded-xl p-6 flex gap-4">
                <div className="flex-1">
                  <h4 className="font-serif font-bold text-primary mb-1">{ann.title}</h4>
                  <p className="text-muted-foreground text-sm mb-2">{ann.content}</p>
                  <p className="text-xs text-muted-foreground">By {ann.authorName} · {format(new Date(ann.createdAt), "MMM d, yyyy")}</p>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteAnn.mutate({ id: ann.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {announcements?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">No announcements yet.</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
