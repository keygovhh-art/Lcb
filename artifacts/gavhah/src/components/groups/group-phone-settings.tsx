import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type PhoneProfile = {
  introText:string|null;introLanguage:string|null;hasAudio:boolean;
  audioUrl:string|null;memberStatsPublic:boolean;
  memberCount:string|null;savedCount:string|null;
  saved:boolean;joined:boolean;canManage:boolean;
};
type Recorder = {
  context:AudioContext;stream:MediaStream;source:MediaStreamAudioSourceNode;
  node:ScriptProcessorNode;silent:GainNode;parts:Float32Array[];sampleRate:number;
};
function pcmWav16k(parts:Float32Array[],sampleRate:number) {
 const size=parts.reduce((n,p)=>n+p.length,0);
 const joined=new Float32Array(size);
 let offset=0;
 for(const part of parts){joined.set(part,offset);offset+=part.length;}
 const outSamples=Math.min(16000*26,Math.floor(joined.length*16000/sampleRate));
 const bytes=new ArrayBuffer(44+outSamples*2);
 const view=new DataView(bytes);
 const mark=(pos:number,text:string) => {for(let i=0;i<text.length;i++)view.setUint8(pos+i,text.charCodeAt(i));};
 mark(0,"RIFF");view.setUint32(4,36+outSamples*2,true);mark(8,"WAVE");mark(12,"fmt ");
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 mark(36,"data");view.setUint32(40,outSamples*2,true);
 for(let i=0;i<outSamples;i++){
  const s=Math.max(-1,Math.min(1,joined[Math.min(size-1,Math.floor(i*sampleRate/16000))]||0));
  view.setInt16(44+i*2,s<0?s*32768:s*32767,true);
 }
 return new Blob([bytes],{type:"audio/wav"});
}
async function toBase64(blob:Blob) {
 const bytes=new Uint8Array(await blob.arrayBuffer());
 let encoded="";
 for(let i=0;i<bytes.length;i+=12000) encoded+=String.fromCharCode(...bytes.subarray(i,i+12000));
 return btoa(encoded);
}
async function apiJson(url:string,method:string,data?:unknown){
 const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},credentials:"same-origin",body:data===undefined?undefined:JSON.stringify(data)});
 if(!response.ok)throw Error("Request failed: "+response.status);
 return response.json();
}
/** One recorder is used for optional creation-intro capture and for group edit. */
export function GroupIntroRecorder({groupId,onReady}:{
 groupId?:number;onReady?:(value:string|null)=>void;
}) {
 const {toast}=useToast();
 const [capturing,setCapturing]=useState(false);
 const [duration,setDuration]=useState(0);
 const [preview,setPreview]=useState<string|null>(null);
 const [fileData,setFileData]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const active=useRef<Recorder|null>(null);
 const clock=useRef<ReturnType<typeof setInterval>|null>(null);
 const autoStop=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [recordingKey,setRecordingKey]=useState(0);
 const stop=useCallback(async()=>{
  const r=active.current;if(!r)return;active.current=null;
  if(clock.current)clearInterval(clock.current);
  if(autoStop.current)clearTimeout(autoStop.current);
  r.node.onaudioprocess=null;r.node.disconnect();r.source.disconnect();r.silent.disconnect();
  for(const t of r.stream.getTracks())t.stop();
  await r.context.close().catch(()=>{});
  setCapturing(false);
  const wav=pcmWav16k(r.parts,r.sampleRate);
  if(wav.size<=44){toast({title:"No audio recorded",variant:"destructive"});return;}
  const url=URL.createObjectURL(wav);
  setPreview(last=>{if(last)URL.revokeObjectURL(last);return url;});
  const encoded=await toBase64(wav);
  setFileData(encoded);
  onReady?.(encoded);
 },[onReady,toast]);
 const start=async()=>{
  if(active.current)return;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   const context=new AudioContext();
   await context.resume();
   const source=context.createMediaStreamSource(stream);
   const node=context.createScriptProcessor(4096,1,1);
   const silent=context.createGain();silent.gain.value=0;
   const r:Recorder={context,stream,source,node,silent,parts:[],sampleRate:context.sampleRate};
   active.current=r;source.connect(node);node.connect(silent);silent.connect(context.destination);
   node.onaudioprocess=(event)=>{if(active.current!==r)return;r.parts.push(new Float32Array(event.inputBuffer.getChannelData(0)));};
   setDuration(0);setCapturing(true);
   clock.current=setInterval(()=>setDuration(d=>d+1),1000);
   autoStop.current=setTimeout(()=>{void stop();},25000);
  }catch{
   setCapturing(false);
   toast({title:"מייקראפאן נישט צוטריטלעך",description:"ערלויב דעם מייקראפאן אין פרוביר נאכאמאל.",variant:"destructive"});
  }
 };
 useEffect(()=>()=>{const r=active.current;if(r){for(const t of r.stream.getTracks())t.stop();r.node.disconnect();void r.context.close();}if(clock.current)clearInterval(clock.current);if(autoStop.current)clearTimeout(autoStop.current);},[]);
 const upload=async()=>{
  if(!groupId||!fileData)return;
  setBusy(true);
  try{
   await apiJson("/api/groups/"+groupId+"/hotline-audio","POST",{mime:"audio/wav",base64:fileData});
   setRecordingKey(k=>k+1);
   toast({title:"די רעקארדירונג איז געהיט פארן גרופ־האטליין"});
  }catch{toast({title:"די רעקארדירונג איז נישט געהיט געווארן",variant:"destructive"});}
  finally{setBusy(false);}
 };
 return (
  <div className="rounded-lg border p-3 space-y-3" dir="rtl">
   <p className="text-sm font-semibold">קורצע רעקארדירונג איבער דער גרופ (אפטיאנעל, ביז 25 סעקונדעס)</p>
   <p className="text-xs text-muted-foreground">פאר טעלעפאן־צוהערער: דער גרופ־נאמען און א קורצע באשרייבונג.</p>
   <div className="flex flex-wrap items-center gap-2">
    {!capturing?<Button type="button" variant="outline" onClick={()=>void start()}>רעקארדירן פונעם מייקראפאן</Button>:
      <Button type="button" variant="destructive" onClick={()=>void stop()}>ענדיגן רעקארדירונג ({duration}s)</Button>}
    {preview&&<audio key={recordingKey} src={preview} controls preload="metadata" className="max-w-full h-10" />}
    {fileData&&groupId&&<Button type="button" onClick={()=>void upload()} disabled={busy}>{busy?"היט אפ...":"היט אפ רעקארדירונג"}</Button>}
   </div>
   {fileData&&!groupId&&<p className="text-sm text-muted-foreground">די רעקארדירונג וועט ווערן געהיט ווען די גרופ ווערט געעפנט.</p>}
  </div>
 );
}
export function GroupPhoneSettings({groupId,canManage}:{
 groupId:number;canManage:boolean;
}) {
 const {toast}=useToast();
 const [profile,setProfile]=useState<PhoneProfile|null>(null);
 const [loading,setLoading]=useState(false);
 const [stats,setStats]=useState(false);
 const [saved,setSaved]=useState(false);
 const [introText,setIntroText]=useState("");
 const [language,setLanguage]=useState("yi");
 const refresh=useCallback(async()=>{
  const r=await fetch("/api/groups/"+groupId+"/hotline-profile",{credentials:"same-origin"});
  if(!r.ok)return;
  const p=await r.json() as PhoneProfile;
  setProfile(p);setStats(p.memberStatsPublic);setSaved(p.saved);setIntroText(p.introText||"");setLanguage(p.introLanguage||"yi");
 },[groupId]);
 useEffect(()=>{void refresh();},[refresh]);
 const action=async(fn:()=>Promise<unknown>)=>{
  setLoading(true);try{await fn();await refresh();toast({title:"דערהיינטיגט"});}
  catch{toast({title:"נישט געלונגען",variant:"destructive"});}finally{setLoading(false);}
 };
 return <section className="rounded-xl border bg-card p-4 space-y-3" dir="rtl">
  <h3 className="font-semibold">גרופ־האטליין און סעיוון</h3>
  <p className="text-sm text-muted-foreground">גרופ־נומער: <b>{groupId}</b>. סעיוון איז נישט דאס זעלבע ווי ווערן א מעמבער.</p>
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="outline" disabled={loading} onClick={()=>void action(async()=>{await apiJson("/api/groups/"+groupId+"/save",saved?"DELETE":"PUT");})}>
    {saved?"נעם אראפ פון געסעיווטע גרופס":"סעיוו גרופ"}
   </Button>
  </div>
  {profile?.hasAudio&&profile.audioUrl&&<div className="space-y-1"><p className="text-sm">רעקארדירונג פארן האטליין</p><audio src={profile.audioUrl} controls className="w-full max-w-md" /></div>}
  {profile?.memberStatsPublic&&<p className="text-sm">מעמבערס: {profile.memberCount} | געסעיווט: {profile.savedCount}</p>}
  {canManage&&<>
   <GroupIntroRecorder groupId={groupId}/>
   <label className="flex gap-2 items-center text-sm">
    <input type="checkbox" checked={stats} onChange={e=>setStats(e.target.checked)} />
    ערלויב ציבור צו זען/הערן וויפיל מעמבערס און געסעיווטע גרופס
   </label>
   <label className="block space-y-1 text-sm">קורצע באשרייבונג פארן טעלעפאן (אפטיאנעל)
    <textarea value={introText} onChange={e=>setIntroText(e.target.value.slice(0,1000))}
      className="w-full min-h-16 border rounded p-2 bg-background" />
   </label>
   <label className="block text-sm">שפראך פונעם אריינגעטייפטן טעקסט
    <select className="block mt-1 rounded border p-2 bg-background" value={language} onChange={e=>setLanguage(e.target.value)}>
     <option value="yi">אידיש</option><option value="en">ענגליש</option>
    </select>
   </label>
   <Button type="button" disabled={loading} onClick={()=>void action(async()=>{
    await apiJson("/api/groups/"+groupId+"/hotline-profile","PATCH",{memberStatsPublic:stats,introText,introLanguage:language});
   })}>היט אפ גרופ־האטליין סעטינגס</Button>
  </>}
 </section>;
}
