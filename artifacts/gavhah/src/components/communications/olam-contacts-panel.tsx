import {useCallback,useEffect,useState} from "react";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";

type Contact={
 id:number;contact_ref:number;name:string;phone:string;postal_address?:string;
 do_not_call:boolean;created_at?:string;current_outcome?:string|null;
 call_count?:number;notes?:string;preferred_hours?:string;
};
type Event={id:number;recorded_at:string;call_at:string;direction:string;source:string;
 outcome:string;purpose_type:string;purpose_key:string|null;details?:Record<string,unknown>};
const base="/api/askanus/max/contacts/approved";
const filters=[
 ["all","אלע קאנטאקט'ס"],["eligible","מען קען שוין רופן"],["callbacks","צוריקצורופן פאר א נדבה"],
 ["pledge_pending","התחייבות אדער טיילווייז באצאלט"],["warm","ווארעמע קאנטאקטן"],
 ["do_not_call","נישט רופן"],["missed","פארפאסטע אריינקומענדיגע קאלס"],
 ["donations","געגעבן א נדבה"],["no_answer","נישט געענטפערט"],
 ["not_interested","נישט אינטערעסירט"],["asked_no_more","בעט נישט מער צו רופן"],
 ["pledges","צוגעזאגט"],["other","אנדערע רעזולטאטן"],["unreported","סטאטיסטיקס נישט אריינגעלייגט"],
 ["spoke","גערעדט"]
] as const;
const statusLabels:Record<string,string>={
 "":"נישט אריינגעלייגט",no_answer:"נישט געענטפערט",donation:"געגעבן א נדבה",
 callback:"צוריקצורופן",pledge:"צוגעזאגט",not_interested:"נישט אינטערעסירט",
 asked_no_more:"בעט נישט מער צו רופן",do_not_call:"נישט רופן",
 spoke:"גערעדט",other:"אנדערע"
};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const res=await fetch(base+path,{credentials:"include",cache:"no-store",...init});
 const data:unknown=await res.json().catch(()=>({}));
 if(!res.ok){const x=data as {error?:string};throw Error(x.error||"דער פארלאנג איז נישט געלונגען");}
 return data as T;
}
const body=(data:unknown):RequestInit=>({
 method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)
});
const mobileBox="rounded-xl border bg-card p-3 sm:p-4";
const label="block text-sm font-medium mb-1";
export function OlamContactsPanel(){
 const [category,setCategory]=useState<string>("all");
 const [sort,setSort]=useState<"newest"|"oldest">("newest");
 const [searchMode,setSearchMode]=useState<"none"|"phone"|"gregorian"|"hebrew"|"id">("none");
 const [searchValue,setSearchValue]=useState("");
 const [hYear,setHYear]=useState("5787"),[hMonth,setHMonth]=useState("1"),[hDay,setHDay]=useState("1");
 const [page,setPage]=useState(0),[list,setList]=useState<Contact[]>([]),[selected,setSelected]=useState<Contact|null>(null);
 const [events,setEvents]=useState<Event[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [adding,setAdding]=useState(false),[phone,setPhone]=useState(""),[name,setName]=useState(""),[address,setAddress]=useState("");
 const [edit,setEdit]=useState(false),[ePhone,setEPhone]=useState(""),[eName,setEName]=useState(""),[eAddress,setEAddress]=useState("");
 const [months,setMonths]=useState("6"),[scope,setScope]=useState("person"),[purpose,setPurpose]=useState(""),[nextAllowed,setNextAllowed]=useState("");
 const load=useCallback(async()=>{
  const q=new URLSearchParams({category,sort,page:String(page),limit:"30"});
  if(searchMode==="phone"&&searchValue)q.set("phone",searchValue);
  if(searchMode==="id"&&searchValue)q.set("contactRef",searchValue);
  if(searchMode==="gregorian"&&searchValue){q.set("dateSystem","gregorian");q.set("callDate",searchValue);}
  if(searchMode==="hebrew"){q.set("dateSystem","hebrew");q.set("hebrewYear",hYear);q.set("hebrewMonth",hMonth);q.set("hebrewDay",hDay);}
  try{
   const x=await api<{items:Contact[]}>("/list?"+q.toString());setList(x.items);setError("");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
 },[category,sort,page,searchMode,searchValue,hYear,hMonth,hDay]);
 useEffect(()=>{void load();},[load]);
 const act=async(fn:()=>Promise<void>)=>{
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{await fn();await load();}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const open=async(c:Contact)=>{
  setSelected(c);setEvents([]);setEdit(false);setEName(c.name||"");setEPhone(c.phone);
  setEAddress(c.postal_address||"");setMonths("6");setPurpose("");setNextAllowed("");
  try{
   const [detail,hist]=await Promise.all([
    api<Contact>("/"+c.contact_ref),
    api<{allCurrentAndPrevious:Event[]}>("/"+c.contact_ref+"/calls")
   ]);
   setSelected(detail);setEvents(hist.allCurrentAndPrevious);
  }catch(e){setError(e instanceof Error?e.message:"היסטאריע נישט אוועליבעל");}
 };
 const add=()=>act(async()=>{
  const x=await api<{contact:Contact}>("",body({phone,name,address}));
  setAdding(false);setName("");setAddress("");setPhone("");
  setNotice("קאנטאקט אפגעהיטן: #"+x.contact.contact_ref);
  await open(x.contact);
 });
 const save=()=>act(async()=>{
  if(!selected)return;
  const q=await api<{contact:Contact}>("/"+selected.contact_ref,{
   method:"PATCH",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({name:eName,phone:ePhone,postal_address:eAddress})
  });
  setEdit(false);setNotice("קאנטאקט אפדעיטעד");await open(q.contact);
 });
 const archive=()=>act(async()=>{
  if(!selected||!confirm("אויסנעמען נאר דעם קאנטאקט פון דער ליסטע? קאל־היסטאריע און פינאנץ בלייבן."))return;
  await api("/"+selected.contact_ref+"/archive",body({confirm:"ARCHIVE_CONTACT_ONLY"}));
  setSelected(null);setNotice("קאנטאקט ארויסגענומען פון דער ליסטע; אלטע סטאטוסן בלייבן.");
 });
 const updateDnc=(flag:boolean)=>act(async()=>{
  if(!selected||!confirm(flag?"באשטעטיגן: נישט מער רופן דעם מענטש?":"באשטעטיגן: ווידער ערלויבן צו רופן?"))return;
  await api("/"+selected.contact_ref,{method:"PATCH",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({do_not_call:flag,confirm:"CONFIRM_CALL_PERMISSION"})});
  setNotice(flag?"אנגעצייכנט נישט צו רופן":"רוף־ערלויבעניש אפדעיטעד");
  await open(selected);
 });
 const plan=()=>act(async()=>{
  if(!selected)return;
  await api("/"+selected.contact_ref+"/recontact",body({
   scope,purposeType:purpose?"case":"none",purposeKey:purpose,intervalMonths:Number(months),
   nextAllowedAt:nextAllowed?new Date(nextAllowed).toISOString():undefined
  }));
  setNotice("צוריקצורופן־כלל באשטעטיגט; דער קאנטאקט וועט ווערן געוויזן ווען ער איז בארעכטיגט.");
 });
 return <section className="space-y-4" dir="rtl" lang="yi">
  <div className={mobileBox}>
   <h2 className="text-xl font-semibold">קאנטאקט'ס</h2>
   <p className="text-sm text-muted-foreground">איין צענטראלע ליסטע מיט קאל־היסטאריע, נאכפאלגן, נדבות און התחייבותן. די לעצטע סטאטוס ווערט ערשט געוויזן; די אלטע ווערן נישט פארלוירן.</p>
  </div>
  {error&&<p role="alert" className="rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
  <div className={mobileBox}>
   <div className="flex flex-wrap gap-2 mb-3">
    <Button type="button" onClick={()=>{setAdding(!adding);setSelected(null);}} variant={adding?"default":"outline"}>
     קנעפל 2 — לייג אריין א קאנטאקט
    </Button>
    <Button type="button" variant="outline" onClick={()=>{setSelected(null);setCategory("all");setSearchMode("none");setPage(0);}}>אלע קאנטאקט'ס</Button>
   </div>
   {adding&&<div className="grid sm:grid-cols-3 gap-3">
    <div><label className={label}>טעלעפאן־נומער</label><Input dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="8455551234"/></div>
    <div><label className={label}>נאמען — קען בלייבן ליידיג</label><Input value={name} onChange={e=>setName(e.target.value)}/></div>
    <div><label className={label}>אדרעס — קען מען איבערהיפן</label><Input value={address} onChange={e=>setAddress(e.target.value)}/></div>
    <Button disabled={busy||!phone} onClick={()=>void add()}>היט אפ קאנטאקט</Button>
   </div>}
  </div>
  <div className={mobileBox}>
   <h3 className="font-semibold mb-2">קאטעגאריעס — א באזונדערער קנעפל פאר יעדער</h3>
   <div className="flex flex-wrap gap-2">
    {filters.map(([id,text],i)=><Button key={id} size="sm" type="button" variant={category===id?"default":"outline"}
      onClick={()=>{setCategory(id);setPage(0);setSelected(null);}}>{i+1}. {text}</Button>)}
   </div>
   <div className="grid sm:grid-cols-3 gap-3 mt-4">
    <div><label className={label}>אויסשטעל</label><select className="w-full border rounded-lg p-2 bg-background" value={sort} onChange={e=>setSort(e.target.value as "newest"|"oldest")}>
     <option value="newest">פון ניי צו אלט</option><option value="oldest">פון אלט צו ניי</option></select></div>
    <div><label className={label}>זוך־אפטיילונג</label><select className="w-full border rounded-lg p-2 bg-background" value={searchMode} onChange={e=>{setSearchMode(e.target.value as typeof searchMode);setPage(0);}}>
     <option value="none">אלע אין דער קאטעגאריע</option><option value="phone">1. טעלעפאן־נומער</option>
     <option value="gregorian">2. דאטום למספרם</option><option value="hebrew">2. אידישע דאטום</option>
     <option value="id">3. קאנטאקט־איי־די</option></select></div>
    {(searchMode==="phone"||searchMode==="id")&&<div><label className={label}>זוך־נומער</label><Input dir="ltr" value={searchValue} onChange={e=>setSearchValue(e.target.value)}/></div>}
    {searchMode==="gregorian"&&<div><label className={label}>ווען סיי וועלכער קאל איז פארגעקומען</label><Input type="date" value={searchValue} onChange={e=>setSearchValue(e.target.value)}/></div>}
    {searchMode==="hebrew"&&<div className="sm:col-span-2">
     <label className={label}>אידישע דאטום — טאג, חודש פון תשרי, יאר</label>
     <div className="flex gap-2">
      <Input dir="ltr" type="number" min="1" max="30" value={hDay} onChange={e=>setHDay(e.target.value)}/>
      <Input dir="ltr" type="number" min="1" max="13" value={hMonth} onChange={e=>setHMonth(e.target.value)}/>
      <Input dir="ltr" type="number" min="5000" max="7000" value={hYear} onChange={e=>setHYear(e.target.value)}/>
     </div>
    </div>}
   </div>
  </div>
  <div className={mobileBox}>
   <h3 className="font-semibold mb-3">ליסטע — {filters.find(x=>x[0]===category)?.[1]}</h3>
   <div className="space-y-2">
    {!list.length&&<p className="text-sm text-muted-foreground">נישט געטראפן קיין קאנטאקטן אין דער אויסוואל.</p>}
    {list.map(c=><button type="button" key={c.id} onClick={()=>void open(c)}
     className="w-full rounded-lg border p-3 text-right hover:bg-muted/50 focus:outline focus:outline-2">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>#{c.contact_ref} — {c.name||c.phone}</strong>
      <span className="text-sm" dir="ltr">{c.name?c.phone:""}</span>
     </div>
     <div className="text-xs text-muted-foreground">{statusLabels[c.current_outcome||""]||c.current_outcome||"נישט אריינגעלייגט"} · {c.call_count||0} קאלס</div>
    </button>)}
   </div>
   <div className="flex gap-2 mt-3">
    <Button variant="outline" disabled={page===0} onClick={()=>setPage(x=>Math.max(0,x-1))}>פריערדיגע</Button>
    <Button variant="outline" disabled={list.length<30} onClick={()=>setPage(x=>x+1)}>נעקסטע</Button>
   </div>
  </div>
  {selected&&<div className={mobileBox}>
   <div className="flex flex-wrap justify-between gap-2">
    <div><h3 className="text-lg font-semibold">קאנטאקט #{selected.contact_ref}: {selected.name||"אן א נאמען"}</h3>
     <p dir="ltr">{selected.phone}</p></div>
    <Button variant="outline" onClick={()=>setSelected(null)}>צוריק צו דער ליסטע</Button>
   </div>
   <div className="flex flex-wrap gap-2 mt-3">
    <Button variant="outline" onClick={()=>setEdit(!edit)}>1 — עדיטירן</Button>
    <Button variant="outline" onClick={()=>setEdit(false)}>2 — אלע קאל־סטאטוסן</Button>
    <Button variant="outline" onClick={()=>void archive()}>3 — ארויסנעמען</Button>
   </div>
   {edit&&<div className="grid sm:grid-cols-3 gap-3 mt-4">
    <div><label className={label}>טעלעפאן־נומער</label><Input value={ePhone} dir="ltr" onChange={e=>setEPhone(e.target.value)}/></div>
    <div><label className={label}>נאמען</label><Input value={eName} onChange={e=>setEName(e.target.value)}/></div>
    <div><label className={label}>אדרעס</label><Input value={eAddress} onChange={e=>setEAddress(e.target.value)}/></div>
    <Button disabled={busy} onClick={()=>void save()}>היט אפ ענדערונגען</Button>
   </div>}
   <div className="mt-4 flex flex-wrap gap-2">
    <Button variant="outline" disabled={busy} onClick={()=>void updateDnc(!selected.do_not_call)}>
     {selected.do_not_call?"נאך באשטעטיגונג: ערלויבן רופן":"נישט מער רופן"}
    </Button>
   </div>
   <div className="mt-5 border rounded-lg p-3">
    <h4 className="font-semibold mb-2">ווען קען מען ווידער רופן?</h4>
    <div className="grid sm:grid-cols-4 gap-2">
     <div><label className={label}>פאר וועמען / וועלכן צוועק</label><select className="border rounded-lg w-full p-2 bg-background" value={scope} onChange={e=>setScope(e.target.value)}>
      <option value="person">דער מענטש בכלל</option><option value="same_purpose">דער זעלבער צוועק</option><option value="new_purpose">אן אנדער צוועק</option></select></div>
     <div><label className={label}>אויב פארבונדן מיט א קעיס־איי־די</label><Input dir="ltr" type="number" value={purpose} onChange={e=>setPurpose(e.target.value)}/></div>
     <div><label className={label}>יעדע וויפיל חדשים</label><Input dir="ltr" type="number" min="1" max="120" value={months} onChange={e=>setMonths(e.target.value)}/></div>
     <div><label className={label}>אדער א פונקטליכער דאטום</label><Input type="datetime-local" value={nextAllowed} onChange={e=>setNextAllowed(e.target.value)}/></div>
    </div>
    <Button className="mt-3" disabled={busy} onClick={()=>void plan()}>היט אפ צוריקצורופן־כלל</Button>
   </div>
   <div className="mt-5 space-y-2">
    <h4 className="font-semibold">סטאטוסן — יעצטיגער ערשט, דערנאך אלע פריערדיגע</h4>
    {!events.length&&<p className="text-sm text-muted-foreground">נאך נישט דא קיין אפגעהיטענע קאל־סטאטוסן.</p>}
    {events.map((e,i)=><div className="border rounded-lg p-3 text-sm" key={e.id}>
     <div className="flex justify-between gap-2 flex-wrap"><strong>{i===0?"איצט / לעצטער איינטראג":"פריערדיגער איינטראג"} — {statusLabels[e.outcome]||e.outcome||"נישט אריינגעלייגט"}</strong>
      <time>{new Date(e.recorded_at).toLocaleString()}</time></div>
     <p className="text-muted-foreground">{e.direction==="inbound"?"אריינקומענדיג":"ארויסגייענדיג"} · {e.source} · {e.purpose_type==="none"?"קיין צוועק נישט אויסגעוועלט":e.purpose_type}</p>
    </div>)}
   </div>
  </div>}
 </section>;
}
