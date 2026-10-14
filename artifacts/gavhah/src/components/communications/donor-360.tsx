import { useCallback, useEffect, useState } from "react";
import { Bell, CircleDollarSign, ClipboardList, ShieldAlert, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAskanuscasesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Donor = {
  id:number;name:string;phone:string;email:string;notes:string;
  doNotCall:boolean;preferredTimezone:string;preferredHours:string;
  relationshipNotes:string;optOutReason:string;
};
type Pledge = { id:number;caseId:number;amount:number;paidAmount:number;remaining:number;status:string;dueDate:string|null;note:string;createdAt:string };
type Receipt = {id:number;pledgeId:number|null;caseId:number;amount:number;refundedAmount:number;method:string;verification:string;createdAt:string};
type Call = {id:number;caseId:number;contactName:string;outcome:string;observedMood:string;note:string;createdAt:string};
type Followup = {id:number;caseId:number;note:string;dueDate:string|null;dueTime?:string|null;completed:boolean};
type Profile = {contact:Donor;calls:Call[];pledges:Pledge[];receipts:Receipt[];followups:Followup[]};
type PermissionEvent = {id:number;action:"reconsent"|"owner_override";evidence:string;method:string;priorOptOutReason:string;createdAt:string};
async function jsonCall<T>(url:string,init?:RequestInit):Promise<T>{
  const result=await fetch(url,{credentials:"include",cache:"no-store",...init});
  if(!result.ok){
    const body=await result.json().catch(()=>({}));
    throw new Error(body.error||"נישט געלונגען אפצוהיטן");
  }
  return result.json();
}
const write=(v:unknown,method="POST"):RequestInit=>({method,headers:{"Content-Type":"application/json"},body:JSON.stringify(v)});
export function Donor360({contactId,caseId,onChanged,revision=0}:{
  contactId:number;caseId:number|null;onChanged:()=>void;revision?:number;
}){
  const qc=useQueryClient();
  const [data,setData]=useState<Profile|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [editing,setEditing]=useState(false);
  const [hours,setHours]=useState("");
  const [moodNotes,setMoodNotes]=useState("");
  const [doNotCall,setDoNotCall]=useState(false);
  const [optReason,setOptReason]=useState("");
  const [permissionEvents,setPermissionEvents]=useState<PermissionEvent[]>([]);
  const [showOverride,setShowOverride]=useState(false);
  const [overrideReason,setOverrideReason]=useState("");
  const [overrideKey,setOverrideKey]=useState(()=>crypto.randomUUID());
  const [settleId,setSettleId]=useState<number|null>(null);
  const [pay,setPay]=useState("");
  const [payMethod,setPayMethod]=useState("other");
  const [paymentKey,setPaymentKey]=useState(()=>crypto.randomUUID());
  const [refundId,setRefundId]=useState<number|null>(null);
  const [refundAmount,setRefundAmount]=useState("");
  const [refundReason,setRefundReason]=useState("");
  const [refundKey,setRefundKey]=useState(()=>crypto.randomUUID());
  const [followNote,setFollowNote]=useState("");
  const [followDue,setFollowDue]=useState("");
  const [followTime,setFollowTime]=useState("");
  const [repeatRule,setRepeatRule]=useState("none");
  const load=useCallback(async()=>{
    try{
      const [profile,events]=await Promise.all([
        jsonCall<Profile>("/api/askanus/contacts/"+contactId+"/360"),
        jsonCall<PermissionEvent[]>("/api/askanus/contacts/"+contactId+"/consents"),
      ]);
      setPermissionEvents(events);
      setData(profile);setHours(profile.contact.preferredHours||"");
      setMoodNotes(profile.contact.relationshipNotes||"");
      setDoNotCall(Boolean(profile.contact.doNotCall));
      setOptReason(profile.contact.optOutReason||"");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען צו לאָדן");}
  },[contactId]);
  useEffect(()=>{void load();},[load,revision]);
  const savePreferences=async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      await jsonCall("/api/askanus/contacts/"+contactId,write({
        preferredHours:hours,relationshipNotes:moodNotes,doNotCall,optOutReason:optReason,
      },"PATCH"));
      await load();onChanged();setEditing(false);
      setMessage("דער נדבן־קארטל און די רופן־רשות זענען אפגעהיטן.");
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(false);}
  };
  const overrideDoNotCall=async()=>{
    if(!data?.contact.doNotCall||busy)return;
    const confirmed=window.confirm(
      "דער מענטש איז אנגעצייכנט געווארן אלס 'נישט רופן'. ווילסטו טאקע אליין אראפנעמען דעם צייכן? "+
      "דאס איז דיין אייגענער באשלוס, נישט קיין נייע רשות פונעם מענטש. די געשיכטע בלייבט אפגעהיטן.");
    if(!confirmed)return;
    setBusy(true);setError("");setMessage("");
    try{
      await jsonCall("/api/askanus/contacts/"+contactId+"/call-permission",write({
        action:"owner_override",ownerConfirmedOverride:true,
        evidence:overrideReason.trim(),requestId:overrideKey,
      }));
      setOverrideKey(crypto.randomUUID());setOverrideReason("");setShowOverride(false);
      await load();onChanged();
      setEditing(false);
      setMessage("דער עסקן האט אליין אראפגענומען דעם רופן־צייכן. דער באשלוס און די פריערדיגע סיבה בלייבן אין דער געשיכטע.");
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען אראפצונעמען דעם צייכן");}
    finally{setBusy(false);}
  };
  const settle=async(e:React.FormEvent)=>{
    e.preventDefault();if(!settleId||!(Number(pay)>0))return;
    setBusy(true);setError("");setMessage("");
    try{
      const r=await jsonCall<{duplicate:boolean}>("/api/askanus/pledges/"+settleId+"/settlements",
        write({amount:Number(pay),method:payMethod,requestId:paymentKey}));
      setMessage(r.duplicate?"די באצאלונג איז שוין איינגעשריבן — נישט צוויי מאל געציילט.":
        "באצאלונג אריינגעשריבן אלס פערזענליכער באריכט. די פארבליבענע התחייבות איז אפדעיטעט.");
      setPaymentKey(crypto.randomUUID());setPay("");setSettleId(null);
      await load();onChanged();await qc.invalidateQueries({queryKey:getListAskanuscasesQueryKey()});
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(false);}
  };
  const reverseReceipt=async(e:React.FormEvent)=>{
    e.preventDefault();if(!refundId||!(Number(refundAmount)>0)||!refundReason.trim())return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await jsonCall<{duplicate:boolean}>("/api/askanus/receipts/"+refundId+"/refunds",
        write({amount:Number(refundAmount),reason:refundReason.trim(),requestId:refundKey}));
      setMessage(result.duplicate
        ?"די קארעקטור איז שוין אפגעהיטן, נישט צוויי מאל גערעכנט."
        :"די חשבון־קארעקטור איז אפגעהיטן. דאס שיקט נישט צוריק געלט דורכן באצאלונגס־סערוויס.");
      setRefundId(null);setRefundAmount("");setRefundReason("");setRefundKey(crypto.randomUUID());
      await load();onChanged();await qc.invalidateQueries({queryKey:getListAskanuscasesQueryKey()});
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(false);}
  };
  const addDonorFollowup=async(e:React.FormEvent)=>{
    e.preventDefault();if(!caseId||!followNote.trim())return;
    setBusy(true);setError("");setMessage("");
    try{
      await jsonCall("/api/askanus/contacts/"+contactId+"/followups",
        write({caseId,note:followNote.trim(),dueDate:followDue||null,dueTime:followTime||null,
          timeZone:followTime?(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"):null,
          repeatRule}));
      setFollowNote("");setFollowDue("");setFollowTime("");setRepeatRule("none");
      setMessage("דער זעלבער נאכפאלג איז געוויזן אין מיין עסקנות און עולם החסד.");
      await load();onChanged();await qc.invalidateQueries({queryKey:getListAskanuscasesQueryKey()});
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(false);}
  };
  if(!data) return <div className="rounded-lg border p-3 text-sm" dir="rtl">{error||"לאדנט דעם נדבן־חשבון..."}</div>;
  const c=data.contact;
  const raised=data.receipts.reduce((sum,r)=>sum+r.amount-Number(r.refundedAmount||0),0);
  const remaining=data.pledges.filter(p=>p.status!=="cancelled").reduce((sum,p)=>sum+p.remaining,0);
  return <section dir="rtl" className="mt-4 rounded-xl border p-4 space-y-4 bg-background">
    <h4 className="font-bold flex gap-2 items-center"><UserRound className="h-5 w-5"/> {c.name} — נדבן 360°</h4>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="text-sm text-green-700 dark:text-green-300">{message}</p>}
    {c.doNotCall && <div className="flex gap-2 border border-destructive/40 rounded-lg p-3 text-destructive text-sm">
      <ShieldAlert className="h-5 w-5 shrink-0"/> נישט רופן! דער קאנטאקט האט א רופן־פארבאט.
      {c.optOutReason&&<span>טעם: {c.optOutReason}</span>}
    </div>}
    {c.doNotCall&&<div className="border rounded-lg p-3 space-y-2 text-sm">
      <Button type="button" variant="outline" size="sm" disabled={busy}
        onClick={()=>setShowOverride(v=>!v)}>דער עסקן וויל אראפנעמען דעם „נישט רופן“־צייכן</Button>
      {showOverride&&<div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          דער צייכן דינט דיר אלס ווארענונג. דו קענסט אים אראפנעמען,
          אבער דאס איז נישט קיין באשטעטיגונג אז דער מענטש האט צוריקגעגעבן רשות.
          אויסערלעכע רופן־כללים קענען נאך אלץ גילטן.
        </p>
        <Label htmlFor="donor-override-reason">פארוואס נעמסטו אראפ דעם צייכן? (נישט מחויב)</Label>
        <Textarea id="donor-override-reason" value={overrideReason}
          placeholder="אייגענע באמערקונג פאר דער געשיכטע"
          onChange={e=>setOverrideReason(e.target.value)} maxLength={1500}/>
        <Button type="button" size="sm" disabled={busy} onClick={()=>void overrideDoNotCall()}>
          באשטעטיגן און אראפנעמען דעם צייכן
        </Button>
      </div>}
    </div>}
    <div className="grid grid-cols-2 gap-2 text-center text-sm">
      <div className="rounded-lg bg-muted/40 p-2"><strong className="block text-lg">${raised.toLocaleString()}</strong> איינגעשריבענע באצאלונגען ($)</div>
      <div className="rounded-lg bg-muted/40 p-2"><strong className="block text-lg">${remaining.toLocaleString()}</strong> אפענע התחייבויות ($)</div>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      {c.phone&&<span>טעלעפאן: <span dir="ltr">{c.phone}</span></span>}
      {c.email&&<span>אימעיל: {c.email}</span>}
      <span>רוף־באריכטן: {data.calls.length}</span>
      <span>נאכפאלגן: {data.followups.filter(f=>!f.completed).length}</span>
    </div>
    <Button variant="outline" size="sm" onClick={()=>setEditing(v=>!v)}>
      {editing?"צומאכן איינשטעלונגען":"רופן־רשות, צייטן און באציאונגס־נאטיצן"}
    </Button>
    {editing&&<div className="space-y-2 border rounded-lg p-3">
      <label className="flex gap-2 items-center text-sm">
        <input type="checkbox" className="h-5 w-5" checked={doNotCall} disabled={c.doNotCall}
          onChange={e=>setDoNotCall(e.target.checked)}/>
        נישט רופן דעם מענטש
      </label>
      {c.doNotCall&&<p className="text-xs text-muted-foreground">דער עסקן קען אראפנעמען דעם צייכן אויב ער באשליסט אזוי, מיט א ווארענונג און א געשיכטע. דאס איז נישט א נייע רשות פונעם נדבן.</p>}
      <Label htmlFor="donor-reason">סיבה פון רופן־פארבאט</Label>
      <Input id="donor-reason" value={optReason} onChange={e=>setOptReason(e.target.value)}/>
      <Label htmlFor="donor-hours">פאסיגע צייטן לויטן נדבן</Label>
      <Input id="donor-hours" placeholder="למשל: נישט פאר 7 אויפדערנאכט" value={hours} onChange={e=>setHours(e.target.value)}/>
      <Label htmlFor="donor-relationship">פערזענליכע באציאונגס־נאטיצן</Label>
      <Textarea id="donor-relationship" value={moodNotes} onChange={e=>setMoodNotes(e.target.value)}/>
      <Button size="sm" disabled={busy} onClick={()=>void savePreferences()}>אפהיטן איינשטעלונגען</Button>
    </div>}
    <div className="space-y-2">
      <h5 className="font-semibold flex gap-2"><CircleDollarSign className="h-4 w-4"/> התחייבויות און טיילווייזע באצאלונגען</h5>
      {data.pledges.length===0&&<p className="text-xs text-muted-foreground">דערווייל נישטא קיין פארבונדענע התחייבויות.</p>}
      {data.pledges.map(p=><div className="rounded-lg border p-3 space-y-2" key={p.id}>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>התחייבות #{p.id}</strong><span>${p.amount.toLocaleString()} צוגעזאגט</span></div>
        <p className="text-xs">באצאלט: ${p.paidAmount.toLocaleString()} · רעשט: ${p.remaining.toLocaleString()}</p>
        {p.remaining>0&&p.status==="open"&&<Button size="sm" variant="outline" onClick={()=>{setSettleId(p.id);setPay("");}}>
          באצאלונג אריינשרייבן
        </Button>}
        {settleId===p.id&&<form onSubmit={e=>void settle(e)} className="space-y-2 border-t pt-2">
          <Label htmlFor="settle-amount">וויפיל האט ער באצאלט?</Label>
          <Input id="settle-amount" type="number" inputMode="decimal" min="0.01" step="0.01" max={p.remaining}
            value={pay} onChange={e=>setPay(e.target.value)} required/>
          <Label htmlFor="settle-method">באצאלונגס־אופן</Label>
          <select id="settle-method" className="w-full h-10 border rounded-md bg-background px-2" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
            {["cash","check","card","bank","external","other"].map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">דאס איז א מאנועלער באריכט; נישט קיין אויטאמאטישע באצאלונג־באשטעטיגונג.</p>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy||!(Number(pay)>0)||Number(pay)>p.remaining}>אפהיטן באצאלונג</Button>
            <Button type="button" size="sm" variant="outline" onClick={()=>setSettleId(null)}>אפלאזן</Button></div>
        </form>}
      </div>)}
      {data.receipts.length>0&&<div className="text-xs space-y-1">
        <strong>באצאלונגס־היסטאריע:</strong>
        {data.receipts.slice(0,12).map(r=><div key={r.id} className="border rounded-md p-2 space-y-1">
          <p>#{r.id} · ${r.amount.toLocaleString()} · {r.method} · {r.verification==="verified"?"באשטעטיגט":"מאנועל איינגעשריבן"}</p>
          {r.refundedAmount>0&&<p>חשבון־קארעקטורן: ${r.refundedAmount.toLocaleString()} · יעצט: ${(r.amount-r.refundedAmount).toLocaleString()}</p>}
          {r.amount-r.refundedAmount>0&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{setRefundId(r.id);setRefundAmount("");setRefundReason("");}}>קארעקטור / אומקער</Button>}
          {refundId===r.id&&<form onSubmit={e=>void reverseReceipt(e)} className="space-y-2 p-2 border rounded-lg">
            <p className="text-xs text-destructive">דאס פאררעכט נאר דעם גבהה־חשבון; אן אמת׳ע צוריקצאלונג מוז ווערן באהאנדלט ביים געלט־סערוויס.</p>
            <Label htmlFor="refund-amount">סכום פון דער קארעקטור</Label>
            <Input id="refund-amount" type="number" min="0.01" step="0.01" max={r.amount-r.refundedAmount}
              value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} required/>
            <Label htmlFor="refund-reason">פארוואס דארף מען פאררעכטן דעם חשבון?</Label>
            <Textarea id="refund-reason" value={refundReason} onChange={e=>setRefundReason(e.target.value)} required maxLength={500}/>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy||!refundReason.trim()||!(Number(refundAmount)>0)||Number(refundAmount)>r.amount-r.refundedAmount}>אפהיטן קארעקטור</Button>
              <Button type="button" size="sm" variant="outline" onClick={()=>setRefundId(null)}>אפלאזן</Button>
            </div>
          </form>}
        </div>)}
      </div>}
    </div>
    <div className="space-y-2">
      <h5 className="font-semibold flex gap-2"><Bell className="h-4 w-4"/> נאכפאלגן פאר דעם נדבן</h5>
      {data.followups.map(f=><p key={f.id} className="rounded-lg border p-2 text-xs">
        {f.completed?"פארטיג":"אפן"} · {f.note}{f.dueDate?" · "+f.dueDate+(f.dueTime?" "+f.dueTime:""):""}
      </p>)}
      <form onSubmit={e=>void addDonorFollowup(e)} className="space-y-2">
        <Textarea aria-label="נדבן־נאכפאלג" value={followNote} onChange={e=>setFollowNote(e.target.value)}
          placeholder="וואס דארף מען נאכפאלגן?" required/>
        <Input aria-label="נאכפאלג־דאטום" type="date" value={followDue} onChange={e=>setFollowDue(e.target.value)}/>
        <Input aria-label="נאכפאלג־שעה" type="time" disabled={!followDue} value={followTime} onChange={e=>setFollowTime(e.target.value)}/>
        <select aria-label="איבערחזרן נדבן־נאכפאלג" disabled={!followDue} value={repeatRule}
          onChange={e=>setRepeatRule(e.target.value)} className="w-full h-11 rounded-lg border bg-background px-2">
          <option value="none">איינמאליג</option><option value="daily">יעדן טאג</option>
          <option value="weekly">יעדע וואך</option><option value="monthly">יעדן חודש</option>
        </select>
        <Button size="sm" type="submit" disabled={!caseId||busy||!followNote.trim()}>צולייגן פארבונדענעם נאכפאלג</Button>
      </form>
    </div>
    {permissionEvents.length>0&&<div className="space-y-2">
      <h5 className="font-semibold text-sm">רופן־צייכן: באשלוסן און געשיכטע</h5>
      {permissionEvents.map(event=><div key={event.id} className="border rounded-md p-2 text-xs space-y-1">
        <p><strong>{event.action==="owner_override"
          ?"דער עסקן האט אליין אראפגענומען דעם צייכן"
          :"דער נדבן האט לויטן באריכט צוריקגעגעבן רשות"}</strong> · {event.createdAt.slice(0,10)}</p>
        {event.priorOptOutReason&&<p>פריערדיגע סיבה: {event.priorOptOutReason}</p>}
        <p>פארשריבענע סיבה: {event.evidence}</p>
      </div>)}
    </div>}
    <div className="space-y-2">
      <h5 className="font-semibold flex gap-2"><ClipboardList className="h-4 w-4"/> רופן־היסטאריע</h5>
      {data.calls.length===0&&<p className="text-xs text-muted-foreground">נאכנישטא קיין פארבונדענע רוף־באריכטן.</p>}
      {data.calls.slice(0,20).map(r=><p key={r.id} className="text-xs border rounded-md p-2">
        {r.createdAt.slice(0,10)} · {r.outcome} · שטימונג־באמערקונג: {r.observedMood}
        {r.note&&<span className="block mt-1 whitespace-pre-wrap">{r.note}</span>}
      </p>)}
    </div>
  </section>;
}
