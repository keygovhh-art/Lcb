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

type PersonalCase = {
  id:number; title:string; goalAmount:number; fundsReceived:number; fundsPromised:number;
  followUpNotes:CaseFollowupEntry[];
};
type Contact = { id:number; name:string; phone:string; email:string; notes:string; doNotCall?:boolean; preferredHours?:string };
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
  spoke:"גערעדט",no_answer:"נישט געענטפערט",callback:"בעט צוריקצורופן",
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
  const [name,setName] = useState("");
  const [outcome,setOutcome] = useState("spoke");
  const [moneyKind,setMoneyKind] = useState("none");
  const [amount,setAmount] = useState("");
  const [note,setNote] = useState("");
  const [mood,setMood] = useState("neutral");
  const [revision,setRevision] = useState(0);
  const [followupNote,setFollowupNote] = useState("");
  const [dueDate,setDueDate] = useState("");
  const [dueTime,setDueTime] = useState("");
  const [quickNote,setQuickNote] = useState("");
  const [quickDate,setQuickDate] = useState("");
  const [quickTime,setQuickTime] = useState("");
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
    setContactId(id);
    const person=[...contacts,...(remoteContacts??[])].find(c=>c.id===id);
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
  const saveCall=async(e:React.FormEvent)=>{
    e.preventDefault();if(!caseId || !name.trim()) return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await request<{duplicate:boolean;report:Call}>(
        "/api/askanus/cases/"+caseId+"/call-reports",
        json({requestId,contactId,contactName:name.trim(),outcome,moneyKind,mood,
          amount:moneyKind==="none"?0:Number(amount),note,followupNote,dueDate:dueDate||null,dueTime:dueTime||null,
          timeZone:dueTime?(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"):null}),
      );
      setMessage(result.duplicate
        ? "דער פריערדיגער באריכט איז שוין אפגעהיטן. קיין צווייטע נדבה איז נישט צוגערעכנט."
        : "דער רוף־באריכט איז אפגעהיטן. מיין עסקנות באנוצט די זעלבע פראיעקט־דאַטן.");
      setCalls(items=>[result.report,...items.filter(r=>r.id!==result.report.id)].slice(0,100));
      setRequestId(crypto.randomUUID());setOutcome("spoke");setMoneyKind("none");setAmount("");setMood("neutral");setRevision(v=>v+1);
      setNote("");setFollowupNote("");setDueDate("");setDueTime("");
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
          dueTime:quickTime||undefined,timeZone:quickTime?(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"):undefined}));
      setQuickNote("");setQuickDate("");setQuickTime("");setMessage("דער נאכפאלג איז אין דער זעלבער ליסטע פון מיין עסקנות.");
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
        {href:"#max-today",label:"היינט"},
        {href:"#max-call",label:"רופן"},
        {href:"#max-contacts",label:"מענטשן"},
        {href:"#max-projects",label:"צוועקן"},
        {href:"#max-more",label:"מער"},
      ].map(a=><a key={a.href} href={a.href} className="rounded-lg border bg-card p-2 font-medium min-h-11 flex items-center justify-center hover:bg-muted/60">{a.label}</a>)}
    </nav>
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
          <Input id="max-contact-search" type="search" placeholder="נאמען, נומער אדער אימעיל"
            value={contactSearch} onChange={e=>setContactSearch(e.target.value)}/>
          <Label htmlFor="max-contact">אויסקלייבן א קאנטאקט</Label>
          <select id="max-contact" value={contactId??""} onChange={e=>setContact(e.target.value?Number(e.target.value):null)}
            className="w-full h-11 rounded-lg border bg-background px-3 text-sm">
            <option value="">אן אויסגעקליבענעם קאנטאקט</option>
            {selectedContact && !filteredContacts.some(c=>c.id===selectedContact.id) &&
              <option value={selectedContact.id}>{selectedContact.name}</option>}
            {filteredContacts.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?" · "+c.phone:""}</option>)}
          </select>
          {chosenContact?.doNotCall && <p role="alert" className="text-sm font-semibold text-destructive">
            רופן־פארבאט: דער מענטש האט געבעטן נישט צו ווערן גערופן. די דיילער־פארבינדונג איז פארשפארט.
          </p>}
          {chosenContact?.phone && !chosenContact.doNotCall && <a className="inline-flex gap-2 underline text-secondary text-sm" href={"tel:"+chosenContact.phone}>
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
        {contactId!==null&&<Donor360 contactId={contactId} caseId={caseId}
          revision={revision} onChanged={()=>{void load();setRevision(v=>v+1);}} />}
      </section>
      <section id="max-call" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 scroll-mt-24">
        <h3 className="font-bold text-lg flex items-center gap-2"><BookOpen className="h-5 w-5"/> רוף־רעזולטאט אפהיטן</h3>
        <form onSubmit={e=>void saveCall(e)} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="max-name">מיט וועמען האסטו גערעדט?</Label>
            <Input id="max-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={240}/></div>
          <div className="space-y-1"><Label htmlFor="max-outcome">וואס איז געשען?</Label>
            <select id="max-outcome" className="w-full h-11 rounded-lg border bg-background px-3" value={outcome} onChange={e=>setOutcome(e.target.value)}>
              {Object.entries(outcomeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="space-y-1"><Label htmlFor="max-money">נדבה־מצב</Label>
            <select id="max-money" className="w-full h-11 rounded-lg border bg-background px-3" value={moneyKind} onChange={e=>setMoneyKind(e.target.value)}>
              <option value="none">קיין נדבה נישט אריינגעשריבן</option>
              <option value="received">באקומען — מיין מאנועלער באריכט</option>
              <option value="pledged">צוגעזאגט — נאכנישט באצאלט</option>
            </select></div>
          {moneyKind!=="none" && <div className="space-y-1"><Label htmlFor="max-amount">סכום ($)</Label>
            <Input id="max-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></div>}
          <div className="space-y-1"><Label htmlFor="max-mood">וויאזוי איז דער שמועס געווען? (דיין באמערקונג)</Label>
            <select id="max-mood" className="w-full h-11 rounded-lg border bg-background px-3"
              value={mood} onChange={e=>setMood(e.target.value)}>
              <option value="neutral">נייטראל</option>
              <option value="friendly">פריינטליך</option>
              <option value="busy">פארנומען</option>
              <option value="uncomfortable">אומבאקוועם</option>
              <option value="uninterested">נישט אינטערעסירט</option>
              <option value="other">אנדערש</option>
            </select>
          </div>
          <div className="space-y-1"><Label htmlFor="max-note">קורצע נאטיץ פונעם רוף</Label>
            <Textarea id="max-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={1500}/></div>
          <div className="space-y-1"><Label htmlFor="max-callback">נאכפאלג צולייגן (אפציאנעל)</Label>
            <Textarea id="max-callback" placeholder="למשל: צוריק רופן איבער א טשעק" value={followupNote} onChange={e=>setFollowupNote(e.target.value)}/></div>
          {followupNote.trim() && <div className="space-y-1"><Label htmlFor="max-due">ווען דארף מען נאכפאלגן?</Label>
            <Input id="max-due" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
            <Input aria-label="נאכפאלג־שעה" type="time" disabled={!dueDate} value={dueTime} onChange={e=>setDueTime(e.target.value)}/></div>}
          <Button className="w-full min-h-11" type="submit" disabled={busy||!caseId||!name.trim()||(moneyKind!=="none"&&!(Number(amount)>0))}>
            <Save className="h-4 w-4 ml-2"/> {busy?"היט אפ...":"אפהיטן — און דערהיינטיגן מיין עסקנות"}
          </Button>
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
          <Input aria-label="נאכפאלג־שעה" type="time" disabled={!quickDate} value={quickTime} onChange={e=>setQuickTime(e.target.value)}/></div>
        <Button type="submit" disabled={busy||!quickNote.trim()}><Plus className="h-4 w-4 ml-1"/> צולייגן</Button>
      </form>
      <CaseFollowups caseId={current.id} followups={current.followUpNotes} onUpdated={load}/>
    </section>}
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
