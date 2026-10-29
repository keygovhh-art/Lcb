import {useEffect,useState} from "react";
import {RefreshCw,Clock,Users,ClipboardList} from "lucide-react";
import {Button} from "@/components/ui/button";

type Today={
 summary:{openTasks:number;dueOrOverdueFollowups:number},
 nextFollowups:Array<{id:number;project:string;note:string;dueDate:string|null;dueTime?:string|null;timeZone?:string|null}>,
 nextTasks:Array<{id:number;title:string;deadline:string;caseTitle:string}>
};
type Recontact={
 id:number;donor:string;project:string;scope:string;dueAt:string;
 status:string;eligible:boolean;doNotCall:boolean;
};
type Report={id:number;contactName:string;outcome:string;moneyKind:string;amount:number;createdAt:string};
const labels:Record<string,string>={
 gave:"געגעבן א נדבה",no_answer:"נישט אויפגעהויבן",
 callback:"בעט צוריקצורופן",not_interested:"נישט אינטערעסירט",
 do_not_call:"בעט נישט מער צו רופן",other:"אנדערע",
 spoke:"אלטע באריכטן: גערעדט"
};
async function get<T>(uri:string):Promise<T>{
 const response=await fetch(uri,{credentials:"include",cache:"no-store"});
 if(!response.ok)throw Error("דער טישל האט נישט געקענט ליינען די לעצטע MAX־דאטן.");
 return response.json() as Promise<T>;
}
const date=(v:string)=>new Date(v).toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});

