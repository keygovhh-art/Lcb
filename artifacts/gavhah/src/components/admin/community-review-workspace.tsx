import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

type Intake={
 id:number;member_id:number;kind:"offer"|"request"|"project";category:string;
 availability:string|null;urgency:string|null;
 title_audio:boolean;details_audio:boolean;location_audio:boolean;goal_audio:boolean;
 project_id:number|null;status:string;created_at:string;staff_notes:string|null;
};
type Project={id:number;title:string;description:string;status:string;type:string;location:string|null;goalDescription?:string|null;organizerName?:string|null;createdAt?:string};
async function json(url:string,method="GET",body?:unknown){
 const res=await fetch(url,{
  method,credentials:"same-origin",
  ...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Server request failed");
 return data;
}
export function CommunityReviewWorkspace(){
 const [intakes,setIntakes]=useState<Intake[]>([]);
 const [projects,setProjects]=useState<Project[]>([]);
 const [entry,setEntry]=useState<Record<number,{title:string;description:string;note:string}>>({});
 const [reviewNotes,setReviewNotes]=useState<Record<number,string>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [ready,setReady]=useState(false);
 const refresh=useCallback(async()=>{
  try{
   const [a,b]=await Promise.all([
    json("/api/admin/gavhah-phone3/intake"),
    json("/api/admin/community-projects/pending")
   ]);
   setIntakes(Array.isArray(a)?a:[]);
   setProjects(Array.isArray(b)?b:[]);
   setReady(true);setError("");
  }catch(e){setError(e instanceof Error?e.message:"קיין איבערקוק־דאטן נישט");}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const setField=(id:number,name:"title"|"description"|"note",v:string)=>
  setEntry(old=>({...old,[id]:{title:old[id]?.title||"",description:old[id]?.description||"",note:old[id]?.note||"",[name]:v}}));
 async function reviewProject(p:Project,decision:"approved"|"rejected"){
  const field=entry[p.id]||{title:"",description:"",note:""};
  if(!window.confirm(decision==="approved"?"באשטעטיגן און פובליצירן דעם פראיעקט?":"אפווארפן דעם פראיעקט?"))return;
  setBusy("project:"+p.id);setError("");
  try{
   const d:{decision:string;note:string;title?:string;description?:string}={decision,note:field.note};
   if(field.title.trim())d.title=field.title.trim();
   if(field.description.trim())d.description=field.description.trim();
   await json("/api/admin/community-projects/"+p.id+"/review","POST",d);
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"איבערקוק נישט געלונגען");}
  finally{setBusy(null);}
 }
 async function reviewPrivate(i:Intake,decision:"reviewing"|"completed"|"rejected"){
  if(!window.confirm("טוישן דעם פריוואטן סטאטוס? קיין קאנטאקט־דעטאלן ווערן נישט געשיקט צו אנדערע."))return;
  setBusy("intake:"+i.id);setError("");
  try{
   await json("/api/admin/gavhah-phone3/"+i.id+"/review","POST",{
    decision,note:reviewNotes[i.id]||""
   });
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(null);}
 }
 return <section dir="rtl" lang="yi" className="space-y-6">
   <header className="rounded-xl border bg-card p-5 space-y-2">
     <h2 className="text-xl font-bold">קנעפל 3 — פריוואטע עסקנים־בקשות און פראיעקט־באשטעטיגונג</h2>
     <p className="text-sm text-muted-foreground">אלע טעלעפאן־בקשות זענען נאר פאר דער גבהה־מערכת. קיין קאמפיין/פראיעקט ווערט נישט פובליק ביז דער טיעם דרוקט „באשטעטיגן“.</p>
     <Button type="button" variant="outline" onClick={()=>void refresh()}>דערפרישן</Button>
   </header>
   {error&&<p role="alert" className="border rounded-lg p-3 text-destructive">{error}</p>}
   {!ready&&<p>מען ליינט די פריוואטע ליסטעס...</p>}
   <div className="space-y-3">
     <h3 className="font-bold">טעלעפאן־איינשרייבונגען ({intakes.length})</h3>
     {intakes.length===0&&<p className="text-sm text-muted-foreground">קיין אומבאארבעטע איינשרייבונגען נישט.</p>}
     {intakes.map(i=><article key={i.id} className="rounded-xl border bg-card p-4 space-y-3">
       <div className="flex flex-wrap gap-3 items-center text-sm">
         <strong>#{i.id} · {i.kind==="offer"?"איך קען העלפן":i.kind==="request"?"איך דארף עסקנים":"פראיעקט־איינגאבע"}</strong>
         <span>מעמבער #{i.member_id}</span><span>{i.category}</span>
         <span>{i.status}</span>
       </div>
       <p className="text-sm">פאראנענקייט/דרינגלעכקייט: {i.availability||i.urgency||"נישט אנגעגעבן"}</p>
       <div className="grid sm:grid-cols-2 gap-3">
         {(["title","details","location","goal"] as const).map(k=>{
           const exists=k==="title"?i.title_audio:k==="details"?i.details_audio:k==="location"?i.location_audio:i.goal_audio;
           return exists?<div key={k} className="space-y-1">
             <p className="text-xs font-semibold">{k==="title"?"נאמען":k==="details"?"באשרייבונג":k==="location"?"געגנט":"ציל"}</p>
             <audio controls preload="none" className="w-full" src={`/api/admin/gavhah-phone3/${i.id}/audio/${k}`} />
           </div>:null;
         })}
       </div>
       {i.project_id&&<p className="text-sm">פארבונדן צום ווארטנדן פראיעקט #{i.project_id}. באשטעטיגונג דורכן פראיעקט־טיעם אונטן.</p>}
       <Textarea placeholder="פריוואטע נאטיץ פון מערכת" value={reviewNotes[i.id]||""}
         maxLength={1500} onChange={e=>setReviewNotes(o=>({...o,[i.id]:e.target.value}))}/>
       <div className="flex flex-wrap gap-2">
         <Button disabled={busy!==null} variant="outline" onClick={()=>void reviewPrivate(i,"reviewing")}>אין באארבעטונג</Button>
         {i.kind!=="project"&&<Button disabled={busy!==null} onClick={()=>void reviewPrivate(i,"completed")}>באארבעט / פארטיג</Button>}
         {i.kind!=="project"&&<Button disabled={busy!==null} variant="destructive" onClick={()=>void reviewPrivate(i,"rejected")}>אפווארפן</Button>}
       </div>
     </article>)}
   </div>
   <div className="space-y-3">
     <h3 className="font-bold">פראיעקטן / קאמפיינס וואס ווארטן אויף באשטעטיגונג ({projects.length})</h3>
     {projects.length===0&&<p className="text-sm text-muted-foreground">קיין ווארטנדע פראיעקטן נישט.</p>}
     {projects.map(p=><article key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
       <h4 className="font-semibold">#{p.id} · {p.title} · {p.type}</h4>
       <p className="text-sm">{p.description}</p>
       <p className="text-xs text-muted-foreground">געגנט: {p.location||"נישט אנגעגעבן"}</p>
       <div className="space-y-2">
         <label className="block text-sm font-semibold">נאמען פארן פובליקן פראיעקט (ביי טעלעפאן מוז מען ערשט אויסשרייבן)</label>
         <Input value={entry[p.id]?.title??p.title} maxLength={240} onChange={e=>setField(p.id,"title",e.target.value)}/>
         <label className="block text-sm font-semibold">פולע באשרייבונג</label>
         <Textarea value={entry[p.id]?.description??p.description} maxLength={5000} onChange={e=>setField(p.id,"description",e.target.value)}/>
         <label className="block text-sm font-semibold">מערכת־נאטיץ (פריוואט)</label>
         <Textarea value={entry[p.id]?.note||""} maxLength={1500} onChange={e=>setField(p.id,"note",e.target.value)}/>
       </div>
       <div className="flex flex-wrap gap-2">
         <Button disabled={busy!==null} onClick={()=>void reviewProject({
            ...p,
          },"approved")}>באשטעטיגן און פובליצירן</Button>
         <Button disabled={busy!==null} variant="destructive" onClick={()=>void reviewProject(p,"rejected")}>אפווארפן</Button>
       </div>
     </article>)}
   </div>
 </section>;
}
