import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {useAuth} from "@/context/auth-context";
import {MinyanTravelPlanner} from "./minyan-trip-planner";
type Result={id:number;dialCode:number;synagogueName:string;city:string;country:string;address:string|null;
 shacharis:string;mincha:string;maariv:string;ownSaved:boolean;geoVerified:boolean;notes:string|null};
const AREAS=[
 {id:"1",name:"וויליאמסבורג"},{id:"2",name:"מאנסי"},{id:"3",name:"קרית יואל / מאנרא"},
 {id:"4",name:"בארא פארק"},{id:"5",name:"לעיקוואד"}
];
export function MinyanAdvancedCenter(){
 const [area,setArea]=useState("all"),[query,setQuery]=useState("");
 const [dial,setDial]=useState("");
 const [list,setList]=useState<Result[]>([]),[saved,setSaved]=useState<Result[]>([]);
 const [mode,setMode]=useState<"places"|"saved"|"planner">("places");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const {isAuthenticated}=useAuth();
 const load=async()=>{
  setBusy(true);setMessage("");
  try{
   const url=new URL("/api/minyans/advanced",window.location.origin);
   if(area!=="all")url.searchParams.set("cityCode",area);
   if(query.trim())url.searchParams.set("q",query.trim());
   const req=await fetch(url.toString(),{cache:"no-store"});
   const val=await req.json().catch(()=>[]);
   if(!req.ok)throw Error(val.error||"מען קען יעצט נישט ליינען די מנינים.");
   setList(val);
  }catch(e){setMessage(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const loadSaved=async()=>{
  if(!isAuthenticated){setMessage("איינלאגן אין גבהה צו זען די געסעיווטע ליסטע.");return;}
  try{
   const r=await fetch("/api/me/minyans/saved",{credentials:"same-origin",cache:"no-store"});
   if(!r.ok)throw Error("מיין געסעיווטע ליסטע איז נישט אוועילעבל.");
   setSaved(await r.json());
  }catch(e){setMessage(e instanceof Error?e.message:"נישט געלונגען");}
 };
 useEffect(()=>{void load();},[area]);
 useEffect(()=>{if(mode==="saved")void loadSaved()},[mode]);
 const mark=async(item:Result)=>{
  if(!isAuthenticated){setMessage("צו סעיוון א מנין דארף מען זיין איינגעשריבן.");return;}
  try{
   const willSave=!saved.some(x=>x.id===item.id);
   const r=await fetch(`/api/me/minyans/saved/${item.id}`,{
     method:willSave?"PUT":"DELETE",credentials:"same-origin"
   });
   if(!r.ok)throw Error("מען קען יעצט נישט סעיוון דעם מנין.");
   await loadSaved();
  }catch(e){setMessage(e instanceof Error?e.message:"נישט געלונגען");}
 };
 const lookup=async()=>{
  if(!/^\d{3,4}$/.test(dial)){setMessage("לייג אריין 3 אדער 4 ציפערן.");return;}
  try{
   const r=await fetch("/api/minyans/dial/"+dial,{cache:"no-store"});
   const found=await r.json().catch(()=>null);
   if(!r.ok||!found)throw Error("קיין באשטעטיגטער בית המדרש מיט דעם נומער נישט געפונען.");
   setList([found]);setMode("places");setMessage("");
  }catch(e){setMessage(e instanceof Error?e.message:"נישט געלונגען");}
 };
 const shown=mode==="saved"?saved:list;
 return <section dir="rtl" className="space-y-5">
  <div className="rounded-xl border p-5 bg-card space-y-3">
   <h2 className="text-2xl font-bold">קנעפל 7 — מנינים־צענטער</h2>
   <p className="text-sm text-muted-foreground">געפין באשטעטיגטע בתי מדרשים, מנינים, געסעיווטע פלעצער, רוטעס און א פלאן פאר די קומענדיגע צייט.</p>
   <div className="flex flex-wrap gap-2">
    <Button variant={mode==="places"?"default":"outline"} onClick={()=>setMode("places")}>1 — זוכן מנינים</Button>
    <Button variant={mode==="saved"?"default":"outline"} onClick={()=>setMode("saved")}>2 — מיינע געסעיווטע</Button>
    <Button variant={mode==="planner"?"default":"outline"} onClick={()=>setMode("planner")}>3 — לייוו / פלאן א טריפ</Button>
   </div>
  </div>
  {mode==="planner"?<MinyanTravelPlanner existingPlaces={list}/>:<>
  {mode==="places"&&<div className="rounded-xl border p-4 space-y-3 bg-card">
    <label className="font-medium text-sm">זוך לויט געגנט</label>
    <Select value={area} onValueChange={setArea}>
      <SelectTrigger><SelectValue/></SelectTrigger>
      <SelectContent><SelectItem value="all">אלע געגענטער</SelectItem>
       {AREAS.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
      </SelectContent>
    </Select>
    <div className="flex gap-2 flex-col sm:flex-row">
     <Input placeholder="נאמען, גאס, אדרעס, שטאט, אנדערע דעטאלן"
       value={query} onChange={e=>setQuery(e.target.value)}
       onKeyDown={e=>{if(e.key==="Enter")void load()}}/>
     <Button disabled={busy} onClick={()=>void load()}>זוכן</Button>
    </div>
    <div className="flex gap-2">
     <Input inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="3–4 ציפער ID"
       value={dial} onChange={e=>setDial(e.target.value.replace(/\D/g,"").slice(0,4))}/>
     <Button variant="outline" onClick={()=>void lookup()}>זוך לויט ID</Button>
    </div>
  </div>}
  {message&&<p role="alert" className="border p-3 rounded-lg text-sm">{message}</p>}
  <p className="text-sm text-muted-foreground">{shown.length} באשטעטיגטע פלעצער אין דער אויסגעקליבענער ליסטע.</p>
  <div className="grid sm:grid-cols-2 gap-3">
   {shown.map(place=><article key={place.id} className="rounded-xl bg-card border p-4 space-y-2">
     <div className="flex justify-between gap-2">
      <h3 className="font-bold">{place.synagogueName}</h3>
      <span className="font-mono font-bold tabular-nums">#{place.dialCode}</span>
     </div>
     <p className="text-sm">{place.address||"פולע אדרעס נאכנישט באשטעטיגט"}, {place.city}</p>
     {place.shacharis&&<p className="text-sm">שחרית: {place.shacharis.replaceAll("\n"," · ")}</p>}
     {place.mincha&&<p className="text-sm">מנחה: {place.mincha.replaceAll("\n"," · ")}</p>}
     {place.maariv&&<p className="text-sm">מעריב: {place.maariv.replaceAll("\n"," · ")}</p>}
     {place.notes&&<p className="text-xs text-muted-foreground">{place.notes}</p>}
     <div className="flex gap-2 items-center justify-between">
      <Button size="sm" variant="outline" onClick={()=>void mark(place)}>
       {saved.some(x=>x.id===place.id)?"ארויסנעמען פון געסעיווטע":"סעיוון דעם מנין"}
      </Button>
      <span className="text-xs text-muted-foreground">{place.geoVerified?"אדרעס פאר רוטעס באשטעטיגט":"רוטע־אדרעס ווארט אויף באשטעטיגונג"}</span>
     </div>
   </article>)}
  </div></>}
 </section>;
}
