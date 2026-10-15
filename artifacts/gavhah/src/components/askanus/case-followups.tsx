import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAskanuscasesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Bell, BookOpen, CheckCircle, ChevronDown, ChevronUp, RotateCcw, Trash2, Pencil, Save, X } from "lucide-react";
import {
  partitionCaseFollowups, removeCaseFollowup, updateCaseFollowupCompletion,
} from "@/lib/case-followup-history";

export type CaseFollowupEntry = {
  id: number;
  caseId: number;
  note: string;
  date: string;
  dueDate?: string | null;
  dueTime?: string | null;
  timeZone?: string | null;
  repeatRule?: string;
  repeatAnchorDay?: number | null;
  generatedFromId?: number | null;
  completed: boolean;
  createdAt: string;
};

export function CaseFollowups({ caseId, followups, onUpdated }: {
  caseId: number;
  followups: CaseFollowupEntry[];
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editRepeatRule,setEditRepeatRule] = useState("none");
  const [savingId, setSavingId] = useState<number | null>(null);
  const { open, history } = partitionCaseFollowups(followups);
  const busy = togglingId !== null || deletingId !== null || savingId !== null;

  const updateStoredCase = (change: (items: CaseFollowupEntry[]) => CaseFollowupEntry[]) => {
    qc.setQueryData(getListAskanuscasesQueryKey(), (existing: any) =>
      Array.isArray(existing) ? existing.map((item: any) =>
        item.id === caseId
          ? { ...item, followUpNotes: change(item.followUpNotes || []) }
          : item,
      ) : existing,
    );
  };

  const toggleFollowup = async (item: CaseFollowupEntry) => {
    if(busy)return;
    setTogglingId(item.id);
    try{
      const response=await fetch("/api/askanus/followups/"+item.id+"/toggle",{
        method:"PATCH",credentials:"include",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        // An explicitly desired state is retry-safe, unlike a blind toggle.
        body:JSON.stringify({completed:!item.completed}),
      });
      if(!response.ok)throw Error("Could not update follow-up");
      const updated:CaseFollowupEntry=await response.json();
      updateStoredCase(items=>updateCaseFollowupCompletion(items, item.id, updated.completed));
      await onUpdated();
      toast({title:updated.completed
        ?(item.repeatRule&&item.repeatRule!=="none"
          ?"דער נאכפאלג איז פארטיג. דער קומענדיגער איז שוין צוגעשטעלט."
          :"דער נאכפאלג איז אריבער אין היסטאריע")
        :"דער נאכפאלג איז צוריק אפן"});
    }catch{
      toast({title:"נישט געלונגען צו דערהיינטיגן דעם נאכפאלג",variant:"destructive"});
    }finally{setTogglingId(null);}
  };

  const deleteFollowup = async (item: CaseFollowupEntry) => {
    if (busy) return;
    if (!window.confirm("זיכער אויסמעקן דעם Follow-up? דאס איז א שטענדיגע אויסמעקונג און מען קען עס נישט צוריקברענגען.")) {
      return;
    }
    setDeletingId(item.id);
    try {
      const response = await fetch("/api/askanus/followups/" + item.id, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not delete follow-up");
      const result = await response.json();
      if (result.ok !== true || result.deletedId !== item.id) throw new Error("Deletion was not confirmed");
      updateStoredCase(items => removeCaseFollowup(items, item.id));
      void onUpdated();
      toast({ title: "דער Follow-up איז טאקע אויסגעמעקט" });
    } catch {
      toast({ title: "נישט געלונגען אויסצומעקן דעם Follow-up", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const beginEdit = (item: CaseFollowupEntry) => {
    if (busy) return;
    setEditingId(item.id);
    setEditNote(item.note);
    setEditDueDate(item.dueDate || "");
    setEditDueTime(item.dueTime || "");
    setEditRepeatRule(item.repeatRule||"none");
  };

  const saveEdit = async (item: CaseFollowupEntry) => {
    if (busy || !editNote.trim()) return;
    setSavingId(item.id);
    try {
      const response = await fetch("/api/askanus/followups/" + item.id, {
        method: "PATCH", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editNote.trim(), dueDate: editDueDate || null, dueTime:editDueDate?(editDueTime||null):null,
          timeZone:editDueTime?(item.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"):null,
          repeatRule:editRepeatRule }),
      });
      if (!response.ok) throw new Error("Could not edit follow-up");
      const updated: CaseFollowupEntry = await response.json();
      if (updated.id !== item.id || updated.caseId !== caseId) throw new Error("Unexpected follow-up");
      updateStoredCase(items => items.map(f => f.id === item.id ? updated : f));
      setEditingId(null);
      void onUpdated();
      toast({ title: "דער נאכפאלג איז דערהיינטיגט געווארן אין ביידע אפטיילונגען" });
    } catch {
      toast({ title: "נישט געלונגען צו ענדערן דעם נאכפאלג", variant: "destructive" });
    } finally { setSavingId(null); }
  };

  const entry = (item: CaseFollowupEntry, isHistory: boolean) => (
    <div key={item.id} className="flex flex-col gap-2 rounded-xl border bg-background px-3 py-3 sm:flex-row sm:items-start sm:justify-between" dir="rtl">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {isHistory ? (
          <CheckCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-green-700 mt-0.5" />
        ) : (
          <button type="button" disabled={busy} onClick={() => toggleFollowup(item)}
            aria-label={"פארטיג מאכן Follow-up: " + item.note}
            className="h-6 w-6 shrink-0 rounded-md border-2 border-secondary flex items-center justify-center hover:bg-secondary/10 disabled:opacity-50" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          {editingId === item.id ? (
            <div className="space-y-2">
              <Textarea aria-label="נאכפאלג־נאטיץ" value={editNote} onChange={e => setEditNote(e.target.value)}
                className="min-h-20" maxLength={1500} />
              <Input aria-label="באשטימטער נאכפאלג־דאטום" type="date" value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)} />
              <Input aria-label="באשטימטע שעה" type="time" value={editDueTime}
                disabled={!editDueDate} onChange={e=>setEditDueTime(e.target.value)} />
              <label className="text-xs block">ווידערהאלן דעם נאכפאלג</label>
              <select aria-label="ווידערהאלן נאכפאלג" className="w-full min-h-11 rounded-md border bg-background px-2"
                value={editRepeatRule} onChange={e=>setEditRepeatRule(e.target.value)} disabled={!editDueDate}>
                <option value="none">איינמאליג</option>
                <option value="daily">יעדן טאג</option>
                <option value="weekly">יעדע וואך</option>
                <option value="monthly">יעדן חודש</option>
              </select>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy || !editNote.trim()} onClick={() => void saveEdit(item)}>
                  <Save className="h-3.5 w-3.5 ml-1" /> אפהיטן
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingId(null)}>
                  <X className="h-3.5 w-3.5 ml-1" /> אפלאזן
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-foreground whitespace-pre-wrap break-words" dir="auto">{item.note}</p>
          )}
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            {isHistory && <span className="font-semibold text-green-700">פארטיג</span>}
            <span>אויפגעשריבן: <span dir="ltr">{item.date}</span></span>
            {item.dueDate && <span>· באשטימט: <span dir="ltr">{item.dueDate}{item.dueTime?" "+item.dueTime:""}</span></span>}
            {item.repeatRule&&item.repeatRule!=="none"&&<span>· איבערחזרנדיג: {item.repeatRule==="daily"?"טעגליך":item.repeatRule==="weekly"?"וואכעדיג":"חודש׳ליך"}</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ps-2">
        {isHistory && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleFollowup(item)}
            className="min-h-9 gap-1.5" aria-label={"צוריק עפענען Follow-up: " + item.note}>
            <RotateCcw className="h-3.5 w-3.5" />
            צוריק צו אפן
          </Button>
        )}
        <Button type="button" variant="outline" size="sm"
          disabled={busy} onClick={() => beginEdit(item)}
          className="min-h-9 gap-1" aria-label={"ענדערן Follow-up: " + item.note}>
          <Pencil className="h-3.5 w-3.5" /> עדיטן
        </Button>
        <Button type="button" variant="outline" size="sm"
          disabled={busy} onClick={() => void deleteFollowup(item)}
          className="min-h-9 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          aria-label={"דעליט Follow-up: " + item.note}>
          <Trash2 className="h-3.5 w-3.5" />
          {deletingId === item.id ? "מעקט אויס..." : "דעליט"}
        </Button>
      </div>
    </div>
  );

  return (
    <section className="space-y-4 pt-2 border-t" aria-label="קעיס Follow-ups און היסטאריע">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden="true" />
          אפענע Follow-ups ({open.length})
        </h4>
        {open.length ? open.map(item => entry(item, false)) : (
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/20 p-3">
            דערווייל נישטא קיין אפענע Follow-ups.
          </p>
        )}
      </div>

      <section className="rounded-xl border border-green-700/20 bg-green-50/30 dark:bg-green-900/10 p-3 space-y-3">
        <button type="button" className="w-full flex items-center justify-between gap-2 text-start"
          onClick={() => setShowHistory(value => !value)} aria-expanded={showHistory}
          aria-controls={"followup-history-" + caseId}>
          <span className="flex items-center gap-2 text-sm font-semibold text-primary">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Follow-up היסטאריע — וואס מ'האט שוין אויפגעטון ({history.length})
          </span>
          {showHistory ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        {showHistory && (
          <div id={"followup-history-" + caseId} className="space-y-2">
            {history.length ? history.map(item => entry(item, true)) : (
              <p className="text-xs text-muted-foreground">
                דא וועלן זיך אפהיטן אלע Follow-ups וואס מ'האט פארטיג געמאכט, ביז מען מעקט זיי בפירוש אויס.
              </p>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
