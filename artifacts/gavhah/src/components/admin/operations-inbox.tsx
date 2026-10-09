import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Clock, Flag, HandHeart, Inbox, MessageSquareText, RefreshCcw, Search, UserCog, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";

type WorkflowState = {
  assignedTo: number | null;
  workflowStatus: "new" | "in_review" | "waiting";
  dueAt: string | null;
  notes: Array<{ text: string; authorId: number; createdAt: string }>;
  updatedAt: string | null;
  updatedBy: number | null;
};

type OperationItem = {
  key: string;
  kind: string;
  id: number;
  priority: "critical" | "high" | "normal";
  title: string;
  summary: string;
  createdAt: string;
  meta: Record<string, any>;
  workflow: WorkflowState;
  overdue: boolean;
  escalated: boolean;
  ageHours: number;
};

type StaffMember = {
  id: number;
  name: string;
  nickname: string | null;
  role: string;
  status: string;
};

type InboxResponse = {
  counts: {
    total: number;
    reports: number;
    helpRequests: number;
    groupJoins: number;
    causeSubmissions: number;
    minyans: number;
    support: number;
    reservations: number;
    pendingComments: number;
  };
  items: OperationItem[];
};

const EMPTY: InboxResponse = {
  counts: { total: 0, reports: 0, helpRequests: 0, groupJoins: 0, causeSubmissions: 0, minyans: 0, support: 0, reservations: 0, pendingComments: 0 },
  items: [],
};

function labelForKind(kind: string, yi: boolean) {
  const en: Record<string, string> = {
    report: "Report",
    help_request: "Help Request",
    group_join: "Group Join",
    cause_submission: "Cause Review",
    minyan_submission: "Minyan Review",
    member_connection: "Member Connection",
    help_offer: "Help Offer",
    volunteer_registration: "Volunteer Registration",
    project_join: "Project Participation",
    cause_join: "Cause Participation",
    cause_support: "Cause Response",
    member_registration: "New Member",
    group_creation: "New Group",
    group_join_review: "Group Participation",
    project_creation: "New Project",
    reservation: "Reservation",
    support: "Support",
    feedback: "Feedback",
    suggestion: "Suggestion",
    system_error: "System Error",
    comment_review: "Reply Review",
  };
  const yid: Record<string, string> = {
    report: "רעפארט",
    help_request: "הילף־בקשה",
    group_join: "גרופע־אנשליסונג",
    cause_submission: "צוועק־איבערזיכט",
    minyan_submission: "מנין־איבערזיכט",
    member_connection: "פארבינדן מיטגלידער",
    help_offer: "הילף אנבאט",
    volunteer_registration: "נייער העלפער",
    project_join: "אנטייל אין פראיעקט",
    cause_join: "אנטייל אין צוועק",
    cause_support: "ענטפער אויף א צוועק",
    member_registration: "נייער מיטגליד",
    group_creation: "נייע גרופע",
    group_join_review: "גרופע־אנטייל",
    project_creation: "נייער פראיעקט",
    reservation: "אפיס־צייט",
    support: "הילף",
    feedback: "הערה",
    suggestion: "עצה",
    system_error: "סיסטעם־פראבלעם",
    comment_review: "ריפליי־ריוויו",
  };
  return (yi ? yid : en)[kind] || kind.replaceAll("_", " ");
}

