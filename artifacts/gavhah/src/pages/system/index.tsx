import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import {
  useListReports, useResolveReport, useListUsers, useBanUser, useSuspendUser,
  useListAnnouncements, useCreateAnnouncement, useDeleteAnnouncement,
  getListReportsQueryKey, getListUsersQueryKey, getListAnnouncementsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, Users, Flag, Megaphone, CheckCircle, Ban, Clock, Trash2,
  MessageSquare, HelpCircle, ChevronDown, ChevronUp, Send, AlertTriangle, Settings
} from "lucide-react";
import { format } from "date-fns";

const FAQ = [
  { q: "How do I submit a help request?", a: "Go to the Activists Directory, click the 'Help Requests' tab, and press 'Submit a Request'. Fill out the form and our team will connect you with appropriate volunteers." },
  { q: "How do I volunteer?", a: "Visit the Activists Directory and click 'Register as Volunteer'. Fill in your skills, availability, and location." },
  { q: "How do I add a minyan?", a: "Go to the Minyan Directory and click 'Add Minyan'. Your submission is reviewed before appearing publicly." },
  { q: "What is My Askanus?", a: "My Askanus is your personal activism dashboard. It helps you track cases, manage tasks, log your impact, and stay organized in your chesed work." },
  { q: "Who can create a group?", a: "Any registered member can create a group. Groups can be public, private, or password-protected." },
  { q: "How do I report inappropriate content?", a: "Every post, discussion, and listing has a report button. Click it, select a reason, and our moderation team will review it." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/20 transition-colors">
        <span className="font-semibold text-foreground text-sm pr-4">{q}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{a}</div>}
    </div>
  );
}

