import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAskanuscasesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Bell, BookOpen, CheckCircle2, ContactRound, PhoneCall, Plus, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CaseFollowups, type CaseFollowupEntry } from "@/components/askanus/case-followups";
import { Donor360 } from "@/components/communications/donor-360";
import { MaxSourceHelper } from "@/components/communications/max-source-helper";
import { MaxReminderInbox } from "@/components/communications/max-reminder-inbox";
import { MaxPerformancePanel } from "@/components/communications/max-performance-panel";
import { MaxHistoryPanel } from "@/components/communications/max-history-panel";
import { GavhahConnectPanel } from "@/components/communications/gavhah-connect-panel";
import { MaxTishl } from "@/components/communications/max-tishl";

type PersonalCase = {
  id:number; title:string; goalAmount:number; fundsReceived:number; fundsPromised:number;
  followUpNotes:CaseFollowupEntry[];
};
type Contact = { id:number; name:string; phone:string; email:string; notes:string; organization?:string;city?:string;tags?:string; doNotCall?:boolean; preferredHours?:string };
type Call = {id:number; caseId:number; contactName:string; outcome:string; moneyKind:string; amount:number; note:string; createdAt:string};
type TodaySummary = {
  summary:{dueOrOverdueFollowups:number;totalOpenFollowups:number;openTasks:number;openPromiseBalance:number};
  nextTasks:Array<{id:number;title:string;deadline:string;priority:string;caseTitle:string}>;
};

async function request<T>(url:string, init?:RequestInit):Promise<T> {
  const response = await fetch(url,{credentials:"include",cache:"no-store", ...init});
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    throw new Error(typeof message.error === "string" ? message.error : "Server request failed");
  }
  return response.json() as Promise<T>;
}
const json = (body:unknown,method="POST"):RequestInit => ({
  method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
});
const outcomeNames:Record<string,string> = {
  spoke:"גערעדט (אלטער באריכט)",gave:"געגעבן א נדבה",no_answer:"נישט אויפגעהויבן",callback:"בעט צוריקצורופן",
  do_not_call:"בעט נישט מער צו רופן",
  not_interested:"נישט אינטערעסירט",other:"אנדערע",
};

