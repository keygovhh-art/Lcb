import { useCallback,useEffect,useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Campaign={id:string;title:string;goal_amount:string;status:string;role:string};
type Assignment={id:string;title:string;kind:string;priority:string;status:string;due_at:string|null};
type CampaignRoom={id:string;title:string;room_status:string;floor_mode:string;live_program?:string|null;next_program_at?:string|null;openUrl:string|null};
type RoomResponse={mode:string;rooms:CampaignRoom[]};
type Finance={id:number;amount:number;paidAmount?:number;refundedAmount?:number;caseId:number};
type Overview={pledges:Finance[];receipts:Finance[]};
type Reversal={id:number;receiptId:number;amount:number;createdAt:string};
type LinkStatus={configured:boolean;linked:boolean;campaigns:Campaign[]};
type Diagnostics={configured:boolean;remoteReachable:boolean;protocolCompatible:boolean};

async function api<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{credentials:"include",cache:"no-store",...init});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof data?.error==="string"?data.error:"פארבינדונגס־טעות");
 return data as T;
}
const post=(body:object):RequestInit=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const cash=(number:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(number||0));

/** Optional team layer: personal MAX always works without Campaign Connect. */
export function GavhahConnectPanel({caseId,followups}:{caseId?:number|null;followups?:Array<{id:number;note:string;completed:boolean}>}){
 const [status,setStatus]=useState<LinkStatus|null>(null);
 const [diagnostics,setDiagnostics]=useState<Diagnostics|null>(null);
 const [token,setToken]=useState("");
 const [campaignId,setCampaignId]=useState("");
 const [events,setEvents]=useState<Overview|null>(null);
 const [reversals,setReversals]=useState<Reversal[]>([]);
 const [refundId,setRefundId]=useState("");
 const [refundConsent,setRefundConsent]=useState(false);
 const [eventKey,setEventKey]=useState("");
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [campaignRooms,setCampaignRooms]=useState<CampaignRoom[]>([]);
 const [consent,setConsent]=useState(false);
 const [followupId,setFollowupId]=useState("");
 const [followupConsent,setFollowupConsent]=useState(false);
 const [pending,setPending]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const reload=useCallback(async()=>{
  const result=await api<LinkStatus>("/api/askanus/connect/status");
  setStatus(result);
  if(!result.linked||!result.campaigns?.length){setCampaignId("");setAssignments([]);setCampaignRooms([]);return;}
  setCampaignId(p=>result.campaigns.some(c=>c.id===p)?p:result.campaigns[0].id);
 },[]);
 useEffect(()=>{void reload().catch(e=>setError(e instanceof Error?e.message:"פארבינדונגס־טעות"));},[reload]);
 useEffect(()=>{
  let cancelled=false;
  void api<Diagnostics>("/api/askanus/connect/diagnostics").then(x=>{
   if(!cancelled)setDiagnostics(x);
  }).catch(()=>{if(!cancelled)setDiagnostics({configured:false,remoteReachable:false,protocolCompatible:false});});
  return ()=>{cancelled=true;};
 },[]);
 useEffect(()=>{
  if(!status?.linked)return;
  let cancelled=false;
  void api<Reversal[]>("/api/askanus/connect/reversals").then(items=>{
   if(!cancelled)setReversals(items);
  }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"קארעקטור־טעות");});
  void api<Overview>("/api/askanus/finance/overview"+(caseId?"?caseId="+caseId:""))
    .then(result=>{if(!cancelled)setEvents(result);})
    .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"חשבונות־טעות");});
  return ()=>{cancelled=true;};
 },[caseId,status?.linked]);
 useEffect(()=>{
  if(!campaignId){setCampaignRooms([]);return;}
  let cancelled=false;
  void api<RoomResponse>("/api/askanus/connect/rooms?campaignId="+encodeURIComponent(campaignId))
   .then(result=>{if(!cancelled)setCampaignRooms(result.rooms||[]);})
   .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"קאמפיין־זאל־פארבינדונג נישט געלונגען");});
  return ()=>{cancelled=true;};
 },[campaignId]);
 useEffect(()=>{
  if(!campaignId){setAssignments([]);return;}
  let cancelled=false;
  void api<Assignment[]>("/api/askanus/connect/assignments?campaignId="+encodeURIComponent(campaignId))
   .then(result=>{if(!cancelled)setAssignments(result);})
   .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"מאנשאפט־פראבלעם");});
  return ()=>{cancelled=true;};
 },[campaignId]);
 const updateAssignedTask=async(id:string,status:"open"|"in_progress"|"done")=>{
  if(!campaignId||pending)return;
  setPending(true);setError("");setMessage("");
  try{
   const saved=await api<{id:string;status:string}>("/api/askanus/connect/assignments/"+encodeURIComponent(id)+"/status",
    post({campaignId,status}));
   setAssignments(previous=>previous.map(task=>task.id===saved.id?{...task,status:saved.status}:task));
   setMessage("די קאמפיין־אויפגאבע איז געענדערט אינעם זעלבן קאמפיין־רעקארד.");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setPending(false);}
 };
 const connect=async(e:React.FormEvent)=>{
  e.preventDefault();setPending(true);setError("");setMessage("");
  try{await api("/api/askanus/connect/redeem",post({code:token.trim()}));setToken("");await reload();setMessage("די צוויי אקאונטס זענען פארבונדן.");}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}finally{setPending(false);}
 };
 const shareReversal=async(e:React.FormEvent)=>{
  e.preventDefault();if(!refundConsent||!campaignId||!refundId)return;
  setPending(true);setError("");setMessage("");
  try{
   const r=await api<{duplicate:boolean}>("/api/askanus/connect/share-reversal",post({
    campaignId,refundId:Number(refundId),confirmShare:true
   }));
   setMessage(r.duplicate?"די קארעקטור איז שוין אריינגערעכנט.":"די מאנועלע קארעקטור איז פארבונדן מיטן קאמפיין; עס איז נישט קיין באנק־ריפאנד.");
   setRefundConsent(false);
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setPending(false);}
 };
 const shareFollowup=async(e:React.FormEvent)=>{
  e.preventDefault();if(!followupConsent||!campaignId||!followupId)return;
  setPending(true);setError("");setMessage("");
  try{
   const result=await api<{duplicate:boolean}>("/api/askanus/connect/share-followup",post({
    campaignId,followupId:Number(followupId),shareScope:"assigned_managers",confirmShare:true
   }));
   setMessage(result.duplicate?"דער נאכפאלג איז שוין פארבונדן.":"דער זעלבער נאכפאלג־ID איז פארבונדן מיטן קאמפיין, אן מיטטיילן דיינע פריוואטע נאטיצן.");
   setFollowupConsent(false);
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setPending(false);}
 };
 const share=async(e:React.FormEvent)=>{
  e.preventDefault();if(!consent||!campaignId||!eventKey)return;
  const [kind,id]=eventKey.split(":");
  setPending(true);setError("");setMessage("");
  try{
   const r=await api<{duplicate:boolean}>("/api/askanus/connect/share-finance",post({campaignId,kind,eventId:Number(id),confirmShare:true}));
   setMessage(r.duplicate?"שוין געווען אריינגערעכנט; נישט פארדאפלט.":"אריינגעשריבן אינעם אויסגעקליבענעם קאמפיין אלס מאנועל באריכטעט.");
   setConsent(false);
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setPending(false);}
 };
 const financial=[
  ...(events?.pledges||[]).map(e=>({key:"pledge:"+e.id,name:"התחייבות #"+e.id,amount:e.amount})),
  ...(events?.receipts||[]).filter(e=>Number(e.refundedAmount||0)===0).map(e=>({key:"receipt:"+e.id,name:"מאנועל באקומען #"+e.id,amount:e.amount}))
 ];
 return <section dir="rtl" className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 scroll-mt-24">
  <div className="space-y-1"><h3 className="text-lg font-bold">גבהה קאנעקט — מיין קאמפיין־מאנשאפט</h3>
   <p className="text-sm text-muted-foreground">MAX בלייבט א פריוואטער אפפ. דער קאמפיין־מנהל זעט נאר די געשעענישן וואס דו גיבסט בפירוש רשות צו מיטטיילן. קיין פריוואטע נדבן־פרטים אדער נאטיצן גייען נישט מיט.</p></div>
  {error&&<p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p>}
  {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  <p className="text-sm"><a className="underline" href="https://gavhah-campaign-center.onrender.com/" target="_blank" rel="noopener noreferrer">עפענען קאמפיין סענטער — ארויסנעמען דיין אייגענעם איינמאליגן קאוד</a> (א באזונדערע איינלאגירונג איז נויטיג).</p>
  {!status&&<p className="text-sm">קוקט נאך די פארבינדונג…</p>}
  {diagnostics&&<p className="text-sm" role="status">
   {diagnostics.protocolCompatible?
    "ביידע פארבינדונגס־סערווערס זענען דערגרייכבאר, און דער API־פראטאקאל שטימט. אקאונט־לינקינג דארף נאך א באזונדערע באשטעטיגונג.":
    diagnostics.configured?
     "דער פארבינדונגס־סערווער איז נאך נישט באשטעטיגט. מען דארף איבערקוקן דעם שליסל און די פארבינדונג צווישן ביידע Render־סערווערס.":
     "גבהה קאנעקט איז נאך נישט קאנפיגורירט אויפן סערווער."}
  </p>}
  {status&&!status.configured&&<p className="text-sm">דער קאמפיין־פארבינדונגס־סערווער איז נאך נישט צוגעגרייט. דיינע פערזענליכע MAX־פונקציעס ארבעטן ווייטער אומאפהענגיג.</p>}
  {status?.configured&&!status.linked&&<form onSubmit={connect} className="space-y-2">
    <Label htmlFor="max-team-code">איינמאליגער קאנעקט־קאוד פונעם קאמפיין סענטער</Label>
    <Input id="max-team-code" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" dir="ltr" required maxLength={32} placeholder="פארבינדונגס־קאוד"/>
    <Button disabled={pending||token.trim().length!==32} type="submit">פארבינדן מיינע צוויי אקאונטס</Button>
   </form>}
  {status?.linked&&<div className="space-y-4">
    <p className="text-sm font-medium">פארבונדן מיט קאמפיין סענטער. די פריוואטע דאַטן בלייבן ביי דיר.</p>
    {status.campaigns.length===0?<p className="text-sm">נאכנישטא קיין אקטיווע קאמפיין־מיטגלידערשאפט.</p>:<>
     <label className="block space-y-1"><span className="font-medium text-sm">מיין קאמפיין</span>
      <select className="min-h-11 w-full rounded-lg border bg-background p-2" value={campaignId} onChange={e=>setCampaignId(e.target.value)}>
       {status.campaigns.map(c=><option key={c.id} value={c.id}>{c.title} — {c.role}</option>)}
      </select>
     </label>
     <div className="rounded-lg border p-3 space-y-3">
      <h4 className="font-semibold">מיינע לעבעדיגע קאמפיין־זאלן</h4>
      <p className="text-xs text-muted-foreground">די זעלבע קאמפיין־מאנשאפט אין MAX. מען קען מיטהאלטן דעם פראגראם, אריינטשעקן און ארבעטן אין קאמפיין סענטער. ווידעא איז פרייוויליג; א באזונדערער איינלאג קען זיך פארלאנגען.</p>
      {campaignRooms.length===0?<p className="text-sm text-muted-foreground">נאכנישטא קיין אפענע אדער צוגעגרייטע ווירטועלע קאמפיין־זאלן.</p>:
       campaignRooms.map(room=><div key={room.id} className="border-b py-2 space-y-2">
        <strong className="block">{room.title}</strong>
        <span className="block text-xs text-muted-foreground">{room.room_status} · {room.floor_mode}
         {room.live_program?" · יעצט: "+room.live_program:""}
         {room.next_program_at?" · נעקסטער פראגראם: "+new Date(room.next_program_at).toLocaleString():""}
        </span>
        {room.openUrl?<a href={room.openUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold">
           אריינגיין אינעם קאמפיין־זאל
         </a>:<p className="text-xs text-muted-foreground">קאמפיין סענטער־לינק ווערט נאכנישט צוגעשטעלט.</p>}
       </div>)}
     </div>
     <div className="rounded-lg border p-3 space-y-2"><h4 className="font-semibold">מיינע קאמפיין־אויפגאבן</h4>
       {assignments.length===0?<p className="text-sm text-muted-foreground">נאך קיין צוגעטיילטע אויפגאבן.</p>:
        assignments.map(a=><div key={a.id} className="border-b py-3 text-sm flex flex-wrap items-center justify-between gap-3">
         <div className="min-w-0"><strong>{a.title}</strong><span className="block text-xs text-muted-foreground">{a.status} · {a.priority} · {a.due_at?.slice(0,10)||"אָן טאג"}</span></div>
         <div className="flex flex-wrap gap-2">
          {a.status!=="done"?
           <Button type="button" size="sm" disabled={pending} onClick={()=>void updateAssignedTask(a.id,"done")}>פארענדיגט</Button>:
           <Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>void updateAssignedTask(a.id,"open")}>צוריק עפענען</Button>}
          {a.status==="open"&&<Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>void updateAssignedTask(a.id,"in_progress")}>אין ארבעט</Button>}
         </div>
        </div>)}
     </div>
     <form onSubmit={share} className="space-y-3 rounded-lg border p-3">
      <h4 className="font-semibold">מיטטיילן איין אויסגעקליבענע געלט־געשעעניש</h4>
      <p className="text-sm text-muted-foreground">נאר א התחייבות אדער א מאנועל באריכטעטע נדבה, נישט קיין פינאנציעלער באווייז. עס קען נישט ווערן געציילט צוויי מאל.</p>
      <select className="min-h-11 w-full rounded-lg border bg-background p-2" value={eventKey} onChange={e=>{setEventKey(e.target.value);setConsent(false);}} required>
       <option value="">קלייב א רעקארד</option>
       {financial.map(e=><option key={e.key} value={e.key}>{e.name} — {cash(e.amount)}</option>)}
      </select>
      <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/>
       <span>איך וויל בפירוש מיטטיילן די אויסגעקליבענע געלט־געשעעניש מיט דעם קאמפיין. מיינע פריוואטע נאטיצן בלייבן פריוואט.</span>
      </label>
      <Button disabled={pending||!consent||!eventKey||!campaignId} type="submit">מיטטיילן דעם רעקארד</Button>
     </form>
     <form onSubmit={shareFollowup} className="space-y-3 rounded-lg border p-3">
      <h4 className="font-semibold">איין נאכפאלג מיטטיילן מיטן קאמפיין</h4>
      <p className="text-xs text-muted-foreground">דער קאמפיין וועט באקומען בלויז א פארבינדונג צום זעלבן מקור־רעקארד. דער טעקסט און פריוואטע נאטיצן בלייבן אין דיין MAX־אקאונט.</p>
      <select className="min-h-11 w-full rounded-lg border bg-background p-2" value={followupId} onChange={e=>{setFollowupId(e.target.value);setFollowupConsent(false);}} required>
       <option value="">קלייב א נאכפאלג פונעם אויסגעקליבענעם פראיעקט</option>
       {(followups||[]).map(f=><option key={f.id} value={f.id}>{f.completed?"פארטיג":"אפן"} · #{f.id} · {f.note.slice(0,65)}</option>)}
      </select>
      <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={followupConsent} onChange={e=>setFollowupConsent(e.target.checked)} className="mt-1"/>
       <span>איך באשטעטיג בפירוש צו מיטטיילן דעם נאכפאלג־מקור מיט די ערלויבטע קאמפיין־מאנשאפט.</span>
      </label>
      <Button disabled={pending||!followupConsent||!followupId||!campaignId} type="submit">מיטטיילן דעם נאכפאלג</Button>
     </form>
     <form onSubmit={shareReversal} className="space-y-3 rounded-lg border p-3">
      <h4 className="font-semibold">קארעקטורן צו פריער מיטגעטיילטע נדבות</h4>
      <p className="text-xs text-muted-foreground">אויב א באצאלונג איז פארראכטן אדער צוריקגעדרייט, דארפסטו מיטטיילן דעם צוגעבונדענעם אודיט־רעקארד, כדי דער קאמפיין זאל נישט ווייטער ציילן דעם גאנצן אלטן סכום.</p>
      <select className="min-h-11 w-full rounded-lg border bg-background p-2" value={refundId} onChange={e=>{setRefundId(e.target.value);setRefundConsent(false);}} required>
       <option value="">קלייב א מאנועלע קארעקטור</option>
       {reversals.map(r=><option key={r.id} value={r.id}>קארעקטור #{r.id} · קבלה #{r.receiptId} · {cash(r.amount)}</option>)}
      </select>
      <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={refundConsent} onChange={e=>setRefundConsent(e.target.checked)} className="mt-1"/>
       <span>איך באשטעטיג בפירוש צו מיטטיילן די אויסגעקליבענע קארעקטור מיטן קאמפיין.</span>
      </label>
      <Button disabled={pending||!refundConsent||!refundId||!campaignId} type="submit">מיטטיילן קארעקטור</Button>
     </form>
    </>}
    <Button variant="outline" disabled={pending} onClick={async()=>{
     setPending(true);setError("");try{await api("/api/askanus/connect/unlink",post({}));await reload();setMessage("די פארבינדונג איז אויסגעלאשן; די פריוואטע דאטן בלייבן.");}
     catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}finally{setPending(false);}
    }}>אויסשאלטן די אקאונט־פארבינדונג</Button>
  </div>}
 </section>;
}