export default function SystemCenter() {
  const qc = useQueryClient();
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [supportForm, setSupportForm] = useState({ name: "", email: "", type: "", subject: "", message: "" });

  const { data: reports } = useListReports({}, { query: { queryKey: getListReportsQueryKey({}) } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey({}) } });
  const { data: announcements } = useListAnnouncements({ query: { queryKey: getListAnnouncementsQueryKey() } });

  const resolveReport = useResolveReport();
  const banUser = useBanUser();
  const suspendUser = useSuspendUser();
  const createAnn = useCreateAnnouncement();
  const deleteAnn = useDeleteAnnouncement();

  const { isAdmin } = useAuth();
  const pendingReports = reports?.filter(r => r.status === "pending") ?? [];
  const statusColor = (status: string) => status === "active" ? "default" : status === "suspended" ? "secondary" : "destructive";

  const AdminOnly = ({ children }: { children: React.ReactNode }) => isAdmin ? <>{children}</> : (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center">
        <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h2 className="font-serif text-xl font-bold text-primary mb-2">Admin Access Required</h2>
        <p className="text-muted-foreground text-sm">This section is for administrators only.</p>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-secondary" />
            <h1 className="font-serif text-4xl font-bold text-primary">System Center</h1>
          </div>
          <p className="text-muted-foreground font-serif italic ml-11">
            Platform administration, moderation, community support, and system settings.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <Tabs defaultValue="support" className="space-y-8">
          <TabsList className="bg-muted/50 flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="support" className="gap-2"><MessageSquare className="h-4 w-4" /> Contact & Support</TabsTrigger>
            <TabsTrigger value="faq" className="gap-2"><HelpCircle className="h-4 w-4" /> FAQ</TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <Flag className="h-4 w-4" /> Moderation
              {pendingReports.length > 0 && <span className="bg-destructive text-white text-xs rounded-full px-1.5">{pendingReports.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Users</TabsTrigger>
            <TabsTrigger value="announcements" className="gap-2"><Megaphone className="h-4 w-4" /> Announcements</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" /> Settings</TabsTrigger>
          </TabsList>

          {/* Contact & Support */}
          <TabsContent value="support" className="space-y-8">
            <h2 className="font-serif text-2xl font-bold text-primary">Contact & Support</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-card border rounded-xl p-6">
                <h3 className="font-semibold text-foreground mb-5">Send a Message</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="font-semibold">Your Name</Label>
                      <Input value={supportForm.name} onChange={e => setSupportForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-semibold">Email</Label>
                      <Input type="email" value={supportForm.email} onChange={e => setSupportForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" className="h-11" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Type</Label>
                    <Select value={supportForm.type} onValueChange={v => setSupportForm(f => ({ ...f, type: v }))}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="support">Technical Support</SelectItem>
                        <SelectItem value="feedback">Feedback</SelectItem>
                        <SelectItem value="suggestion">Suggestion</SelectItem>
                        <SelectItem value="report">Content Report</SelectItem>
                        <SelectItem value="other">General Inquiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Subject</Label>
                    <Input value={supportForm.subject} onChange={e => setSupportForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief subject" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Message</Label>
                    <Textarea value={supportForm.message} onChange={e => setSupportForm(f => ({ ...f, message: e.target.value }))} placeholder="Describe your issue or feedback..." className="min-h-28 resize-none" />
                  </div>
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-white gap-2 h-12" onClick={() => setSupportForm({ name: "", email: "", type: "", subject: "", message: "" })}>
                    <Send className="h-4 w-4" /> Submit Message
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-card border rounded-xl p-6">
                  <h3 className="font-semibold text-foreground mb-4">Contact Information</h3>
                  <div className="space-y-3 text-sm">
                    {[
                      { label: "General Support", value: "support@gavhah.org" },
                      { label: "Community Moderation", value: "moderation@gavhah.org" },
                      { label: "Technical Issues", value: "tech@gavhah.org" },
                      { label: "Office Hours", value: "Sunday–Thursday, 9AM–5PM EST" },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between py-2 border-b last:border-0">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-accent/10 border border-accent/20 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-accent-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm mb-1">Urgent Chesed Matter?</p>
                      <p className="text-sm text-muted-foreground">For time-sensitive community emergencies, contact us immediately via the Reservations page to book a same-day consultation slot.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* FAQ */}
          <TabsContent value="faq" className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-primary">Frequently Asked Questions</h2>
            <div className="space-y-2">
              {FAQ.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
            </div>
          </TabsContent>

          {/* Moderation */}
          <TabsContent value="reports" className="space-y-4">
            <AdminOnly>
            <h2 className="font-serif text-2xl font-bold text-primary">Content Moderation</h2>
            {reports?.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic flex flex-col items-center gap-2">
                <CheckCircle className="h-8 w-8 text-green-500" />
                No pending reports to review.
              </div>
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
                  <Button size="sm" variant="outline" className="gap-2 shrink-0"
                    onClick={() => resolveReport.mutate({ id: report.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListReportsQueryKey({}) }) })}
                    disabled={resolveReport.isPending}
                  >
                    <CheckCircle className="h-4 w-4 text-green-600" /> Resolve
                  </Button>
                )}
              </div>
            ))}
            </AdminOnly>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users" className="space-y-4">
            <AdminOnly>
            <h2 className="font-serif text-2xl font-bold text-primary">User Management</h2>
            {users?.map(user => (
              <div key={user.id} className="bg-card border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-lg shrink-0">{user.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">{user.name}</span>
                    <Badge variant={statusColor(user.status) as any}>{user.status}</Badge>
                    <Badge variant="outline" className="capitalize">{user.role}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  {user.location && <p className="text-xs text-muted-foreground">{user.location}</p>}
                </div>
                {user.status === "active" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => suspendUser.mutate({ id: user.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) }) })}
                      disabled={suspendUser.isPending}
                    ><Clock className="h-3 w-3" /> Suspend</Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/20 hover:bg-destructive/5"
                      onClick={() => banUser.mutate({ id: user.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListUsersQueryKey({}) }) })}
                      disabled={banUser.isPending}
                    ><Ban className="h-3 w-3" /> Ban</Button>
                  </div>
                )}
              </div>
            ))}
            </AdminOnly>
          </TabsContent>

          {/* Announcements */}
          <TabsContent value="announcements" className="space-y-6">
            <AdminOnly>
            <h2 className="font-serif text-2xl font-bold text-primary">Announcements</h2>
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Create Announcement</h3>
              <form className="space-y-4" onSubmit={e => {
                e.preventDefault();
                if (!annTitle || !annContent) return;
                createAnn.mutate({ data: { title: annTitle, content: annContent } }, {
                  onSuccess: () => { setAnnTitle(""); setAnnContent(""); qc.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }); }
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
                  onClick={() => deleteAnn.mutate({ id: ann.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }) })}
                ><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {announcements?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">No announcements yet.</div>
            )}
            </AdminOnly>
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="space-y-6">
            <AdminOnly>
            <h2 className="font-serif text-2xl font-bold text-primary">Platform Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { title: "User Registration", desc: "Allow new users to register", status: "enabled" },
                { title: "Email Notifications", desc: "Send email notifications to users", status: "enabled" },
                { title: "SMS Module", desc: "Send SMS alerts (requires provider setup)", status: "disabled" },
                { title: "Public Volunteer Directory", desc: "Allow public viewing of volunteer profiles", status: "enabled" },
                { title: "Guest Content Access", desc: "Allow non-registered users to view posts", status: "enabled" },
                { title: "Maintenance Mode", desc: "Temporarily disable public access", status: "disabled" },
              ].map((setting, i) => (
                <div key={i} className="bg-card border rounded-xl p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{setting.title}</p>
                    <p className="text-xs text-muted-foreground">{setting.desc}</p>
                  </div>
                  <Badge variant={setting.status === "enabled" ? "default" : "outline"} className="shrink-0">{setting.status}</Badge>
                </div>
              ))}
            </div>
            </AdminOnly>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
