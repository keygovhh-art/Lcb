import {useEffect,useRef,useState} from "react";
import {useAuth} from "@/context/auth-context";
import {Button} from "@/components/ui/button";

type Phase="idle"|"recording"|"preview"|"uploading"|"done";
export function ForumVoiceRecorder({onPublished}:{onPublished?:()=>void}){
  const {isAuthenticated}=useAuth();
  const [phase,setPhase]=useState<Phase>("idle");
  const [error,setError]=useState("");
  const [url,setUrl]=useState("");
  const [publishedId,setPublishedId]=useState<number|null>(null);
  const rec=useRef<MediaRecorder|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const pieces=useRef<BlobPart[]>([]);
  const finished=useRef<Blob|null>(null);

  useEffect(()=>()=>{rec.current?.state==="recording"&&rec.current.stop();
    stream.current?.getTracks().forEach(track=>track.stop());},[]);
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
  function reset(){
    if(rec.current?.state==="recording")rec.current.stop();
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    finished.current=null;pieces.current=[];
    setUrl("");setError("");setPhase("idle");setPublishedId(null);
  }
  async function start(){
    setError("");
    if(!isAuthenticated){setError("קודם דארף מען זיין אריינגעשריבן אין גבהה.");return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      setError("דער בראוזער קען נישט רעקארדירן. נוץ א בראוזער מיט מייקראפאן־ערלויבעניש.");return;
    }
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      stream.current=s;pieces.current=[];
      const type=["audio/webm;codecs=opus","audio/webm","audio/ogg"].find(x=>MediaRecorder.isTypeSupported(x));
      const r=new MediaRecorder(s,type?{mimeType:type}:undefined);rec.current=r;
      r.ondataavailable=event=>{if(event.data.size)pieces.current.push(event.data)};
      r.onerror=()=>setError("די רעקארדירונג איז נישט געלונגען.");
      r.onstop=()=>{
        s.getTracks().forEach(t=>t.stop());stream.current=null;
        const b=new Blob(pieces.current,{type:r.mimeType||"audio/webm"});finished.current=b;
        if(!b.size){setError("קיין שטימע איז נישט אויפגענומען געווארן.");setPhase("idle");return;}
        setUrl(URL.createObjectURL(b));setPhase("preview");
      };
      r.start(500);setPhase("recording");
    }catch{setError("דער מייקראפאן איז נישט צוטריטליך.");setPhase("idle");}
  }
  function stop(){
    if(rec.current?.state==="recording")rec.current.stop();
  }
  async function publish(){
    const b=finished.current;
    if(!b||phase!=="preview")return;
    if(b.size>4*1024*1024){setError("די רעקארדירונג איז צו גרויס — מאקסימום 4 MB.");return;}
    setPhase("uploading");setError("");
    try{
      const base64=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error("קיין לייענען"));
        reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
        reader.readAsDataURL(b);
      });
      const response=await fetch("/api/discussions/voice",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({base64,mime:b.type.split(";")[0]||"audio/webm"})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||"פובליצירן איז נישט געלונגען");
      setPublishedId(data.id);setPhase("done");onPublished?.();
    }catch(e){setError(e instanceof Error?e.message:"פובליצירן איז נישט געלונגען");setPhase("preview");}
  }
  return <section dir="rtl" className="rounded-xl border bg-card p-5 space-y-3" aria-label="שטימע שמועס">
    <h2 className="font-bold text-lg">🎙️ אריינרעדן א שמועס</h2>
    <p className="text-sm text-muted-foreground">רעקארדיר, הער איבער, אדער רעד נאכאמאל. נאר ווען דו דרוקסט „פובליצירן“ גייט דער שמועס גלייך ארויף אויפן פובליק בלאט.</p>
    {phase==="idle"&&<Button type="button" onClick={start}>רעקארדירן א שמועס</Button>}
    {phase==="recording"&&<div className="flex flex-wrap items-center gap-2">
      <span aria-live="polite">דער מייקראפאן רעקארדירט...</span>
      <Button type="button" onClick={stop}>פארענדיגן רעקארדירונג</Button>
      <Button type="button" variant="outline" onClick={reset}>אפברעכן</Button>
    </div>}
    {(phase==="preview"||phase==="uploading"||phase==="done")&&<>
      {url&&<audio controls preload="metadata" src={url} className="w-full" aria-label="הער איבער דיין שמועס"/>}
      {phase==="preview"&&<div className="flex flex-wrap gap-2">
        <Button type="button" disabled={false} onClick={publish}>פובליצירן יעצט</Button>
        <Button type="button" variant="outline" onClick={()=>{reset();void start()}}>איבעררעדן</Button>
        <Button type="button" variant="outline" onClick={reset}>אויסמעקן / אפברעכן</Button>
      </div>}
      {phase==="uploading"&&<p aria-live="polite">מען פובליצירט דעם שמועס...</p>}
      {phase==="done"&&<div className="flex flex-wrap gap-2 items-center">
        <span role="status">דער שמועס איז פובליצירט אויפן וועבזייט.</span>
        <a className="underline" href={`/forum/${publishedId}`}>עפענען שמועס</a>
        <Button type="button" variant="outline" onClick={reset}>ווייטער — א נייע שמועס</Button>
      </div>}
    </>}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
export function ForumVoicePlayer({id}:{id:number}){
  return <audio className="w-full" controls preload="none" src={`/api/discussions/${id}/voice`} aria-label="הער דעם רעקארדירטן שמועס"/>;
}
