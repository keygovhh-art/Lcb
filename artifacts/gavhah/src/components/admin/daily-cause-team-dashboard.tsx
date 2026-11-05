import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
type Pledge={id:number;charity_id:number;member_id:number;case_id:number;amount_cents:string;due_on:string;status:string};
type Donation={id:number;charity_id:number;member_id:number;case_id:number;amount_cents:string|null;state:string;evidence_note:string|null};
type Cause={id:number;title:string;goal_amount:number;existing_verified_cents:string;extra_verified_cents:string;publication_state:string;is_todays_featured:boolean};
type Application={id:number;member_id:number;title:string;description:string;location:string;urgency:string;status:string};
type Data={causes:Cause[];pledges:Pledge[];donationIntents:Donation[];cases:Array<{id:number;user_id:number;charity_id:number;funds_promised:string;funds_received:string}>};
async function request(url:string,method="GET",body?:unknown){
 const response=await fetch(url,{method,credentials:"same-origin",cache:"no-store",
  ...(body!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const json=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(json.error||"דער סערווער קען עס נישט באארבעטן");
 return json;
}
const fmt=(value:unknown)=>"$"+(Number(value||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export function DailyCauseTeamDashboard(){
 const [data,setData]=useState<Data|null>(null),[proposals,setProposals]=useState<Application[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [notes,setNotes]=useState<Record<number,string>>({});
 const [evidence,setEvidence]=useState<Record<number,string>>({});
 const [selected,setSelected]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const [a,b]=await Promise.all([
    request("/api/admin/daily/workspace"),request("/api/admin/daily/proposals")
   ]);
   setData(a);setProposals(b);setError("");
  }catch(e){setError(e instanceof Error?e.message:"קען נישט לאודן דאטן");}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const act=async(task:()=>Promise<unknown>)=>{
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try{await task();setSuccess("אפהיטן איז געלונגען. סטאטוסן זענען דערהיינטיגט.");await refresh();}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const cause=data?.causes?.find(c=>c.id===Number(selected))||data?.causes?.find(c=>c.is_todays_featured)||data?.causes?.[0];
 return <section dir="rtl" className="space-y-5">
  <div className="rounded-xl border bg-card p-5 space-y-2">
   <h2 className="text-xl font-bold">היינטיגע צוועק — צענטראלע טיעם־מענעדזשמענט</h2>
   <p className="text-sm text-muted-foreground">פולשטענדיג אפגעטיילט פון מתאחדים באהבה. בל״נ־צוזאגן, באצאלטע נדבות און ווארטנדע בקשות ווערן געהאלטן באזונדער.</p>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   {success&&<p role="status">{success}</p>}
   <Button variant="outline" onClick={()=>void refresh()}>דערפרישן</Button>
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">היינטיגע אקטיווע צוועק / קאמפיין</h3>
   <Select value={String(cause?.id||"")} onValueChange={setSelected}>
    <SelectTrigger><SelectValue placeholder="קלייב א קאמפיין"/></SelectTrigger>
    <SelectContent>{(data?.causes||[]).map(c=><SelectItem key={c.id} value={String(c.id)}>
     #{c.id} — {c.title}</SelectItem>)}</SelectContent>
   </Select>
   {cause&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
    <p><strong>{fmt(Number(cause.existing_verified_cents||0)+Number(cause.extra_verified_cents||0))}</strong>
      <span className="block text-xs text-muted-foreground">באשטעטיגט באקומען (צוויי לעדזשערס)</span></p>
    <p><strong>{fmt((data?.pledges||[]).filter(p=>p.charity_id===cause.id&&
      ["accepted_bln","approved_bln","fulfilled"].includes(p.status))
      .reduce((sum,p)=>sum+Number(p.amount_cents||0),0))}</strong>
      <span className="block text-xs text-muted-foreground">בל״נ אנגענומען</span></p>
    <p><strong>${Number(cause.goal_amount||0).toLocaleString()}</strong>
      <span className="block text-xs text-muted-foreground">אפיציעלער ציל</span></p>
   </div>}
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">BL״N־אונטערנעמונגען — צוויי־חדשים־באשטעטיגונג</h3>
   {(data?.pledges||[]).filter(p=>p.charity_id===cause?.id).map(p=><article key={p.id} className="border rounded-lg p-3 space-y-2">
    <strong>#{p.id} · מעמבער #{p.member_id} · {fmt(p.amount_cents)} · ביז {p.due_on}</strong>
    <p className="text-sm">{p.status} · מיין עסקנות קעיס #{p.case_id}</p>
    {p.status==="pending_team"&&<>
      <Textarea placeholder="מערכת־נאטיץ" value={notes[p.id]||""} onChange={e=>setNotes(x=>({...x,[p.id]:e.target.value}))}/>
      <div className="flex flex-wrap gap-2">
       <Button disabled={busy} onClick={()=>void act(()=>request(`/api/admin/daily/pledges/${p.id}/review`,"POST",
        {decision:"approved",note:notes[p.id]||""}))}>באשטעטיגן</Button>
       <Button variant="destructive" disabled={busy} onClick={()=>void act(()=>request(`/api/admin/daily/pledges/${p.id}/review`,"POST",
        {decision:"rejected",note:notes[p.id]||""}))}>אפווארפן</Button>
      </div>
    </>}
   </article>)}
   {!data?.pledges?.length&&<p className="text-sm">דערווייל קיין BL״N־איינגאבעס נישט.</p>}
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">נדבות — איבערקוקן געלט וואס איז פאקטיש אריינגעקומען</h3>
   {(data?.donationIntents||[]).filter(d=>d.charity_id===cause?.id).map(d=><article key={d.id} className="border rounded-lg p-3 space-y-2">
    <strong>נדבה #{d.id} · מעמבער #{d.member_id} · {d.amount_cents?fmt(d.amount_cents):"סכום נאכנישט אנגעגעבן"}</strong>
    <p className="text-sm">סטאטוס: {d.state} · קעיס #{d.case_id}</p>
    {d.evidence_note&&<p className="text-xs">באווייז־אינפארמאציע: {d.evidence_note}</p>}
    {d.state==="submitted_for_verification"&&<>
      <Textarea placeholder="אמתע באצאל־באשטעטיגונג, רעפערענץ אדער באנק־אינפארמאציע" value={evidence[d.id]||""}
       onChange={e=>setEvidence(x=>({...x,[d.id]:e.target.value}))}/>
      <div className="flex gap-2 flex-wrap">
       <Button disabled={busy||(evidence[d.id]||"").trim().length<8} onClick={()=>void act(()=>
        request(`/api/admin/daily/donations/${d.id}/review`,"POST",
         {decision:"verified",verificationNote:evidence[d.id]}))}>געלט באשטעטיגט באקומען</Button>
       <Button variant="destructive" disabled={busy} onClick={()=>void act(()=>
        request(`/api/admin/daily/donations/${d.id}/review`,"POST",
         {decision:"rejected",verificationNote:evidence[d.id]||""}))}>אפווארפן</Button>
      </div>
    </>}
   </article>)}
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">נייע היינטיגע צוועק־פארשלאגן — נאר פאר דער מערכת</h3>
   {proposals.filter(p=>p.status==="pending"||p.status==="reviewing").map(p=><article key={p.id}
    className="rounded-lg border p-3 space-y-2">
    <strong>פארשלאג #{p.id}: {p.title}</strong>
    <p className="text-sm">{p.description}</p>
    <p className="text-xs">מעמבער #{p.member_id} · {p.location||"קיין געגנט"} · {p.urgency}</p>
    <Textarea placeholder="מערכת־הערה" value={notes[-p.id]||""}
     onChange={e=>setNotes(n=>({...n,[-p.id]:e.target.value}))}/>
    <div className="flex gap-2 flex-wrap">
     <Button disabled={busy} onClick={()=>void act(()=>request(`/api/admin/daily/proposals/${p.id}/review`,"POST",
      {decision:"approved",note:notes[-p.id]||""}))}>אננעמען צום קאמפיין־איבערקוק (נישט לייוו)</Button>
     <Button variant="destructive" disabled={busy} onClick={()=>void act(()=>request(`/api/admin/daily/proposals/${p.id}/review`,"POST",
      {decision:"rejected",note:notes[-p.id]||""}))}>אפווארפן</Button>
    </div>
   </article>)}
  </div>
  <p className="text-xs text-muted-foreground">פעימענט־פארבינדונגען, אודיא־מעסעדזשעס און אויסוואלן פאר היינטיגע צוועק ווערן אנגעשטעלט אין דער באזונדערער „היינטיגע צוועק סעטינגס“ אפטיילונג.</p>
 </section>;
}
