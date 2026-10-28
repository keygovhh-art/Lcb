import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

type Menu={path:string;label:string;kind:string;parent:string;depth:number};
type Saved={path:string;tts_text:string;audio_size:number|null;published_path:string|null;published_at:string|null;updated_at:string};
type StudioResponse={catalogue:Menu[];prompts:Saved[];provider:{state:string;approvedFolder:string|null};note:string};
type Effects={pitch:number;speed:number;warmth:number;clarity:number;echo:number;robot:boolean};
const original:Effects={pitch:0,speed:1,warmth:0,clarity:0,echo:0,robot:false};
const presets:Record<string,Effects>={
 normal:{...original},
 deep:{pitch:-4,speed:0.98,warmth:7,clarity:-1,echo:0,robot:false},
 bright:{pitch:3,speed:1.02,warmth:-2,clarity:6,echo:0,robot:false},
 radio:{pitch:-1,speed:1,warmth:3,clarity:8,echo:0,robot:false},
 robot:{pitch:-1,speed:1,warmth:-3,clarity:2,echo:0,robot:true},
 space:{pitch:-2,speed:0.96,warmth:-2,clarity:3,echo:7,robot:false}
};
async function req(path:string,init?:RequestInit){
 const response=await fetch("/api/admin/yemot/voice-studio"+path,{
  cache:"no-store",credentials:"include",...init,
  headers:{"Content-Type":"application/json",...(init?.headers||{})}
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||"דער פארלאנג איז נישט געלונגען");
 return data;
}
function wavData(audio:AudioBuffer){
 const samples=audio.getChannelData(0),buf=new ArrayBuffer(44+samples.length*2);
 const view=new DataView(buf);
 const put=(n:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(n+i,s.charCodeAt(i));};
 put(0,"RIFF");view.setUint32(4,36+samples.length*2,true);put(8,"WAVE");put(12,"fmt ");
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*2,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,"data");
 view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const sample=Math.max(-1,Math.min(1,samples[i]));
  view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);
 }
 return new Blob([buf],{type:"audio/wav"});
}
async function processLocally(blob:Blob,fx:Effects){
 const sourceContext=new AudioContext();
 let input:AudioBuffer;
 try{input=await sourceContext.decodeAudioData(await blob.arrayBuffer());}
 finally{await sourceContext.close();}
 const rate=Math.pow(2,fx.pitch/12)*fx.speed;
 const duration=input.duration/rate+Math.min(fx.echo/10,0.8)+0.05;
 if(duration>170)throw Error("די רעקארדירונג איז צו לאנג פאר דעם שנעלן עדיטאר");
 const sr=16000;
 const offline=new OfflineAudioContext(1,Math.ceil(duration*sr),sr);
 const source=offline.createBufferSource();
 source.buffer=input;source.playbackRate.value=rate;
 const highpass=offline.createBiquadFilter();highpass.type="highpass";highpass.frequency.value=80;
 const warmth=offline.createBiquadFilter();warmth.type="lowshelf";warmth.frequency.value=280;warmth.gain.value=fx.warmth;
 const clarity=offline.createBiquadFilter();clarity.type="highshelf";clarity.frequency.value=2600;clarity.gain.value=fx.clarity;
 const compressor=offline.createDynamicsCompressor();compressor.threshold.value=-22;compressor.ratio.value=3;
 source.connect(highpass);highpass.connect(warmth);warmth.connect(clarity);clarity.connect(compressor);
 const dry=offline.createGain();dry.gain.value=fx.robot?0.8:0.98;compressor.connect(dry);dry.connect(offline.destination);
 if(fx.robot){
  const tremolo=offline.createGain(),osc=offline.createOscillator(),depth=offline.createGain();
  tremolo.gain.value=0.45;osc.type="square";osc.frequency.value=72;depth.gain.value=0.34;
  osc.connect(depth);depth.connect(tremolo.gain);compressor.connect(tremolo);
  tremolo.connect(offline.destination);osc.start(0);osc.stop(duration);
 }
 if(fx.echo>0){
  const delay=offline.createDelay(1.0),wet=offline.createGain();
  delay.delayTime.value=0.1+fx.echo*0.045;wet.gain.value=fx.echo/32;
  compressor.connect(delay);delay.connect(wet);wet.connect(offline.destination);
 }
 source.start(0);
 return wavData(await offline.startRendering());
}
async function asBase64(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error("Audio file could not be read"));
  reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
  reader.readAsDataURL(blob);
 });
}
export function YemotVoiceStudio(){
 const [data,setData]=useState<StudioResponse|null>(null);
 const [selected,setSelected]=useState("root");
 const [filter,setFilter]=useState("");
 const [tts,setTts]=useState("");
 const [recording,setRecording]=useState<Blob|null>(null);
 const [previewUrl,setPreviewUrl]=useState("");
 const [effects,setEffects]=useState<Effects>(original);
 const [busy,setBusy]=useState(false);
 const [active,setActive]=useState(false);
 const [monitor,setMonitor]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const recorder=useRef<MediaRecorder|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const micMonitor=useRef<AudioContext|null>(null);
 const effectsRef=useRef(effects);
 useEffect(()=>{effectsRef.current=effects;},[effects]);
 const reload=async()=>{
  const v=await req("") as StudioResponse;
  setData(v);return v;
 };
 useEffect(()=>{void reload().catch(e=>setError(e.message));return ()=>{
  recorder.current?.state==="recording"&&recorder.current.stop();
  stream.current?.getTracks().forEach(t=>t.stop());
  if(micMonitor.current)void micMonitor.current.close();
 };},[]);
 useEffect(()=>{setRecording(null);setPreviewUrl("");setEffects(original);setError("");setMessage("");},[selected]);
 useEffect(()=>{const item=data?.prompts.find(x=>x.path===selected);setTts(item?.tts_text||"");},[selected,data?.prompts]);
 useEffect(()=>{
  if(!recording){setPreviewUrl("");return;}
  const url=URL.createObjectURL(recording);setPreviewUrl(url);
  return ()=>URL.revokeObjectURL(url);
 },[recording]);
 const current=data?.catalogue.find(x=>x.path===selected);
 const saved=data?.prompts.find(x=>x.path===selected);
 const options=(data?.catalogue||[]).filter(x=>(x.path+" "+x.label).toLowerCase().includes(filter.toLowerCase()));
 const family=(data?.catalogue||[]).filter(x=>x.parent===selected);
 const stopMonitor=()=>{
  if(micMonitor.current){void micMonitor.current.close();micMonitor.current=null;}
  setMonitor(false);
 };
 const startMic=async()=>{
  setError("");setMessage("");
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
   setError("דער בראוזער שטיצט נישט מייקראפאן. נוץ Chrome אויף HTTPS אדער לאד ארויף א פייל.");return;
  }
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   stream.current=media;
   const type=["audio/webm;codecs=opus","audio/webm","audio/ogg"].find(x=>MediaRecorder.isTypeSupported(x));
   const rec=new MediaRecorder(media,type?{mimeType:type}:undefined),parts:BlobPart[]=[];
   rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
   rec.onstop=()=>{
    setRecording(new Blob(parts,{type:rec.mimeType||"audio/webm"}));
    media.getTracks().forEach(t=>t.stop());stream.current=null;stopMonitor();setActive(false);
    setMessage("די רעקארדירונג איז גרייט. קענסט יעצט טוישן דעם קול און איבערהערן.");
   };
   rec.onerror=()=>setError("די רעקארדירונג האט זיך נישט געלונגען.");
   recorder.current=rec;rec.start(1000);setActive(true);
  }catch{
   setError("מייקראפאן איז נישט ערלויבט. עפען Android Chrome → דער סייט → Site settings → Microphone → Allow; דערנאך פרוביר נאכאמאל.");
  }
 };
 const startMonitor=async()=>{
  if(!stream.current){setError("הייב קודם אן רעקארדירן.");return;}
  if(micMonitor.current){stopMonitor();return;}
  try{
   const ctx=new AudioContext(),src=ctx.createMediaStreamSource(stream.current);
   const high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),compress=ctx.createDynamicsCompressor();
   high.type="highpass";high.frequency.value=100;low.type="lowshelf";low.frequency.value=280;
   low.gain.value=effects.warmth;compress.threshold.value=-20;
   src.connect(high);high.connect(low);low.connect(compress);compress.connect(ctx.destination);
   micMonitor.current=ctx;setMonitor(true);
  }catch{setError("לייוו איבערהערן איז נישט געשטיצט אינעם בראוזער.");}
 };
 const work=async(fn:()=>Promise<void>)=>{
  setBusy(true);setError("");setMessage("");
  try{await fn();await reload();}catch(e){setError(e instanceof Error?e.message:"אומבאקאנטער פעלער");}
  finally{setBusy(false);}
 };
 const saveText=()=>void work(async()=>{
  await req("/"+encodeURIComponent(selected),{method:"PUT",body:JSON.stringify({ttsText:tts})});
  setMessage("דער ענגלישער TTS איז געהיטן פאר דעם מעניו. אויף א פארבונדענעם ימות־רוף ווערט עס געלייענט.");
 });
 const uploadAudio=()=>void work(async()=>{
  if(!recording)throw Error("רעקארדיר אדער לאד ארויף א פייל.");
  const changed=await processLocally(recording,effectsRef.current);
  if(changed.size>4*1024*1024)throw Error("דער אוידיא איז גרעסער ווי 4MB. נעם א קירצערן רעקארדירונג.");
  await req("/"+encodeURIComponent(selected)+"/audio",{
   method:"POST",body:JSON.stringify({mime:"audio/wav",base64:await asBase64(changed)})
  });
  setMessage("געהיטן אלס פריוואטע טיוטע. יעצט דרוק פובליצירן צום ימות־פאלדער.");
 });
 const publish=()=>void work(async()=>{
  if(!window.confirm("פובליצירן די איצטיגע רעקארדירונג צו ימות? קיין אנדערע עקסטענשאן ווערט נישט געטוישט."))return;
  const result=await req("/"+encodeURIComponent(selected)+"/publish",{
   method:"POST",body:JSON.stringify({confirm:"PUBLISH_TO_APPROVED_YEMOT_FOLDER"})
  });
  setMessage(result.verified?"ימות האט באשטעטיגט דעם פייל. דארף נאך פראבירן מיט אן אמת'ן רוף.":"דער פייל איז נישט באשטעטיגט.");
 });
 const speak=()=>{
  if(!("speechSynthesis" in window)){setError("דער בראוזער שטיצט נישט לאקאלן TTS.");return;}
  window.speechSynthesis.cancel();
  const v=new SpeechSynthesisUtterance(tts||current?.label||"Welcome to Gavhah");
  v.lang="en-US";v.rate=0.9;window.speechSynthesis.speak(v);
 };
 const update=(key:keyof Effects,value:number|boolean)=>setEffects(x=>({...x,[key]:value}));
 return <div dir="rtl" lang="yi" className="space-y-5 max-w-4xl">
  <div className="rounded-xl border p-4 space-y-2 bg-card">
   <h3 className="font-bold text-lg">🎙️ ימות קול־סטודיא — יעדע מעניו און קנעפל</h3>
   <p className="text-sm text-muted-foreground">
    די מעניוס ווערן גענומען פונעם אמתן גבהה־API. אריינלייגן ענגלישן TTS,
    רעקארדירן אויפן פלאץ, ארויפלאדן א פייל, און רעדאגירן דעם קול לאקאל אינעם בראוזער.
    קיין ElevenLabs, Fish אדער SignalWire ווערט נישט גענוצט.
   </p>
   <p className="text-xs">ימות־מצב: <strong>{data?.provider.state||"ליידט"}</strong> · באשטעטיגטער אודיא־פאלדער: <span dir="ltr">{data?.provider.approvedFolder&&/^\/[0-9]{1,3}$/.test(data.provider.approvedFolder)?data.provider.approvedFolder:"נאכנישט צוגעגרייט"}</span></p>
  </div>
  <div className="rounded-xl border p-4 space-y-3 bg-card">
   <label className="font-semibold block">טרעף אן אפטיילונג, מעניו אדער קנעפל</label>
   <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="זוך לויט נאמען אדער נומער..." />
   <select className="w-full border rounded-lg bg-background p-3" value={selected} onChange={e=>setSelected(e.target.value)}>
    {options.map(x=><option key={x.path} value={x.path}>{x.path==="root"?"/":"/"+x.path} — {x.label}</option>)}
    {!options.some(x=>x.path===selected)&&current&&<option value={selected}>{current.label}</option>}
   </select>
   <p className="text-sm">אויסגעקליבן: <strong>{current?.label||"Main menu"}</strong> · <code dir="ltr">{selected==="root"?"/":"/"+selected}</code></p>
   {family.length>0&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {family.map(x=><Button key={x.path} size="sm" variant="outline" onClick={()=>setSelected(x.path)}>
     {x.path.slice(-1)} — {x.label.slice(0,24)}
    </Button>)}
   </div>}
   {current&&current.parent&&<Button size="sm" variant="ghost" onClick={()=>setSelected(current.parent)}>צוריק צום העכערן מעניו</Button>}
  </div>
  <div className="rounded-xl border p-4 space-y-3 bg-card">
   <h4 className="font-bold">ענגלישער TTS פאר דעם מעניו</h4>
   <Textarea dir="ltr" lang="en" rows={4} maxLength={950} placeholder="Welcome. Press 1 for..." value={tts} onChange={e=>setTts(e.target.value)} />
   <div className="flex flex-wrap gap-2">
    <Button disabled={busy} onClick={saveText}>היטן TTS</Button>
    <Button disabled={busy} variant="outline" onClick={speak}><span lang="en">Preview English</span></Button>
    <Button variant="outline" onClick={()=>setTts("You selected "+(current?.label||"the main menu")+". Press zero to go back.")}>צוגרייטן א ענגלישן נוסח</Button>
   </div>
   <p className="text-xs text-muted-foreground">די בראוזער־הער־טעסט נוצט דעם לאקאלן Android TTS. אויפן טעלעפאן רעדט ימות'ס TTS.</p>
  </div>
  <div className="rounded-xl border p-4 space-y-3 bg-card">
   <h4 className="font-bold">אייגענע רעקארדירונג פאר דעם מעניו</h4>
   <div className="flex flex-wrap gap-2">
    {!active?<Button disabled={busy} onClick={()=>void startMic()}>🎙️ אנהייבן רעקארדירן</Button>:
     <Button variant="destructive" onClick={()=>recorder.current?.stop()}>⏹️ ענדיגן רעקארדירן</Button>}
    {active&&<Button variant="outline" onClick={()=>void startMonitor()}>{monitor?"אויסלעשן לייוו הערן":"🎧 לייוו איבערהערן"}</Button>}
    <label className="inline-flex cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium">
     📁 פייל ארויפלאדן
     <input className="sr-only" type="file" accept="audio/*,.wav,.mp3,.ogg,.webm" onChange={e=>{
      const f=e.target.files?.[0];if(f){setRecording(f);setMessage("פייל אויסגעקליבן — גרייט צום לאקאלן עדיטן.");}e.target.value="";
     }}/>
    </label>
   </div>
   {active&&<p className="text-xs">רעקארדירונג לויפט. פאר לייוו איבערהערן נוץ העדפאונס כדי אויסצומיידן א פידבעק.</p>}
   {previewUrl&&<audio controls preload="metadata" className="w-full" src={previewUrl}/>}
   {!previewUrl&&!!saved?.audio_size&&<audio controls preload="none" className="w-full" src={"/api/admin/yemot/voice-studio/"+encodeURIComponent(selected)+"/audio"}/>}
   <h4 className="font-semibold">לאקאלער וואויס־טשענגער</h4>
   <div className="grid grid-cols-3 gap-2">
    {Object.keys(presets).map(k=><Button key={k} variant="outline" size="sm" onClick={()=>setEffects({...presets[k]})}>{k}</Button>)}
   </div>
   <div className="grid sm:grid-cols-2 gap-4">
    {([
     ["pitch","קול־הייך", -8,8,1],["speed","שנעלקייט",0.7,1.3,0.05],
     ["warmth","טיפקייט / ווארעמקייט",-12,12,1],["clarity","קלארקייט",-12,12,1],
     ["echo","עקא",0,10,1]
    ] as const).map(([key,label,min,max,step])=><label key={key} className="block text-sm">
     <span>{label}: <strong>{effects[key]}</strong></span>
     <input className="w-full" type="range" min={min} max={max} step={step}
      value={effects[key]} onChange={e=>update(key,Number(e.target.value))}/>
    </label>)}
   </div>
   <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={effects.robot} onChange={e=>update("robot",e.target.checked)}/> ראבאטישער קול־עפעקט
   </label>
   <p className="text-xs text-muted-foreground">די עפעקטן ארבעטן אינגאנצן אין דיין בראוזער. קול־הייך טוישט אויך אביסל די לענג פון דער רעקארדירונג. פאר א אמתן פראפעסיאנעלן formant/pitch-preserving טויש וואלט מען געדארפט א גרעסערן לאקאלן Audio-Processor.</p>
   <div className="flex flex-wrap gap-2">
    <Button disabled={busy||!recording} variant="outline" onClick={()=>void (async()=>{
     try{setBusy(true);const b=await processLocally(recording!,effects);setRecording(b);setEffects(original);setMessage("דער געענדערטער קול איז גרייט צום איבערהערן.");}
     catch(e){setError(e instanceof Error?e.message:"עדיטן נישט געלונגען");}
     finally{setBusy(false);}
    })()}>▶️ טוישן קול און איבערהערן</Button>
    <Button disabled={busy||!recording} onClick={uploadAudio}>היטן אודיא־טיוטע</Button>
    <Button disabled={busy||!saved?.audio_size||(data?.provider.state!=="live"||!/^\/[0-9]{1,3}$/.test(data.provider.approvedFolder||""))} variant="outline" onClick={publish}>פובליצירן צום ימות־האטליין</Button>
   </div>
   <p className="text-sm">פריוואטע אודיא־טיוטע: {saved?.audio_size?"יא, "+Math.round(saved.audio_size/1024)+" KB":"ניין"} · אויפן ימות־פאלדער: {saved?.published_path?"באשטעטיגט":"נאך נישט"}</p>
   <p className="text-xs text-muted-foreground">דער קנעפל „פובליצירן“ טוישט נאר דעם אודיא פאר דער אויסגעקליבענער מעניו־אפטיילונג. אן אן עקזיסטירנדן באשטעטיגטן ימות־פאלדער ווערט גארנישט געענדערט.</p>
  </div>
  {message&&<p role="status" className="text-sm text-green-700">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  <Button variant="outline" onClick={()=>void reload().catch(e=>setError(e.message))}>דערפרישן קול־סטודיא</Button>
 </div>;
}
