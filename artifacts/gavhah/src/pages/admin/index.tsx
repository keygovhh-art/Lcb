import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListReports, useResolveReport, useDismissReport, useListUsers, useBanUser, useSuspendUser,
  useListAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, useGetAdminStats,
  useListFeaturedCauses, useListCommunityProjects, useUpdateMinyan,
  getListReportsQueryKey, getListUsersQueryKey, getListAnnouncementsQueryKey, getGetAdminStatsQueryKey,
  getListFeaturedCausesQueryKey, getListCommunityProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Users, Flag, Megaphone, CheckCircle, Ban, Clock, Trash2, Edit3, BarChart3,
  TrendingUp, Heart, MessageSquare, Globe, Star, AlertTriangle, UserCheck, BookmarkCheck, UserPlus,
  Lock, Sparkles, FolderKanban, HandHeart, ExternalLink, RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { CharityManagement } from "@/components/admin/charity-management";
import { FeaturedCauseManagement } from "@/components/admin/featured-cause-management";
import { SiteCopyManagement } from "@/components/admin/site-copy-management";
import { MembershipGateManagement } from "@/components/admin/membership-gate-management";
import { AdvancedMemberManagement } from "@/components/admin/advanced-member-management";
import { OperationsInbox } from "@/components/admin/operations-inbox";
import { PrivateAssistanceManagement } from "@/components/admin/private-assistance-management";
import { EngagementManagement } from "@/components/admin/engagement-management";
import { PinnedAnnouncementManagement } from "@/components/admin/pinned-announcement-management";