function priorityBadge(priority: string, yi: boolean) {
  if (priority === "critical") return yi ? "קריטיש" : "Critical";
  if (priority === "high") return yi ? "וויכטיג" : "High";
  return yi ? "נארמאל" : "Normal";
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function OperationsInbox() {
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const { toast } = useToast();
  const [data, setData] = useState<InboxResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [legacyVolunteerIds, setLegacyVolunteerIds] = useState<Record<string, string>>({});
  const [closureReasons, setClosureReasons] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [res, usersRes] = await Promise.all([
        fetch("/api/admin/operations-inbox", { credentials: "include", cache: "no-store" }),
        fetch("/api/users", { credentials: "include", cache: "no-store" }),
      ]);
      if (!res.ok) throw new Error("Could not load management inbox");
      setData(await res.json());
      if (usersRes.ok) {
        const allUsers = await usersRes.json() as StaffMember[];
        setStaff(allUsers.filter(user =>
          user.status === "active" && ["moderator", "admin", "super_admin"].includes(user.role)
        ));
      }
    } catch (error) {
      toast({
        title: yi ? "מען האט נישט געקענט לאדן דעם אינבאקס" : "Could not load Operations Inbox",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.items.filter(item => {
      if (filter === "urgent" && !["critical", "high"].includes(item.priority)) return false;
      if (filter !== "all" && filter !== "urgent" && item.kind !== filter) return false;
      if (!q) return true;
      return [item.title, item.summary, labelForKind(item.kind, yi)]
        .some(value => String(value || "").toLowerCase().includes(q));
    });
  }, [data.items, filter, search, yi]);

  const request = async (url: string, method = "POST", body?: unknown) => {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Action failed");
    }
  };

  const connectionAction = async (item: OperationItem, action: "link" | "invite" | "close") => {
    const volunteerId = Number(legacyVolunteerIds[item.key]);
    const reason = (closureReasons[item.key] || "").trim();
    if (action === "link" && (!Number.isSafeInteger(volunteerId) || volunteerId <= 0)) {
      toast({ title: yi ? "שרייב א ריכטיגן וואלונטיר־נומער" : "Enter a valid volunteer ID", variant: "destructive" });
      return;
    }
    if (action === "close" && (reason.length < 10 || reason.length > 1000)) {
      toast({ title: yi ? "שרייב כאטש צען אותיות פארוואס עס איז נישט געלונגען" : "Give a reason of 10–1000 characters", variant: "destructive" });
      return;
    }
    if (action === "invite" && !window.confirm(
      yi
        ? "דאס שיקט א פארלאנג דורך דער וועבסייט צום וואלונטיר. עס שיקט דערווייל נישט קיין SMS אדער אימעיל. ווייטער?"
        : "This sends an IN-APP consent request to the volunteer, not SMS or email. Continue?"
    )) return;
    if (action === "close" && !window.confirm(
      yi ? "דער פאל וועט ווערן פארמאכט אלס נישט געלונגען, נישט אלס מצליח געווען. ווייטער?" :
        "Close this case as unsuccessful? It will NOT be counted as a successful connection."
    )) return;
    setBusy(item.key + action);
    try {
      const base = `/api/admin/member-connections/${item.id}`;
      await request(
        base + (action === "link" ? "/link" : action === "invite" ? "/invite" : "/close-unfulfilled"),
        "POST",
        action === "link" ? { volunteerId } : action === "close" ? { reason } : {},
      );
      toast({ title: yi ? "די פארבינדונג־בקשה איז אפדעיטעד" : "Connection case updated" });
      await load();
    } catch (error) {
      toast({
        title: yi ? "די אקציע איז נישט דורכגעגאנגען" : "Could not update connection case",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally { setBusy(null); }
  };

  const actionExplanation = (item: OperationItem) => {
    const descriptions: Record<string, [string, string]> = {
      report: [
        "באשטעטיגן מיינט אז דער רעפארט איז באהאנדלט; אפווארפן מיינט מען פארמאכט דעם רעפארט אן אננעמען די טענה. דאס מעקט נישט אויטאמאטיש די פאוסט.",
        "Resolve closes the report after investigation; Dismiss closes it without accepting the report. Neither automatically deletes the post.",
      ],
      help_request: [
        "באשטעטיגן שטעלט די בקשה אין דער עפנטליכער הילף־ליסטע. דאס מיינט נישט אז מען האט שוין געהאלפן.",
        "Approve publishes the help request to the public directory. It does NOT mean help was delivered.",
      ],
      group_join: [
        "באשטעטיגן ערלויבט דעם מיטגליד אריינצוקומען אין דער גרופע.",
        "Approve gives this member access to the group.",
      ],
      cause_submission: [
        "באשטעטיגן לאזט די פארגעשלאגענע צוועק ווייטערגיין צום פובליקירן.",
        "Approve lets the submitted cause progress to its public listing.",
      ],
      minyan_submission: [
        "באשטעטיגן לייגט אריין דעם מנין אין דער עפנטליכער ליסטע.",
        "Approve puts the minyan into the public directory.",
      ],
      reservation: [
        "פארטיג מיינט די אפיס־באגעגעניש איז שוין פאקטיש פארגעקומען; קענסל מאכט די באשטעלונג אויס.",
        "Complete means the appointment actually happened. Cancel removes the scheduled appointment.",
      ],
      comment_review: [
        "באשטעטיגן פובליקירט דעם פארהאלטענעם ריפליי. אפווארפן פארמיידט דאס פובליקירן.",
        "Approve publishes the held reply; Reject prevents publication.",
      ],
      member_connection: [
        "איבערקוקן אליין איז נישט גענוג. דער וואלונטיר מוז מסכים זיין; דער בעטער דארף זיך פארבינדן און באשטעטיגן אז עס איז געלונגען.",
        "Review alone is NOT completion. The volunteer must consent, and the requester must confirm real contact.",
      ],
    };
    const [yiddish, english] = descriptions[item.kind] || [
      "נעם קודם אחריות, פיהר אויס די נויטיגע ארבעט און שרייב א נאטיץ. נאר דערנאך קען מען דעם פאל פארמאכן.",
      "Take ownership, perform the required follow-up, and record what was done before closing.",
    ];
    return yi ? yiddish : english;
  };

  const act = async (item: OperationItem, action: string) => {
    if (item.kind === "member_connection") {
      toast({ title: yi ? "פארבינדונגען מוז מען פירן דורך דעם פולן פארבינדונג־פראצעס" :
        "Use the connection workflow; review alone cannot close this case", variant: "destructive" });
      return;
    }
    if (reviewOnly(item)) {
      if (!item.workflow.notes.length) {
        toast({
          title: yi ? "לייג קודם א אינערליכע נאטיץ וואס איז פאקטיש געטאן געווארן" :
            "Record the actual follow-up as an internal note before closing",
          variant: "destructive",
        });
        return;
      }
      if (!window.confirm(yi
        ? "האסטו טאקע דורכגעפירט די ארבעט וואס שטייט אין די נאטיצן? דער פאל וועט פארשווינדן פונעם אפענעם אינבאקס."
        : "Has the work described in the notes actually been done? This closes the case in the open inbox."
      )) return;
    }
    setBusy(item.key + action);
    try {
      if (item.kind === "report") {
        await request(`/api/reports/${item.id}/${action === "approve" ? "resolve" : "dismiss"}`);
      } else if (item.kind === "help_request") {
        await request(`/api/help-requests/${item.id}`, "PATCH", { status: action === "approve" ? "open" : "rejected" });
      } else if (item.kind === "group_join") {
        await request(`/api/groups/${item.meta.groupId}/members/${item.id}`, "PATCH", { status: action === "approve" ? "approved" : "rejected" });
      } else if (item.kind === "cause_submission") {
        await request(`/api/cause-submissions/${item.id}/${action === "approve" ? "approve" : "reject"}`);
      } else if (item.kind === "minyan_submission") {
        await request(`/api/minyans/${item.id}`, "PATCH", { status: action === "approve" ? "approved" : "rejected" });
      } else if (item.kind === "reservation") {
        await request(`/api/reservations/${item.id}`, "PATCH", { status: action === "approve" ? "completed" : "cancelled" });
      } else if (item.kind === "comment_review") {
        await request(`/api/admin/pending-comments/${item.id}/${action === "approve" ? "approve" : "reject"}`);
      } else {
        await request(`/api/admin/support-messages/${item.id}`, "PATCH", {
          status: "resolved", resolutionNote: item.workflow.notes[item.workflow.notes.length - 1]?.text || "",
        });
      }

      toast({ title: yi ? "די אקציע איז אפגעהיטן — זע די ערקלערונג אויבן" : "Action completed — see the outcome explanation" });
      await load();
    } catch (error) {
      toast({
        title: yi ? "די אקציע איז נישט דורכגעגאנגען" : "Action failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const updateWorkflow = async (item: OperationItem, patch: Record<string, unknown>) => {
    setBusy(item.key + ":workflow");
    try {
      await request("/api/admin/operations-workflow", "PATCH", { key: item.key, ...patch });
      toast({ title: yi ? "אפגעהיטן" : "Workflow saved" });
      await load();
    } catch (error) {
      toast({
        title: yi ? "מען האט נישט געקענט אפהיטן" : "Could not save workflow",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const reviewOnly = (item: OperationItem) => ![
    "report", "help_request", "group_join", "cause_submission", "minyan_submission", "reservation", "comment_review",
  ].includes(item.kind);

  const statCards = [
    { label: yi ? "אלעס אפן" : "Open Now", value: data.counts.total, icon: <Inbox className="h-4 w-4" /> },
    { label: yi ? "רעפארטס" : "Reports", value: data.counts.reports, icon: <Flag className="h-4 w-4" /> },
    { label: yi ? "הילף־בקשות" : "Help Requests", value: data.counts.helpRequests, icon: <HandHeart className="h-4 w-4" /> },
    { label: yi ? "ווארט אויף ריוויו" : "Reply Reviews", value: data.counts.pendingComments, icon: <MessageSquareText className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6 text-secondary" />
            <h2 className="font-serif text-2xl font-bold text-primary">
              {yi ? "אפעראציע־אינבאקס" : "Operations Inbox"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            {yi
              ? "איין פלאץ פאר אלע זאכן וואס דארפן א מענטש׳נס איבערזיכט. גארנישט זאל פאלן צווישן די בענקלעך."
              : "One place for everything that needs human review so requests do not fall through the cracks."}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          {yi ? "פריש לאדן" : "Refresh"}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              {card.icon} {card.label}
            </div>
            <p className="text-3xl font-bold text-primary mt-2">{card.value}</p>
          </div>
        ))}
      </div>

      {data.items.some(item => item.priority === "critical" || item.priority === "high") && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">{yi ? "עס זענען דא וויכטיגע זאכן וואס ווארטן" : "Priority items are waiting"}</p>
            <p className="text-xs text-amber-800 mt-1">
              {yi ? "קריטישע און וויכטיגע בקשות ווערן אייביג געוויזן ערשט." : "Critical and high-priority requests are always sorted first."}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_auto] gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={yi ? "זוך אין אלע אפענע בקשות..." : "Search all open requests..."}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["all", yi ? "אלעס" : "All"],
            ["urgent", yi ? "וויכטיג" : "Priority"],
            ["report", yi ? "רעפארטס" : "Reports"],
            ["help_request", yi ? "נצרכים" : "Help"],
            ["group_join", yi ? "גרופעס" : "Groups"],
            ["member_connection", yi ? "פארבינדונגען" : "Connections"],
            ["system_error", yi ? "טעכנישע פראבלעמען" : "System Errors"],
            ["comment_review", yi ? "ריפליי־ריוויו" : "Reply Reviews"],
          ].map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">
          {yi ? "לאדנט דעם אינבאקס..." : "Loading inbox..."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
          <p className="font-semibold">{yi ? "קיין אפענע זאכן אין דעם פילטער" : "Nothing open in this view"}</p>
          <p className="text-xs text-muted-foreground mt-1">{yi ? "דער אינבאקס איז ריין." : "This queue is clear."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={item.key} className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="outline">{labelForKind(item.kind, yi)}</Badge>
                    {item.priority !== "normal" && (
                      <Badge className={item.priority === "critical" ? "bg-red-100 text-red-800 border-red-200" : "bg-amber-100 text-amber-800 border-amber-200"}>
                        {priorityBadge(item.priority, yi)}
                      </Badge>
                    )}
                    {item.escalated && (
                      <Badge className="bg-red-600 text-white border-red-700">
                        {item.overdue ? (yi ? "איבער די צייט" : "Overdue") : (yi ? "ווארט צו לאנג" : "Waiting too long")}
                      </Badge>
                    )}
                    {item.workflow.assignedTo && (
                      <Badge variant="secondary" className="gap-1">
                        <UserCog className="h-3 w-3" />
                        {staff.find(s => s.id === item.workflow.assignedTo)?.nickname ||
                         staff.find(s => s.id === item.workflow.assignedTo)?.name ||
                         `#${item.workflow.assignedTo}`}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{item.summary}</p>
                  {item.meta?.location && <p className="text-xs text-muted-foreground mt-2">{yi ? "ארט:" : "Location:"} {item.meta.location}</p>}
                  {item.meta?.contact && <p className="text-xs text-muted-foreground mt-1">{yi ? "קאנטאקט:" : "Contact:"} {item.meta.contact}</p>}
                  {item.kind === "member_connection" && item.meta?.volunteerName && (
                    <p className="text-xs mt-2">
                      <span className="font-semibold">{yi ? "פארלאנגטער וואלונטיר:" : "Requested volunteer:"}</span>
                      {" "}{item.meta.volunteerName} {item.meta.volunteerId ? `(#${item.meta.volunteerId})` : ""}
                    </p>
                  )}
                  {item.kind === "member_connection" && item.meta?.volunteerContact && (
                    <p className="text-xs mt-1 break-all">
                      <span className="font-semibold">{yi ? "וואלונטיר קאנטאקט — נאר פאר אדמין:" : "Volunteer contact — staff only:"}</span>
                      {" "}{item.meta.volunteerContact}
                    </p>
                  )}
                  <p className="rounded-md bg-muted/30 border px-3 py-2 mt-3 text-xs text-foreground leading-relaxed">
                    <strong>{yi ? "וואס פאסירט ווען מען דרוקט?" : "What does the action do?"}</strong>
                    {" "}{actionExplanation(item)}
                  </p>

                  <div className="mt-4 rounded-xl border bg-muted/15 p-3 space-y-3">
                    <p className="text-xs text-muted-foreground">{yi
                      ? "די פעלדער אונטן טוישן נאר דעם אינערליכן ארבעטס־פלאן; זיי פארמאכן נישט דעם פאל און שיקן נישט קיין קאנטאקט־פרטים."
                      : "Assignment, status and due date organize staff work only. They do not close a case or share contact information."}</p>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <label className="text-[11px] text-muted-foreground">
                        <span className="mb-1 flex items-center gap-1"><UserCog className="h-3 w-3" /> {yi ? "ווער האנדלט עס" : "Assigned to"}</span>
                        <select
                          value={item.workflow.assignedTo ?? ""}
                          disabled={busy !== null}
                          onChange={e => void updateWorkflow(item, { assignedTo: e.target.value ? Number(e.target.value) : null })}
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="">{yi ? "נאך קיינער" : "Unassigned"}</option>
                          {staff.map(member => (
                            <option key={member.id} value={member.id}>
                              {member.nickname || member.name} — {member.role}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-[11px] text-muted-foreground">
                        <span className="mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> {yi ? "מצב" : "Status"}</span>
                        <select
                          value={item.workflow.workflowStatus}
                          disabled={busy !== null}
                          onChange={e => void updateWorkflow(item, { workflowStatus: e.target.value })}
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="new">{yi ? "ניי" : "New"}</option>
                          <option value="in_review">{yi ? "מען ארבעט דערויף" : "In Review"}</option>
                          <option value="waiting">{yi ? "ווארט אויף ענטפער" : "Waiting"}</option>
                        </select>
                      </label>

                      <label className="text-[11px] text-muted-foreground">
                        <span className="mb-1 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {yi ? "ביז ווען" : "Due"}</span>
                        <input
                          type="datetime-local"
                          value={localDateTime(item.workflow.dueAt)}
                          disabled={busy !== null}
                          onChange={e => void updateWorkflow(item, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        value={noteDrafts[item.key] || ""}
                        onChange={e => setNoteDrafts(prev => ({ ...prev, [item.key]: e.target.value }))}
                        placeholder={yi ? "וואס האט מען געטאן? קומענדיגער שריט..." : "What was done? Next step..."}
                        className="h-9"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null || !(noteDrafts[item.key] || "").trim()}
                        onClick={() => {
                          const note = (noteDrafts[item.key] || "").trim();
                          if (!note) return;
                          void updateWorkflow(item, { note }).then(() => {
                            setNoteDrafts(prev => ({ ...prev, [item.key]: "" }));
                          });
                        }}
                        className="gap-1.5 shrink-0"
                      >
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {yi ? "לייג צו" : "Add Note"}
                      </Button>
                    </div>

                    {item.workflow.notes.length > 0 && (
                      <div className="space-y-1">
                        {item.workflow.notes.slice(-2).reverse().map((note, index) => (
                          <div key={index} className="text-xs rounded-md bg-background border px-2.5 py-2">
                            <span className="text-muted-foreground">#{note.authorId} · {new Date(note.createdAt).toLocaleString()} — </span>
                            {note.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {item.kind === "member_connection" ? (
                    <div className="space-y-2 w-full lg:w-72">
                      {item.meta?.connectionStage === "legacy" && (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {yi ? "אלטע בקשה: דער וואלונטיר איז נאך נישט באשטעטיגט. שרייב דעם ריכטיגן וואלונטיר־נומער צו פארבינדן דעם פאל." :
                              "Older request: verify the volunteer profile ID before continuing."}
                          </p>
                          <Input
                            type="number"
                            min="1"
                            value={legacyVolunteerIds[item.key] || ""}
                            onChange={e => setLegacyVolunteerIds(prev => ({ ...prev, [item.key]: e.target.value }))}
                            placeholder={yi ? "וואלונטיר נומער" : "Volunteer profile ID"}
                            className="h-9"
                          />
                          <Button className="w-full" disabled={busy !== null} onClick={() => void connectionAction(item, "link")}>
                            {yi ? "באשטעטיג דעם וואלונטיר" : "Verify and link volunteer"}
                          </Button>
                        </>
                      )}
                      {item.meta?.connectionStage === "new" && (
                        <Button className="w-full" disabled={busy !== null} onClick={() => void connectionAction(item, "invite")}>
                          {yi ? "בעט רשות פונעם וואלונטיר" : "Request volunteer consent"}
                        </Button>
                      )}
                      {item.meta?.connectionStage === "invited" && (
                        <p className="text-xs rounded-md bg-muted/30 p-2 border">
                          {yi ? "דער וואלונטיר האט א מעלדונג באקומען אין זיין וועבסייט־אינבאקס. מען ווארט אויף רשות; אויב נויטיג, פארבינד זיך מיט אים פערזענליך." :
                            "An in-app consent request was sent. Awaiting the volunteer's decision; follow up personally if needed."}
                        </p>
                      )}
                      {item.meta?.connectionStage === "accepted" && (
                        <p className="text-xs rounded-md bg-muted/30 p-2 border">
                          {yi ? "דער וואלונטיר האט מסכים געווען. דער בעטער זעט דעם קאנטאקט אין 'מיינע פארבינדונגען'. דער פאל בלייבט אפן ביז דער בעטער באשטעטיגט הצלחה." :
                            "Volunteer consent granted. The requester can see contact details in My Connections. This stays OPEN until the requester confirms actual contact."}
                        </p>
                      )}
                      {item.meta?.connectionStage === "declined" && (
                        <p className="text-xs rounded-md bg-muted/30 p-2 border">
                          {yi ? "דער וואלונטיר האט נישט מסכים געווען. שרייב א פאסיגן הסבר אונטן איידער מען פארמאכט דעם פאל אלס נישט געלונגען." :
                            "The volunteer declined. Enter a reason below to close this case as unsuccessful, NOT completed."}
                        </p>
                      )}
                      {["new", "invited", "accepted", "declined"].includes(item.meta?.connectionStage) && (
                        <div className="space-y-2">
                          <Input
                            value={closureReasons[item.key] || ""}
                            onChange={e => setClosureReasons(prev => ({ ...prev, [item.key]: e.target.value }))}
                            placeholder={yi ? "פארוואס קען מען נישט אויספירן? (אויב נויטיג)" : "Reason if this cannot be completed"}
                            className="h-9"
                          />
                          <Button variant="outline" className="w-full" disabled={busy !== null}
                            onClick={() => void connectionAction(item, "close")}>
                            {yi ? "פארמאך אלס נישט געלונגען" : "Close as unsuccessful"}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : reviewOnly(item) ? (
                    <Button size="sm" onClick={() => void act(item, "approve")} disabled={busy !== null} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      {yi ? "פארמאך נאכן ערלעדיגן" : "Close after follow-up"}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => void act(item, "approve")} disabled={busy !== null} className="gap-1.5">
                        <Check className="h-3.5 w-3.5" />
                        {item.kind === "reservation"
                          ? (yi ? "פארטיג" : "Complete")
                          : (yi ? "באשטעטיג" : "Approve")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act(item, "reject")} disabled={busy !== null} className="gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        {item.kind === "report"
                          ? (yi ? "ווארף אפ" : "Dismiss")
                          : item.kind === "reservation"
                            ? (yi ? "קענסל" : "Cancel")
                            : (yi ? "נישט באשטעטיגן" : "Reject")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground flex items-start gap-2">
        <Clock className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          {yi
            ? "יעדע אפענע זאך קען ווערן צוגעטיילט צו א טיעם־מענטש, באקומען א מצב, due date און אינערליכע נאטיצן. זאכן וואס ווארטן צו לאנג ווערן אויטאמאטיש ארויסגעהויבן."
            : "Every open item can be assigned to staff, given a workflow status, due date, and internal notes. Items waiting too long are automatically escalated."}
        </p>
      </div>
    </div>
  );
}
