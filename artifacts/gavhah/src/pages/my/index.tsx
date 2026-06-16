import { useState } from "react";
import {
  useListNotifications, useMarkAllNotificationsRead,
  getListNotificationsQueryKey
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
import { Progress } from "@/components/ui/progress";
import {
  Bell, MessageSquare, Users, Heart, Activity, CheckCheck, Star,
  Plus, CheckCircle, Clock, AlertTriangle, Trash2, Edit3, Calendar,
  TrendingUp, Phone, DollarSign, HandHeart, BookOpen, ChevronLeft, ChevronRight
} from "lucide-react";
import { format, subDays } from "date-fns";

// --- localStorage persistence ---
function useLocal<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const set = (v: T | ((p: T) => T)) => {
    setVal(prev => {
      const next = typeof v === "function" ? (v as any)(prev) : v;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };
  return [val, set];
}

// --- Types ---
interface Case {
  id: number; title: string; description: string;
  status: "open" | "in_progress" | "closed"; urgency: "low" | "medium" | "high" | "critical";
  category: string; contactName: string; createdAt: string; deadline: string;
  fundsPromised: number; fundsReceived: number; notes: string;
}
interface Task {
  id: number; title: string; caseTitle: string;
  deadline: string; completed: boolean; priority: "low" | "medium" | "high"; notes: string;
}
interface Note { id: number; title: string; content: string; createdAt: string; }

const URGENCY_COLORS: Record<string, string> = {
  critical: "destructive", high: "secondary", medium: "default", low: "outline"
};
const STATUS_COLORS: Record<string, string> = {
  open: "default", in_progress: "secondary", closed: "outline"
};

const SEED_CASES: Case[] = [
  { id: 1, title: "Medical transport — R. Klein family", description: "Family needs transport to Sloan Kettering 3x weekly", status: "in_progress", urgency: "high", category: "Bikur Cholim", contactName: "Rivky Klein", createdAt: "2026-06-01", deadline: "2026-06-20", fundsPromised: 500, fundsReceived: 200, notes: "Picked up Monday and Wednesday so far. Need a Thursday driver." },
  { id: 2, title: "Hachnosas Kallah — Weinberg wedding", description: "Young couple needs $3,000 for wedding expenses", status: "open", urgency: "critical", category: "Hachnosas Kallah", contactName: "Moshe Weinberg", createdAt: "2026-06-05", deadline: "2026-06-28", fundsPromised: 1500, fundsReceived: 800, notes: "" },
  { id: 3, title: "Housing assistance — Schwartz family", description: "Family of 6 needs help with 2 months back rent", status: "closed", urgency: "medium", category: "Housing", contactName: "Yenta Schwartz", createdAt: "2026-05-15", deadline: "2026-05-30", fundsPromised: 2000, fundsReceived: 2000, notes: "Resolved. Connected with local gemach." },
];
const SEED_TASKS: Task[] = [
  { id: 1, title: "Call Thursday driver for Klein family", caseTitle: "Medical transport — R. Klein family", deadline: "2026-06-11", completed: false, priority: "high", notes: "" },
  { id: 2, title: "Follow up with Weinberg on remaining donors", caseTitle: "Weinberg wedding", deadline: "2026-06-12", completed: false, priority: "high", notes: "" },
  { id: 3, title: "Send thank-you note to transport volunteers", caseTitle: "", deadline: "2026-06-13", completed: true, priority: "medium", notes: "" },
  { id: 4, title: "Post forum update on shidduchim resources", caseTitle: "", deadline: "2026-06-14", completed: false, priority: "low", notes: "" },
];
const SEED_NOTES: Note[] = [
  { id: 1, title: "Bikur Cholim Network Contacts", content: "Reb Moshe Goldstein: 718-555-0142\nDevorah Katz (Lakewood): 732-555-0088\nLocal hospitals: Call social work dept first.", createdAt: "2026-06-01" },
  { id: 2, title: "Grant Application Notes", content: "UJA deadline: July 15. Need: 2 references, budget sheet, mission statement.\nFederation grants: rolling basis, submit quarterly.", createdAt: "2026-06-03" },
];

// Historical mock data
const HISTORY_DATA: Record<string, { people: number; calls: number; funds: number; hours: number; messages: number }> = {};
for (let i = 1; i <= 90; i++) {
  const d = format(subDays(new Date(2026, 5, 10), i), "yyyy-MM-dd");
  HISTORY_DATA[d] = {
    people: Math.floor(Math.random() * 5),
    calls: Math.floor(Math.random() * 8),
    funds: Math.floor(Math.random() * 300),
    hours: Math.round(Math.random() * 4 * 10) / 10,
    messages: Math.floor(Math.random() * 12),
  };
}

// --- Sub-components ---
function ImpactStat({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl p-5 border ${color} flex flex-col gap-2`}>
      <div className="flex items-center gap-2 text-sm font-medium opacity-80">{icon} {label}</div>
      <div className="text-3xl font-serif font-bold">{value}</div>
    </div>
  );
}

function NewCaseDialog({ onAdd }: { onAdd: (c: Case) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", urgency: "medium", category: "General", contactName: "", deadline: "", fundsPromised: "" });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ id: Date.now(), ...form, status: "open" as const, urgency: form.urgency as Case["urgency"], createdAt: new Date().toISOString().slice(0, 10), fundsPromised: Number(form.fundsPromised) || 0, fundsReceived: 0, notes: "" });
    setOpen(false);
    setForm({ title: "", description: "", urgency: "medium", category: "General", contactName: "", deadline: "", fundsPromised: "" });
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
                  {["Bikur Cholim", "Hachnosas Kallah", "Housing", "Financial", "Education", "Medical", "Transportation", "General"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            <div className="space-y-1.5"><Label className="font-semibold">Funds Promised ($)</Label><Input type="number" value={form.fundsPromised} onChange={s("fundsPromised")} placeholder="0" className="h-11" /></div>
          </div>
          <div className="space-y-1.5"><Label className="font-semibold">Description</Label><Textarea value={form.description} onChange={s("description")} placeholder="Case details..." className="resize-none" /></div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold">Open Case</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewTaskDialog({ onAdd }: { onAdd: (t: Task) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", caseTitle: "", deadline: "", priority: "medium", notes: "" });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
    setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ id: Date.now(), ...form, completed: false } as Task);
    setOpen(false);
    setForm({ title: "", caseTitle: "", deadline: "", priority: "medium", notes: "" });
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
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-white h-12 font-semibold">Add Task</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- History Calendar ---
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function HistoryCalendar({ onSelect, selected }: { onSelect: (d: string) => void; selected: string }) {
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(5);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dateStr = (d: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const prev = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const next = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);
  const today = "2026-06-10";

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
          const hasData = !!HISTORY_DATA[ds];
          const isSel = selected === ds;
          const isToday = ds === today;
          return (
            <button key={i} onClick={() => onSelect(ds)}
              className={`aspect-square flex items-center justify-center text-xs rounded transition-colors relative ${
                isSel ? "bg-secondary text-white font-bold" :
                isToday ? "bg-primary/10 text-primary font-bold" :
                hasData ? "hover:bg-accent/30 text-foreground" : "text-muted-foreground/50 hover:bg-muted/40"
              }`}
            >
              {day}
              {hasData && !isSel && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
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
  const [cases, setCases] = useLocal<Case[]>("gavhah_cases", SEED_CASES);
  const [tasks, setTasks] = useLocal<Task[]>("gavhah_tasks", SEED_TASKS);
  const [notes, setNotes] = useLocal<Note[]>("gavhah_notes", SEED_NOTES);
  const [historyDate, setHistoryDate] = useState("2026-06-08");
  const [newNote, setNewNote] = useState({ title: "", content: "" });
  const [editNoteId, setEditNoteId] = useState<number | null>(null);

  const { data: notifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });
  const markAllRead = useMarkAllNotificationsRead();
  const unread = notifications?.filter(n => !n.isRead).length ?? 0;

  // Lifetime stats
  const totalFundsRaised = cases.reduce((a, c) => a + c.fundsReceived, 0);
  const totalPeopleHelped = cases.filter(c => c.status === "closed").length;
  const openCases = cases.filter(c => c.status !== "closed").length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const pendingTasks = tasks.filter(t => !t.completed).length;

  const histDay = HISTORY_DATA[historyDate];

  const toggleTask = (id: number) => setTasks(ts => ts.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const deleteTask = (id: number) => setTasks(ts => ts.filter(t => t.id !== id));
  const updateCaseStatus = (id: number, status: Case["status"]) => setCases(cs => cs.map(c => c.id === id ? { ...c, status } : c));
  const deleteCase = (id: number) => setCases(cs => cs.filter(c => c.id !== id));
  const saveNote = () => {
    if (!newNote.title || !newNote.content) return;
    if (editNoteId) {
      setNotes(ns => ns.map(n => n.id === editNoteId ? { ...n, ...newNote } : n));
      setEditNoteId(null);
    } else {
      setNotes(ns => [...ns, { id: Date.now(), ...newNote, createdAt: new Date().toISOString().slice(0, 10) }]);
    }
    setNewNote({ title: "", content: "" });
  };

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
          {/* Today's summary */}
          <div className="mt-8 bg-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/60 mb-4">Today's Overview — {format(new Date(2026, 5, 10), "EEEE, MMMM d")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Open Cases", value: openCases, icon: <HandHeart className="h-5 w-5" /> },
                { label: "Pending Tasks", value: pendingTasks, icon: <CheckCircle className="h-5 w-5" /> },
                { label: "Funds Outstanding", value: `$${cases.filter(c => c.status !== "closed").reduce((a, c) => a + (c.fundsPromised - c.fundsReceived), 0).toLocaleString()}`, icon: <DollarSign className="h-5 w-5" /> },
                { label: "Notifications", value: unread, icon: <Bell className="h-5 w-5" /> },
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
            <ImpactStat label="Funds Raised" value={`$${totalFundsRaised.toLocaleString()}`} icon={<DollarSign className="h-4 w-4" />} color="bg-secondary/5 border-secondary/10 text-secondary" />
            <ImpactStat label="Tasks Done" value={completedTasks} icon={<CheckCircle className="h-4 w-4" />} color="bg-accent/10 border-accent/20 text-accent-foreground" />
            <ImpactStat label="Active Cases" value={openCases} icon={<Phone className="h-4 w-4" />} color="bg-primary/5 border-primary/10 text-primary" />
            <ImpactStat label="Open Tasks" value={pendingTasks} icon={<Clock className="h-4 w-4" />} color="bg-secondary/5 border-secondary/10 text-secondary" />
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
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Active Cases</h2>
              <NewCaseDialog onAdd={c => setCases(cs => [c, ...cs])} />
            </div>
            {cases.map(c => {
              const fundPct = c.fundsPromised > 0 ? Math.min(100, Math.round((c.fundsReceived / c.fundsPromised) * 100)) : 0;
              return (
                <div key={c.id} className={`bg-card border rounded-xl p-6 hover:shadow-sm transition-shadow ${c.status === "closed" ? "opacity-70" : ""}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={URGENCY_COLORS[c.urgency] as any} className="capitalize text-xs">{c.urgency}</Badge>
                        <Badge variant={STATUS_COLORS[c.status] as any} className="capitalize text-xs">{c.status.replace("_", " ")}</Badge>
                        <Badge variant="outline" className="text-xs">{c.category}</Badge>
                      </div>
                      <div>
                        <h3 className="font-serif font-bold text-primary text-lg">{c.title}</h3>
                        {c.contactName && <p className="text-sm text-muted-foreground">Contact: {c.contactName}</p>}
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{c.description}</p>
                      </div>
                      {c.fundsPromised > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-secondary">${c.fundsReceived.toLocaleString()} received</span>
                            <span className="text-muted-foreground">of ${c.fundsPromised.toLocaleString()} promised</span>
                          </div>
                          <Progress value={fundPct} className="h-2" />
                          <p className="text-xs text-muted-foreground">{fundPct}% collected · ${(c.fundsPromised - c.fundsReceived).toLocaleString()} outstanding</p>
                        </div>
                      )}
                      {c.notes && <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 italic">{c.notes}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {c.deadline && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Deadline: {c.deadline}</span>}
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Opened: {c.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2 shrink-0">
                      {c.status !== "closed" && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => updateCaseStatus(c.id, "closed")}>
                          <CheckCircle className="h-3.5 w-3.5" /> Close
                        </Button>
                      )}
                      {c.status === "open" && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => updateCaseStatus(c.id, "in_progress")}>
                          <Activity className="h-3.5 w-3.5" /> Start
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1.5 text-xs" onClick={() => deleteCase(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {cases.length === 0 && (
              <div className="text-center py-16 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                No cases yet. Open your first case above.
              </div>
            )}
          </TabsContent>

          {/* TASKS */}
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-primary">Task Manager</h2>
              <NewTaskDialog onAdd={t => setTasks(ts => [t, ...ts])} />
            </div>
            <div className="space-y-3">
              {["high", "medium", "low"].map(priority => {
                const priorityTasks = tasks.filter(t => t.priority === priority && !t.completed);
                if (priorityTasks.length === 0) return null;
                return (
                  <div key={priority}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${priority === "high" ? "text-destructive" : priority === "medium" ? "text-secondary" : "text-muted-foreground"}`}>
                      {priority} priority
                    </p>
                    {priorityTasks.map(t => (
                      <div key={t.id} className="bg-card border rounded-xl p-4 flex items-start gap-3 mb-2 hover:border-primary/20 transition-colors">
                        <button onClick={() => toggleTask(t.id)} className="mt-0.5 shrink-0 w-5 h-5 rounded border-2 border-muted-foreground/40 hover:border-secondary flex items-center justify-center transition-colors">
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
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive shrink-0 h-7 w-7 p-0" onClick={() => deleteTask(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {tasks.filter(t => !t.completed).length === 0 && (
                <div className="text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                  All tasks completed! Add new tasks above.
                </div>
              )}
            </div>
            {tasks.filter(t => t.completed).length > 0 && (
              <div className="pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Completed</p>
                <div className="space-y-2">
                  {tasks.filter(t => t.completed).map(t => (
                    <div key={t.id} className="bg-muted/30 border rounded-xl p-4 flex items-center gap-3 opacity-60">
                      <CheckCircle className="h-5 w-5 text-green-600 fill-green-100 shrink-0" />
                      <p className="flex-1 line-through text-muted-foreground text-sm">{t.title}</p>
                      <Button size="sm" variant="ghost" className="text-muted-foreground text-xs h-7" onClick={() => toggleTask(t.id)}>Undo</Button>
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
              <p className="text-muted-foreground text-sm">Review any previous day's activism record. Click a date with a dot to see details.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <HistoryCalendar selected={historyDate} onSelect={setHistoryDate} />
              <div className="space-y-4">
                <div className="bg-card border rounded-xl p-6">
                  <h3 className="font-serif font-bold text-primary text-lg mb-1">
                    {format(new Date(historyDate + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-5 font-serif italic">Daily activity summary</p>
                  {histDay ? (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "People Helped", value: histDay.people, icon: <Users className="h-4 w-4" />, color: "text-primary" },
                        { label: "Calls Made", value: histDay.calls, icon: <Phone className="h-4 w-4" />, color: "text-secondary" },
                        { label: "Funds Raised", value: `$${histDay.funds}`, icon: <DollarSign className="h-4 w-4" />, color: "text-accent-foreground" },
                        { label: "Hours Worked", value: `${histDay.hours}h`, icon: <Clock className="h-4 w-4" />, color: "text-primary" },
                        { label: "Messages Sent", value: histDay.messages, icon: <MessageSquare className="h-4 w-4" />, color: "text-secondary" },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center gap-3 bg-muted/40 rounded-lg p-3">
                          <span className={s.color}>{s.icon}</span>
                          <div>
                            <div className={`text-xl font-serif font-bold ${s.color}`}>{s.value}</div>
                            <div className="text-xs text-muted-foreground">{s.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground font-serif italic">
                      No activity recorded for this date.
                    </div>
                  )}
                </div>
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary text-sm">90-Day Summary</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["People Helped", Object.values(HISTORY_DATA).reduce((a, v) => a + v.people, 0)],
                      ["Calls Made", Object.values(HISTORY_DATA).reduce((a, v) => a + v.calls, 0)],
                      ["Funds Raised", `$${Object.values(HISTORY_DATA).reduce((a, v) => a + v.funds, 0).toLocaleString()}`],
                      ["Hours Worked", `${Object.values(HISTORY_DATA).reduce((a, v) => a + v.hours, 0).toFixed(0)}h`],
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
              {notes.map(note => (
                <div key={note.id} className="bg-card border rounded-xl p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-serif font-bold text-primary">{note.title}</h3>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => { setEditNoteId(note.id); setNewNote({ title: note.title, content: note.content }); }}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setNotes(ns => ns.filter(n => n.id !== note.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-4">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-3 border-t pt-2">{note.createdAt}</p>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="col-span-full text-center py-12 border rounded-xl bg-muted/20 text-muted-foreground font-serif italic">
                  No notes yet.
                </div>
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
