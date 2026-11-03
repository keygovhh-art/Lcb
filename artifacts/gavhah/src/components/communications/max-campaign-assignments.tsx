import {useEffect,useState} from "react";
import {PhoneCall,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";

type Campaign={id:string;title:string;status:string;role:string;team_name:string};
type Lead={id:string;displayName:string;phone:string;status:string;dueAt:string|null;
 claimedByMe:boolean;temporarilyBusy:boolean};
type Eligibility={eligible:boolean;configured:boolean;campaigns:Campaign[]};
export type PreparedCampaignCall={lead:Lead;campaignId:string;campaignTitle:string;
 sessionId:string;country:"US"|"CA"};
const read=async<T,>(url:string,init?:RequestInit):Promise<T>=>{
 const r=await fetch(url,{credentials:"include",cache:"no-store",...init});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(typeof data.error==="string"?data.error:"נישט געלונגען");
 return data as T;
};
const post=(obj:unknown):RequestInit=>({method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify(obj)});

/** No DOM tab, no callable queue, and no API result for unjoined accounts. */
export function MaxCampaignAssignments({onPrepared}:{
 onPrepared:(prepared:PreparedCampaignCall)=>void
}){
 const [eligibility,setEligibility]=useState<Eligibility|null>(null);
 const [campaignId,setCampaignId]=useState("");
 const [calls,setCalls]=useState<Lead[]>([]);
 const [country,setCountry]=useState<"US"|"CA">("US");
 const [active,setActive]=useState<PreparedCampaignCall|null>(null);
 const [result,setResult]=useState("no_answer");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  let alive=true;
  void read<Eligibility>("/api/askanus/connect/call-queue/campaigns")
   .then(r=>{if(!alive)return;setEligibility(r);
    if(r.eligible&&r.campaigns.length)setCampaignId(r.campaigns[0].id);
   }).catch(e=>{if(alive)setError(e.message)});
  return ()=>{alive=false};
 },[]);
 const load=async(id=campaignId)=>{
  if(!id)return;
  const r=await read<{calls:Lead[]}>(
   "/api/askanus/connect/call-queue?campaignId="+encodeURIComponent(id));
  setCalls(r.calls||[]);
 };
 useEffect(()=>{
  if(!campaignId){setCalls([]);return;}
  let alive=true;
  void read<{calls:Lead[]}>(
   "/api/askanus/connect/call-queue?campaignId="+encodeURIComponent(campaignId))
   .then(r=>{if(alive)setCalls(r.calls||[])})
   .catch(e=>{if(alive)setError(e.message)});
  return ()=>{alive=false};
 },[campaignId]);
 if(!eligibility?.eligible||!eligibility.campaigns.length)return null;
 const selected=eligibility.campaigns.find(c=>c.id===campaignId);
 const next=async()=>{
  if(busy||!selected)return;
  setBusy(true);setError("");setMessage("");
  try{
   const r=await read<{
    call:Lead|null;prepared:{id:string;status:string}|null;
    dialInitiated:boolean;recordingEnabled:boolean;
   }>("/api/askanus/connect/call-queue/next",post({campaignId,country}));
   if(!r.call||!r.prepared){setMessage("נישטא קיין נעקסטע צוגעטיילטע רופן.");return;}
   const prepared:PreparedCampaignCall={
    lead:r.call,campaignId,campaignTitle:selected.title,
    sessionId:r.prepared.id,country};
   setActive(prepared);onPrepared(prepared);
   setMessage("דער נומער איז גענומען פון Campaign Center און די רופן־אפטיילונג איז געעפנט.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setBusy(false)}
 };
 const release=async()=>{
  if(!active||busy)return;
  setBusy(true);setError("");
  try{
   await read("/api/askanus/connect/call-queue/"+encodeURIComponent(active.lead.id)+"/release",
    post({campaignId:active.campaignId}));
   setActive(null);setMessage("דער נומער איז צוריק אין קאמפיין־ווארטליסטע.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setBusy(false)}
 };
 const save=async()=>{
  if(!active||busy)return;
  setBusy(true);setError("");
  try{
   await read("/api/askanus/connect/call-queue/"+encodeURIComponent(active.lead.id)+"/result",
    post({campaignId:active.campaignId,outcome:result,note}));
   setActive(null);setNote("");
   setMessage("דער אויסגאנג איז אפגעהיטן דירעקט אין Campaign Center, נישט דאפעלט.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setBusy(false)}
 };
 return <section id="max-campaign-call-assignments" aria-label="מיינע צוגעטיילטע קאמפיין־רופן"
  className="rounded-xl border p-3 space-y-3" dir="rtl">
  <h4 className="font-bold text-lg">Call Assignments — מיינע צוגעטיילטע רופן</h4>
  <p className="text-sm text-muted-foreground">
   דאס איז דירעקט פארבונדן מיט Campaign Center, און ווערט נאר געוויזן פאר איינגעשריבענע
   אקטיווע קאמפיין־מיטגלידער. די נומערן זענען נישט דיינע פריוואטע קאנטאקטן.
  </p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {message&&<p role="status" className="text-sm">{message}</p>}
  <select aria-label="קאמפיין־סענטער קאמפיין" value={campaignId}
   onChange={e=>{setCampaignId(e.target.value);setActive(null)}}
   className="w-full h-11 rounded-lg border bg-background px-2">
   {eligibility.campaigns.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}
  </select>
  <div className="flex items-center gap-2 flex-wrap">
   <select aria-label="לאנד פון צוגעטיילטן נומער" value={country}
    onChange={e=>setCountry(e.target.value as "US"|"CA")}
    className="h-11 border rounded-lg bg-background px-2">
    <option value="US">USA</option><option value="CA">Canada</option>
   </select>
   <Button type="button" disabled={busy||!campaignId}
    onClick={()=>void next()}><PhoneCall className="h-4 w-4 ml-1"/> דעם נעקסטן רוף נעמען</Button>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>void load()}>
    <RefreshCw className="h-4 w-4 ml-1"/> דערפרישן
   </Button>
  </div>
  <p className="text-xs text-muted-foreground">
   איין קנעפל נעמט דעם נעקסטן צוגעטיילטן נומער און עפנט Calling Mode.
   דער אויטאמאטישער SignalWire־דיילער דארף זיין באשטעטיגט איידער ס'קען ארויסגיין אן אמת'ער רוף.
  </p>
  {active&&<div className="rounded-xl border p-3 space-y-3">
   <strong>אויסגעקליבן: {active.lead.displayName} — <span dir="ltr">{active.lead.phone}</span></strong>
   <p className="text-xs">רוף־סעסיע: {active.sessionId} · Campaign Center: {active.campaignTitle}</p>
   <label className="block text-sm">דער אויסגאנג
    <select className="w-full h-11 rounded-lg border bg-background px-2"
     value={result} onChange={e=>setResult(e.target.value)}>
     <option value="no_answer">נישט אויפגעהויבן</option>
     <option value="spoke">גערעדט</option>
     <option value="callback">צוריקרופן</option>
     <option value="pledged">צוגעזאגט</option>
     <option value="paid">נדבה באריכטעט (נישט באשטעטיגט באצאלט)</option>
     <option value="not_interested">נישט אינטערעסירט</option>
     <option value="do_not_call">נישט מער רופן</option>
    </select>
   </label>
   <Textarea value={note} onChange={e=>setNote(e.target.value)}
    placeholder="נאטיץ פארן קאמפיין" rows={2} maxLength={2000}/>
   <div className="flex flex-wrap gap-2">
    <Button type="button" disabled={busy} onClick={()=>void save()}>אפהיטן אויסגאנג</Button>
    <Button type="button" disabled={busy} variant="outline" onClick={()=>void release()}>
     צוריקגעבן דעם נומער
    </Button>
   </div>
  </div>}
  <p className="text-sm">ווארטנדיגע רופן ({calls.filter(c=>!c.temporarilyBusy).length})</p>
  {calls.filter(c=>!c.temporarilyBusy).slice(0,15).map(c=>
   <div key={c.id} className="flex flex-wrap justify-between border-b py-2 gap-2 text-sm">
    <span>{c.displayName} · <span dir="ltr">{c.phone}</span></span>
    <span className="text-muted-foreground">{c.status}{c.dueAt?" · "+new Date(c.dueAt).toLocaleDateString():""}</span>
   </div>)}
 </section>;
}
