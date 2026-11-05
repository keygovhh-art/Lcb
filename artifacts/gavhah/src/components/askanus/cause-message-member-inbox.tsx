import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
type RequestRow={
 id:number;channel:"united"|"daily";purpose:"announcement"|"join";request_note:string;
 state:"requested"|"submitted"|"approved"|"rejected";created_at:string;review_note:string|null;
};
export function CauseMessageMemberInbox(){
 const [items,setItems]=useState<RequestRow[]>([]);
 const [texts,setTexts]=useState<Record<number,string>>({});
 const [recordings,setRecordings]=useState<Record<number,File|null>>({});
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState(""),[message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const r=await fetch("/api/me/cause-message-requests",{credentials:"same-origin",cache:"no-store"});
   if(!r.ok)throw Error("דער מעסעדזש־אינבאקס קען נישט געליינט ווערן.");
   setItems(await r.json());setErr("");
  }catch(e){setErr(e instanceof Error?e.message:"נישט געלונגען");}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const submit=async(id:number)=>{
  if(busy)return;
  const t=texts[id]||"",file=recordings[id];
  if(!t.trim()&&!file){setErr("שרייב א מעסעדזש אדער רעקארדיר/לייג ארויף אודיא.");return;}
  if(file&&file.size>3*1024*1024){setErr("דער אודיא איז צו גרויס — מאקסימום 3MB.");return;}
  setBusy(true);setErr("");
  try{
   const base64=file?await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
    reader.onerror=()=>reject(Error("דער פייל קען נישט געליינט ווערן"));
    reader.readAsDataURL(file);
   }):undefined;
   const r=await fetch(`/api/me/cause-message-requests/${id}/submit`,{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({textEn:t,audioBase64:base64,mimeType:file?.type})
   });
   const response=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(response.error||"נישט געלונגען");
   setMessage("דיין מעסעדזש איז אריינגעשיקט צום גבהה־טיעם, און וועט נישט גיין פובליק ביזן באשטעטיגן.");
   setTexts(old=>({...old,[id]:""}));
   setRecordings(old=>({...old,[id]:null}));
   await refresh();
  }catch(e){setErr(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 if(!items.length)return null;
 return <section dir="rtl" className="rounded-xl border bg-card p-4 space-y-4">
  <h2 className="text-xl font-bold">מעלדונגען: די מערכת בעט פון דיר צווועק־מעסעדזשעס</h2>
  <p className="text-sm text-muted-foreground">דו קענסט שיקן די אפיציעלע מעסעדזש אין ענגלישן טעקסט און/אדער אודיא. דער טיעם דארף דאס קודם איבערקוקן.</p>
  {err&&<p role="alert" className="text-destructive">{err}</p>}
  {message&&<p role="status">{message}</p>}
  {items.map(item=><article key={item.id} className="rounded-lg border p-4 space-y-2">
    <h3 className="font-semibold">{item.channel==="united"?"מתאחדים באהבה":"היינטיגע צוועק"} · {item.purpose==="announcement"?"אפיציעלע צוועק־מעסעדזש":"אנשליסן / נדבה־אנווייזונגען"}</h3>
    <p className="text-sm">{item.request_note}</p>
    <p className="text-xs">סטאטוס: {item.state==="requested"?"ווארט אויף דיין אריינשיקן":item.state==="submitted"?"ווארט אויף טיעם־איבערקוק":item.state==="approved"?"באשטעטיגט":"אפגעווארפן"}</p>
    {item.review_note&&<p className="text-xs">מערכת־הערה: {item.review_note}</p>}
    {item.state==="requested"&&<>
      <Textarea maxLength={3000} dir="auto" placeholder="שרייב די אפיציעלע מעסעדזש אין ענגליש פאר TTS"
       value={texts[item.id]||""} onChange={e=>setTexts(v=>({...v,[item.id]:e.target.value}))}/>
      <label className="block text-sm font-semibold">אודיא־רעקארדירונג (אויב דו ווילסט)</label>
      <input type="file" accept="audio/webm,audio/ogg,audio/wav,audio/mpeg"
       onChange={e=>setRecordings(v=>({...v,[item.id]:e.target.files?.[0]||null}))}/>
      <Button disabled={busy} onClick={()=>void submit(item.id)}>שיקן צום טיעם פאר באשטעטיגונג</Button>
    </>}
  </article>)}
 </section>;
}