function reportContentPath(type: string, id: number) {
  if (type === "news") return `/news/${id}`;
  if (type === "discussion") return `/forum/${id}`;
  return null;
}

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
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const { user, isLoaded, isAdmin } = useAuth();
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [editAnnId, setEditAnnId] = useState<number | null>(null);
  const [editAnnTitle, setEditAnnTitle] = useState("");
  const [editAnnContent, setEditAnnContent] = useState("");
  const [savingAnnEdit, setSavingAnnEdit] = useState(false);
  const [adminMinyans, setAdminMinyans] = useState<any[]>([]);
  const [causeSubmissions, setCauseSubmissions] = useState<any[]>([]);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [supportResolutionNotes, setSupportResolutionNotes] = useState<Record<number, string>>({});
  const [adminReservations, setAdminReservations] = useState<any[]>([]);
  const [adminHelpRequests, setAdminHelpRequests] = useState<any[]>([]);
  const [helpResolutionNotes, setHelpResolutionNotes] = useState<Record<number, string>>({});
  const [causeActivity, setCauseActivity] = useState<any[]>([]);


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

  const startAnnouncementEdit = (ann: any) => {
    setEditAnnId(ann.id);
    setEditAnnTitle(ann.title ?? "");
    setEditAnnContent(ann.content ?? "");
  };

  const saveAnnouncementEdit = async () => {
    if (!editAnnId || !editAnnTitle.trim() || !editAnnContent.trim()) return;
    setSavingAnnEdit(true);
    try {
      const res = await fetch(`/api/announcements/${editAnnId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editAnnTitle.trim(), content: editAnnContent.trim() }),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      qc.setQueryData(getListAnnouncementsQueryKey(), (current: any) =>
        Array.isArray(current) ? current.map((item: any) => item.id === editAnnId ? updated : item) : current
      );
      void qc.invalidateQueries({ queryKey: ["/api/announcements"] });
      setEditAnnId(null);
      toast({ title: "Announcement updated" });
    } catch {
      toast({ title: "Could not update announcement", variant: "destructive" });
    } finally {
      setSavingAnnEdit(false);
    }
  };

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

  if (!user) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center py-24 px-4">
          <div className="text-center max-w-md">
            <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-serif text-2xl font-bold text-primary mb-2">Administrator Sign In</h2>
            <p className="text-muted-foreground mb-5">Sign in with a staff account to open the management center.</p>
            <Link href="/login?return=%2Ffounder">
              <Button>Sign In to Administration</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center py-24 px-4">
          <div className="text-center max-w-lg">
            <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-serif text-2xl font-bold text-primary mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              You are signed in, but this account does not currently have staff access.
            </p>
            <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
              Current role: <span className="font-semibold">{user.role}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Administration requires an admin or moderator role. You are no longer redirected away silently.
            </p>
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
        <Tabs defaultValue="operations" className="space-y-8">
          <TabsList className="bg-muted/50 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="operations" className="gap-2">
              <AlertTriangle className="h-4 w-4" /> Operations Inbox
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="engagement" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Comments & Views
            </TabsTrigger>
            <TabsTrigger value="site-copy" className="gap-2">
              <Edit3 className="h-4 w-4" /> Live Site Editor
            </TabsTrigger>
            <TabsTrigger value="welcome-pages" className="gap-2">
              <Edit3 className="h-4 w-4" /> {yi ? "ברוכים־הבאים־בלעטער" : "Welcome Page Designer"}
            </TabsTrigger>
            {(user?.role === "admin" || user?.role === "super_admin") && (
              <TabsTrigger value="member-management" className="gap-2">
                <Users className="h-4 w-4" /> {yi ? "מעמבער־פארוואלטונג" : "Advanced Members"}
              </TabsTrigger>
            )}
            <TabsTrigger value="support" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Support
              {supportMessages.filter(m => m.status === "open").length > 0 && (
                <span className="bg-destructive text-white text-xs rounded-full px-1.5 py-0.5">{supportMessages.filter(m => m.status === "open").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="private-assistance" className="gap-2">
              <HandHeart className="h-4 w-4" /> {yi ? "פריוואטער הילף־צענטער" : "Private Assistance Matching"}
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
            <TabsTrigger value="charity" className="gap-2"><Heart className="h-4 w-4" /> Charity</TabsTrigger>
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

          <details className="rounded-xl border bg-card p-4 sm:p-5 text-sm">
            <summary className="cursor-pointer font-semibold text-primary text-base">
              {yi ? "וויאזוי ארבעט די אדמיניסטראציע? — ערקלערונג פאר אלע קנעפלעך" :
                "How administration works — what the actions actually do"}
            </summary>
            <div className="mt-4 space-y-3 text-muted-foreground leading-relaxed">
              <p>
                {yi ? "דער אפעראציע־אינבאקס איז דער הויפט־פלאץ פאר אלע אריינקומענדע בקשות. צוטיילן צו אן אדמין, אויסקלויבן א מצב און אריינשרייבן נאטיצן פארמאכט נישט דעם פאל." :
                  "Operations Inbox is the central place for incoming cases. Assigning staff, changing status or writing notes never completes the case."}
              </p>
              <p>
                <strong className="text-foreground">{yi ? "באשטעטיגן:" : "Approve:"}</strong>{" "}
                {yi ? "מיינט אין יעדע אפטיילונג אן אנדער זאך: פובליקירן א הילף־בקשה, ערלויבן א גרופע־מיטגליד, אדער אננעמען א ריפליי. דאס איז נישט קיין באווייז אז די הילף איז שוין געלונגען." :
                  "Its effect depends on the section: publishing a help request, admitting a group member, or publishing a reply. It never proves that real assistance was delivered."}
              </p>
              <p>
                <strong className="text-foreground">{yi ? "פארמאכן:" : "Close:"}</strong>{" "}
                {yi ? "מוז קומען נאכן אמתן ערלעדיגן. ביי פשוטע מעסעדזשעס דארף מען שרייבן וואס מען האט געטאן; ביי וואלונטיר־פארבינדונגען קען מען נישט באצייכענען הצלחה ביז דער בעטער אליין באשטעטיגט." :
                  "Requires a recorded follow-up for ordinary messages. Volunteer introductions cannot be marked successful until the requester confirms real contact."}
              </p>
              <p>
                <strong className="text-foreground">{yi ? "נאך־ארבעט:" : "Follow-up:"}</strong>{" "}
                {yi ? "נוץ די אינערליכע נאטיצן, דער פאראנטווארטליכער אדמין, און א טערמין. זאכן וואס ווארטן צו לאנג ווערן ארויסגעהויבן." :
                  "Assign an owner, due date and internal notes. Overdue cases are highlighted."}
              </p>
              <p>
                {yi ? "חשוב: די וועבסייט שיקט אינערליכע מעלדונגען. SMS און אוטאמאטישע אימעילס זענען דערווייל נישט פארבונדן." :
                  "Website inbox notifications are active; SMS and automated email are not connected."}
              </p>
            </div>
          </details>

          {/* ─── Operations Inbox ─── */}
          <TabsContent value="operations" className="space-y-6">
            <OperationsInbox />
          </TabsContent>

          {/* ─── Comments, Replies & Views ─── */}
          <TabsContent value="engagement" className="space-y-6">
            <EngagementManagement />
          </TabsContent>

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
                  { label: "Today's Cause", sub: "Charity spotlight active; online payments not connected", active: true },
                  { label: "Minyan Directory", sub: "Worldwide minyan times", active: true },
                  { label: "Group Center", sub: "Community groups and posts", active: true },
                  { label: "My Askanus", sub: "Case management system", active: true },
                  { label: "Communications", sub: "Website broadcasts active; phone/SMS provider not connected", active: true },
                  { label: "Reservations", sub: "Live office reservation system", active: true },
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

          <TabsContent value="welcome-pages" className="space-y-6">
            <MembershipGateManagement />
          </TabsContent>
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <TabsContent value="member-management" className="space-y-6">
              <AdvancedMemberManagement />
            </TabsContent>
          )}

          {/* ─── Live Site Editor ─── */
          <TabsContent value="site-copy" className="space-y-6">
            <SiteCopyManagement />
          </TabsContent>

          {/* ─── Support Inbox ─── */}
          <TabsContent value="support" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Support Inbox</h2>
              <p className="text-muted-foreground text-sm mt-1">{yi ? "דא קען מען באהאנדלען מעסעדזשעס. א פאל ווערט פארמאכט נאר נאך א דאקומענטירטן ערלעדיגונג." : "Handle incoming messages with a documented action before closing them."}</p>
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
                    msg.type === "volunteer_contact" ? (
                      <p className="text-xs max-w-xs rounded-md border p-2 bg-muted/30">
                        {yi ? "פארבינדונג־בקשה: פיהר עס ווייטער אינעם אפעראציע־אינבאקס. איבערקוקן אליין איז נישט קיין הצלחה." :
                          "Member connection: continue in Operations Inbox. Review alone cannot complete the introduction."}
                      </p>
                    ) : (
                      <div className="space-y-2 w-full sm:max-w-xs">
                        <p className="text-xs text-muted-foreground">
                          {yi ? "וואס האסטו פאקטיש געטאן? שרייב א נאטיץ איידער דו פארמאכסט." :
                            "Describe the real follow-up before closing this request."}
                        </p>
                        <Textarea
                          rows={2}
                          value={supportResolutionNotes[msg.id] || ""}
                          onChange={e => setSupportResolutionNotes(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          placeholder={yi ? "ערלעדיגט: וואס פונקטליך איז געטאן געווארן?" :
                            "What action was taken?"}
                        />
                        <Button
                          size="sm" variant="outline"
                          disabled={(supportResolutionNotes[msg.id] || "").trim().length < 10}
                          onClick={async () => {
                            if (!window.confirm(yi
                              ? "האסטו פאקטיש ערלעדיגט די זאך? דער פאל וועט פארשווינדן פונעם אפענעם אינבאקס."
                              : "Was the stated action really completed? This closes the open case.")) return;
                            const res = await fetch(`/api/admin/support-messages/${msg.id}`, {
                              method: "PATCH", credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "resolved", resolutionNote: supportResolutionNotes[msg.id].trim() }),
                            });
                            if (res.ok) {
                              await loadSupportMessages();
                              setSupportResolutionNotes(prev => ({ ...prev, [msg.id]: "" }));
                            } else {
                              const error = await res.json().catch(() => ({}));
                              toast({ title: error.error || "Could not close the request", variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          {yi ? "פארמאך נאכן ערלעדיגן" : "Close after follow-up"}
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
            {supportMessages.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No support messages yet.</div>
            )}
          </TabsContent>

          <TabsContent value="private-assistance" className="space-y-6">
            <PrivateAssistanceManagement />
          </TabsContent>

          {/* ─── Help Requests ─── */}
          <TabsContent value="help-requests" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Help Requests</h2>
              <p className="text-muted-foreground text-sm mt-1">{yi ? "יעדע בקשה בלייבט גענצליך פריוואט. באשטעטיגן מיינט נאר אז די מערכת נעמט איבער דעם פאל. זוך דעם פאסיגן עסקן אינעם פריוואטן הילף־צענטער." : "All help requests remain private. Approve means staff accepts the case internally, NEVER public publication. Find a suitable helper in Private Assistance Matching."}</p>
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
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {req.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-secondary hover:bg-secondary/90 text-white"
                          onClick={async () => {
                            const res = await fetch(`/api/help-requests/${req.id}`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "open", isFeatured: false }),
                            });
                            if (res.ok) {
                              await loadAdminHelpRequests();
                              void qc.invalidateQueries({ queryKey: ["/api/help-requests"] });
                            }
                          }}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> {yi ? "נעם איבער אינערליך" : "Accept Privately"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/20"
                          onClick={async () => {
                            const res = await fetch(`/api/help-requests/${req.id}`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "rejected", isFeatured: false }),
                            });
                            if (res.ok) await loadAdminHelpRequests();
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {req.status === "open" && (
                      <div className="w-full sm:max-w-xs space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {yi ? "די בקשה ווערט אינערליך באהאנדלט, נישט פובליק. שרייב וועלכע הילף איז טאקע געגעבן געווארן איידער דו פארמאכסט דעם פאל." :
                            "This request is being handled privately by staff, NOT publicly. Record assistance delivered before closing."}
                        </p>
                        <Textarea rows={2}
                          value={helpResolutionNotes[req.id] || ""}
                          onChange={e => setHelpResolutionNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder={yi ? "וואס איז פאקטיש געהאלפן געווארן?" : "What assistance was delivered?"}
                        />
                        <Button size="sm" variant="outline"
                          disabled={(helpResolutionNotes[req.id] || "").trim().length < 10}
                          onClick={async () => {
                            if (!window.confirm(yi
                              ? "איז די הילף טאקע געגעבן געווארן? דער פאל וועט ווערן פארמאכט."
                              : "Was real help delivered? This will mark the case fulfilled.")) return;
                            const res = await fetch(`/api/help-requests/${req.id}`, {
                              method: "PATCH", credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                status: "resolved", isFeatured: req.isFeatured,
                                resolutionNote: helpResolutionNotes[req.id].trim(),
                              }),
                            });
                            if (res.ok) {
                              await loadAdminHelpRequests();
                              void qc.invalidateQueries({ queryKey: ["/api/help-requests"] });
                            } else {
                              const error = await res.json().catch(() => ({}));
                              toast({ title: error.error || "Could not complete help request", variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          {yi ? "באשטעטיג אז די הילף איז געגעבן" : "Confirm real assistance delivered"}
                        </Button>
                      </div>
                    )}
                  </div>
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
                {r.status === "confirmed" && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-secondary hover:bg-secondary/90 text-white"
                      onClick={async () => {
                        const res = await fetch(`/api/reservations/${r.id}`, {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "completed" }),
                        });
                        if (res.ok) {
                          await loadAdminReservations();
                          toast({ title: "Reservation marked completed" });
                        }
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/20"
                      onClick={async () => {
                        const res = await fetch(`/api/reservations/${r.id}`, {
                          method: "DELETE",
                          credentials: "include",
                        });
                        if (res.ok) {
                          await loadAdminReservations();
                          toast({ title: "Reservation cancelled" });
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
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
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {reportContentPath(report.contentType, report.contentId) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => navigate(reportContentPath(report.contentType, report.contentId)!)}
                    >
                      <ExternalLink className="h-4 w-4" /> View Content
                    </Button>
                  )}
                  {report.status === "pending" && (
                    <>
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
                    </>
                  )}
                </div>
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
                {u.id !== user?.id && (
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {u.status === "active" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                          onClick={() => suspendUser.mutate(
                            { id: u.id },
                            {
                              onSuccess: () => {
                                void qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
                                toast({ title: "Member suspended" });
                              },
                              onError: () => toast({ title: "Could not suspend member", variant: "destructive" }),
                            }
                          )}
                          disabled={suspendUser.isPending}
                        >
                          <Clock className="h-3 w-3" /> Suspend
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive/20 hover:bg-destructive/5"
                          onClick={() => banUser.mutate(
                            { id: u.id },
                            {
                              onSuccess: () => {
                                void qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
                                toast({ title: "Member banned" });
                              },
                              onError: () => toast({ title: "Could not ban member", variant: "destructive" }),
                            }
                          )}
                          disabled={banUser.isPending}
                        >
                          <Ban className="h-3 w-3" /> Ban
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-green-700 border-green-200 hover:bg-green-50"
                        onClick={async () => {
                          const res = await fetch(`/api/users/${u.id}`, {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "active" }),
                          });
                          if (res.ok) {
                            void qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
                            toast({ title: "Member reactivated" });
                          } else {
                            const body = await res.json().catch(() => ({}));
                            toast({ title: "Could not reactivate member", description: body.error, variant: "destructive" });
                          }
                        }}
                      >
                        <RotateCcw className="h-3 w-3" /> Reactivate
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {users?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">No members yet.</div>
            )}
          </TabsContent>

          {/* ─── Charity Management ─── */}
          <TabsContent value="charity">
            <CharityManagement />
          </TabsContent>

          {/* ─── Featured Content ─── */}
          <TabsContent value="featured">
            <FeaturedCauseManagement />
          </TabsContent>

          {/* ─── Cause Activity ─── */}
          <TabsContent value="causes" className="space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Cause Activity</h2>
              <p className="text-muted-foreground text-sm mt-1">Recent supporter pledges and cause activity across the platform.</p>
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
          <TabsContent value="announcements" className="space-y-8">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Announcements</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage pinned home announcements linked to official News posts, plus general platform announcements.
              </p>
            </div>

            <PinnedAnnouncementManagement />

            <div className="border-t pt-8">
              <h3 className="font-serif text-xl font-bold text-primary">General Platform Announcements</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                These legacy announcements are not automatically pinned to the home bar. Use the pinned manager above for the home announcement strip.
              </p>
              <div className="bg-card border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Create General Announcement</h3>
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
              <div key={ann.id} className="bg-card border rounded-xl p-6 flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  {editAnnId === ann.id ? (
                    <div className="space-y-3">
                      <Input value={editAnnTitle} onChange={e => setEditAnnTitle(e.target.value)} placeholder="Announcement title" className="h-10" />
                      <Textarea value={editAnnContent} onChange={e => setEditAnnContent(e.target.value)} placeholder="Announcement content..." className="min-h-24 resize-none" />
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white" onClick={() => void saveAnnouncementEdit()} disabled={savingAnnEdit || !editAnnTitle.trim() || !editAnnContent.trim()}>
                          {savingAnnEdit ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditAnnId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="font-serif font-bold text-primary mb-1">{ann.title}</h4>
                      <p className="text-muted-foreground text-sm mb-2 whitespace-pre-wrap">{ann.content}</p>
                      <p className="text-xs text-muted-foreground">By {ann.authorName} · {format(new Date(ann.createdAt), "MMM d, yyyy")}</p>
                    </>
                  )}
                </div>
                {editAnnId !== ann.id && (
                  <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary" onClick={() => startAnnouncementEdit(ann)}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteAnn.mutate(
                    { id: ann.id },
                    {
                      onSuccess: () => {
                        qc.setQueryData(getListAnnouncementsQueryKey(), (current: any) =>
                          Array.isArray(current) ? current.filter((item: any) => item.id !== ann.id) : current
                        );
                        void qc.invalidateQueries({ queryKey: ["/api/announcements"] });
                        toast({ title: "Announcement deleted" });
                      },
                      onError: () => toast({ title: "Could not delete announcement", variant: "destructive" }),
                    }
                  )}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {announcements?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">No general announcements yet.</div>
            )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
