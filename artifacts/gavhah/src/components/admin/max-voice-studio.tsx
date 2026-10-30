import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

/** MAX / SignalWire only. All saved audio is private and never alters live routes. */
type Entry={path:string;label:string;guide:string};
type Draft={path:string;yiddish_script:string;english_tts:string;audio_size:number|null};
type ResponseData={catalogue:Entry[];drafts:Draft[];
 line:{number:string;legacyExtension:string;routeAudit:string;cutoverEnabled:boolean;
 migrationStage:string;recordedCallTests:number};publicationEnabled:boolean;note:string};
type Effect={pitch:number;speed:number;warmth:number;clarity:number;echo:number};
const plain:Effect={pitch:0,speed:1,warmth:0,clarity:0,echo:0};
const styles:Record<string,Effect>={
 "נארמאל":plain,"טיף":{pitch:-4,speed:.96,warmth:6,clarity:-1,echo:0},
 "קלאר":{pitch:1,speed:1.03,warmth:0,clarity:6,echo:0},
 "ראדיא":{pitch:-2,speed:1,warmth:4,clarity:5,echo:0},
 "רעזאנאנץ":{pitch:-3,speed:.94,warmth:2,clarity:1,echo:4}
};
const valid=(p:string)=>p==="root"||/^[1-9][0-9]{0,15}$/.test(p);
async function req(path:string,init?:RequestInit){
 const r=await fetch("/api/admin/max/voice-studio"+path,{
  credentials:"include",cache:"no-store",...init,
  headers:{"Content-Type":"application/json",...(init?.headers||{})}
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"די אקציע איז נישט געלונגען");
 return data;
}
function wave(audio:AudioBuffer){
 const x=audio.getChannelData(0),b=new ArrayBuffer(x.length*2+44),v=new DataView(b);
 const ascii=(i:number,t:string)=>{for(let j=0;j<t.length;j++)v.setUint8(i+j,t.charCodeAt(j));};
 ascii(0,"RIFF");v.setUint32(4,b.byteLength-8,true);ascii(8,"WAVE");ascii(12,"fmt ");
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,audio.sampleRate,true);v.setUint32(28,audio.sampleRate*2,true);
 v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,"data");
 v.setUint32(40,x.length*2,true);
 for(let j=0;j<x.length;j++){const a=Math.max(-1,Math.min(1,x[j]));v.setInt16(44+j*2,a<0?a*32768:a*32767,true);}
 return new Blob([b],{type:"audio/wav"});
}
async function renderPreview(source:Blob,fx:Effect){
 const decoder=new AudioContext();
 let buffer:AudioBuffer;
 try{buffer=await decoder.decodeAudioData(await source.arrayBuffer());}
 finally{await decoder.close();}
 const rate=Math.pow(2,fx.pitch/12)*fx.speed,duration=buffer.duration/rate+fx.echo/10+0.05;
 if(duration>160)throw Error("צו לאנג פארן קול־עדיטאר");
 const offline=new OfflineAudioContext(1,Math.ceil(duration*16000),16000);
 const input=offline.createBufferSource();input.buffer=buffer;input.playbackRate.value=rate;
 const high=offline.createBiquadFilter();high.type="highpass";high.frequency.value=85;
 const warmth=offline.createBiquadFilter();warmth.type="lowshelf";warmth.frequency.value=270;warmth.gain.value=fx.warmth;
 const clarity=offline.createBiquadFilter();clarity.type="highshelf";clarity.frequency.value=2600;clarity.gain.value=fx.clarity;
 const limiter=offline.createDynamicsCompressor();limiter.threshold.value=-20;limiter.ratio.value=3;
 input.connect(high);high.connect(warmth);warmth.connect(clarity);clarity.connect(limiter);
 limiter.connect(offline.destination);
 if(fx.echo>0){
  const delay=offline.createDelay(.8),gain=offline.createGain();
  delay.delayTime.value=.1+fx.echo*.05;gain.gain.value=fx.echo/30;
  limiter.connect(delay);delay.connect(gain);gain.connect(offline.destination);
 }
 input.start(0);
 return wave(await offline.startRendering());
}
function encodedAudio(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const file=new FileReader();file.onerror=()=>reject(Error("קען נישט ליינען דעם אודיא"));
  file.onload=()=>resolve(String(file.result||"").split(",")[1]||"");
  file.readAsDataURL(blob);
 });
}
export function MaxVoiceStudio(){
 const [data,setData]=useState<ResponseData|null>(null);
 const [path,setPath]=useState("root"),[custom,setCustom]=useState("");
 const [yi,setYi]=useState(""),[en,setEn]=useState("");
 const [recorded,setRecorded]=useState<Blob|null>(null);
 const [preview,setPreview]=useState<Blob|null>(null);
 const [previewUrl,setPreviewUrl]=useState("");
 const [fx,setFx]=useState<Effect>(plain);
 const [recording,setRecording]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
 const playback=useRef<HTMLAudioElement|null>(null),keepPosition=useRef(0);
 const current=data?.drafts.find(x=>x.path===path),entry=data?.catalogue.find(x=>x.path===path);
 const reload=async()=>setData(await req("") as ResponseData);
 useEffect(()=>{void reload().catch(e=>setError(e.message));return ()=>{
  if(recorder.current?.state==="recording")recorder.current.stop();
  stream.current?.getTracks().forEach(t=>t.stop());
 };},[]);
 useEffect(()=>{
  setYi(current?.yiddish_script||"");setEn(current?.english_tts||"");
  setRecorded(null);setFx(plain);setNotice("");setError("");
 },[path,data?.drafts]);
 useEffect(()=>{
  if(!recorded){setPreview(null);return;}
  let dead=false;
  if(playback.current)keepPosition.current=playback.current.currentTime||0;
  void renderPreview(recorded,fx).then(b=>{if(!dead)setPreview(b);})
   .catch(e=>{if(!dead)setError(e.message);});
  return ()=>{dead=true;};
 },[recorded,fx]);
 useEffect(()=>{
  if(!preview){setPreviewUrl("");return;}
  const url=URL.createObjectURL(preview);setPreviewUrl(url);
  return ()=>URL.revokeObjectURL(url);
 },[preview]);
 const run=async(action:()=>Promise<void>)=>{
  try{setBusy(true);setError("");setNotice("");await action();}
  catch(e){setError(e instanceof Error?e.message:"די אקציע איז נישט געלונגען");}
  finally{setBusy(false);}
 };
 async function startRecording(){
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error("מייקראפאן איז נישט צוטריטלעך אויפן בלעטערער");
  const mic=await navigator.mediaDevices.getUserMedia({audio:true});
  stream.current=mic;
  const types=["audio/webm;codecs=opus","audio/webm","audio/ogg"];
  const mime=types.find(x=>MediaRecorder.isTypeSupported(x));
  const rec=new MediaRecorder(mic,mime?{mimeType:mime}:undefined),parts:BlobPart[]=[];
  rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
  rec.onstop=()=>{
   setRecorded(new Blob(parts,{type:rec.mimeType||"audio/webm"}));
   stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setRecording(false);
  };
  recorder.current=rec;rec.start(1000);setRecording(true);
 }
 const saveText=()=>void run(async()=>{
  await req("/"+encodeURIComponent(path),{method:"PUT",body:JSON.stringify({yiddishScript:yi,englishTts:en})});
  await reload();setNotice("דער נוסח איז פריוואט אפגעהיטן; די לייוו־ליניע בלייבט אומגעענדערט.");
 });
 const saveAudio=()=>void run(async()=>{
  if(!preview)throw Error("קלויבט קודם א רעקארדירונג");
  if(preview.size>4*1024*1024)throw Error("דער אודיא איז גרעסער ווי 4 MB");
  await req("/"+encodeURIComponent(path)+"/audio",{
   method:"POST",body:JSON.stringify({mime:"audio/wav",base64:await encodedAudio(preview)})
  });
  await reload();setNotice("די געענדערטע רעקארדירונג איז אפגעהיטן אלס פריוואטע טיוטע. נישט לייוו.");
 });
 const speak=()=>{
  if(!en.trim()||!window.speechSynthesis){setError("לייגט אריין ענגלישן TTS־טעקסט");return;}
  window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(en);u.lang="en-US";
  window.speechSynthesis.speak(u);
 };
 return <section dir="rtl" className="space-y-5 rounded-lg border p-4">
  <div className="space-y-2">
   <h2 className="text-xl font-semibold">🎙️ עולם החסד MAX — קול־סטודיא</h2>
   <p className="text-sm text-muted-foreground">לויטן ישיבה־סטודיא: פאר יעדן מעניו און קנעפל אן אייגענעם נוסח, רעקארדירונג, TTS און קול־עפעקט. נאר עולם החסד — נישט קאמפיין סענטער, ימות אדער דער אלטער 55555.</p>
   <div className="rounded border p-3 text-sm">
    <p>ליניע: <b dir="ltr">{data?.line.number||"+16056558080"}</b> · אפגעהיטענער אלטער עקסטענשאן: <b>55555</b></p>
    <p>לייוו־אודיא־פובליצירן: <b>אויסגעלאשן ביזן פולן SignalWire־קאל־טעסט</b>.</p>
    <p>רוטינג־איבערקוק: {data?.line.routeAudit||"..."}, פיזישע מיגראציע־טעסטן: {data?.line.recordedCallTests??"?"}</p>
   </div>
  </div>
  <div className="space-y-2">
   <label className="text-sm font-medium">מעניו / עקסטענשאן</label>
   <select className="w-full rounded border bg-background p-2" value={path} onChange={e=>setPath(e.target.value)}>
    {data?.catalogue.map(x=><option key={x.path} value={x.path}>{x.path==="root"?"הויפט מעניו":x.path+" — "+x.label}</option>)}
    {!data?.catalogue.some(x=>x.path===path)&&<option value={path}>{path} — אייגענע עקסטענשאן</option>}
   </select>
   <div className="flex flex-wrap items-center gap-2">
    <Input className="max-w-[180px]" value={custom} onChange={e=>setCustom(e.target.value)}
     placeholder="למשל 121" dir="ltr"/>
    <Button variant="outline" onClick={()=>{
     if(!valid(custom)){setError("נאר ציפערן 1-9 אויפן אנהייב, ביז 16 ציפערן. 55555 איז באשיצט.");return;}
     if(custom==="55555"){setError("55555 געהערט צום אלטן סיסטעם");return;}
     setPath(custom);setCustom("");
    }}>עפענען אן עקסטענשאן</Button>
   </div>
   <p className="text-xs text-muted-foreground">דער פאלדער־וועג איז אייגנארטיג; יעדן עקסטענשאן קענט איר רעדאגירן באזונדער. 55555 ווערט נישט גערירט.</p>
  </div>
  <div className="rounded-md bg-muted/40 p-3 space-y-2">
   <p className="font-semibold">וואס זאל איך זאגן אויף דער עקסטענשאן?</p>
   <p className="whitespace-pre-wrap text-sm">{entry?.guide||"זאגט דעם נאמען פון דער אפטיילונג, דערנאך די ריכטיגע קנעפלעך וואס זענען יעצט באמת פארהאן. פאר א צוריק־קנעפל, זאגט ווי מען גייט צוריק. שרייבט נישט א פונקציע וואס איז נאך נישט געטעסט."}</p>
   <Button variant="outline" size="sm" onClick={()=>setYi(entry?.guide||"")}>איינלייגן דעם פארגעשריבענעם נוסח</Button>
  </div>
  <div className="space-y-2">
   <label className="text-sm font-medium">מיין אידישער נוסח</label>
   <Textarea rows={5} maxLength={1500} dir="rtl" value={yi} onChange={e=>setYi(e.target.value)}/>
   <label className="text-sm font-medium">ענגלישער TTS־נוסח (אויסגעשטעלט פאר די טעלעפאן־טעסט־שטימע)</label>
   <Textarea rows={3} maxLength={950} dir="ltr" value={en} onChange={e=>setEn(e.target.value)}/>
   <div className="flex flex-wrap gap-2">
    <Button disabled={busy} onClick={saveText}>היטן נוסח</Button>
    <Button variant="outline" onClick={speak}>🔊 הערן TTS־פריוויו</Button>
   </div>
   <p className="text-xs text-muted-foreground">TTS־פריוויו ווערט געשפילט דורך אייער בלעטערער; דאס איז נישט קיין באשטעטיגטע אידישע טעלעפאן־שטימע.</p>
  </div>
  <div className="space-y-3 rounded border p-3">
   <h3 className="font-semibold">רעקארדירן, ארויפלאדן און קול־ענדערן</h3>
   <div className="flex flex-wrap gap-2">
    {!recording?<Button variant="outline" onClick={()=>void run(startRecording)}>🎤 אנהייבן רעקארדירן</Button>
     :<Button variant="destructive" onClick={()=>recorder.current?.stop()}>⏹️ ענדיגן</Button>}
    <label className="inline-flex cursor-pointer items-center rounded border px-3 py-2 text-sm">
     📁 אודיא ארויפלאדן
     <input type="file" className="sr-only" accept="audio/*" onChange={e=>{
      const f=e.target.files?.[0];if(f)setRecorded(f);e.target.value="";
     }}/>
    </label>
   </div>
   <div className="flex flex-wrap gap-2">
    {Object.entries(styles).map(([name,e])=><Button key={name} size="sm" variant="outline" onClick={()=>setFx({...e})}>{name}</Button>)}
   </div>
   {([["pitch","הויכקייט",-6,6,.5],["speed","גיכקייט",.7,1.3,.02],
    ["warmth","ווארעמקייט",-8,8,1],["clarity","קלארקייט",-8,8,1],["echo","עקא",0,7,1]] as const)
    .map(([key,label,min,max,step])=><label key={key} className="flex items-center gap-3 text-sm">
     <span className="w-28">{label}: {fx[key]}</span>
     <input type="range" className="grow" min={min} max={max} step={step} value={fx[key]}
      onChange={e=>setFx(v=>({...v,[key]:Number(e.target.value)}))}/>
    </label>)}
   {previewUrl&&<audio ref={playback} src={previewUrl} controls className="w-full" onLoadedMetadata={e=>{
    const a=e.currentTarget;if(keepPosition.current>0&&keepPosition.current<a.duration){
     a.currentTime=keepPosition.current;keepPosition.current=0;
    }
   }}/>}
   {!previewUrl&&!!current?.audio_size&&<audio controls className="w-full" src={"/api/admin/max/voice-studio/"+encodeURIComponent(path)+"/audio"} preload="none"/>}
   <Button onClick={saveAudio} disabled={!preview||busy}>היטן געענדערטן אודיא־טיוטע</Button>
   <p className="text-xs text-muted-foreground">געזעיווט: {current?.audio_size?Math.ceil(current.audio_size/1024)+" KB":"נאך נישט"} · נאר פריוואטע טיוטע, נישט ארויסגעשפילט אויף דער ליניע.</p>
  </div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
