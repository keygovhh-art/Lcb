import {useEffect,useState} from "react";
import {PhoneCall,Save,Volume2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {MaxCampaignAssignments,type PreparedCampaignCall} from "@/components/communications/max-campaign-assignments";

type Project={id:number;title:string};
type Person={id:number;name:string;phone:string;doNotCall:boolean};
type Call={id:string;caseId:number|null;number:string;country:string;direction:string;status:string;
 durationSeconds:number|null;startedAt:string|null;answeredAt:string|null;endedAt:string|null;
 outcome:string;mood:string;note:string;createdAt:string;participantCount:number};
type Prefs={lastCaseId:number|null;holdMode:"gavhah"|"message"|"audio";
 holdMessage:string;holdAudioPath:string;signalwireConnected:boolean;providerReady:boolean;recordingEnabled:boolean};
const outcomes=[
 {value:"",label:"אויסגאנג נישט אריינגעלייגט"},{value:"donation",label:"געגעבן א נדבה (צולייגן סכום אין נדבות־באריכט)"},
 {value:"no_answer",label:"נישט אויפגעהויבן"},{value:"callback",label:"צוריקרופן"},
 {value:"asked_no_more",label:"בעט נישט מער צו רופן — פרעגן ביים קומענדיגן רוף"},
 {value:"not_interested",label:"נישט אינטערעסירט"},{value:"do_not_call",label:"נישט מער רופן"},
 {value:"other",label:"אנדערש"}];
const ask=async<T,>(url:string,init?:RequestInit):Promise<T>=>{
 const r=await fetch(url,{credentials:"include",cache:"no-store",...init});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"די פארלאנג איז נישט געלונגען");
 return data as T;
};
const put=(body:unknown,method="PUT"):RequestInit=>({method,
 headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

export function MaxVoiceCalling({cases,selectedContact}:{
 cases:Project[];selectedContact?:Person|null
}){
 const [prefs,setPrefs]=useState<Prefs|null>(null);
 const [history,setHistory]=useState<Call[]>([]);
 const [caseId,setCaseId]=useState<number|null>(null);
 const [skip,setSkip]=useState(false);
 const [number,setNumber]=useState("");
 const [country,setCountry]=useState<"US"|"CA">("US");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [editing,setEditing]=useState<string|null>(null);
 const [editCase,setEditCase]=useState<number|null>(null);
 const [editOutcome,setEditOutcome]=useState("");
 const [editMood,setEditMood]=useState("");
 const [editNote,setEditNote]=useState("");
 const [holdMode,setHoldMode]=useState<Prefs["holdMode"]>("gavhah");
 const [holdMessage,setHoldMessage]=useState("");
 const [help,setHelp]=useState(false);
 const [callingMode,setCallingMode]=useState<PreparedCampaignCall|null>(null);
 useEffect(()=>{
  let active=true;
  Promise.all([
   ask<Prefs>("/api/askanus/max/calling/preferences"),
   ask<Call[]>("/api/askanus/max/calling/sessions")
  ]).then(([p,h])=>{
   if(!active)return;
   setPrefs(p);setHistory(h);setCaseId(p.lastCaseId);setHoldMode(p.holdMode);
   setHoldMessage(p.holdMessage);
  }).catch(e=>{if(active)setError(e.message)});
  return ()=>{active=false};
 },[]);
 useEffect(()=>{if(selectedContact?.phone)setNumber(selectedContact.phone)},[selectedContact?.id,selectedContact?.phone]);
 // The provider is the only authority for duration/status; don't simulate timers.
 useEffect(()=>{
  if(!prefs?.providerReady||!history.some(c=>["initiating","ringing","in_progress"].includes(c.status)))return;
  let stopped=false;
  const refresh=()=>{
   void ask<Call[]>("/api/askanus/max/calling/sessions")
    .then(calls=>{if(!stopped)setHistory(calls)})
    .catch(()=>{});
  };
  const interval=window.setInterval(refresh,4000);
  return ()=>{stopped=true;window.clearInterval(interval)};
 },[prefs?.providerReady,history.some(c=>["initiating","ringing","in_progress"].includes(c.status))]);

 const projectName=cases.find(c=>c.id===caseId)?.title;
 const selectedProject=cases.find(c=>c.id===caseId);
 const savePreference=async(newCase:number|null,mode=holdMode,announcement=holdMessage)=>{
  const p=await ask<{saved:boolean;lastCaseId:number|null}>(
   "/api/askanus/max/calling/preferences",
   put({lastCaseId:newCase,holdMode:mode,holdMessage:announcement,holdAudioPath:""}));
  setPrefs(prev=>prev?{...prev,lastCaseId:p.lastCaseId,holdMode:mode,holdMessage:announcement}:prev);
 };
 const dialSignalWire=async(id:string)=>{
  const result=await ask<{dialInitiated:boolean;message?:string;agentPhoneEnding?:string}>(
   "/api/askanus/max/calling/sessions/"+encodeURIComponent(id)+"/dial",put({},"POST"));
  if(result.dialInitiated){
   setMessage("SignalWire רופט יעצט דיין באשטעטיגטן טעלעפאן, ענדיגט מיט "+(result.agentPhoneEnding||"")+
    ". ווען דו הייבסט אויף, רופט די סיסטעם דעם צוגעטיילטן נומער.");
   setHistory(xs=>xs.map(c=>c.id===id?{...c,status:"ringing"}:c));
  }else setMessage("דער רוף איז נישט ארויסגעגאנגען.");
 };
 const prepareCall=async()=>{
  if(selectedContact?.doNotCall){setError("דער קאנטאקט איז אנגעצייכנט נישט צו רופן.");return;}
  if(!skip&&!caseId){setError("ביטע וועל אויס א קאמפיין, אדער דרוק סקיפן.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const attempt=async(confirmed:boolean)=>{
    const response=await fetch("/api/askanus/max/calling/sessions",{
     ...put({number,country,caseId:skip?null:caseId,
       contactId:selectedContact?.id??null,confirmAskAgain:confirmed},"POST"),
     credentials:"include",cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
     if(response.status===409&&data.requiresConfirmation&&!confirmed){
      if(window.confirm("דער מענטש האט פריער געבעטן נישט מער צו רופן. ביסטו זיכער אז דו ווילסט ווייטער גיין?"))
       return attempt(true);
      throw Error("דער רוף איז נישט צוגעגרייט.");
     }
     throw Error(data.error||"נישט געלונגען");
    }
    return data as Call&{message:string;callInitiated:false};
   };
   const call=await attempt(false);
   setHistory(list=>[call,...list]);setMessage(call.message);
   if(!skip&&caseId)await savePreference(caseId);
   if(prefs?.providerReady)await dialSignalWire(call.id);
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setBusy(false)}
 };
 // Only a provider-verified account may dial. A queue click always enters mode.
 const selectAssignedCall=async(prepared:PreparedCampaignCall)=>{
  setCallingMode(prepared);setNumber(prepared.lead.phone);setCountry(prepared.country);
  window.location.hash="#max-voice-calling";
  if(!prefs?.providerReady){
   setMessage("דער נעקסטער רוף פון Campaign Center איז צוגעגרייט. SignalWire איז נאכנישט פארבונדן פאר עכטע רופן.");
   return;
  }
  try{
   await dialSignalWire(prepared.sessionId);
  }catch(e){setError(e instanceof Error?e.message:"SignalWire רוף נישט געלונגען")}
 };
 const hangup=async(id:string)=>{
  setBusy(true);setError("");
  try{
   const done=await ask<{hangupRequested:boolean}>(
    "/api/askanus/max/calling/sessions/"+encodeURIComponent(id)+"/control",
    put({action:"hangup"},"POST"));
   if(done.hangupRequested){
    setMessage("SignalWire האט באשטעטיגט דעם אויפהענג־באפעל.");
    setHistory(xs=>xs.map(x=>x.id===id?{...x,status:"completed"}:x));
   }
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען; האק אראפ אויפן טעלעפאן.")}
  finally{setBusy(false)}
 };
 const beginEdit=(c:Call)=>{
  setEditing(c.id);setEditCase(c.caseId);setEditOutcome(c.outcome);
  setEditMood(c.mood);setEditNote(c.note);
 };
 const saveEdit=async()=>{
  if(!editing)return;
  setBusy(true);setError("");
  try{
   const updated=await ask<Call>("/api/askanus/max/calling/sessions/"+encodeURIComponent(editing),
    put({caseId:editCase,outcome:editOutcome,mood:editMood,note:editNote},"PATCH"));
   setHistory(xs=>xs.map(x=>x.id===updated.id?updated:x));
   setMessage("די אינפארמאציע איז איבערגעשריבן.");setEditing(null);
   if(editCase){setCaseId(editCase);setSkip(false)}
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setBusy(false)}
 };
 const saveHold=async()=>{
  setBusy(true);setError("");setMessage("");
  try{
   await savePreference(prefs?.lastCaseId??null,holdMode,holdMessage);
   setMessage("דיין האלט־מעלדונג איז אפגעהיטן; זי איז נאכנישט אקטיוו אויפן טעלעפאן.");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setBusy(false)}
 };
 return <section id="max-voice-calling" dir="rtl" lang="yi"
  className="rounded-xl border bg-card p-4 sm:p-6 space-y-5 scroll-mt-24">
  <div>
   <h3 className="font-bold text-lg flex items-center gap-2">
    <PhoneCall className="h-5 w-5"/> רופן — קאמפיין און רוף־געשיכטע
   </h3>
   <p className="text-sm text-muted-foreground">
    {prefs?.providerReady
     ?"SignalWire איז שוין קאנעקטעד און די נייע רופן זענען אקטיוו פאר דיין באשטעטיגטן נומער. קיין שמועסן ווערן נישט רעקארדירט."
     :prefs?.signalwireConnected
      ?"SignalWire איז שוין קאנעקטעד און וועריפיצירט! דער נייער אויטאמאטישער רופן־קנעפל איז נאך פארשפארט ביז די באשטעטיגטע רופן־אקטיוואציע."
      :"די רופן־צוגרייטונג איז פאראן; דער SignalWire־מצב קען דערווייל נישט באשטעטיגט ווערן."}
   </p>
  </div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {message&&<p role="status" className="text-sm font-semibold">{message}</p>}
  <MaxCampaignAssignments onPrepared={p=>{void selectAssignedCall(p)}}/>
  {callingMode&&<div className="rounded-lg border p-3 space-y-2">
   <strong>Calling Mode — {callingMode.campaignTitle}</strong>
   <p>{callingMode.lead.displayName}: <span dir="ltr">{callingMode.lead.phone}</span></p>
   <p className="text-sm text-muted-foreground">{prefs?.providerReady
    ?"SignalWire קען שוין רופן דיין באשטעטיגטן טעלעפאן און דערנאך דעם נדבן."
    :"SignalWire איז שוין קאנעקטעד; דער נייער אויטאמאטישער רוף איז נאך נישט אקטיווירט."}</p>
  </div>}
  <div className="rounded-xl border p-3 space-y-3">
   <p className="font-semibold">
    {prefs?.lastCaseId&&cases.some(x=>x.id===prefs.lastCaseId)
     ?"דו האסט לעצטנס געארבעט אויפן פראיעקט: "+cases.find(x=>x.id===prefs.lastCaseId)?.title
     :"ביטע וועל אויס א קאמפיין צו עפענען."}
   </p>
   <p className="text-xs text-muted-foreground">
    דרוק 1 — אויסקלייבן א קאמפיין; 2 — סקיפן; 3 — הערן אלע אפציעס.
   </p>
   <div className="grid grid-cols-3 gap-2">
    <Button type="button" variant="outline" onClick={()=>setSkip(false)}>1 · קאמפיין</Button>
    <Button type="button" variant="outline" onClick={()=>{setSkip(true);setMessage("דעם רוף קען מען שפעטער צוטיילן.");}}>2 · סקיפן</Button>
    <Button type="button" variant="outline" onClick={()=>setHelp(v=>!v)}>3 · אפציעס</Button>
   </div>
   {!skip&&<select aria-label="פראיעקט אויסקלייבן" value={selectedProject?.id??""}
    onChange={e=>setCaseId(e.target.value?Number(e.target.value):null)}
    className="w-full h-11 rounded-lg border bg-background px-2">
    <option value="">וועל אויס א קאמפיין</option>
    {cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
   </select>}
   {skip?<p className="text-sm">אן קאמפיין — מ'קען עס שפעטער פארבינדן און אלעמאל טוישן.</p>
    :projectName?<p className="text-sm">די ארבעט איז אויפן קאמפיין: <strong>{projectName}</strong></p>:null}
   {help&&<div className="rounded-lg bg-muted/30 p-3 text-sm space-y-1">
    <p>בשעת'ן רוף: 1 — אויפהייבן ווארטנדיגן רוף; 2 — האלטן אדער צוריקנעמען;
    3 — העכער; 4 — שטילער; 6 — דריי־וועג (מאקסימום 3 מענטשן).</p>
    <p>5 — א זיכערער אונטערמעניו: 1 — אראפהאקן; 2 — א צווייטן נומער רופן.
    0 — הערן די אפציעס.</p>
    <p className="text-xs">די קנעפלעך זענען נאך נישט טעלעפאניש אקטיוו; די שטארקייט פונעם פיזישן טעלעפאן דארף מען אויפן טעלעפאן אליין טוישן.</p>
   </div>}
  </div>
  <div className="rounded-xl border p-3 space-y-3">
   <p className="font-semibold">טעלעפאן־נומער צוגרייטן</p>
   <div className="grid grid-cols-3 gap-2">
    <select value={country} onChange={e=>setCountry(e.target.value as "US"|"CA")}
     aria-label="לאנד" className="rounded-lg border bg-background px-2 col-span-1">
     <option value="US">USA</option><option value="CA">Canada</option>
    </select>
    <Input className="col-span-2" value={number} onChange={e=>setNumber(e.target.value)}
     placeholder="+1 212 555 0123" type="tel" aria-label="טעלעפאן נומער"/>
   </div>
   <Button onClick={()=>void prepareCall()} disabled={busy||!number.trim()}>
    <Save className="h-4 w-4 ml-1"/> {prefs?.providerReady?"רוף יעצט דורך SignalWire":"צוגרייטן רוף — נישט אנרופן"}
   </Button>
   <p className="text-xs text-muted-foreground">אמעריקא און קאנאדע האבן ביידע +1; א ריכטיגע לאנד־איבערפרואוו דורכן פראוויידער וועט מען דארפן פארן אמת'ן רוף.</p>
  </div>
  <div className="rounded-xl border p-3 space-y-3">
   <h4 className="font-semibold flex items-center gap-2"><Volume2 className="h-4 w-4"/> וואס צו זאגן ביים האלטן</h4>
   <select value={holdMode} onChange={e=>setHoldMode(e.target.value as Prefs["holdMode"])}
    className="w-full h-11 rounded-lg border bg-background px-2">
    <option value="gavhah">גבהה דיפאלט־מעלדונג</option>
    <option value="message">מיין אייגענע מעלדונג</option>
   </select>
   {holdMode==="message"&&<Textarea value={holdMessage} onChange={e=>setHoldMessage(e.target.value)}
    placeholder="א דאנק פארן ווארטן. מיר זענען באלד צוריק ביים טעלעפאן."
    maxLength={700} rows={3}/>}
   <Button variant="outline" onClick={()=>void saveHold()} disabled={busy}>
    <Save className="h-4 w-4 ml-1"/> אפהיטן מעלדונג
   </Button>
   <p className="text-xs text-muted-foreground">פאר אייגענע מוזיק אדער ריקארדירונג קענסטו עס צוגרייטן אינעם <a className="underline" href="/api/admin/max/ivr-editor/voice-studio">עולם החסד שטימע־עדיטער</a>. די האלט־אודיא איז נאכנישט פארבונדן צום קאל־פראוויידער.</p>
  </div>
  <div className="space-y-3">
   <h4 className="font-semibold">רוף־אינפארמאציע ({history.length})</h4>
   {!history.length&&<p className="text-sm text-muted-foreground">דערווייל קיין צוגעגרייטע רופן.</p>}
   {history.map(c=><div key={c.id} className="border rounded-xl p-3 space-y-2">
    <p className="text-sm font-medium" dir="ltr">{c.number} · {c.direction}</p>
    <p className="text-xs text-muted-foreground">
     {c.status==="prepared"?"צוגעגרייט — נישט גערופן":c.status}
     {" · "+new Date(c.createdAt).toLocaleString()}
     {" · "+(c.durationSeconds===null?"געדויער אומבאקאנט":c.durationSeconds+" סעקונדעס")}
     {" · "+(cases.find(x=>x.id===c.caseId)?.title||"אן קאמפיין")}
    </p>
    {c.note&&<p className="text-sm whitespace-pre-wrap">{c.note}</p>}
    {prefs?.providerReady&&["initiating","ringing","in_progress"].includes(c.status)&&
     <Button type="button" size="sm" variant="destructive" disabled={busy}
      onClick={()=>void hangup(c.id)}>
      <PhoneCall className="h-4 w-4 ml-1"/> אראפהאקן דורך SignalWire
     </Button>}
    {editing===c.id?<div className="space-y-2">
     <select className="w-full rounded-lg border p-2 bg-background" value={editCase??""}
      onChange={e=>setEditCase(e.target.value?Number(e.target.value):null)}
      aria-label="רוף צוטיילן">
      <option value="">אן קאמפיין</option>
      {cases.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}
     </select>
     <select className="w-full rounded-lg border p-2 bg-background" value={editOutcome}
      onChange={e=>setEditOutcome(e.target.value)} aria-label="אויסגאנג">
      {outcomes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
     </select>
     <select className="w-full rounded-lg border p-2 bg-background" value={editMood}
      onChange={e=>setEditMood(e.target.value)} aria-label="שטימונג">
      <option value="">שטימונג נישט אריינגעלייגט</option>
      <option value="friendly">פריינטליך</option><option value="neutral">נייטראל</option>
      <option value="busy">פארנומען</option><option value="uncomfortable">אומבאקוועם</option>
      <option value="uninterested">נישט אינטערעסירט</option><option value="other">אנדערש</option>
     </select>
     <Textarea value={editNote} onChange={e=>setEditNote(e.target.value)}
      placeholder="נאטיץ איבער דעם רוף" rows={3} maxLength={2500}/>
     <div className="flex gap-2">
      <Button onClick={()=>void saveEdit()} disabled={busy}>אפהיטן</Button>
      <Button variant="outline" onClick={()=>setEditing(null)}>צוריק</Button>
     </div>
    </div>:<Button variant="outline" size="sm" onClick={()=>beginEdit(c)}>
     עדיטן / צוטיילן א קאמפיין
    </Button>}
   </div>)}
  </div>
 </section>;
}