export function MaxTishl({revision=0}:{revision?:number}){
 const [today,setToday]=useState<Today|null>(null);
 const [contacts,setContacts]=useState<Recontact[]>([]);
 const [groups,setGroups]=useState<Array<{outcome:string;count:number}>>([]);
 const [reports,setReports]=useState<Report[]>([]);
 const [chosen,setChosen]=useState("all");
 const [view,setView]=useState<"due"|"waiting"|"all">("due");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");
  void Promise.all([
   get<Today>("/api/askanus/max/today"),
   get<{items:Recontact[]}>("/api/askanus/max/recontact?filter="+view),
   get<{groups:Array<{outcome:string;count:number}>;items:Report[]}>("/api/askanus/max/outcome-groups"+(chosen==="all"?"":"?outcome="+chosen))
  ]).then(([t,r,g])=>{
   if(cancelled)return;
   setToday(t);setContacts(r.items);setGroups(g.groups);setReports(g.items);
  }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"נישט געלונגען");})
    .finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true};
 },[chosen,view,revision,refresh]);
 const due=contacts.filter(c=>c.eligible);
 const visibleFollowups=today?.nextFollowups||[];
 return <section id="max-tishl" dir="rtl" className="rounded-2xl border bg-card p-4 sm:p-6 space-y-5 scroll-mt-24">
  <header className="flex flex-wrap gap-3 justify-between items-center">
   <div><h2 className="font-bold text-xl flex gap-2 items-center"><ClipboardList className="h-5 w-5"/> מיין טישל — וואס דארף איך יעצט טון?</h2>
    <p className="text-sm text-muted-foreground">איין ארבעטס־פלאץ פאר אויפגאבן, צוריק־רופן, נדבן־צייטן און די געשיכטע פון אלע רעזולטאטן.</p></div>
   <Button type="button" variant="outline" disabled={loading} onClick={()=>setRefresh(x=>x+1)}>
    <RefreshCw className="h-4 w-4 ml-2"/> דערפרישן
   </Button>
  </header>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-sm">
   <div className="rounded-xl border p-3"><b className="block text-2xl">{today?.summary.dueOrOverdueFollowups??"—"}</b> אפענע נאכפאלגן היינט/פריער</div>
   <div className="rounded-xl border p-3"><b className="block text-2xl">{today?.summary.openTasks??"—"}</b> אויפגאבן</div>
   <div className="rounded-xl border p-3 col-span-2 sm:col-span-1"><b className="block text-2xl">{view==="due"?due.length:"—"}</b> נדבנים־צייט אנגעקומען (אויף דער געלאדענער זייט)</div>
  </div>
  <div className="space-y-2">
   <h3 className="font-semibold flex gap-2 items-center"><Clock className="h-4 w-4"/> מיין נאכפאלג־טישל</h3>
   {visibleFollowups.length===0?<p className="text-sm text-muted-foreground">דערווייל זענען נישטא געלאדענע נאכפאלגן.</p>:visibleFollowups.slice(0,15).map(f=>
    <div className="rounded-lg border p-3 text-sm" key={f.id}>
     <b>{f.project}</b> · {f.note}
     <span className="block text-xs text-muted-foreground">{f.dueDate||"נאך אן א באשטימטער דאטום"} {f.dueTime||""} {f.timeZone||""}</span>
    </div>)}
  </div>
  <div className="space-y-2 border-t pt-4">
   <h3 className="font-semibold">מיינע נעקסטע אויפגאבן</h3>
   {(today?.nextTasks||[]).slice(0,8).map(x=><div key={x.id} className="rounded-lg border p-3 text-sm">
    <b>{x.title}</b> {x.caseTitle&&" · "+x.caseTitle}
    <span className="text-muted-foreground block text-xs">{x.deadline}</span>
   </div>)}
  </div>
  <div className="space-y-3 border-t pt-4">
   <h3 className="font-semibold flex gap-2 items-center"><Users className="h-4 w-4"/> נדבנים — ווען קען מען ווידער באטראכטן א רוף?</h3>
   <div className="flex flex-wrap gap-2">{(["due","waiting","all"] as const).map(v=>
    <Button key={v} type="button" size="sm" variant={view===v?"default":"outline"} onClick={()=>setView(v)}>
     {v==="due"?"צייט איז שוין אנגעקומען":v==="waiting"?"ווארט נאך":"אלע"}
    </Button>)}</div>
   {contacts.length===0?<p className="text-sm text-muted-foreground">נאך נישטא קיין נדבנים אין דער אויסגעקליבענער ליסטע.</p>:
    contacts.map(x=><div key={x.id} className="flex flex-wrap justify-between gap-2 border rounded-lg p-3 text-sm">
     <div><b>{x.donor}</b> · {x.project}<span className="block text-xs text-muted-foreground">
      {x.scope==="same_purpose"?"פארן זעלבן צוועק":"פאר א נייעם צוועק"} · {date(x.dueAt)}</span></div>
     <span className="font-medium">{x.doNotCall?"נישט רופן — פארבאטן":x.eligible?"צייט איז אנגעקומען":"ווארט נאך"}</span>
    </div>)}
   <p className="text-xs text-muted-foreground">צייט אנגעקומען מיינט נישט אויטאמאטישע רוף־רשות. MAX קאנטראלירט ״נישט רופן״ און אנדערע שוץ־כללים באזונדער.</p>
  </div>
  <div className="space-y-3 border-t pt-4">
   <h3 className="font-semibold">רוף־רעזולטאטן — אויטאמאטיש לויט קאטאגאריע</h3>
   <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" variant={chosen==="all"?"default":"outline"} onClick={()=>setChosen("all")}>אלע באריכטן</Button>
    {Object.entries(labels).map(([key,label])=>{
     const count=groups.find(g=>g.outcome===key)?.count||0;
     return <Button type="button" key={key} size="sm" variant={chosen===key?"default":"outline"}
      onClick={()=>setChosen(key)}>{label} ({count})</Button>;
    })}
   </div>
   {reports.slice(0,30).map(x=><div key={x.id} className="rounded-lg border px-3 py-2 text-sm flex flex-wrap justify-between gap-2">
    <span><b>{x.contactName}</b> · {labels[x.outcome]||x.outcome}</span>
    <span className="text-muted-foreground">{x.moneyKind!=="none"?"$"+x.amount.toLocaleString()+" · ":""}{date(x.createdAt)}</span>
   </div>)}
   {!reports.length&&<p className="text-sm text-muted-foreground">נישטא קיין באריכטן אין דער קאטאגאריע.</p>}
  </div>
 </section>;
}
