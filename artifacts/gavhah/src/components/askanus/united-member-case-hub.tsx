import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

type Case={case_id:number;cause_id:number;title:string;description:string;central_goal?:string;
 funds_promised:string;funds_received:string;supporter_count:number;case_status:string};
type Pledge={id:number;cause_id:number;case_id:number;amount_cents:string;due_on:string;status:string};
type Donation={id:number;cause_id:number;case_id:number;amount_cents:string|null;state:string};
type Bonus={cause_id:number;status:string;minutes_allocated:number;minutes_used:number;expires_at:string};
type Shared={case_id:number;role:"viewer"|"coordinator";expires_at:string;title:string;cause_title:string;central_goal:string};
type Workspace={cases:Case[];pledges:Pledge[];donations:Donation[];olamBonuses:Bonus[];
 events:Array<{id:number;case_id:number;kind:string;details:string;created_at:string}>};
const dollar=(cents:unknown)=>"$"+(Number(cents||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export function UnitedMemberCaseHub({highlightCase}:{highlightCase?:number|null}){
 const [items,setItems]=useState<Workspace|null>(null);
 const [shared,setShared]=useState<Shared[]>([]);
 const [amount,setAmount]=useState<Record<number,string>>({});
 const [evidence,setEvidence]=useState<Record<number,string>>({});
 const [notes,setNotes]=useState<Record<number,string>>({});
 const [followupNotes,setFollowupNotes]=useState<Record<number,string>>({});
 const [followupDates,setFollowupDates]=useState<Record<number,string>>({});
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const [a,b]=await Promise.all([
    fetch("/api/me/united/workspace",{credentials:"same-origin",cache:"no-store"}),
    fetch("/api/me/united/shared-cases",{credentials:"same-origin",cache:"no-store"})
   ]);
   if(!a.ok||!b.ok)throw Error("United case data could not be loaded");
   setItems(await a.json());setShared(await b.json());setError("");
  }catch(e){setError(e instanceof Error?e.message:"קיין דעטאלן נישט");}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const report=async(d:Donation)=>{
  if(busy||!amount[d.id]||!evidence[d.id])return;
  setBusy(true);setError("");
  try{
   const res=await fetch(`/api/me/united/donation-intents/${d.id}/report`,{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({amount:Number(amount[d.id]),evidence:evidence[d.id]})
   });
   const json=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(json.error||"נישט געלונגען");
   setMessage("די נדבה־אינפארמאציע ווארט אויף דער טיעם־באשטעטיגונג. נאך נישט פאררעכנט אלס באקומענע געלט.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const shareNote=async(c:Shared)=>{
  if(busy||!notes[c.case_id]?.trim())return;
  setBusy(true);setError("");
  try{
   const res=await fetch(`/api/me/united/shared-cases/${c.case_id}/note`,{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({note:notes[c.case_id]})
   });
   const outcome=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(outcome.error||"נישט געלונגען");
   setMessage("דיין נאטיץ איז אפגעהיטן פאר דעם קעיס.");
   setNotes(old=>({...old,[c.case_id]:""}));await refresh();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const scheduleFollowup=async(c:Shared)=>{
  if(busy||!(followupNotes[c.case_id]||"").trim()||!followupDates[c.case_id])return;
  setBusy(true);setError("");
  try{
   const r=await fetch(`/api/me/united/shared-cases/${c.case_id}/followups`,{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({note:followupNotes[c.case_id],dueOn:followupDates[c.case_id]})
   });
   const result=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(result.error||"פאלא־אפ נישט געלונגען");
   setMessage("דער פאלא־אפ איז געשאפן אינעם זעלבן אפיציעלן קעיס.");
   setFollowupNotes(o=>({...o,[c.case_id]:""}));setFollowupDates(o=>({...o,[c.case_id]:""}));
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 if(!items&&!shared.length&&!error)return <p className="text-sm">מען ליינט דיינע מתאחדים־באהבה קעיסן...</p>;
 if(!items?.cases?.length&&!shared.length)return null;
 return <section className="space-y-4" dir="rtl">
   <div className="rounded-xl border bg-card p-4 space-y-2">
    <h2 className="text-xl font-bold">מתאחדים באהבה — מיינע אפיציעלע קעיסן</h2>
    <p className="text-sm text-muted-foreground">געב איבער די קעיס־סטאטוס, בל״נ־טערמינען, פאלא־אפס און ערהאלטענע נדבות. דער צענטראלער גאל קומט פון דעם אפיציעלן צוועק.</p>
    <Button variant="outline" size="sm" onClick={()=>void refresh()}>דערפרישן</Button>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {message&&<p role="status">{message}</p>}
   </div>
   {items?.cases?.map(c=><article key={c.case_id}
     className={`rounded-xl border bg-card p-4 space-y-3 ${highlightCase===c.case_id?"ring-2 ring-primary":""}`}>
     <h3 className="font-bold">{c.title} · קעיס #{c.case_id}</h3>
     <div className="grid grid-cols-2 gap-2 text-sm">
      <p>צענטראלער גאל: <strong>${Number(c.central_goal||0).toLocaleString()}</strong></p>
      <p>באטייליגטע: <strong>{c.supporter_count}</strong></p>
      <p>בל״נ אנגענומענע צוזאגן: <strong>${Number(c.funds_promised||0).toLocaleString()}</strong></p>
      <p>מיינע באשטעטיגט באקומענע נדבות: <strong>${Number(c.funds_received||0).toLocaleString()}</strong></p>
     </div>
     <a href={`/my?case=${c.case_id}`} className="underline text-primary font-semibold">
      עפענען דעם פולן קעיס מיט טעסקס, נאטיצן און פאלא־אפס
     </a>
     {items.pledges.filter(p=>p.case_id===c.case_id).map(p=><div key={p.id} className="rounded-lg border p-3 text-sm">
      <strong>בל״נ #{p.id}: {dollar(p.amount_cents)}</strong> · ביז {p.due_on}
      <p>{p.status==="pending_team"?"ווארט אויף טיעם־באשטעטיגונג":
        p.status==="approved_bln"||p.status==="accepted_bln"?"בל״נ אנגענומען, נישט באצאלט":p.status}</p>
     </div>)}
     {items.donations.filter(d=>d.case_id===c.case_id).map(d=><div key={d.id} className="rounded-lg border p-3 space-y-2 text-sm">
      <strong>נדבה־בקשה #{d.id}</strong> · {d.state}
      {d.state==="instructions_only"&&<>
       <Input type="number" min="0.01" step="0.01" placeholder="סכום וואס דו האסט שוין געגעבן"
         value={amount[d.id]||""} onChange={e=>setAmount(x=>({...x,[d.id]:e.target.value}))}/>
       <Textarea placeholder="באצאל־רעפערענץ אדער באשרייבונג פאר דער טיעם־איבערקוק"
         value={evidence[d.id]||""} onChange={e=>setEvidence(x=>({...x,[d.id]:e.target.value}))}/>
       <Button disabled={busy||!amount[d.id]||!(evidence[d.id]||"").trim()} onClick={()=>void report(d)}>
         אריינשיקן נדבה פאר באשטעטיגונג
       </Button>
       <p className="text-xs text-muted-foreground">דאס איז א באריכט צום טיעם. עס ווערט נישט באטראכט אלס באצאלט אן באשטעטיגונג.</p>
      </>}
     </div>)}
     {items.olamBonuses.filter(b=>b.cause_id===c.cause_id).map(b=><p key={b.cause_id} className="text-sm rounded-lg border p-3">
       עולם החסד באנוס: {b.minutes_allocated} מינוטן ({(b.minutes_allocated/60).toFixed(1)} שעות)
       · {b.status==="reserved"?"רעזערווירט, נאך נישט אקטיוו אויף SignalWire":b.status}
     </p>)}
     <div className="space-y-1">
      <h4 className="font-semibold text-sm">לעצטע אפדעיטס</h4>
      {items.events.filter(e=>e.case_id===c.case_id).slice(0,4).map(e=><p key={e.id} className="text-xs border-b py-1">{e.details}</p>)}
     </div>
   </article>)}
   {shared.map(c=><article key={c.case_id} className="rounded-xl border p-4 space-y-2">
    <h3 className="font-bold">א באגרעניצטער מיטארבעטער־קעיס #{c.case_id}</h3>
    <p className="text-sm">צוועק: {c.cause_title} · רעכט: {c.role==="viewer"?"בלויז זען":"קאארדינירן"}</p>
    <p className="text-xs">דער צוטריט לויפט אויס: {c.expires_at}</p>
    {c.role==="coordinator"&&<>
      <Textarea placeholder="לייג א נאטיץ צום אויסגעקליבענעם קעיס" value={notes[c.case_id]||""}
       onChange={e=>setNotes(n=>({...n,[c.case_id]:e.target.value}))}/>
      <Button disabled={busy||!notes[c.case_id]?.trim()} onClick={()=>void shareNote(c)}>
       אפהיטן די נאטיץ
      </Button>
      <Textarea placeholder="א נייע קאארדינירטע פאלא־אפ אויפגאבע"
       value={followupNotes[c.case_id]||""}
       onChange={e=>setFollowupNotes(n=>({...n,[c.case_id]:e.target.value}))}/>
      <Input type="date" value={followupDates[c.case_id]||""}
       onChange={e=>setFollowupDates(n=>({...n,[c.case_id]:e.target.value}))}/>
      <Button variant="outline" disabled={busy||!followupNotes[c.case_id]?.trim()||!followupDates[c.case_id]}
       onClick={()=>void scheduleFollowup(c)}>אריינלייגן א פאלא־אפ אין דעם קעיס</Button>
    </>}
   </article>)}
 </section>;
}
