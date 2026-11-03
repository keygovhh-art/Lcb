import {useEffect,useRef,useState} from "react";
import {Bell,PhoneIncoming,Volume2,Save,Play} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
type Settings={
 enabled:boolean;availability:"auto"|"unavailable";publicDisplayName:string;
 publicPurpose:string;unavailableMessage:string;shareCallbackNumber:boolean;
 callbackNumber:string;unavailableAudioEnabled:boolean;hasUnavailableAudio:boolean;
};
type Alert={id:string;kind:"incoming"|"busy"|"yemot"|"voicemail"|"missed";
 phoneEnding:string;createdAt:string;isRead:boolean;status:string;purpose:string};
type Voicemail={id:string;phoneEnding:string;purpose:string;durationSeconds:number|null;recordedAt:string};
const def:Settings={
 enabled:false,availability:"auto",publicDisplayName:"",publicPurpose:"",
 unavailableMessage:"",shareCallbackNumber:false,callbackNumber:"",
 unavailableAudioEnabled:false,hasUnavailableAudio:false
};
const request=async<T,>(url:string,init?:RequestInit):Promise<T>=>{
 const r=await fetch(url,{credentials:"include",cache:"no-store",...init});
 const v=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(typeof v.error==="string"?v.error:"דער פארלאנג איז נישט געלונגען");
 return v as T;
};
const post=(body:unknown,method="POST"):RequestInit=>({
 method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
});
export function MaxReturnCallsPanel(){
 const [settings,setSettings]=useState<Settings>(def);
 const [alerts,setAlerts]=useState<Alert[]>([]);
 const [voices,setVoices]=useState<Voicemail[]>([]);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const [chimeOn,setChimeOn]=useState(false);
 const [playing,setPlaying]=useState<string|null>(null);
 const ref=useRef<AudioContext|null>(null);
 const seen=useRef(new Set<string>());
 const started=useRef(Date.now());
 const patch=(p:Partial<Settings>)=>setSettings(s=>({...s,...p}));
 useEffect(()=>{
  let alive=true;
  void Promise.all([
   request<Settings>("/api/askanus/max/return-calls/preferences"),
   request<Alert[]>("/api/askanus/max/return-calls/alerts"),
   request<Voicemail[]>("/api/askanus/max/return-calls/voicemails")
  ]).then(([p,a,v])=>{
   if(!alive)return;
   setSettings({...def,...p});setAlerts(a);setVoices(v);
   for(const row of a)seen.current.add(row.id);
  }).catch(e=>{if(alive)setError(e.message)});
  return()=>{alive=false;ref.current?.close().catch(()=>{})};
 },[]);
 useEffect(()=>{
  if(!settings.enabled)return;
  const heartbeat=()=>{
   if(document.visibilityState==="visible")void request(
    "/api/askanus/max/return-calls/heartbeat",post({})).catch(()=>{});
  };
  heartbeat();const timer=window.setInterval(heartbeat,18000);
  return()=>window.clearInterval(timer);
 },[settings.enabled]);
 useEffect(()=>{
  if(!settings.enabled)return;
  const refresh=async()=>{
   try{
    const a=await request<Alert[]>("/api/askanus/max/return-calls/alerts");
    const fresh=a.filter(x=>!seen.current.has(x.id)&&
      new Date(x.createdAt).getTime()>=started.current&&
      ["incoming","busy"].includes(x.kind));
    for(const item of a)seen.current.add(item.id);
    setAlerts(a);
    if(chimeOn&&fresh.length&&ref.current){
     // Exactly one short chime, never read keypad options into an ongoing call.
     const ctx=ref.current;
     const osc=ctx.createOscillator(),gain=ctx.createGain();
     osc.type="sine";osc.frequency.setValueAtTime(820,ctx.currentTime);
     gain.gain.setValueAtTime(.001,ctx.currentTime);
     gain.gain.linearRampToValueAtTime(.13,ctx.currentTime+.03);
     gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.45);
     osc.connect(gain);gain.connect(ctx.destination);
     osc.start();osc.stop(ctx.currentTime+.5);
    }
   }catch{}
  };
  const timer=window.setInterval(()=>{void refresh()},4000);
  return()=>window.clearInterval(timer);
 },[settings.enabled,chimeOn]);
 const activateSound=async()=>{
  try{
   if(!ref.current)ref.current=new AudioContext();
   await ref.current.resume();
   setChimeOn(true);setNotice("דער איין־מאליגער קלאנג איז אקטיוו אויף דעם טישל.");
  }catch{setError("דער בראוזער האט פארמאכט די קלאנג־דערלויבעניש.")}
 };
 const save=async()=>{
  setSaving(true);setError("");
  try{
   await request("/api/askanus/max/return-calls/preferences",post(settings,"PUT"));
   setNotice("די צוריק־רוף איינשטעלונגען זענען אפגעהיטן.");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setSaving(false)}
 };
 const upload=async(file?:File)=>{
  if(!file)return;
  if(file.size>3_900_000){setError("די רעקארדירונג דארף זיין אונטער 4 MB.");return;}
  setSaving(true);setError("");
  try{
   const base64=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error("נישט געקענט לייענען דעם פייל"));
    reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
    reader.readAsDataURL(file);
   });
   await request("/api/askanus/max/return-calls/unavailable-audio",
    post({base64,mime:"audio/wav"}));
   patch({hasUnavailableAudio:true,unavailableAudioEnabled:true});
   setNotice("די אייגענע רעקארדירונג איז אפגעהיטן פאר אנאוועילעבל.");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setSaving(false)}
 };
 const removeAudio=async()=>{
  setSaving(true);setError("");
  try{
   await request("/api/askanus/max/return-calls/unavailable-audio",{method:"DELETE"});
   patch({hasUnavailableAudio:false,unavailableAudioEnabled:false});
   setNotice("די אלטע רעקארדירונג איז אראפגענומען.");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
  finally{setSaving(false)}
 };
 const readAlert=async(id:string)=>{
  try{
   await request("/api/askanus/max/return-calls/alerts/"+id+"/read",post({}));
   setAlerts(x=>x.map(a=>a.id===id?{...a,isRead:true}:a));
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
 };
 const refreshVoices=async()=>{
  try{setVoices(await request<Voicemail[]>("/api/askanus/max/return-calls/voicemails"))}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען")}
 };
 return <section dir="rtl" lang="yi" id="max-return-calls" className="rounded-xl border p-4 space-y-4">
  <h4 className="text-lg font-bold flex items-center gap-2">
   <PhoneIncoming className="h-5 w-5"/> צוריק־רופן צום עסקן
  </h4>
  <p className="text-sm text-muted-foreground">
   די זעלבע SignalWire־נומער קען דערקענען א צוריק־רוף פון א פריער אנגערופענעם נדבן.
   דער אנרופער קען דרוקן 1 פארבינדן אדער 2 איבערלאזן א שטימע־מעסעדזש.
   אלעס איז אויסגעשאלטן ביז דער פראוויידער־רוטע איז באשטעטיגט.
  </p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <label className="flex items-center gap-2">
   <input type="checkbox" checked={settings.enabled} onChange={e=>patch({enabled:e.target.checked})}/>
   <strong>דערלויבן צוריק־רופן צום מיין אקאונט</strong>
  </label>
  <label className="text-sm block space-y-1">מיין מצב
   <select className="w-full h-11 rounded-lg border bg-background px-2"
    value={settings.availability} onChange={e=>patch({availability:e.target.value as Settings["availability"]})}>
    <option value="auto">אויטאמאטיש — ווען איך בין אויפן טישל</option>
    <option value="unavailable">איך בין נישט אוועליבעל</option>
   </select>
  </label>
  <label className="block text-sm">נאמען וואס דער אנרופער זאל הערן
   <Input value={settings.publicDisplayName} maxLength={100}
    onChange={e=>patch({publicDisplayName:e.target.value})}
    placeholder="עסקנ'ס נאמען פארן שטימע־מעניו"/>
  </label>
  <label className="block text-sm">צוועק פונעם רוף
   <Input value={settings.publicPurpose} maxLength={150}
    onChange={e=>patch({publicPurpose:e.target.value})}
    placeholder="נאמען פון קאמפיין אדער צוועק"/>
  </label>
  <label className="block text-sm">מעלדונג ווען איך בין נישט אוועליבעל
   <Textarea rows={3} maxLength={600}
    value={settings.unavailableMessage}
    onChange={e=>patch({unavailableMessage:e.target.value})}
    placeholder="דער עסקן איז יעצט נישט אוועליבעל. ביטע לאזט א מעסעדזש."/>
  </label>
  <div className="rounded-lg border p-3 space-y-2">
   <strong className="text-sm">מיין אייגענע רעקארדירונג — ווען איך בין נישט אוועליבעל</strong>
   <input type="file" accept=".wav,audio/wav" aria-label="אפלאָדן שטימע רעקארדירונג"
    disabled={saving} onChange={e=>void upload(e.target.files?.[0])}/>
   <p className="text-xs text-muted-foreground">WAV, 16 kHz, איין קאנאל, 16-bit PCM, אונטער 4 MB.</p>
   {settings.hasUnavailableAudio&&<>
    <audio controls preload="none" src="/api/askanus/max/return-calls/unavailable-audio"/>
    <label className="flex items-center gap-2 text-sm">
     <input type="checkbox" checked={settings.unavailableAudioEnabled}
      onChange={e=>patch({unavailableAudioEnabled:e.target.checked})}/>
     נוצן די רעקארדירונג אויפן האטליין
    </label>
    <Button size="sm" variant="outline" disabled={saving}
     onClick={()=>void removeAudio()}>אויסמעקן רעקארדירונג</Button>
   </>}
  </div>
  <label className="block text-sm">אפציאנעלער טעלעפאן־נומער
   <Input type="tel" dir="ltr" value={settings.callbackNumber}
    onChange={e=>patch({callbackNumber:e.target.value})} placeholder="+1 845 555 0100"/>
  </label>
  <label className="flex items-center gap-2 text-sm">
   <input type="checkbox" checked={settings.shareCallbackNumber}
    onChange={e=>patch({shareCallbackNumber:e.target.checked})}/>
   פארליינען דעם נומער פארן אנרופער בלויז ווען איך בין נישט אוועליבעל
  </label>
  <Button disabled={saving} onClick={()=>void save()}>
   <Save className="h-4 w-4 ml-1"/> אפהיטן איינשטעלונגען
  </Button>
  <div className="border-t pt-3 space-y-2">
   <h5 className="font-semibold flex items-center gap-2"><Bell className="h-4 w-4"/> אנקומענדיגע רופן</h5>
   <Button size="sm" variant="outline" disabled={chimeOn}
    onClick={()=>void activateSound()}>
    <Volume2 className="h-4 w-4 ml-1"/> {chimeOn?"קלאנג אקטיוו":"אנצינדן איין־מאליגע קלאנג"}
   </Button>
   <p className="text-xs text-muted-foreground">
    אויב דו ביסט אינמיטן א רוף, ווערט געגעבן איין קלאנג און נישט פארגעליינט אלע קנעפלעך.
    אויפן טעלעפאן אליין קען מען נישט אריינרעדן אין א לעבעדיגן רוף אן א באזונדערע Conference־פארבינדונג.
   </p>
   {alerts.filter(x=>!x.isRead).length===0&&<p className="text-sm">נישטא קיין אומגעלייענטע רופן.</p>}
   {alerts.filter(x=>!x.isRead).slice(0,12).map(x=>
    <div key={x.id} className="rounded-lg border p-2 flex justify-between gap-3">
     <div className="text-sm">
      <strong>{x.kind==="incoming"?"א צוריק־רוף":x.kind==="busy"?"א רוף בשעת'ן שמועסן":
       x.kind==="yemot"?"א רוף בשעת ימות":x.kind==="voicemail"?"נייע שטימע־מעסעדזש":"פארפעלטער רוף"}</strong>
      <p>נומער ענדיגט מיט {x.phoneEnding}</p>
      <p className="text-xs text-muted-foreground">{new Date(x.createdAt).toLocaleString()}</p>
     </div>
     <Button size="sm" variant="outline" onClick={()=>void readAlert(x.id)}>געלייענט</Button>
    </div>
   )}
  </div>
  <div className="border-t pt-3 space-y-2">
   <div className="flex justify-between items-center gap-2">
    <strong>שטימע־מעסעדזשעס</strong>
    <Button size="sm" variant="outline" onClick={()=>void refreshVoices()}>דערפרישן</Button>
   </div>
   {voices.length===0&&<p className="text-sm">נאך נישטא קיין מעסעדזשעס.</p>}
   {voices.slice(0,15).map(v=>
    <div key={v.id} className="rounded-lg border p-3 space-y-2">
     <p className="text-sm">נומער ענדיגט מיט {v.phoneEnding}. {v.purpose}</p>
     <p className="text-xs text-muted-foreground">{new Date(v.recordedAt).toLocaleString()} · {v.durationSeconds??"?"} סעקונדעס</p>
     {playing===v.id?<audio controls autoPlay
      src={"/api/askanus/max/return-calls/voicemails/"+v.id+"/audio"}/>:
      <Button size="sm" variant="outline" onClick={()=>setPlaying(v.id)}>
       <Play className="h-4 w-4 ml-1"/> אויסהערן
      </Button>}
    </div>)}
  </div>
 </section>;
}
