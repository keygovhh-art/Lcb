import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

type Settings={name:string;description:string;enabled:boolean;provider_confirmed:boolean;
 listener_extension:string|null;moderator_extension:string|null;mode:string;entry_mode:string;
 waiting_room:boolean;scheduled_start_at:string|null;scheduled_end_at:string|null;
 override_state:string;override_until:string|null;max_participants:number};
type Access={member_id:number;access:string;name:string;note:string};
type Hand={member_id:number;state:string;name:string};
type Data={settings:Settings;access:Access[];hands:Hand[];events:Array<{id:number;event_type:string;created_at:string}>};
async function api(path:string,method="GET",body?:unknown){
 const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",
  ...(body!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"דער סערווער האט נישט באשטעטיגט די ענדערונג");
 return data;
}
export function UnifiedConferenceAdmin(){
 const [data,setData]=useState<Data|null>(null),[form,setForm]=useState<Settings|null>(null);
 const [member,setMember]=useState(""),[access,setAccess]=useState("whitelist");
 const [note,setNote]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const reload=async()=>{const x=await api("/api/admin/conference") as Data;setData(x);setForm(x.settings)};
 useEffect(()=>{void reload().catch(e=>setError(String(e)))},[]);
 const run=async(promise:()=>Promise<unknown>)=>{
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{await promise();setNotice("די ענדערונג איז אפגעהיטן.");await reload();}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const change=<K extends keyof Settings>(key:K,value:Settings[K])=>
  setForm(x=>x?{...x,[key]:value}:x);
 if(!form)return <p role="status">{error||"מען ליינט די קאנפרענץ־אנשטעלונגען..."}</p>;
 const save=()=>run(()=>api("/api/admin/conference/settings","PATCH",{
  name:form.name,description:form.description,
  listenerExtension:form.listener_extension||null,moderatorExtension:form.moderator_extension||null,
  mode:form.mode,entryMode:form.entry_mode,waitingRoom:form.waiting_room,enabled:form.enabled,
  scheduledStart:form.scheduled_start_at||null,scheduledEnd:form.scheduled_end_at||null,
  overrideState:form.override_state,overrideUntil:form.override_until||null,
  maxParticipants:form.max_participants
 }));
 return <section dir="rtl" className="space-y-5">
  <header className="rounded-xl border p-5 space-y-2">
   <h2 className="text-xl font-bold">התקבצו — צענטראלע קאנפרענץ־פארוואלטונג</h2>
   <p className="text-sm">איין ימות־צימער, איין צוטריט־ליסטע פאר אלע אריינגענג. הנהלה־באשלוסן קומען פארן סקעדזשול. קנעפל 8 → 5 פאר קאנפרענץ; 8 → 6 פאר מגיד שיעור.</p>
   {notice&&<p role="status">{notice}</p>}
   {error&&<p role="alert" className="text-destructive">{error}</p>}
  </header>
  <div className="rounded-xl bg-card border p-5 space-y-3">
   <h3 className="font-bold">צימער און ימות־פארבינדונג</h3>
   <Input placeholder="קאנפרענץ נאמען" value={form.name} onChange={e=>change("name",e.target.value)}/>
   <Textarea placeholder="באשרייבונג" value={form.description} onChange={e=>change("description",e.target.value)}/>
   <Input placeholder="/123/4 — ימות באטייליגטע־שלוחה" value={form.listener_extension||""}
    onChange={e=>change("listener_extension",e.target.value||null)}/>
   <Input placeholder="/123/5 — ימות פארוואלטער־שלוחה" value={form.moderator_extension||""}
    onChange={e=>change("moderator_extension",e.target.value||null)}/>
   <p className="text-sm">Provider־סטאטוס: <strong>{form.provider_confirmed?"באשטעטיגט":"נאכנישט באשטעטיגט"}</strong>.
    בלויז א אמת'ער ימות confbridge־טעסט קען פארבינדן די שלוחות; דאס פלאץ טוישט נישט קיין Provider־סעטינגס.</p>
   <div className="grid sm:grid-cols-2 gap-3">
    <div><label className="text-sm font-semibold">צימער־סארט</label>
     <Select value={form.mode} onValueChange={v=>change("mode",v)}>
      <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
       <SelectItem value="lecture">שיעור</SelectItem><SelectItem value="qa">שאלות ותשובות</SelectItem>
       <SelectItem value="discussion">שמועס</SelectItem>
      </SelectContent></Select>
    </div>
    <div><label className="text-sm font-semibold">אריינגאנג</label>
     <Select value={form.entry_mode} onValueChange={v=>change("entry_mode",v)}>
      <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
       <SelectItem value="members">באשטעטיגטע גבהה־מעמבערס</SelectItem>
       <SelectItem value="whitelist">נאר ווייסע ליסטע</SelectItem>
      </SelectContent></Select>
    </div>
   </div>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.waiting_room}
     onChange={e=>change("waiting_room",e.target.checked)}/> ווארט־צימער, לאזן אריין נאר מיט ערלויבעניש</label>
   <div className="grid sm:grid-cols-2 gap-3">
    <div><label className="text-sm">פון דאטום/צייט</label><Input type="datetime-local"
      value={form.scheduled_start_at?.slice(0,16)||""}
      onChange={e=>change("scheduled_start_at",e.target.value?new Date(e.target.value).toISOString():null)}/></div>
    <div><label className="text-sm">ביז דאטום/צייט</label><Input type="datetime-local"
      value={form.scheduled_end_at?.slice(0,16)||""}
      onChange={e=>change("scheduled_end_at",e.target.value?new Date(e.target.value).toISOString():null)}/></div>
   </div>
   <label className="text-sm font-semibold">הנהלה־איבעררייד — שטארקער ווי סקעדזשול</label>
   <Select value={form.override_state} onValueChange={v=>change("override_state",v)}>
    <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
     <SelectItem value="schedule">לויט סקעדזשול</SelectItem>
     <SelectItem value="force_open">הנהלה עפנט יעצט</SelectItem>
     <SelectItem value="force_closed">הנהלה פארמאכט נייע אריינגענג</SelectItem>
    </SelectContent>
   </Select>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled}
    onChange={e=>change("enabled",e.target.checked)}/> אנצינדן דעם ציבור־אריינגאנג (נאר נאך Provider־טעסט)</label>
   <Button disabled={busy} onClick={()=>void save()}>אפהיטן די קאנפרענץ־אנשטעלונגען</Button>
   <p className="text-xs text-muted-foreground">א פעסט־פארמאכונג האלט אפ נייע אריינגענג אין גבהה. צו ארויסווארפן שוין פארבונדענע משתתפים אדער שטום מאכן זיי מוז די ימות־קאנפערענץ־קאנטראל API באשטעטיגט ארבעטן.</p>
  </div>
  <div className="rounded-xl bg-card border p-5 space-y-3">
   <h3 className="font-bold">געמיינזאמע שווארצע/ווייסע ליסטע און רעדן־רעכטן</h3>
   <Input type="number" min="1" placeholder="מעמבער ID" value={member} onChange={e=>setMember(e.target.value)}/>
   <Select value={access} onValueChange={setAccess}><SelectTrigger><SelectValue/></SelectTrigger>
    <SelectContent>
     <SelectItem value="blacklist">שווארצע ליסטע — פארשפארן</SelectItem>
     <SelectItem value="whitelist">ווייסע ליסטע — אריינלאזן</SelectItem>
     <SelectItem value="speaker">ערלויבן צו רעדן</SelectItem>
     <SelectItem value="moderator">פארוואלטער־רעכטן</SelectItem>
    </SelectContent></Select>
   <Textarea placeholder="פארוואס איז די ערלויבעניש געגעבן/אפגענומען?" value={note} onChange={e=>setNote(e.target.value)}/>
   <Button disabled={busy||!Number(member)} onClick={()=>void run(()=>api("/api/admin/conference/access/"+member,"PUT",{access,note}))}>אפהיטן צוטריט־רעכט</Button>
   {data?.access?.map(a=><div className="border rounded-lg p-2 flex justify-between gap-2 items-center" key={a.member_id+"-"+a.access}>
    <div className="text-sm"><strong>{a.name||a.member_id}</strong> — {a.access} <span className="text-xs">{a.note}</span></div>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>api(
     "/api/admin/conference/access/"+a.member_id+"/"+a.access,"DELETE"))}>ארויסנעמען</Button>
   </div>)}
  </div>
  <div className="rounded-xl bg-card border p-5 space-y-3">
   <h3 className="font-bold">משתתפים וואס האבן געבעטן צו רעדן</h3>
   {data?.hands?.filter(x=>x.state==="raised").map(h=><div className="border rounded-lg p-3" key={h.member_id}>
    <p className="text-sm">{h.name||"מעמבער #"+h.member_id}</p>
    <div className="flex gap-2 mt-2">
     <Button size="sm" disabled={busy} onClick={()=>void run(()=>api("/api/admin/conference/hands/"+h.member_id,"POST",{decision:"approved"}))}>געבן רעדן־רעכטן</Button>
     <Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>api("/api/admin/conference/hands/"+h.member_id,"POST",{decision:"dismissed"}))}>אפווארפן</Button>
    </div>
   </div>)}
   <p className="text-xs">א מעמבער־רעדן־רעכט אין גבהה איז א רעקארד; דער ימות־אודיא־מיקראָפאן דארף אויך נאכקומען די Provider־סעטינגס.</p>
  </div>
 </section>;
}