export function MaxCallDesk() {
  const qc = useQueryClient();
  const [cases,setCases] = useState<PersonalCase[]>([]);
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [remoteContacts,setRemoteContacts] = useState<Contact[] | null>(null);
  const [selectedContact,setSelectedContact] = useState<Contact | null>(null);
  const [calls,setCalls] = useState<Call[]>([]);
  const [todaySummary,setTodaySummary] = useState<TodaySummary | null>(null);
  const [caseId,setCaseId] = useState<number | null>(null);
  const [contactId,setContactId] = useState<number | null>(null);
  const [newContact,setNewContact] = useState({name:"",phone:"",email:""});
  const [contactSearch,setContactSearch] = useState("");
  const [importCsv,setImportCsv] = useState("");
  const [importFilename,setImportFilename] = useState("");
  const [importPreview,setImportPreview] = useState<{total:number;ready:number;duplicates:number;preview:Array<{line:number;name:string;phone:string;email:string;doNotCall:boolean}>}|null>(null);
  const [name,setName] = useState("");
  const [outcome,setOutcome] = useState("gave");
  const [moneyKind,setMoneyKind] = useState("none");
  const [amount,setAmount] = useState("");
  const [note,setNote] = useState("");
  const [mood,setMood] = useState("not_entered");
  const [revision,setRevision] = useState(0);
  const [followupNote,setFollowupNote] = useState("");
  const [dueDate,setDueDate] = useState("");
  const [dueTime,setDueTime] = useState("");
  const [repeatRule,setRepeatRule] = useState("none");
  const [callbackKind,setCallbackKind]=useState("none");
  const [callbackMinutes,setCallbackMinutes]=useState("20");
  const [callbackHours,setCallbackHours]=useState("7");
  const [callbackMinuteOfHour,setCallbackMinuteOfHour]=useState("");
  const [recontactEnabled,setRecontactEnabled]=useState(false);
  const [recontactMonths,setRecontactMonths]=useState("6");
  const [recontactScope,setRecontactScope]=useState<"same_purpose"|"new_purpose">("same_purpose");
  const [quickNote,setQuickNote] = useState("");
  const [quickDate,setQuickDate] = useState("");
  const [quickTime,setQuickTime] = useState("");
  const [quickRepeat,setQuickRepeat] = useState("none");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [requestId,setRequestId] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c,people,records,overview] = await Promise.all([
        request<PersonalCase[]>("/api/askanus/cases"),
        request<Contact[]>("/api/askanus/contacts"),
        request<Call[]>("/api/askanus/call-reports"),
        request<TodaySummary>("/api/askanus/max/today"),
      ]);
      setCases(c);setContacts(people);setCalls(records);setTodaySummary(overview);
      setCaseId(current => current && c.some(item=>item.id===current) ? current : c[0]?.id ?? null);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "נישט געלונגען צו לאָדן"); }
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  // Never limit contact discovery to the first page when a user searches.
  useEffect(()=>{
    const term=contactSearch.trim();
    if(!term){setRemoteContacts(null);return;}
    const controller=new AbortController();
    const timeout=setTimeout(()=>{
      request<Contact[]>("/api/askanus/contacts?q="+encodeURIComponent(term)+"&limit=100",
        {signal:controller.signal})
        .then(setRemoteContacts)
        .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"זוך־פראבלעם");});
    },250);
    return ()=>{clearTimeout(timeout);controller.abort();};
  },[contactSearch]);
  const current = useMemo(()=>cases.find(c=>c.id===caseId),[cases,caseId]);
  const chosenContact = selectedContact && selectedContact.id===contactId
    ? selectedContact : contacts.find(c=>c.id===contactId);
  const openFollowups = current?.followUpNotes.filter(f=>!f.completed).length || 0;
  const localDate = new Date();
  const today = [localDate.getFullYear(),String(localDate.getMonth()+1).padStart(2,"0"),
    String(localDate.getDate()).padStart(2,"0")].join("-");
  const allOpen = cases.flatMap(c=>c.followUpNotes.filter(f=>!f.completed)
    .map(f=>({...f,project:c.title})));
  const dueNow = allOpen.filter(f=>f.dueDate && f.dueDate<=today);
  const comingUp = [...allOpen].sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999")).slice(0,5);
  const allReceived=cases.reduce((s,c)=>s+Number(c.fundsReceived),0);
  const filteredContacts = contactSearch.trim()
    ? (remoteContacts ?? []).filter(c=>(c.name+" "+c.phone+" "+c.email)
        .toLocaleLowerCase().includes(contactSearch.trim().toLocaleLowerCase()))
    : contacts;
  const setContact = (id:number | null) => {
    const person=[...contacts,...(remoteContacts??[])].find(c=>c.id===id);
    if(person?.doNotCall&&!window.confirm(
      "אכטונג: דער נדבן האט געבעטן מער נישט צו רופן. ביסט זיכער אז דו ווילסט נאכאמאל אריינגיין אין זיין קארטל? "+
      "דאס עפנט נאר דעם קארטל, און איז נישט קיין רשות אים צו רופן."
    ))return;
    setContactId(id);
    setSelectedContact(person??null);
    setName(person?.name??"");
  };
  const addContact=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");setMessage("");
    try {
      const saved=await request<Contact>("/api/askanus/contacts",json(newContact));
      setContacts(items=>[saved,...items]);setContactId(saved.id);
      setSelectedContact(saved);setName(saved.name);
      setNewContact({name:"",phone:"",email:""});
      setMessage("דער קאנטאקט איז אפגעהיטן אין דיין פריוואטן קשרים־בוך.");
    } catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(false);}
  };
  const previewCsv=async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      const preview=await request<{total:number;ready:number;duplicates:number;preview:Array<{line:number;name:string;phone:string;email:string;doNotCall:boolean}>}>(
        "/api/askanus/contacts/import-preview",json({csv:importCsv}));
      setImportPreview(preview);
    }catch(e){setImportPreview(null);setError(e instanceof Error?e.message:"קשרים־ליסטע איז נישט גוט");}
    finally{setBusy(false);}
  };
  const confirmCsv=async()=>{
    if(!importPreview||!importPreview.ready)return;
    if(!window.confirm("צולייגן "+importPreview.ready+" נייע קשרים אין דיין פריוואטן קשרים־בוך?"))return;
    setBusy(true);setError("");setMessage("");
    try{
      const saved=await request<{total:number;imported:number;skipped:number}>(
        "/api/askanus/contacts/import",json({csv:importCsv,confirm:true}));
      setMessage(saved.imported+" קשרים אריינגעברענגט; "+saved.skipped+" שוין פאראן אדער איבערגעחזרט.");
      setImportCsv("");setImportPreview(null);setImportFilename("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען אריינצוברענגען די קשרים");}
    finally{setBusy(false);}
  };
  const saveCall=async(e:React.FormEvent)=>{
    e.preventDefault();if(!caseId || !name.trim()) return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await request<{duplicate:boolean;report:Call;callbackDueAt?:string|null;callbackTimeZone?:string|null;recontactDueAt?:string|null}>(
        "/api/askanus/cases/"+caseId+"/call-reports",
        json({requestId,contactId,contactName:name.trim(),outcome,
          moneyKind:outcome==="gave"?moneyKind:"none",mood,
          amount:outcome==="gave"&&moneyKind!=="none"?Number(amount):0,
          note,followupNote,dueDate:dueDate||null,dueTime:dueTime||null,
          timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York",
          repeatRule,
          callbackPlan:(outcome==="no_answer"||outcome==="callback")
            ?{kind:callbackKind,minutes:Number(callbackMinutes),hours:Number(callbackHours),
              minuteOfHour:callbackMinuteOfHour===""?null:Number(callbackMinuteOfHour)}
            :{kind:"none"},
          recontactPlan:recontactEnabled&&contactId!==null&&outcome!=="do_not_call"?
            {scope:recontactScope,afterMonths:Number(recontactMonths)}:undefined}),
      );
      const callbackText=result.callbackDueAt
        ? " דער צוריק־רוף ליגט אויפן טישל פאר "+new Date(result.callbackDueAt).toLocaleString(undefined,
           {weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+".":"";
      const recontactText=result.recontactDueAt
        ? " דער נדבן איז אריינגעלייגט אין דער שפעטער־רופן־ליסטע פאר "+
          new Date(result.recontactDueAt).toLocaleDateString()+".":"";
      setMessage(result.duplicate
        ? "דער פריערדיגער באריכט איז שוין אפגעהיטן. קיין צווייטע נדבה איז נישט צוגערעכנט."
        : "דער רוף־באריכט איז אפגעהיטן אין MAX און מיין עסקנות."+callbackText+recontactText);
      setCalls(items=>[result.report,...items.filter(r=>r.id!==result.report.id)].slice(0,100));
      setRequestId(crypto.randomUUID());setOutcome("gave");setMoneyKind("none");setAmount("");setMood("not_entered");setRevision(v=>v+1);
      setNote("");setFollowupNote("");setDueDate("");setDueTime("");setRepeatRule("none");setCallbackKind("none");setRecontactEnabled(false);setRecontactMonths("6");
      await load();
      await qc.invalidateQueries({queryKey:getListAskanuscasesQueryKey()});
    } catch(e){setError(e instanceof Error?e.message:"נישט געלונגען אפצוהיטן");}
    finally{setBusy(false);}
  };
  const addFollowup=async(e:React.FormEvent)=>{
    e.preventDefault();if(!caseId || !quickNote.trim())return;
    setBusy(true);setError("");setMessage("");
    try{
      await request("/api/askanus/cases/"+caseId+"/progress",
        json({action:"followup",note:quickNote.trim(),dueDate:quickDate||undefined,
          dueTime:quickTime||undefined,timeZone:quickTime?(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"):undefined,
          repeatRule:quickRepeat}));
      setQuickNote("");setQuickDate("");setQuickTime("");setQuickRepeat("none");setMessage("דער נאכפאלג איז אין דער זעלבער ליסטע פון מיין עסקנות.");
      await load();
      await qc.invalidateQueries({queryKey:getListAskanuscasesQueryKey()});
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(false);}
  };
  return <div dir="rtl" className="space-y-6">
    <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-2">
      <h2 className="text-xl font-semibold text-primary flex items-center gap-2"><PhoneCall className="h-5 w-5"/> עולם החסד MAX — מיין רופן־צענטער</h2>
      <p className="text-sm text-muted-foreground">
        א פערזענליכער ארבעטס־צענטער פאר נדבנים, רוף־באריכטן, התחייבויות און נאכפאלגן.
        דערווייל ווערן רופן־רעזולטאטן אריינגעשריבן דורך דיר; קיין טעלעפאן־פארבינדונג איז נאכנישט אקטיוו.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4 ml-1"/> דערפרישן
        </Button>
        <Link href="/my"><Button variant="outline" size="sm">צו מיין עסקנות</Button></Link>
      </div>
    </div>
    <nav aria-label="MAX הויפט־אפטיילונגען" className="grid grid-cols-5 gap-1.5 text-center text-[11px] sm:text-sm">
      {[
        {href:"#max-tishl",label:"מיין טישל"},
        {href:"#max-call",label:"רופן"},
        {href:"#max-contacts",label:"מענטשן"},
        {href:"#max-projects",label:"צוועקן"},
        {href:"#max-more",label:"מער"},
      ].map(a=><a key={a.href} href={a.href} className="rounded-lg border bg-card p-2 font-medium min-h-11 flex items-center justify-center hover:bg-muted/60">{a.label}</a>)}
    </nav>
    <MaxTishl revision={revision} />
    <section id="max-today" className="rounded-xl border bg-card p-4 sm:p-6 space-y-3 scroll-mt-24">
      <h3 className="text-lg font-bold">מיין היינטיגע ארבעט — וואס דארף איך יעצט טון?</h3>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-muted/40 p-3"><strong className="block text-lg">{todaySummary?.summary.dueOrOverdueFollowups??dueNow.length}</strong> היינט/פארשפעטיגט</div>
        <div className="rounded-lg bg-muted/40 p-3"><strong className="block text-lg">{todaySummary?.summary.totalOpenFollowups??allOpen.length}</strong> אפענע נאכפאלגן</div>
        <div className="rounded-lg bg-muted/40 p-3"><strong className="block text-lg">{allReceived.toLocaleString()}</strong> באריכטעט באקומען ($)</div>
      </div>
      {comingUp.length===0?<p className="text-sm text-muted-foreground">נאכנישט קיין אפענע נאכפאלגן.</p>:
        comingUp.map(f=><div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
          <span><strong>{f.project}</strong> · {f.note}</span>
          <span className="text-xs text-muted-foreground">{f.dueDate||"קיין דאטום נישט באשטימט"}</span>
        </div>)}
      {todaySummary && todaySummary.nextTasks.length>0 &&
        <div className="space-y-2 border-t pt-3">
          <h4 className="font-semibold text-sm">מיינע אפענע אויפגאבן ({todaySummary.summary.openTasks})</h4>
          {todaySummary.nextTasks.slice(0,5).map(t=><div key={t.id} className="rounded-lg border p-3 text-sm">
            <strong>{t.title}</strong>{t.caseTitle && <span className="text-muted-foreground"> · {t.caseTitle}</span>}
            {t.deadline && <span className="block text-xs text-muted-foreground">{t.deadline}</span>}
          </div>)}
        </div>}
    </section>
    <MaxReminderInbox onChanged={()=>{void load();}} />
    {error && <div role="alert" className="p-3 rounded-lg border border-destructive/40 text-destructive">{error}</div>}
    {message && <div role="status" className="p-3 rounded-lg border border-green-600/30 text-green-800 dark:text-green-300">{message}</div>}
    <div id="max-projects" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 scroll-mt-24">
      <div className="space-y-2">
        <Label htmlFor="max-project">פאר וועלכן פראיעקט ארבעטסטו?</Label>
        <select id="max-project" value={caseId??""} onChange={e=>setCaseId(Number(e.target.value))}
          className="w-full h-11 rounded-lg border bg-background px-3 text-sm">
          {cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {!cases.length && !loading && <p className="text-sm">
          קודם עפען א פראיעקט אין <Link className="underline" href="/my">מיין עסקנות</Link>. יעדע באשטעטיגטע נדבה ווערט צוגערעכנט צום אויסגעקליבענעם פראיעקט.
        </p>}
      </div>
      {current && <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/40 p-3"><div className="font-bold text-lg">${Number(current.fundsReceived).toLocaleString()}</div><span className="text-xs">באקומען ($)</span></div>
        <div className="rounded-lg bg-muted/40 p-3"><div className="font-bold text-lg">${Number(current.fundsPromised).toLocaleString()}</div><span className="text-xs">נאך אויסשטייענדיג ($)</span></div>
        <div className="rounded-lg bg-muted/40 p-3"><div className="font-bold text-lg">{openFollowups}</div><span className="text-xs">אפענע נאכפאלגן</span></div>
      </div>}
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <section id="max-contacts" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 scroll-mt-24">
        <h3 className="font-bold text-lg flex items-center gap-2"><ContactRound className="h-5 w-5"/> מיין פריוואטער קשרים־בוך</h3>
        <div className="space-y-2">
          <Label htmlFor="max-contact-search">זוכן אין מיינע קשרים</Label>
          <Input id="max-contact-search" type="search" placeholder="נאמען, נומער, מוסד, שטאט אדער צייכענונג"
            value={contactSearch} onChange={e=>setContactSearch(e.target.value)}/>
          <Label htmlFor="max-contact">אויסקלייבן א קאנטאקט</Label>
          <select id="max-contact" value={contactId??""} onChange={e=>setContact(e.target.value?Number(e.target.value):null)}
            className="w-full h-11 rounded-lg border bg-background px-3 text-sm">
            <option value="">אן אויסגעקליבענעם קאנטאקט</option>
            {selectedContact && !filteredContacts.some(c=>c.id===selectedContact.id) &&
              <option value={selectedContact.id}>{selectedContact.name}</option>}
            {filteredContacts.map(c=><option key={c.id} value={c.id}>{c.name}{c.organization?" · "+c.organization:""}{c.phone?" · "+c.phone:""}</option>)}
          </select>
          {chosenContact?.doNotCall && <p role="alert" className="text-sm font-semibold text-destructive">
            אכטונג: דער מענטש איז אנגעצייכנט „נישט רופן“. דער עסקן בלייבט אין קאנטראל;
            געדענק אז באשטימטע רופן־כללים קענען נאך אלץ גילטן.
          </p>}
          {chosenContact?.phone && <a className="inline-flex gap-2 underline text-secondary text-sm"
            href={"tel:"+chosenContact.phone}
            onClick={e=>{
              if(chosenContact.doNotCall && !window.confirm(
                "דער מענטש האט געבעטן נישט צו ווערן גערופן. ווילסטו דאך עפענען דעם דיילער? "+
                "דאס ענדערט נישט זיין רופן־צייכן און איז נישט קיין נייע רשות."
              ))e.preventDefault();
            }}>
            <PhoneCall className="h-4 w-4"/> עפענען דעם טעלעפאן־דיילער
          </a>}
          <p className="text-xs text-muted-foreground">דאס עפנט בלויז דעם טעלעפאן־דיילער; ס'איז נאכנישט קיין אויטאמאטיש גערעקארדירטער רוף.</p>
        </div>
        <form onSubmit={e=>void addContact(e)} className="space-y-3 rounded-lg bg-muted/20 border p-3">
          <h4 className="font-medium text-sm">א נייעם קאנטאקט צולייגן</h4>
          <Input aria-label="נאמען" placeholder="נאמען" value={newContact.name} onChange={e=>setNewContact(s=>({...s,name:e.target.value}))} required/>
          <Input aria-label="טעלעפאן" placeholder="טעלעפאן־נומער" value={newContact.phone} onChange={e=>setNewContact(s=>({...s,phone:e.target.value}))}/>
          <Input aria-label="אימעיל" placeholder="אימעיל (אפציאנעל)" value={newContact.email} onChange={e=>setNewContact(s=>({...s,email:e.target.value}))}/>
          <Button type="submit" variant="outline" disabled={busy || !newContact.name.trim()}><Plus className="h-4 w-4 ml-1"/> צולייגן</Button>
        </form>
        <section className="border rounded-lg p-3 space-y-3" aria-label="קשרים אריינברענגען און ארויסנעמען">
          <h4 className="font-semibold text-sm">קשרים אריינברענגען אדער ארויסנעמען</h4>
          <p className="text-xs text-muted-foreground">CSV־פייל מיט name, phone, email, notes, organization, city, tags, do_not_call. קודם איבערקוקן; קיין אלטע קשרים ווערן נישט איבערגעשריבן. די פריוואטע ליסטע ווערט נאר געוויזן פאר דיין אקאונט.</p>
          <a href="/api/askanus/contacts/export.csv" download="gavhah-private-contacts.csv"
            className="inline-flex min-h-10 px-3 items-center border rounded-lg text-sm font-semibold">מיינע קשרים ארויסנעמען (CSV)</a>
          <Label htmlFor="max-import-csv">CSV־פייל פון דיין טעלעפאן</Label>
          <Input id="max-import-csv" type="file" accept=".csv,text/csv" className="h-auto py-2"
            onChange={async e=>{
              const file=e.target.files?.[0];
              setImportPreview(null);setImportCsv("");setImportFilename("");
              if(!file)return;
              if(file.size>512000){setError("די פייל איז צו גרויס. מערסטנס 500 KB פער אריינברענגען.");return;}
              setImportFilename(file.name);
              setImportCsv(await file.text());
            }} />
          {importFilename&&<p className="text-xs">אויסגעקליבן: {importFilename}</p>}
          {importCsv && <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={()=>void previewCsv()}>ערשט איבערקוקן די קשרים</Button>}
          {importPreview && <div className="border rounded-lg p-3 space-y-2 text-sm">
            <p>אין פייל: {importPreview.total} · נייע: {importPreview.ready} · שוין פאראן: {importPreview.duplicates}</p>
            {importPreview.preview.map(r=><p key={r.line} className="text-xs">
              שורה {r.line}: {r.name} · {r.phone||r.email}{r.doNotCall?" · נישט רופן":""}
            </p>)}
            <Button type="button" disabled={busy||!importPreview.ready}
              onClick={()=>void confirmCsv()}>באשטעטיגן — צולייגן {importPreview.ready} קשרים</Button>
          </div>}
        </section>
        {contactId!==null&&<Donor360 contactId={contactId} caseId={caseId}
          revision={revision} onChanged={()=>{void load();setRevision(v=>v+1);}} />}
      </section>
      <section id="max-call" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 scroll-mt-24">
        <h3 className="font-bold text-lg flex items-center gap-2"><BookOpen className="h-5 w-5"/> רוף־רעזולטאט אפהיטן</h3>
        <form onSubmit={e=>void saveCall(e)} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="max-name">מיט וועמען האסטו גערעדט?</Label>
            <Input id="max-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={240}/></div>
          <div className="space-y-1"><Label htmlFor="max-outcome">וואס איז געשען?</Label>
            <select id="max-outcome" className="w-full h-11 rounded-lg border bg-background px-3" value={outcome} onChange={e=>{
              setOutcome(e.target.value);setMoneyKind("none");setAmount("");
              if(e.target.value!=="gave")setMood("not_entered");
            }}>
              {Object.entries(outcomeNames).filter(([k])=>k!=="spoke").map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select></div>
          {outcome==="do_not_call" && <p className="text-sm rounded-lg border p-3">
            „בעט נישט מער צו רופן“ ווערט ביים אפהיטן גלייך אנגעצייכנט אויפן נדבן־קארטל.
            דער עסקן וועט ערשט ווערן געווארנט ווען ער וויל שפעטער ווידער אריינגיין אדער עפענען דעם דיילער.
            „נישט אינטערעסירט“ בלאקירט קיינעם נישט.
            {contactId===null&&<span className="block text-destructive">קלייב אויס דעם ריכטיגן נדבן פון דער קשרים־ליסטע.</span>}
          </p>
          {outcome==="gave" && <div className="rounded-xl border p-3 space-y-2">
            <Label htmlFor="max-money">געגעבן א נדבה — וועלכער מצב?</Label>
            <select id="max-money" className="w-full h-11 rounded-lg border bg-background px-3" value={moneyKind} onChange={e=>setMoneyKind(e.target.value)}>
              <option value="none">קלייב אויס נדבה־מצב</option>
              <option value="received">באקומען — מאנועל באריכטעט</option>
              <option value="pledged">צוגעזאגט — נאכנישט באצאלט</option>
            </select>
          </div>}
          {outcome==="gave" && moneyKind!=="none" && <div className="space-y-1"><Label htmlFor="max-amount">סכום ($)</Label>
            <Input id="max-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></div>}
          <div className="space-y-1"><Label htmlFor="max-mood">וויאזוי איז דער שמועס געווען? (דיין באמערקונג)</Label>
            <select id="max-mood" className="w-full h-11 rounded-lg border bg-background px-3"
              value={mood} onChange={e=>setMood(e.target.value)}>
              <option value="not_entered">נישט אריינגעלייגט</option>
              <option value="neutral">נייטראל — נאר אויב מ׳קלייבט עס אויס</option>
              <option value="friendly">פריינטליך</option>
              <option value="busy">פארנומען</option>
              <option value="uncomfortable">אומבאקוועם</option>
              <option value="uninterested">נישט אינטערעסירט</option>
              <option value="very_warm">גאר ווארעם אויפגענומען</option>
              {outcome==="gave"&&<option value="gave_generously">געגעבן גאר שיין</option>}
              {outcome==="gave"&&<option value="warm_and_gave_generously">ווארעם אויפגענומען און געגעבן שיין</option>}
              <option value="other">אנדערש</option>
            </select>
          </div>
          {(outcome==="no_answer"||outcome==="callback") && <div className="rounded-xl border p-3 space-y-3">
            <h4 className="font-semibold">ווען זאל דער צוריק־רוף ליגן אויפן טישל?</h4>
            <select aria-label="צוריק־רופן־צייט" className="w-full h-11 rounded-lg border bg-background px-2"
              value={callbackKind} onChange={e=>setCallbackKind(e.target.value)}>
              <option value="none">נישט אנשטעלן יעצט</option>
              <option value="ten_minutes">אין 10 מינוט</option>
              <option value="minutes">אייגענע מינוטן (ביז א שעה)</option>
              <option value="one_hour">אין איין שעה</option>
              <option value="hours">פון 1 ביז 24 שעה</option>
            </select>
            {callbackKind==="minutes"&&<div className="space-y-1"><Label htmlFor="max-cb-minutes">אין וויפיל מינוט? (1–60)</Label>
              <Input id="max-cb-minutes" type="number" min="1" max="60" value={callbackMinutes}
                onChange={e=>setCallbackMinutes(e.target.value)} /></div>}
            {callbackKind==="hours"&&<div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="max-cb-hours">אין וויפיל שעה? (1–24)</Label><Input id="max-cb-hours"
                type="number" min="1" max="24" value={callbackHours} onChange={e=>setCallbackHours(e.target.value)} /></div>
              <div><Label htmlFor="max-cb-exact-minute">ספעציפישע מינוט אין יענער שעה (אפציאנעל)</Label>
                <Input id="max-cb-exact-minute" type="number" min="0" max="59"
                  placeholder="למשל 46" value={callbackMinuteOfHour} onChange={e=>setCallbackMinuteOfHour(e.target.value)}/></div>
            </div>}
            {callbackKind!=="none"&&<p className="text-xs text-muted-foreground">די גענויע צייט ווערט אויסגערעכנט נאכן אפהיטן פונעם באריכט, לויטן צייט־זאנע פונעם עסקן, און קומט אריין אינעם טישל און די נאכפאלגן.</p>}
          </div>}
          <div className="space-y-1"><Label htmlFor="max-note">קורצע נאטיץ פונעם רוף</Label>
            <Textarea id="max-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={1500}/></div>
          <div className="space-y-1"><Label htmlFor="max-callback">נאכפאלג צולייגן (אפציאנעל)</Label>
            <Textarea id="max-callback" placeholder="למשל: צוריק רופן איבער א טשעק" value={followupNote} onChange={e=>setFollowupNote(e.target.value)}/></div>
          {followupNote.trim() && <div className="space-y-1"><Label htmlFor="max-due">ווען דארף מען נאכפאלגן?</Label>
            <Input id="max-due" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
            <Input aria-label="נאכפאלג־שעה" type="time" disabled={!dueDate} value={dueTime} onChange={e=>setDueTime(e.target.value)}/>
            <select aria-label="איבערחזרן רוף־נאכפאלג" disabled={!dueDate} value={repeatRule}
              onChange={e=>setRepeatRule(e.target.value)} className="w-full h-11 rounded-lg border bg-background px-2">
              <option value="none">איינמאליג</option><option value="daily">יעדן טאג</option>
              <option value="weekly">יעדע וואך</option><option value="monthly">יעדן חודש</option>
            </select></div>}
          <Button className="w-full min-h-11" type="submit" disabled={busy||!caseId||!name.trim()||(outcome==="gave"&&(moneyKind==="none"||!(Number(amount)>0)))||(recontactEnabled&&contactId===null)||(outcome==="do_not_call"&&contactId===null)>
            <Save className="h-4 w-4 ml-2"/> {busy?"היט אפ...":"אפהיטן — און דערהיינטיגן מיין עסקנות"}
          </Button>
          <div className="rounded-xl border p-3 space-y-2">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={recontactEnabled}
              onChange={e=>setRecontactEnabled(e.target.checked)} disabled={contactId===null||outcome==="do_not_call"}/>
              נאכן באריכט: צולייגן דעם נדבן צו א שפעטער־ווידער־רופן־ליסטע
            </label>
            {recontactEnabled&&contactId!==null&&outcome!=="do_not_call"&&<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label htmlFor="max-recontact-months">אין וויפיל חדשים?</Label>
                <Input id="max-recontact-months" type="number" min="1" max="24"
                  value={recontactMonths} onChange={e=>setRecontactMonths(e.target.value)}/></div>
              <div><Label htmlFor="max-recontact-purpose">פאר וועלכן צוועק?</Label>
                <select id="max-recontact-purpose" className="w-full h-11 rounded-lg border bg-background px-2"
                  value={recontactScope} onChange={e=>setRecontactScope(e.target.value as "same_purpose"|"new_purpose")}>
                  <option value="same_purpose">דער זעלבער צוועק</option><option value="new_purpose">א נייער צוועק</option>
                </select></div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">דאס מאכט נאר א שפעטערדיקע בארעכטיגקייט־ליסטע, נישט קיין אויטאמאטישן רוף. ״נישט רופן״ בלייבט א פארבאט.</p>
            </div>}
          </div>
          <p className="text-xs text-muted-foreground">א צוגעזאגטע נדבה ווערט נישט פאררעכנט אלס באקומען. דאס איז א מאנועלער באריכט, נישט קיין באצאלונג־באשטעטיגונג פון א פינאנציעלער סערוויס.</p>
        </form>
      </section>
    </div>
    {current && <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
      <h3 className="font-bold text-lg flex gap-2 items-center"><Bell className="h-5 w-5"/> די זעלבע נאכפאלגן ווי אין מיין עסקנות</h3>
      <form onSubmit={e=>void addFollowup(e)} className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-2 items-end">
        <div className="space-y-1"><Label htmlFor="max-follow">א נייעם נאכפאלג</Label>
          <Input id="max-follow" value={quickNote} onChange={e=>setQuickNote(e.target.value)} placeholder="וואס דארף איך נאך ערלעדיגן?" required/></div>
        <div className="space-y-1"><Label htmlFor="max-follow-date">דאטום (אפציאנעל)</Label>
          <Input id="max-follow-date" type="date" value={quickDate} onChange={e=>setQuickDate(e.target.value)}/>
          <Input aria-label="נאכפאלג־שעה" type="time" disabled={!quickDate} value={quickTime} onChange={e=>setQuickTime(e.target.value)}/>
          <select aria-label="איבערחזרן דעם נאכפאלג" disabled={!quickDate} value={quickRepeat}
            onChange={e=>setQuickRepeat(e.target.value)} className="w-full h-11 rounded-lg border bg-background px-2">
            <option value="none">איינמאליג</option><option value="daily">יעדן טאג</option>
            <option value="weekly">יעדע וואך</option><option value="monthly">יעדן חודש</option>
          </select></div>
        <Button type="submit" disabled={busy||!quickNote.trim()}><Plus className="h-4 w-4 ml-1"/> צולייגן</Button>
      </form>
      <CaseFollowups caseId={current.id} followups={current.followUpNotes} onUpdated={load}/>
    </section>}
    <div id="max-history" className="scroll-mt-24"><MaxHistoryPanel /></div>
    <MaxPerformancePanel />
    <MaxSourceHelper contactId={contactId} contactName={chosenContact?.name} />
    <GavhahConnectPanel caseId={caseId} followups={current?.followUpNotes} />
    <section id="max-more" className="rounded-xl border bg-card p-4 sm:p-6 space-y-3 scroll-mt-24">
      <h3 className="font-bold text-lg flex items-center gap-2"><CheckCircle2 className="h-5 w-5"/> מיינע לעצטע רוף־באריכטן</h3>
      {calls.length===0 && <p className="text-sm text-muted-foreground">נאכנישט פאראן קיין אפגעהיטענע רוף־באריכטן.</p>}
      {calls.filter(c=>!caseId||c.caseId===caseId).slice(0,20).map(c=><div key={c.id} className="border rounded-lg p-3 flex flex-wrap justify-between gap-2">
        <div><strong className="text-sm">{c.contactName}</strong>
          <p className="text-xs text-muted-foreground">{outcomeNames[c.outcome]||c.outcome} · {new Date(c.createdAt).toLocaleString()}</p>
          {c.note && <p className="text-xs mt-1 whitespace-pre-wrap">{c.note}</p>}
        </div>
        {c.moneyKind!=="none" && <span className="font-medium text-sm">${Number(c.amount).toLocaleString()} · {c.moneyKind==="received"?"באקומען":"צוגעזאגט"}</span>}
      </div>)}
    </section>
  </div>;
}
