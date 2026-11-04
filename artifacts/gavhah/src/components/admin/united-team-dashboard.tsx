import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

type Cause={id:number;title:string;status:string;goal_amount:string|null;supporter_count:number;
 verified_received_cents:string;legacy_pledged_amount:string};
type Pledge={id:number;member_id:number;case_id:number;cause_id:number;amount_cents:string;due_on:string;status:string;review_note:string|null};
type Donation={id:number;member_id:number;case_id:number;cause_id:number;amount_cents:string|null;state:string;evidence_note:string|null};
type Case={id:number;user_id:number;cause_id:number;status:string;funds_promised:string;funds_received:string};
type Dashboard={causes:Cause[];pledges:Pledge[];donationIntents:Donation[];cases:Case[];
 bonuses:Array<Record<string,unknown>>;campaignLinks:Array<Record<string,unknown>>};
async function callApi(path:string,method="GET",body?:unknown){
 const r=await fetch(path,{
  method,credentials:"same-origin",cache:"no-store",
  ...(body!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||"ס׳איז נישט געלונגען");
 return d;
}
export function UnitedTeamDashboard(){
 const [data,setData]=useState<Dashboard|null>(null);
 const [activeCauseId,setActiveCauseId]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [verification,setVerification]=useState<Record<number,string>>({});
 const [notes,setNotes]=useState<Record<number,string>>({});
 const [memberId,setMemberId]=useState(""),[role,setRole]=useState("viewer");
 const [days,setDays]=useState("30"),[selectedCase,setSelectedCase]=useState("");
 const [notification,setNotification]=useState(""),[audience,setAudience]=useState("both");
 const [newGoal,setNewGoal]=useState("");
 const [campaignRef,setCampaignRef]=useState(""),[planCode,setPlanCode]=useState("");
 const [bonusEnabled,setBonusEnabled]=useState(false),[bonusMinutes,setBonusMinutes]=useState("60");
 const [bonusMax,setBonusMax]=useState("600"),[bonusDays,setBonusDays]=useState("30");
 const [bonusMember,setBonusMember]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const got=await callApi("/api/admin/united/workspace") as Dashboard;
   setData(got);setError("");setActiveCauseId(old=>old||got.causes[0]?.id||null);
  }catch(e){setError(e instanceof Error?e.message:"נישטא קיין פארבינדונג");}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const run=async(fn:()=>Promise<unknown>)=>{
  if(busy)return;
  setBusy(true);setError("");setMessage("");
  try{await fn();setMessage("דער ענדערונג איז געווארן אפגעהיטן.");await refresh();}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const causeId=activeCauseId||data?.causes[0]?.id||0;
 const causes=data?.causes||[],pledges=data?.pledges||[],donations=data?.donationIntents||[];
 const cases=data?.cases||[];
 const money=(cents:unknown)=>"$"+(Number(cents||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
 return <section dir="rtl" className="space-y-6">
  <div className="rounded-xl border bg-card p-5 space-y-3">
   <h2 className="font-bold text-xl">מתאחדים באהבה — צענטראלע טיעם־מענעדזשמענט</h2>
   <p className="text-sm text-muted-foreground">בל״נ־צוזאגן, באשטעטיגטע נדבות און דער צענטראלער ציל ווערן געהאלטן באזונדער. קיין סכום ווערט נישט באטראכט ווי באצאלט אן טיעם־באשטעטיגונג.</p>
   <Button variant="outline" onClick={()=>void refresh()}>דערפרישן לייוו סטאטוס</Button>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   {message&&<p role="status" className="text-sm">{message}</p>}
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-4">
   <h3 className="font-bold">צענטראלע צוועק־דאטא</h3>
   <Select value={String(causeId||"")} onValueChange={x=>setActiveCauseId(Number(x))}>
    <SelectTrigger><SelectValue placeholder="קלייב א צוועק"/></SelectTrigger>
    <SelectContent>{causes.map(c=><SelectItem key={c.id} value={String(c.id)}>
      #{c.id} — {c.title}</SelectItem>)}</SelectContent>
   </Select>
   {causes.filter(c=>c.id===causeId).map(c=><div key={c.id} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
     <p><strong>{c.supporter_count}</strong><span className="block text-xs">אנגעשלאסענע</span></p>
     <p><strong>{money(c.verified_received_cents)}</strong><span className="block text-xs">באשטעטיגט באקומען</span></p>
     <p><strong>${Number(c.goal_amount||0).toLocaleString()}</strong><span className="block text-xs">צענטראלער ציל</span></p>
     <p><strong>{pledges.filter(p=>p.cause_id===causeId&&p.status==="pending_team").length}</strong><span className="block text-xs">ווארטנדע BL״N</span></p>
   </div>)}
   <div className="flex flex-wrap gap-2">
    <Input type="number" min="0" step="0.01" placeholder="נייער צענטראלער ציל" value={newGoal}
      onChange={e=>setNewGoal(e.target.value)} />
    <Button disabled={busy||!causeId||!newGoal} onClick={()=>void run(()=>
      callApi(`/api/admin/united/causes/${causeId}/goal`,"POST",{goal:Number(newGoal)}))}>
      ציל אפדעיטן פאר אלע קעיסן
    </Button>
   </div>
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">בל״נ־אונטערנעמונגען — באשטעטיגונג נאָך צוויי חדשים</h3>
   {pledges.filter(p=>p.cause_id===causeId).length===0&&<p className="text-sm">נישטא קיין איינשרייבונגען.</p>}
   {pledges.filter(p=>p.cause_id===causeId).map(p=><div key={p.id} className="border rounded-lg p-3 space-y-2">
    <div><strong>בל״נ #{p.id}</strong> · מעמבער #{p.member_id} · {money(p.amount_cents)} · ביז {p.due_on} · {p.status}</div>
    <a className="underline text-primary text-sm" href={`/my?case=${p.case_id}`}>מיין עסקנות קעיס #{p.case_id} (נאר פארן אייגנטימער)</a>
    {p.status==="pending_team"&&<div className="space-y-2">
      <Textarea placeholder="טיעם־הערה צום מעמבער" value={notes[p.id]||""}
        onChange={e=>setNotes(a=>({...a,[p.id]:e.target.value}))}/>
      <div className="flex gap-2 flex-wrap">
       <Button disabled={busy} onClick={()=>void run(()=>
        callApi(`/api/admin/united/pledges/${p.id}/review`,"POST",{decision:"approved",note:notes[p.id]||""}))}>באשטעטיגן</Button>
       <Button variant="destructive" disabled={busy} onClick={()=>void run(()=>
        callApi(`/api/admin/united/pledges/${p.id}/review`,"POST",{decision:"rejected",note:notes[p.id]||""}))}>אפווארפן</Button>
      </div>
    </div>}
   </div>)}
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">נדבות — נישט פאררעכענען אלס געלט ביז באשטעטיגט</h3>
   {donations.filter(d=>d.cause_id===causeId).map(d=><div key={d.id} className="rounded-lg border p-3 space-y-2">
    <strong>נדבה־בקשה #{d.id}</strong> · מעמבער #{d.member_id} · {d.amount_cents?money(d.amount_cents):"סכום נאכנישט אנגעגעבן"} · {d.state}
    {d.evidence_note&&<p className="text-xs">באווייז־באשרייבונג: {d.evidence_note}</p>}
    {d.state==="submitted_for_verification"&&<>
      <Textarea placeholder="באשטעטיגונג פונעם באצאל־פראוויידער אדער באנק־רעפערענץ" value={verification[d.id]||""}
        onChange={e=>setVerification(a=>({...a,[d.id]:e.target.value}))}/>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy||(verification[d.id]||"").trim().length<8} onClick={()=>void run(()=>
          callApi(`/api/admin/united/donation-intents/${d.id}/review`,"POST",
            {decision:"verified",verificationNote:verification[d.id]}))}>געלט באשטעטיגט באקומען</Button>
        <Button variant="destructive" disabled={busy} onClick={()=>void run(()=>
          callApi(`/api/admin/united/donation-intents/${d.id}/review`,"POST",
            {decision:"rejected",verificationNote:verification[d.id]||""}))}>אפווארפן באריכט</Button>
      </div>
    </>}
   </div>)}
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">פאלא־אפס און מעלדונגען — צום מעמבער, טיעם אדער ביידע</h3>
   <Select value={selectedCase} onValueChange={setSelectedCase}>
    <SelectTrigger><SelectValue placeholder="קלייב א מיין עסקנות קעיס"/></SelectTrigger>
    <SelectContent>{cases.filter(c=>c.cause_id===causeId).map(c=>
      <SelectItem key={c.id} value={String(c.id)}>קעיס #{c.id} · מעמבער #{c.user_id}</SelectItem>)}</SelectContent>
   </Select>
   <Textarea value={notification} onChange={e=>setNotification(e.target.value)} placeholder="שרייב די מעלדונג אדער פאלא־אפ"/>
   <Select value={audience} onValueChange={setAudience}>
    <SelectTrigger><SelectValue/></SelectTrigger>
    <SelectContent>
      <SelectItem value="member">נאר צום מעמבער</SelectItem>
      <SelectItem value="team">נאר צום טיעם</SelectItem>
      <SelectItem value="both">צום מעמבער און טיעם</SelectItem>
    </SelectContent>
   </Select>
   <Button disabled={busy||!selectedCase||notification.trim().length<2} onClick={()=>void run(()=>
    callApi(`/api/admin/united/cases/${selectedCase}/notify`,"POST",
      {audience,message:notification}))}>שיקן מעלדונג</Button>
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">באגרעניצטער קעיס־צוטריט פאר דרויסנדיגע מיטארבעטער</h3>
   <p className="text-sm text-muted-foreground">דער מיטארבעטער מוז האבן זיין אייגענעם גבהה־אקאונט. ער באקומט נאר דעם אויסגעקליבענעם קעיס, אן אדמין־רעכטן אדער צוטריט צו אנדערע קעיסן.</p>
   <Input type="number" value={memberId} onChange={e=>setMemberId(e.target.value)} placeholder="מיטארבעטער מעמבער־איי־די"/>
   <Select value={role} onValueChange={setRole}>
    <SelectTrigger><SelectValue/></SelectTrigger>
    <SelectContent><SelectItem value="viewer">בלויז זען</SelectItem>
     <SelectItem value="coordinator">קאארדינירן — נאטיצן</SelectItem></SelectContent>
   </Select>
   <Input type="number" min="1" max="365" value={days} onChange={e=>setDays(e.target.value)} placeholder="וויפיל טעג צוטריט"/>
   <Button disabled={busy||!selectedCase||!memberId} onClick={()=>void run(()=>
    callApi(`/api/admin/united/cases/${selectedCase}/collaborators`,"POST",
      {memberId:Number(memberId),role,expiresInDays:Number(days)}))}>געבן באגרעניצטן צוטריט</Button>
   <Button variant="outline" disabled={busy||!selectedCase||!memberId} onClick={()=>void run(()=>
    callApi(`/api/admin/united/cases/${selectedCase}/collaborators/${memberId}/revoke`,"POST",{}))}>אפנעמען דעם צוטריט</Button>
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">קאמפיין סענטער פלאן — פארבינדונג צוגרייטן</h3>
   <p className="text-sm">די פארבינדונג האלט דעם פלאן און קאמפיין־רעפערענץ. קיין קאמפיין סענטער API אדער בילינג ווערט נישט אויטאמאטיש אויסגעפירט.</p>
   <Input placeholder="קאמפיין סענטער קאמפיין־רעפערענץ" value={campaignRef} onChange={e=>setCampaignRef(e.target.value)}/>
   <Input placeholder="פלאן קאוד" value={planCode} onChange={e=>setPlanCode(e.target.value)}/>
   <Button disabled={busy||!causeId||!campaignRef||!planCode} onClick={()=>void run(()=>
    callApi("/api/admin/united/campaign-center","POST",
      {causeId,campaignReference:campaignRef,planCode}))}>אפהיטן די פלאן־פארבינדונג</Button>
  </div>
  <div className="rounded-xl border bg-card p-4 space-y-3">
   <h3 className="font-bold">עולם החסד — אומזיסטע מינוטן / שעות</h3>
   <p className="text-sm text-muted-foreground">60 מינוט = איין שעה. נאר מיטגלידער מיט באשטעטיגטן עולם החסד־צוטריט. קיין רעד־מינוטן ווערט נאך נישט אקטיוו ביז SignalWire־באגרעניצונגען זענען פארבונדן.</p>
   <label className="flex gap-2 items-center"><input type="checkbox" checked={bonusEnabled}
      onChange={e=>setBonusEnabled(e.target.checked)}/> ערלויבן רעזערווירטע צוטיילונגען</label>
   <Input type="number" min="0" value={bonusMinutes} onChange={e=>setBonusMinutes(e.target.value)} placeholder="מינוטן פער מעמבער"/>
   <Input type="number" min="0" value={bonusMax} onChange={e=>setBonusMax(e.target.value)} placeholder="מאקסימום צוזאמען מינוטן"/>
   <Input type="number" min="1" value={bonusDays} onChange={e=>setBonusDays(e.target.value)} placeholder="אויסלויף טעג"/>
   <Button disabled={busy||!causeId} onClick={()=>void run(()=>
    callApi("/api/admin/united/olam/bonus-policy","POST",
      {causeId,enabled:bonusEnabled,minutesPerMember:Number(bonusMinutes),
        maxTotalMinutes:Number(bonusMax),expirationDays:Number(bonusDays)}))}>אפהיטן באנוס־רעגלען</Button>
   <Input type="number" value={bonusMember} onChange={e=>setBonusMember(e.target.value)}
     placeholder="מעמבער־איי־די פאר א צוטיילונג"/>
   <Button variant="outline" disabled={busy||!causeId||!bonusMember} onClick={()=>void run(()=>
    callApi("/api/admin/united/olam/bonus-allocations","POST",
      {causeId,memberId:Number(bonusMember)}))}>רעזערווירן מינוטן פאר דעם מעמבער</Button>
  </div>
 </section>;
}
