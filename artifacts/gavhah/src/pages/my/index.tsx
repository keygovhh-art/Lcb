import { useState } from "react";
import {
  useListNotifications, useMarkAllNotificationsRead, getListNotificationsQueryKey,
  useListAskanuscases, useCreateAskanusCase, useUpdateAskanusCase, useDeleteAskanusCase,
  useUpdateAskanuscaseProgress, useToggleCaseFollowup, getListAskanuscasesQueryKey,
  useListAskanustasks, useCreateAskanusTask, useUpdateAskanusTask, useDeleteAskanusTask,
  getListAskanustasksQueryKey,
  useListAskanusNotes, useCreateAskanusNote, useUpdateAskanusNote, useDeleteAskanusNote,
  getListAskanusNotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, MessageSquare, Users, Activity, CheckCheck, Star,
  Plus, CheckCircle, Clock, AlertTriangle, Trash2, Edit3, Calendar,
  TrendingUp, DollarSign, HandHeart, BookOpen, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Target, ArrowUpRight, ArrowDownLeft, Phone
} from "lucide-react";
import { format } from "date-fns";

// --- Types ---
interface ActivityEntry {
  id: number;
  caseId: number;
  date: string;
  type: string;
  note: string;
  amount?: number | null;
  createdAt: string;
}

interface FollowUp {
  id: number;
  caseId: number;
  date: string;
  note: string;
  dueDate?: string | null;
  completed: boolean;
  createdAt: string;
}

interface AskanusCase {
  id: number;
  title: string;
  description: string;
  status: string;
  urgency: string;
  category: string;
  contactName: string;
  deadline: string;
  goalAmount: number;
  fundsPromised: number;
  fundsReceived: number;
  notes: string;
  createdAt: string;
  lastUpdated: string;
  activityLog: ActivityEntry[];
  followUpNotes: FollowUp[];
}

const URGENCY_COLORS: Record<string, string> = {
  critical: "destructive", high: "secondary", medium: "default", low: "outline"
};
const STATUS_COLORS: Record<string, string> = {
  open: "default", in_progress: "secondary", closed: "outline"
};

