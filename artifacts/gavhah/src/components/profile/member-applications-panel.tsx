import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {useAuth} from "@/context/auth-context";
import {useToast} from "@/hooks/use-toast";
import {Link} from "wouter";

type Item={
 kind:"volunteer"|"help";id:number;title:string;status:string;
 createdAt:string;followupCount:number;latestFollowupAt:string|null;
};
const statusLabels:Record<string,string>={
 received:"אנגעקומען צום מערכת — ווארט אויף איבערקוק",
 staff_processed:"די מערכת האט באהאנדלט די אנמעלדונג",
 pending:"ווארט אויף איבערקוק",
 open:"אנגענומען צו איבערקוק און באהאנדלונג",
 rejected:"נישט אנגענומען",
 resolved:"דער צוועק איז אפגעצייכנט אלס פארטיג",
};
export function MemberApplicationsPanel(){
 const {isAuthenticated,user}=useAuth();
 const {toast}=useToast();
 const [items,setItems]=useState<Item[]>([]);
 const [loading,setLoading]=useState(true);
 const [problem,setProblem]=useState("");
 const [writing,setWriting]=useState<Record<string,string>>({});
 const [sending,setSending]=useState<string|null>(null);
 const refresh=async()=>{
  const response=await fetch("/api/me/applications",{credentials:"same-origin",cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data.error||"נישט געקענט ליינען די אנמעלדונגען"));
  setItems(Array.isArray(data.items)?data.items:[]);
 };
 useEffect(()=>{
  if(!isAuthenticated){setItems([]);setLoading(false);return;}
  let alive=true;setLoading(true);
  fetch("/api/me/applications",{credentials:"same-origin",cache:"no-store"})
   .then(r=>r.ok?r.json():Promise.reject(Error("נישט געקענט ליינען די אנמעלדונגען")))
   .then(x=>{if(alive){setItems(Array.isArray(x.items)?x.items:[]);setProblem("");}})
   .catch(e=>{if(alive)setProblem(e instanceof Error?e.message:"א פעהלער איז געשען");})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[isAuthenticated,user?.id]);
 const send=async(item:Item)=>{
  const key=item.kind+":"+item.id;
  const message=(writing[key]||"").trim();
  if(message.length<4||message.length>2000){
   setProblem("שרייב א מעסעדזש פון 4 ביז 2000 אותיות");return;
  }
  setSending(key);setProblem("");
  try{
   const response=await fetch("/api/me/applications/"+item.kind+"/"+item.id+"/followups",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(String(data.error||"נישט געקענט שיקן"));
   setWriting(old=>({...old,[key]:""}));
   await refresh();
   toast({title:"די פאלאו־אפ מעסעדזש איז אנגעקומען צום מערכת"});
  }catch(e){
   setProblem(e instanceof Error?e.message:"נישט געקענט שיקן");
   toast({title:"נישט געקענט שיקן",variant:"destructive"});
  }finally{setSending(null);}
 };
 return <section className="container mx-auto px-4 max-w-4xl mb-8" dir="rtl" id="my-applications">
  <div className="space-y-4">
   <div>
    <h2 className="text-2xl font-serif font-bold text-primary">מיינע הילף־און־וואלונטיר־אנמעלדונגען</h2>
    <p className="text-sm text-muted-foreground">זע וואס דו האסט איינגעשיקט, דעם סטאטוס, און שיק א פריוואטן פאלאו־אפ צום מערכת.</p>
   </div>
   {loading&&<p className="text-sm text-muted-foreground">מען קוקט נאך די אנמעלדונגען...</p>}
   {problem&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{problem}</p>}
   {!loading&&items.length===0&&<div className="rounded-xl border bg-card p-4 space-y-3">
    <p>דו האסט דערווייל נישט איינגעשיקט קיין וואלונטיר־אדער הילף־בקשה.</p>
    <Link href="/directory#help-center"><Button variant="outline">זיך אנגעבן צו העלפן אדער בעטן הילף</Button></Link>
   </div>}
   {items.map(item=>{
    const key=item.kind+":"+item.id;
    return <article key={key} id={"application-"+item.kind+"-"+item.id} className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{item.kind==="volunteer"?"איך וויל העלפן":"איך דארף הילף"} — #{item.id}</h3>
      <span className="text-sm font-medium">{statusLabels[item.status]||item.status}</span>
     </div>
     <p className="text-sm text-muted-foreground break-words">{item.title}</p>
     <p className="text-xs text-muted-foreground">אריינגעשיקט: {new Date(item.createdAt).toLocaleDateString("en-US")} · פאלאו־אפס: {item.followupCount}</p>
     <label className="block text-sm font-medium" htmlFor={"followup-"+key}>א מעסעדזש צום מערכת איבער דער אנמעלדונג</label>
     <Textarea id={"followup-"+key} rows={3} maxLength={2000} value={writing[key]||""}
      onChange={e=>setWriting(old=>({...old,[key]:e.target.value}))}
      placeholder="שרייב דיין פראגע אדער אפדעיט וועגן דעם צוועק..."/>
     <div className="flex flex-wrap gap-2">
      <Button disabled={sending!==null||((writing[key]||"").trim().length<4)}
       onClick={()=>void send(item)}>{sending===key?"מען שיקט...":"שיק פאלאו־אפ צום מערכת"}</Button>
      <Link href="/directory#help-center"><Button variant="outline">הילף־צענטער</Button></Link>
     </div>
     <p className="text-xs text-muted-foreground">די מעסעדזש בלייבט פריוואט אינעם מערכת־אינבאקס; דאס מאכט נישט דעם צוועק פובליק.</p>
    </article>;
   })}
  </div>
 </section>;
}
