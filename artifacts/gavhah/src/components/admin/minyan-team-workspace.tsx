import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
type Place={id:number;synagogueName:string;city:string;address:string|null;status:string;
 shacharis:string;mincha:string;maariv:string;dialCode?:number;
 geoVerified?:boolean;latitude?:number|null;longitude?:number|null};
type Phone={id:number;member_id:number;city:string|null;synagogue_typed:string|null;
 address_typed:string|null;status:string;has_name_audio:boolean;has_address_audio:boolean;
 has_city_audio:boolean;has_notes_audio:boolean;schedule_json:unknown;created_at:string};
type RecordInput={synagogueName:string;city:string;address:string;shacharis:string;mincha:string;maariv:string;notes:string};
type ServiceRule={prayer:string;weekDay:number;time:string;rtOffsetMinutes:string;intervalMinutes:string;untilTime:string};
const emptyRule=():ServiceRule=>({
 prayer:"shacharis",weekDay:1,time:"08:30",rtOffsetMinutes:"",intervalMinutes:"",untilTime:""
});
const api=async(url:string,method="GET",body?:unknown)=>{
 const r=await fetch(url,{method,credentials:"same-origin",cache:"no-store",
  ...(body!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||"א פעלער ביים אפהיטן");
 return d;
};
export function MinyanTeamWorkspace(){
 const [places,setPlaces]=useState<Place[]>([]);
 const [phone,setPhone]=useState<Phone[]>([]);
 const [transcriptions,setTranscriptions]=useState<Record<number,RecordInput>>({});
 const [coordinates,setCoordinates]=useState<Record<number,{latitude:string;longitude:string;timezone:string}>>({});
 const [rules,setRules]=useState<Record<number,ServiceRule[]>>({});
 const [busy,setBusy]=useState(false),[err,setErr]=useState(""),[message,setMessage]=useState("");
 const [selected,setSelected]=useState<number|null>(null);
 const refresh=async()=>{
  try{
   const [admin,publicPlaces,phoneRecords]=await Promise.all([
    api("/api/admin/minyans"),api("/api/minyans/advanced"),api("/api/admin/minyans/phone-submissions")
   ]);
   const dial=new Map((publicPlaces as Place[]).map(p=>[p.id,p]));
   setPlaces((admin as Place[]).map(p=>({...p,...dial.get(p.id)})));
   setPhone(phoneRecords);setErr("");
  }catch(e){setErr(e instanceof Error?e.message:"מנינים־אינפארמאציע נישט אוועילעבל");}
 };
 useEffect(()=>{void refresh()},[]);
 const run=async(fn:()=>Promise<unknown>)=>{
  if(busy)return;
  setBusy(true);setErr("");setMessage("");
  try{await fn();setMessage("די ענדערונג איז אפגעהיטן. דער פובליקער מנין שטייט נאר נאך דער אפיציעלער באשטעטיגונג.");await refresh();}
  catch(e){setErr(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const setT=(id:number,field:keyof RecordInput,value:string)=>{
  setTranscriptions(o=>({...o,[id]:{
   ...(o[id]||{synagogueName:"",city:"",address:"",shacharis:"",mincha:"",maariv:"",notes:""}),
   [field]:value
  }}));
 };
 const setCoordinate=(id:number,field:"latitude"|"longitude"|"timezone",value:string)=>
  setCoordinates(o=>({...o,[id]:{
   ...(o[id]||{latitude:"",longitude:"",timezone:"America/New_York"}),[field]:value
  }}));
 const editRule=(placeId:number,index:number,field:keyof ServiceRule,value:string|number)=>{
  setRules(o=>({...o,[placeId]:(o[placeId]||[emptyRule()]).map((item,i)=>
   i===index?{...item,[field]:value}:item)}));
 };
 const publishRules=(placeId:number)=>{
  const records=(rules[placeId]||[]).flatMap(r=>{
   const valid=r.rtOffsetMinutes.trim()?{time:null,rtOffsetMinutes:Number(r.rtOffsetMinutes)}:
    {time:r.time,rtOffsetMinutes:null};
   return [{prayer:r.prayer,weekDay:Number(r.weekDay),...valid,
    intervalMinutes:r.intervalMinutes?Number(r.intervalMinutes):null,
    untilTime:r.untilTime||null}];
  });
  return run(()=>api(`/api/admin/minyans/${placeId}/service-rules`,"POST",{rules:records}));
 };
 return <section dir="rtl" className="space-y-6">
  <div className="rounded-xl border p-5 space-y-2">
   <h2 className="text-xl font-bold">קנעפל 7 — פראפעסיאנעלע מנינים־אדמיניסטראציע</h2>
   <p className="text-sm text-muted-foreground">
    יעדער באשטעטיגטער בית המדרש באקומט אן אייגענעם 3–4 ציפער־נומער.
    נאר געפרופטע גאסן און מנין־צייטן קענען ווערן גענוצט פאר לייוו רוטעס.
   </p>
   <Button size="sm" variant="outline" onClick={()=>void refresh()}>דערפרישן</Button>
   {err&&<p role="alert" className="text-destructive">{err}</p>}
   {message&&<p role="status">{message}</p>}
  </div>
  <div className="rounded-xl border p-4 space-y-3">
   <h3 className="font-semibold">פראפאזאלן פונעם ימות־האטליין</h3>
   {phone.filter(p=>p.status==="pending"||p.status==="reviewing").length===0&&
    <p className="text-sm">נישטא קיין ווארטנדע טעלעפאן־איינגאבעס.</p>}
   {phone.filter(p=>p.status==="pending"||p.status==="reviewing").map(p=><article key={p.id} className="rounded-xl border p-3 space-y-2">
    <h4 className="font-bold">איינגאבע #{p.id} — מעמבער #{p.member_id} · {p.city||"נישט אויסגעקליבן"}</h4>
    <p className="text-xs">געזאגט: {p.synagogue_typed||"נאמען אין רעקארדירונג"} · {p.address_typed||"אדרעס אין רעקארדירונג"}</p>
    <p className="text-xs">מנין־איינגאבעס: {JSON.stringify(p.schedule_json)}</p>
    <div className="grid sm:grid-cols-2 gap-3">
     {(["name","address","city","notes"] as const).map(k=>
      (k==="name"?p.has_name_audio:k==="address"?p.has_address_audio:k==="city"?p.has_city_audio:p.has_notes_audio)?
       <label className="text-xs" key={k}>{k}
        <audio preload="none" className="w-full" controls
         src={`/api/admin/minyans/phone-submissions/${p.id}/audio/${k}`}/>
       </label>:null)}
    </div>
    <div className="grid sm:grid-cols-2 gap-2">
     {(["synagogueName","city","address","shacharis","mincha","maariv"] as const).map(k=>
      <Input key={k} placeholder={k}
       value={transcriptions[p.id]?.[k]??(k==="synagogueName"?p.synagogue_typed||"":
        k==="city"?p.city||"":k==="address"?p.address_typed||"":"")}
       onChange={e=>setT(p.id,k,e.target.value)}/>)}
    </div>
    <Textarea placeholder="פריוואטע מערכת־נאטיץ" value={transcriptions[p.id]?.notes||""}
     onChange={e=>setT(p.id,"notes",e.target.value)}/>
    <div className="flex flex-wrap gap-2">
     <Button disabled={busy} onClick={()=>void run(()=>api(
      `/api/admin/minyans/phone-submissions/${p.id}/review`,"POST",{
       decision:"approved",...transcriptions[p.id],
       synagogueName:(transcriptions[p.id]?.synagogueName||p.synagogue_typed||""),
       city:(transcriptions[p.id]?.city||p.city||""),
       address:(transcriptions[p.id]?.address||p.address_typed||""),
       times:{
        shacharis:transcriptions[p.id]?.shacharis||"",
        mincha:transcriptions[p.id]?.mincha||"",
        maariv:transcriptions[p.id]?.maariv||""
       },
       notes:transcriptions[p.id]?.notes||""
      }))}>אריינגעבן צום אפיציעלן מנינים־איבערקוק</Button>
     <Button variant="destructive" disabled={busy} onClick={()=>void run(()=>api(
      `/api/admin/minyans/phone-submissions/${p.id}/review`,"POST",
      {decision:"rejected",notes:transcriptions[p.id]?.notes||""}))}>אפווארפן</Button>
    </div>
   </article>)}
  </div>
  <div className="rounded-xl border p-4 space-y-3">
   <h3 className="font-semibold">באשטעטיגטע בתי מדרשים — רוטינג און זמני מנינים</h3>
   {places.filter(p=>p.status==="approved").map(p=><article key={p.id} className="border rounded-lg p-3 space-y-3">
    <button type="button" className="flex w-full justify-between text-start gap-2"
     onClick={()=>setSelected(selected===p.id?null:p.id)}>
     <strong>{p.synagogueName} — #{p.dialCode||"ווארט אויף ID"}</strong>
     <span className="text-xs">{p.geoVerified?"אדרעס באשטעטיגט":"נאך נישט געמאפט"}</span>
    </button>
    {selected===p.id&&<>
     <p className="text-sm">{p.address}, {p.city}</p>
     <a className="underline text-primary text-xs"
      target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.address||"")+", "+p.city)}`}>
      איבערקוקן די אדרעס אויף א מאפע
     </a>
     <div className="grid sm:grid-cols-3 gap-2">
      <Input placeholder="Latitude (באשטעטיגט)" type="number" step="any"
       value={coordinates[p.id]?.latitude||""}
       onChange={e=>setCoordinate(p.id,"latitude",e.target.value)}/>
      <Input placeholder="Longitude (באשטעטיגט)" type="number" step="any"
       value={coordinates[p.id]?.longitude||""}
       onChange={e=>setCoordinate(p.id,"longitude",e.target.value)}/>
      <Input placeholder="Timezone" value={coordinates[p.id]?.timezone||"America/New_York"}
       onChange={e=>setCoordinate(p.id,"timezone",e.target.value)}/>
     </div>
     <Button size="sm" disabled={busy||!coordinates[p.id]?.latitude||!coordinates[p.id]?.longitude}
      onClick={()=>void run(()=>api(`/api/admin/minyans/${p.id}/verified-location`,"POST",{
       location:{latitude:Number(coordinates[p.id].latitude),longitude:Number(coordinates[p.id].longitude)},
       timezone:coordinates[p.id].timezone,staffConfirmedAddress:true
      }))}>באשטעטיגן פינקטליכע אדרעס פאר רוטינג</Button>
     <h4 className="font-semibold">מנין־צייטן — שחרית / מנחה / מעריב / מנחה־מעריב צוזאמען</h4>
     {(rules[p.id]||[]).map((rule,i)=><div key={i} className="rounded-lg border p-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Select value={rule.prayer} onValueChange={v=>editRule(p.id,i,"prayer",v)}>
       <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
        <SelectItem value="shacharis">שחרית</SelectItem><SelectItem value="mincha">מנחה</SelectItem>
        <SelectItem value="maariv">מעריב</SelectItem><SelectItem value="mincha_maariv">מנחה־מעריב</SelectItem>
       </SelectContent>
      </Select>
      <Select value={String(rule.weekDay)} onValueChange={v=>editRule(p.id,i,"weekDay",Number(v))}>
       <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
        {["זונטאג","מאנטאג","דינסטאג","מיטוואך","דאנערשטאג","פרייטאג","שבת"].map((day,dayIndex)=>
         <SelectItem key={day} value={String(dayIndex)}>{day}</SelectItem>)}
       </SelectContent>
      </Select>
      <Input type="time" value={rule.time} onChange={e=>editRule(p.id,i,"time",e.target.value)}
       placeholder="קלארע זייגער־צייט"/>
      <Input type="number" min="0" max="240" placeholder="מינוט בעפאר ר״ת"
       value={rule.rtOffsetMinutes} onChange={e=>editRule(p.id,i,"rtOffsetMinutes",e.target.value)}/>
      <Input type="number" min="5" max="240" placeholder="חוזר יעדע ? מינוט"
       value={rule.intervalMinutes} onChange={e=>editRule(p.id,i,"intervalMinutes",e.target.value)}/>
      <Input type="time" placeholder="ביז צייט" value={rule.untilTime}
       onChange={e=>editRule(p.id,i,"untilTime",e.target.value)}/>
      <Button variant="outline" type="button"
       onClick={()=>setRules(old=>({...old,[p.id]:(old[p.id]||[]).filter((_,n)=>n!==i)}))}>אוועקנעמען</Button>
     </div>)}
     <div className="flex gap-2 flex-wrap">
      <Button variant="outline" onClick={()=>setRules(o=>({...o,[p.id]:[...(o[p.id]||[]),emptyRule()]}))}>צולייגן א מנין</Button>
      <Button disabled={busy||!(rules[p.id]||[]).length} onClick={()=>void publishRules(p.id)}>
       באשטעטיגן די צייטן פארן רוטע־פלאנער
      </Button>
     </div>
     <p className="text-xs text-muted-foreground">ר״ת־פארבונדענע צייטן ווערן גענוצט נאר ווען דער טאג'ס ר״ת־זמן איז באשטעטיגט. רעגלמעסיגע מנינים דארפן א צוגעשטעלטע אנהייב־און־ענד־צייט.</p>
    </>}
   </article>)}
  </div>
 </section>;
}