// --- Sub-components ---
function ImpactStat({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl p-5 border ${color} flex flex-col gap-2`}>
      <div className="flex items-center gap-2 text-sm font-medium opacity-80">{icon} {label}</div>
      <div className="text-3xl font-serif font-bold">{value}</div>
    </div>
  );
}

const ACT_ICONS: Record<string, React.ReactNode> = {
  funds_received: <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />,
  funds_promised: <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />,
  status_change: <Activity className="h-3.5 w-3.5 text-primary" />,
  contact: <Phone className="h-3.5 w-3.5 text-muted-foreground" />,
  note: <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />,
  update: <Edit3 className="h-3.5 w-3.5 text-secondary" />,
};

function NewCaseDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreateAskanusCase();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", description: "", urgency: "medium", category: "General", contactName: "", deadline: "", goalAmount: "", notes: "" });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { data: { title: form.title, description: form.description, urgency: form.urgency, category: form.category, contactName: form.contactName, deadline: form.deadline, goalAmount: Number(form.goalAmount) || 0, notes: form.notes } },
      {
        onSuccess: () => {
          onAdded();
          setOpen(false);
          setForm({ title: "", description: "", urgency: "medium", category: "General", contactName: "", deadline: "", goalAmount: "", notes: "" });
          toast({ title: "Case opened" });
        }
      }
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2"><Plus className="h-4 w-4" /> New Case</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-2xl text-primary">Open New Case</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label className="font-semibold">Title *</Label><Input value={form.title} onChange={s("title")} placeholder="Brief case title" className="h-11" required /></div>
          <div className="space-y-1.5"><Label className="font-semibold">Contact Name</Label><Input value={form.contactName} onChange={s("contactName")} placeholder="Person's name" className="h-11" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="font-semibold">Category</Label>
              <Select value={form.category} onValueChange={s("category")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bikur Cholim", "Hachnosas Kallah", "Housing", "Financial", "Education", "Medical", "Transportation", "Food", "Orphan Support", "General"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="font-semibold">Urgency</Label>
              <Select value={form.urgency} onValueChange={s("urgency")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "critical"].map(u => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="font-semibold">Deadline</Label><Input type="date" value={form.deadline} onChange={s("deadline")} className="h-11" /></div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Fundraising Goal ($)</Label>
              <Input type="number" min="0" value={form.goalAmount} onChange={s("goalAmount")} placeholder="0" className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5"><Label className="font-semibold">Description</Label><Textarea value={form.description} onChange={s("description")} placeholder="Case details..." className="resize-none" /></div>
          <div className="space-y-1.5"><Label className="font-semibold">Initial Notes</Label><Textarea value={form.notes} onChange={s("notes")} placeholder="Any starting notes..." className="resize-none h-20" /></div>
          <Button type="submit" disabled={create.isPending} className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold">Open Case</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpdateProgressDialog({ c, onUpdated }: { c: AskanusCase; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"received" | "promised" | "goal" | "note" | "followup">("received");
  const [received, setReceived] = useState({ amount: "", note: "" });
  const [promised, setPromised] = useState({ amount: "", from: "" });
  const [goal, setGoal] = useState(String(c.goalAmount || ""));
  const [note, setNote] = useState("");
  const [followup, setFollowup] = useState({ note: "", dueDate: "" });
  const progress = useUpdateAskanuscaseProgress();
  const { toast } = useToast();

  const save = () => {
    let body: Record<string, unknown> = { action: tab };
    if (tab === "received") body = { action: "funds_received", amount: Number(received.amount), note: received.note };
    else if (tab === "promised") body = { action: "funds_promised", amount: Number(promised.amount), from: promised.from };
    else if (tab === "goal") body = { action: "goal", goal: Number(goal) };
    else if (tab === "note") body = { action: "note", note };
    else if (tab === "followup") body = { action: "followup", note: followup.note, dueDate: followup.dueDate || undefined };

    progress.mutate(
      { id: c.id, data: body as any },
      {
        onSuccess: () => {
          onUpdated();
          setOpen(false);
          setReceived({ amount: "", note: "" });
          setPromised({ amount: "", from: "" });
          setGoal(String(c.goalAmount || ""));
          setNote("");
          setFollowup({ note: "", dueDate: "" });
          toast({ title: "Progress updated" });
        }
      }
    );
  };

  const TABS = [
    { id: "received" as const, label: "Record Received", icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
    { id: "promised" as const, label: "Record Pledge", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
    { id: "goal" as const, label: "Update Goal", icon: <Target className="h-3.5 w-3.5" /> },
    { id: "note" as const, label: "Add Note", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: "followup" as const, label: "Add Follow-up", icon: <Bell className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <TrendingUp className="h-3.5 w-3.5" /> Update Progress
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Update Case Progress</DialogTitle>
            <p className="text-sm text-muted-foreground">{c.title}</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${tab === t.id ? "bg-secondary text-white border-secondary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {tab === "received" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Record funds that have been physically received.</p>
                <div className="space-y-1.5"><Label className="font-semibold">Amount Received ($) *</Label>
                  <Input type="number" min="0" value={received.amount} onChange={e => setReceived(r => ({ ...r, amount: e.target.value }))} placeholder="0.00" className="h-11" />
                </div>
                <div className="space-y-1.5"><Label className="font-semibold">Note <span className="font-normal text-muted-foreground">(from whom / how)</span></Label>
                  <Input value={received.note} onChange={e => setReceived(r => ({ ...r, note: e.target.value }))} placeholder="e.g. From community fund, via check" className="h-11" />
                </div>
              </div>
            )}
            {tab === "promised" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Record a new pledge or commitment (not yet received).</p>
                <div className="space-y-1.5"><Label className="font-semibold">Amount Pledged ($) *</Label>
                  <Input type="number" min="0" value={promised.amount} onChange={e => setPromised(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="h-11" />
                </div>
                <div className="space-y-1.5"><Label className="font-semibold">Donor / Organization</Label>
                  <Input value={promised.from} onChange={e => setPromised(p => ({ ...p, from: e.target.value }))} placeholder="Who made the pledge?" className="h-11" />
                </div>
              </div>
            )}
            {tab === "goal" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Update the total fundraising goal for this case.</p>
                <div className="space-y-1.5"><Label className="font-semibold">New Goal Amount ($)</Label>
                  <Input type="number" min="0" value={goal} onChange={e => setGoal(e.target.value)} placeholder="0.00" className="h-11" />
                </div>
              </div>
            )}
            {tab === "note" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Add an activity note to the case log.</p>
                <div className="space-y-1.5"><Label className="font-semibold">Activity Note *</Label>
                  <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="What happened? What was done?" className="resize-none min-h-24" />
                </div>
              </div>
            )}
            {tab === "followup" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Add a follow-up reminder for this case.</p>
                <div className="space-y-1.5"><Label className="font-semibold">Follow-up Note *</Label>
                  <Textarea value={followup.note} onChange={e => setFollowup(f => ({ ...f, note: e.target.value }))} placeholder="What needs to be followed up on?" className="resize-none min-h-20" />
                </div>
                <div className="space-y-1.5"><Label className="font-semibold">Due Date <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input type="date" value={followup.dueDate} onChange={e => setFollowup(f => ({ ...f, dueDate: e.target.value }))} className="h-11" />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-white h-11 font-semibold" onClick={save} disabled={progress.isPending}>
                Save Update
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CaseCard({ c, onUpdated }: { c: AskanusCase; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const updateCase = useUpdateAskanusCase();
  const deleteCase = useDeleteAskanusCase();
  const progressMutation = useUpdateAskanuscaseProgress();
  const toggleFollowup = useToggleCaseFollowup();
  const { toast } = useToast();

  const goal = Number(c.goalAmount);
  const received = Number(c.fundsReceived);
  const promised = Number(c.fundsPromised);
  const remaining = goal > 0 ? Math.max(0, goal - received) : 0;
  const outstanding = goal > 0 ? Math.max(0, goal - received - promised) : 0;
  const receivedPct = goal > 0 ? Math.min(100, (received / goal) * 100) : 0;
  const promisedPct = goal > 0 ? Math.min(100 - receivedPct, (promised / goal) * 100) : 0;

  const openFollowups = c.followUpNotes.filter(f => !f.completed);

  const handleToggleFollowup = (id: number) => {
    toggleFollowup.mutate({ id }, { onSuccess: onUpdated });
  };

  const setStatus = (status: string) => {
    progressMutation.mutate(
      { id: c.id, data: { action: "status", status } as any },
      { onSuccess: onUpdated }
    );
  };

  const handleDelete = () => {
    deleteCase.mutate({ id: c.id }, {
      onSuccess: () => { onUpdated(); toast({ title: "Case deleted" }); }
    });
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all hover:shadow-sm ${c.status === "closed" ? "opacity-80" : ""}`}>
      <div className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={URGENCY_COLORS[c.urgency] as any} className="capitalize text-xs">{c.urgency}</Badge>
              <Badge variant={STATUS_COLORS[c.status] as any} className="capitalize text-xs">{c.status.replace("_", " ")}</Badge>
              <Badge variant="outline" className="text-xs">{c.category}</Badge>
            </div>
            <h3 className="font-serif font-bold text-primary text-lg leading-tight">{c.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{c.description}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {c.contactName && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.contactName}</span>}
              {c.deadline && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Deadline: {c.deadline}</span>}
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Updated: {c.lastUpdated.slice(0, 10)}</span>
            </div>
          </div>
        </div>

        {goal > 0 ? (
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Goal", value: `$${goal.toLocaleString()}`, color: "text-primary font-bold" },
                { label: "Received", value: `$${received.toLocaleString()}`, color: "text-green-700 font-bold" },
                { label: "Promised", value: `$${promised.toLocaleString()}`, color: "text-blue-600 font-bold" },
                { label: "Remaining", value: `$${remaining.toLocaleString()}`, color: "text-secondary font-bold" },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
                  <div className={`text-sm ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="h-3 bg-muted rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${receivedPct}%` }} />
                <div className="bg-blue-400/60 h-full transition-all" style={{ width: `${promisedPct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span><span className="text-green-700 font-medium">{Math.round(receivedPct)}% received</span> · <span className="text-blue-600 font-medium">{Math.round(promisedPct)}% promised</span></span>
                {outstanding > 0 && <span className="text-secondary font-medium">${outstanding.toLocaleString()} still needed</span>}
                {outstanding === 0 && remaining === 0 && <span className="text-green-700 font-medium">Fully funded!</span>}
              </div>
            </div>
          </div>
        ) : (received > 0 || promised > 0) ? (
          <div className="flex gap-4 text-sm">
            {received > 0 && <span className="text-green-700 font-medium"><ArrowDownLeft className="h-3.5 w-3.5 inline mr-1" />${received.toLocaleString()} received</span>}
            {promised > 0 && <span className="text-blue-600 font-medium"><ArrowUpRight className="h-3.5 w-3.5 inline mr-1" />${promised.toLocaleString()} promised</span>}
          </div>
        ) : null}

        {c.notes && <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 italic leading-relaxed">{c.notes}</p>}

        {openFollowups.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Open Follow-ups ({openFollowups.length})</p>
            {openFollowups.slice(0, 2).map(f => (
              <div key={f.id} className="flex items-start gap-2 text-xs">
                <button onClick={() => handleToggleFollowup(f.id)} className="mt-0.5 w-4 h-4 rounded border border-muted-foreground/40 hover:border-secondary shrink-0 flex items-center justify-center" />
                <span className="text-foreground flex-1">{f.note}{f.dueDate && <span className="text-muted-foreground ml-1">· Due {f.dueDate}</span>}</span>
              </div>
            ))}
            {openFollowups.length > 2 && <p className="text-xs text-muted-foreground">{openFollowups.length - 2} more…</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          <UpdateProgressDialog c={c} onUpdated={onUpdated} />
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Log ({c.activityLog.length}) · Follow-ups ({c.followUpNotes.length})
          </Button>
          <div className="flex gap-1.5 ml-auto">
            {c.status === "open" && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setStatus("in_progress")}>
                <Activity className="h-3.5 w-3.5" /> Start
              </Button>
            )}
            {c.status !== "closed" && (
              <Button size="sm" variant="outline" className="gap-1 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => setStatus("closed")}>
                <CheckCircle className="h-3.5 w-3.5" /> Close
              </Button>
            )}
            {c.status === "closed" && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setStatus("open")}>Reopen</Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 w-8 p-0" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/10 p-6 space-y-6">
          <div>
            <h4 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Activity Log
            </h4>
            {c.activityLog.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {c.activityLog.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 text-xs">
                    <div className="flex items-center gap-1 shrink-0 w-20 text-muted-foreground">{entry.date}</div>
                    <div className="shrink-0 mt-0.5">{ACT_ICONS[entry.type] ?? <Activity className="h-3.5 w-3.5" />}</div>
                    <span className="flex-1 text-foreground">
                      {entry.note}
                      {entry.amount != null && <span className="font-semibold text-green-700 ml-1">(${Number(entry.amount).toLocaleString()})</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4" /> Follow-up Notes
            </h4>
            {c.followUpNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No follow-up notes yet.</p>
            ) : (
              <div className="space-y-2">
                {c.followUpNotes.map(f => (
                  <div key={f.id} className={`flex items-start gap-3 text-xs ${f.completed ? "opacity-50" : ""}`}>
                    <button onClick={() => handleToggleFollowup(f.id)} className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${f.completed ? "bg-green-500 border-green-500" : "border-muted-foreground/40 hover:border-secondary"}`}>
                      {f.completed && <CheckCircle className="h-3 w-3 text-white fill-white" />}
                    </button>
                    <div className="flex-1">
                      <span className={f.completed ? "line-through text-muted-foreground" : "text-foreground"}>{f.note}</span>
                      {f.dueDate && <span className="text-muted-foreground ml-2">· Due {f.dueDate}</span>}
                      <span className="text-muted-foreground ml-2">({f.date})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewTaskDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreateAskanusTask();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", caseTitle: "", deadline: "", priority: "medium", notes: "" });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { data: { title: form.title, caseTitle: form.caseTitle, deadline: form.deadline, priority: form.priority, notes: form.notes } },
      {
        onSuccess: () => {
          onAdded();
          setOpen(false);
          setForm({ title: "", caseTitle: "", deadline: "", priority: "medium", notes: "" });
          toast({ title: "Task added" });
        }
      }
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2"><Plus className="h-4 w-4" /> Add Task</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-serif text-2xl text-primary">Add Task</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label className="font-semibold">Task *</Label><Input value={form.title} onChange={s("title")} placeholder="What needs to be done?" className="h-11" required /></div>
          <div className="space-y-1.5"><Label className="font-semibold">Related Case <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={form.caseTitle} onChange={s("caseTitle")} placeholder="Case name" className="h-11" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="font-semibold">Deadline</Label><Input type="date" value={form.deadline} onChange={s("deadline")} className="h-11" /></div>
            <div className="space-y-1.5"><Label className="font-semibold">Priority</Label>
              <Select value={form.priority} onValueChange={s("priority")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="font-semibold">Notes</Label><Textarea value={form.notes} onChange={s("notes")} placeholder="Optional notes..." className="resize-none" /></div>
          <Button type="submit" disabled={create.isPending} className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold">Add Task</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function HistoryCalendar({ onSelect, selected }: { onSelect: (d: string) => void; selected: string }) {
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dateStr = (d: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const prev = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const next = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);
  const todayStr = new Date().toISOString().slice(0, 10);
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 hover:bg-muted rounded"><ChevronLeft className="h-4 w-4" /></button>
        <span className="font-serif font-bold text-primary text-sm">{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={next} className="p-1 hover:bg-muted rounded"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = dateStr(day);
          const isSel = selected === ds;
          return (
            <button key={i} onClick={() => onSelect(ds)}
              className={`aspect-square flex items-center justify-center text-xs rounded transition-colors ${
                isSel ? "bg-secondary text-white font-bold" :
                ds === todayStr ? "bg-primary/10 text-primary font-bold" :
                "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Component ---
export default function MyAskanus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [newNote, setNewNote] = useState({ title: "", content: "" });
  const [editNoteId, setEditNoteId] = useState<number | null>(null);
  const [caseFilter, setCaseFilter] = useState<"all" | "open" | "in_progress" | "closed">("all");

  const { data: casesRaw = [] } = useListAskanuscases({ query: { queryKey: getListAskanuscasesQueryKey() } });
  const cases = casesRaw as unknown as AskanusCase[];

  const { data: tasksRaw = [] } = useListAskanustasks({ query: { queryKey: getListAskanustasksQueryKey() } });
  const tasks = tasksRaw as any[];

  const { data: notesRaw = [] } = useListAskanusNotes({ query: { queryKey: getListAskanusNotesQueryKey() } });
  const notes = notesRaw as any[];

  const updateTask = useUpdateAskanusTask();
  const deleteTask = useDeleteAskanusTask();
  const createNote = useCreateAskanusNote();
  const updateNote = useUpdateAskanusNote();
  const deleteNote = useDeleteAskanusNote();

  const { data: notifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });
  const markAllRead = useMarkAllNotificationsRead();
  const unread = notifications?.filter(n => !n.isRead).length ?? 0;

  const invalidateCases = () => qc.invalidateQueries({ queryKey: getListAskanuscasesQueryKey() });
  const invalidateTasks = () => qc.invalidateQueries({ queryKey: getListAskanustasksQueryKey() });
  const invalidateNotes = () => qc.invalidateQueries({ queryKey: getListAskanusNotesQueryKey() });

  const totalFundsRaised = cases.reduce((a, c) => a + Number(c.fundsReceived), 0);
  const totalGoal = cases.filter(c => c.status !== "closed").reduce((a, c) => a + Number(c.goalAmount), 0);
  const totalPeopleHelped = cases.filter(c => c.status === "closed").length;
  const openCases = cases.filter(c => c.status !== "closed").length;
  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const pendingTasks = tasks.filter((t: any) => !t.completed).length;
  const totalPromised = cases.reduce((a, c) => a + Number(c.fundsPromised), 0);
  const totalOutstanding = cases.filter(c => c.status !== "closed").reduce((a, c) => a + Math.max(0, Number(c.goalAmount) - Number(c.fundsReceived) - Number(c.fundsPromised)), 0);
  const openFollowups = cases.reduce((a, c) => a + c.followUpNotes.filter(f => !f.completed).length, 0);

  const filteredCases = caseFilter === "all" ? cases : cases.filter(c => c.status === caseFilter);

  const toggleTask = (id: number, completed: boolean) =>
    updateTask.mutate({ id, data: { completed: !completed } }, { onSuccess: invalidateTasks });

  const handleDeleteTask = (id: number) =>
    deleteTask.mutate({ id }, { onSuccess: invalidateTasks });

  const saveNote = () => {
    if (!newNote.title || !newNote.content) return;
    if (editNoteId) {
      updateNote.mutate({ id: editNoteId, data: { title: newNote.title, content: newNote.content } }, {
        onSuccess: () => { invalidateNotes(); setEditNoteId(null); setNewNote({ title: "", content: "" }); }
      });
    } else {
      createNote.mutate({ data: { title: newNote.title, content: newNote.content } }, {
        onSuccess: () => { invalidateNotes(); setNewNote({ title: "", content: "" }); toast({ title: "Note saved" }); }
      });
    }
  };

  const handleDeleteNote = (id: number) =>
    deleteNote.mutate({ id }, { onSuccess: invalidateNotes });

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-1">
            <Star className="h-8 w-8 text-accent fill-accent" />
            <h1 className="font-serif text-4xl font-bold">My Askanus</h1>
          </div>
          <p className="font-serif italic text-primary-foreground/70 ml-11">
            Your personal activism command center — organize, track, and measure your impact.
          </p>
          <div className="mt-8 bg-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/60 mb-4">Today's Overview</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Open Cases", value: openCases, icon: <HandHeart className="h-5 w-5" /> },
                { label: "Pending Tasks", value: pendingTasks, icon: <CheckCircle className="h-5 w-5" /> },
                { label: "Funds Outstanding", value: `$${totalOutstanding.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" /> },
                { label: "Follow-ups Due", value: openFollowups, icon: <Bell className="h-5 w-5" /> },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="flex items-center justify-center gap-1.5 text-primary-foreground/60 text-xs mb-1">{s.icon} {s.label}</div>
                  <div className="text-3xl font-serif font-bold text-accent">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lifetime Impact */}
      <div className="bg-muted/30 border-b py-6">
        <div className="container mx-auto px-4">
          <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-4">Lifetime Impact</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <ImpactStat label="People Helped" value={totalPeopleHelped} icon={<Users className="h-4 w-4" />} color="bg-primary/5 border-primary/10 text-primary" />
            <ImpactStat label="Funds Raised" value={`$${totalFundsRaised.toLocaleString()}`} icon={<DollarSign className="h-4 w-4" />} color="bg-green-50 border-green-100 text-green-800" />
            <ImpactStat label="Total Goal" value={`$${totalGoal.toLocaleString()}`} icon={<Target className="h-4 w-4" />} color="bg-primary/5 border-primary/10 text-primary" />
            <ImpactStat label="Pledged" value={`$${totalPromised.toLocaleString()}`} icon={<ArrowUpRight className="h-4 w-4" />} color="bg-blue-50 border-blue-100 text-blue-800" />
            <ImpactStat label="Tasks Done" value={completedTasks} icon={<CheckCircle className="h-4 w-4" />} color="bg-secondary/5 border-secondary/10 text-secondary" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <Tabs defaultValue="cases" className="space-y-8">
          <TabsList className="bg-muted/50 h-auto p-1 flex flex-wrap gap-1">
            <TabsTrigger value="cases" className="gap-2">
              <HandHeart className="h-4 w-4" /> Cases
              {openCases > 0 && <span className="bg-secondary text-white text-xs rounded-full px-1.5">{openCases}</span>}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <CheckCircle className="h-4 w-4" /> Tasks
              {pendingTasks > 0 && <span className="bg-destructive text-white text-xs rounded-full px-1.5">{pendingTasks}</span>}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><Calendar className="h-4 w-4" /> History</TabsTrigger>
            <TabsTrigger value="notes" className="gap-2"><BookOpen className="h-4 w-4" /> Notes</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" /> Notifications
              {unread > 0 && <span className="bg-destructive text-white text-xs rounded-full px-1.5">{unread}</span>}
            </TabsTrigger>
          </TabsList>

          {/* CASES */}
          <TabsContent value="cases" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-serif text-2xl font-bold text-primary">Case Files</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 bg-muted/60 rounded-lg p-1">
                  {(["all", "open", "in_progress", "closed"] as const).map(f => (
                    <button key={f} onClick={() => setCaseFilter(f)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-all capitalize ${caseFilter === f ? "bg-background text-primary font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {f === "all" ? "All" : f.replace("_", " ")}
                    </button>
                  ))}
                </div>
                <NewCaseDialog onAdded={invalidateCases} />
              </div>
            </div>
            {filteredCases.map(c => (
              <CaseCard key={c.id} c={c} onUpdated={invalidateCases} />
            ))}
            {filteredCases.length === 0 && (
              <div className="text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                {caseFilter === "all" ? "No cases yet. Open your first case above." : `No ${caseFilter.replace("_", " ")} cases.`}
              </div>
            )}
          </TabsContent>

          {/* TASKS */}
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Task Manager</h2>
              <NewTaskDialog onAdded={invalidateTasks} />
            </div>
            <div className="space-y-3">
              {["high", "medium", "low"].map(priority => {
                const priorityTasks = tasks.filter((t: any) => t.priority === priority && !t.completed);
                if (priorityTasks.length === 0) return null;
                return (
                  <div key={priority}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${priority === "high" ? "text-destructive" : priority === "medium" ? "text-secondary" : "text-muted-foreground"}`}>
                      {priority} priority
                    </p>
                    {priorityTasks.map((t: any) => (
                      <div key={t.id} className="bg-card border rounded-xl p-4 flex items-start gap-3 mb-2 hover:border-primary/20 transition-colors">
                        <button onClick={() => toggleTask(t.id, t.completed)} className="mt-0.5 shrink-0 w-5 h-5 rounded border-2 border-muted-foreground/40 hover:border-secondary flex items-center justify-center transition-colors">
                          {t.completed && <CheckCircle className="h-3.5 w-3.5 text-green-600 fill-green-600" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm">{t.title}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                            {t.caseTitle && <span>Case: {t.caseTitle}</span>}
                            {t.deadline && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.deadline}</span>}
                          </div>
                          {t.notes && <p className="text-xs text-muted-foreground italic mt-1">{t.notes}</p>}
                        </div>
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive shrink-0 h-7 w-7 p-0" onClick={() => handleDeleteTask(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {tasks.filter((t: any) => !t.completed).length === 0 && (
                <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                  All tasks completed!
                </div>
              )}
            </div>
            {tasks.filter((t: any) => t.completed).length > 0 && (
              <div className="pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Completed</p>
                <div className="space-y-2">
                  {tasks.filter((t: any) => t.completed).map((t: any) => (
                    <div key={t.id} className="bg-muted/30 border rounded-xl p-4 flex items-center gap-3 opacity-60">
                      <CheckCircle className="h-5 w-5 text-green-600 fill-green-100 shrink-0" />
                      <p className="flex-1 line-through text-muted-foreground text-sm">{t.title}</p>
                      <Button size="sm" variant="ghost" className="text-muted-foreground text-xs h-7" onClick={() => toggleTask(t.id, t.completed)}>Undo</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* HISTORY */}
          <TabsContent value="history" className="space-y-6">
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-2">Activity History</h2>
              <p className="text-muted-foreground text-sm">Review your case activity log across all cases.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <HistoryCalendar selected={historyDate} onSelect={setHistoryDate} />
              <div className="space-y-4">
                <div className="bg-card border rounded-xl p-6">
                  <h3 className="font-serif font-bold text-primary text-lg mb-4">
                    {format(new Date(historyDate + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                  </h3>
                  {(() => {
                    const dayActivities = cases.flatMap(c =>
                      c.activityLog.filter(a => a.date === historyDate).map(a => ({ ...a, caseName: c.title }))
                    );
                    return dayActivities.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground font-serif italic">No activity recorded for this date.</p>
                    ) : (
                      <div className="space-y-3">
                        {dayActivities.map((a, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm">
                            <div className="shrink-0 mt-0.5">{ACT_ICONS[a.type] ?? <Activity className="h-3.5 w-3.5" />}</div>
                            <div className="flex-1">
                              <p className="text-foreground">{a.note}{a.amount != null && <span className="font-semibold text-green-700 ml-1">(${Number(a.amount).toLocaleString()})</span>}</p>
                              <p className="text-xs text-muted-foreground">{(a as any).caseName}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary text-sm">All-Time Summary</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["Cases Managed", cases.length],
                      ["Closed Cases", cases.filter(c => c.status === "closed").length],
                      ["Total Raised", `$${totalFundsRaised.toLocaleString()}`],
                      ["Tasks Done", completedTasks],
                    ].map(([l, v], i) => (
                      <div key={i} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className="font-semibold text-foreground">{v}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* NOTES */}
          <TabsContent value="notes" className="space-y-6">
            <h2 className="font-serif text-2xl font-bold text-primary">My Notes</h2>
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">{editNoteId ? "Edit Note" : "New Note"}</h3>
              <div className="space-y-3">
                <Input value={newNote.title} onChange={e => setNewNote(n => ({ ...n, title: e.target.value }))} placeholder="Note title..." className="h-11" />
                <Textarea value={newNote.content} onChange={e => setNewNote(n => ({ ...n, content: e.target.value }))} placeholder="Write your note here..." className="min-h-28 resize-none" />
                <div className="flex gap-2">
                  <Button className="bg-secondary hover:bg-secondary/90 text-white gap-2" onClick={saveNote} disabled={!newNote.title || !newNote.content}>
                    <BookOpen className="h-4 w-4" /> {editNoteId ? "Save Changes" : "Add Note"}
                  </Button>
                  {editNoteId && <Button variant="outline" onClick={() => { setEditNoteId(null); setNewNote({ title: "", content: "" }); }}>Cancel</Button>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {notes.map((note: any) => (
                <div key={note.id} className="bg-card border rounded-xl p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-serif font-bold text-primary">{note.title}</h3>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => { setEditNoteId(note.id); setNewNote({ title: note.title, content: note.content }); }}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteNote(note.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-4">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-3 border-t pt-2">{note.createdAt?.slice(0, 10)}</p>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="col-span-full text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">No notes yet.</div>
              )}
            </div>
          </TabsContent>

          {/* NOTIFICATIONS */}
          <TabsContent value="notifications" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Notifications</h2>
              {unread > 0 && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => markAllRead.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) })} disabled={markAllRead.isPending}>
                  <CheckCheck className="h-4 w-4" /> Mark all read
                </Button>
              )}
            </div>
            {notifications?.map(notif => (
              <div key={notif.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${!notif.isRead ? "bg-accent/5 border-accent/20" : "bg-card"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!notif.isRead ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}>
                  <Bell className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!notif.isRead ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{notif.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(notif.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
                {!notif.isRead && <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />}
              </div>
            ))}
            {(!notifications || notifications.length === 0) && (
              <div className="text-center py-12 text-muted-foreground font-serif italic border rounded-xl bg-muted/20">No notifications yet.</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
