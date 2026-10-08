import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, Flag, HandHeart, Inbox, RefreshCcw, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";

type OperationItem = {
  key: string;
  kind: string;
  id: number;
  priority: "critical" | "high" | "normal";
  title: string;
  summary: string;
  createdAt: string;
  meta: Record<string, any>;
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
  };
  items: OperationItem[];
};

const EMPTY: InboxResponse = {
  counts: { total: 0, reports: 0, helpRequests: 0, groupJoins: 0, causeSubmissions: 0, minyans: 0, support: 0, reservations: 0 },
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
    volunteer_registration: "Volunteer Registration",
    project_join: "Project Participation",
    cause_join: "Cause Participation",
    cause_support: "Cause Response",
    reservation: "Reservation",
    support: "Support",
    feedback: "Feedback",
    suggestion: "Suggestion",
  };
  const yid: Record<string, string> = {
    report: "רעפארט",
    help_request: "הילף־בקשה",
    group_join: "גרופע־אנשליסונג",
    cause_submission: "צוועק־איבערזיכט",
    minyan_submission: "מנין־איבערזיכט",
    member_connection: "פארבינדן מיטגלידער",
    volunteer_registration: "נייער העלפער",
    project_join: "אנטייל אין פראיעקט",
    cause_join: "אנטייל אין צוועק",
    cause_support: "ענטפער אויף א צוועק",
    reservation: "אפיס־צייט",
    support: "הילף",
    feedback: "הערה",
    suggestion: "עצה",
  };
  return (yi ? yid : en)[kind] || kind.replaceAll("_", " ");
}

function priorityBadge(priority: string, yi: boolean) {
  if (priority === "critical") return yi ? "קריטיש" : "Critical";
  if (priority === "high") return yi ? "וויכטיג" : "High";
  return yi ? "נארמאל" : "Normal";
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

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operations-inbox", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Could not load management inbox");
      setData(await res.json());
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

  const act = async (item: OperationItem, action: string) => {
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
      } else {
        await request(`/api/admin/support-messages/${item.id}`, "PATCH", { status: "resolved" });
      }

      toast({ title: yi ? "אויפגעפאסט" : "Updated" });
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

  const reviewOnly = (item: OperationItem) => ![
    "report", "help_request", "group_join", "cause_submission", "minyan_submission", "reservation",
  ].includes(item.kind);

  const statCards = [
    { label: yi ? "אלעס אפן" : "Open Now", value: data.counts.total, icon: <Inbox className="h-4 w-4" /> },
    { label: yi ? "רעפארטס" : "Reports", value: data.counts.reports, icon: <Flag className="h-4 w-4" /> },
    { label: yi ? "הילף־בקשות" : "Help Requests", value: data.counts.helpRequests, icon: <HandHeart className="h-4 w-4" /> },
    { label: yi ? "אנשליס־בקשות" : "Join Requests", value: data.counts.groupJoins + data.counts.causeSubmissions, icon: <Users className="h-4 w-4" /> },
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
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{item.summary}</p>
                  {item.meta?.location && <p className="text-xs text-muted-foreground mt-2">{yi ? "ארט:" : "Location:"} {item.meta.location}</p>}
                  {item.meta?.contact && <p className="text-xs text-muted-foreground mt-1">{yi ? "קאנטאקט:" : "Contact:"} {item.meta.contact}</p>}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {reviewOnly(item) ? (
                    <Button size="sm" onClick={() => void act(item, "approve")} disabled={busy !== null} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      {yi ? "איבערגעקוקט" : "Mark Reviewed"}
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
            ? "דער יעצטיגער אינבאקס ניצט די עקזיסטירנדע statuses פונעם סייט. דער נעקסטער שטאפל איז assignment צו שטאב, אינערליכע נאטיצן, due dates און escalation פאר זאכן וואס ווארטן צו לאנג."
            : "This first version uses the site's existing statuses. The next layer is staff assignment, internal notes, due dates, and escalation for requests waiting too long."}
        </p>
      </div>
    </div>
  );
}
