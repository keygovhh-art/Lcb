import { useEffect, useState } from "react";
import { BookOpen, History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type HistoryItem={
 id:number;kind:string;action:string;caseId:number|null;entityId:number;
 title:string;details:string;happenedAt:string;
};
type HistoryResult={items:HistoryItem[];hasMore:boolean;nextOffset:number;note:string};
const groups=[
 {kind:"all",name:"אלעס"},
 {kind:"followups",name:"נאכפאלגן"},
 {kind:"pledges",name:"התחייבויות"},
 {kind:"payments",name:"באצאלונגען"},
 {kind:"cases",name:"פראיעקטן"},
 {kind:"tasks",name:"אויפגאבן"},
 {kind:"calls",name:"רופן"},
 {kind:"events",name:"ענדערונגען"},
 {kind:"activities",name:"אלטע באריכטן"},
];
const actionNames:Record<string,string>={
 completed:"פארטיג",open:"אפן",closed:"פארענדיגט",in_progress:"אינמיטן",
 paid:"גאנץ באצאלט",manually_reported:"מאנועל באריכטעט",
 funds_received:"באריכטעט באקומען",funds_promised:"צוגעזאגט",
 status_change:"מצב געטוישט",note:"באמערקונג",contact:"קשר־באריכט",
 followup_completed:"נאכפאלג פארטיג",followup_reopened:"נאכפאלג צוריק געעפנט",
 followup_edited:"נאכפאלג געטוישט",
 followup_recurring_generated:"קומענדיגער איבערחזרנדיגער נאכפאלג",
 pledge_partially_paid:"טיילווייז באצאלטע התחייבות",
 pledge_fully_paid:"גאנץ באצאלטע התחייבות",
 receipt_accounting_reversal:"פינאנציעלע קארעקטור",
 case_completed:"פארענדיגטער פראיעקט",case_reopened:"פראיעקט צוריק געעפנט",
 case_status_changed:"פראיעקט־מצב געטוישט",
 task_completed:"אויפגאבע פארטיג",task_reopened:"אויפגאבע צוריק געעפנט",
 task_edited:"אויפגאבע געטוישט",task_explicitly_deleted:"אויפגאבע בפירוש אויסגעמעקט",
};

function presentDetails(item:HistoryItem):string{
  try{
    const parsed=JSON.parse(item.details) as Record<string,unknown>;
    return Object.entries(parsed)
      .filter(([key,val])=>val!==null&&val!==""&&key!=="verification")
      .slice(0,12).map(([key,val])=>key+": "+String(val)).join(" · ");
  }catch{return item.details;}
}
async function getHistory(kind:string,q:string,offset:number,caseId?:number){
 const query=new URLSearchParams({kind,limit:"40",offset:String(offset)});
 if(q.trim())query.set("q",q.trim());
 if(caseId)query.set("caseId",String(caseId));
 const response=await fetch("/api/askanus/max/history?"+query,{
   credentials:"include",cache:"no-store",
 });
 if(!response.ok){
  const body=await response.json().catch(()=>({}));
  throw Error(body.error||"נישט געלונגען צו לאָדן היסטאריע");
 }
 return response.json() as Promise<HistoryResult>;
}
/** Open, completed, fully funded, closed and legacy records remain searchable. */
export function MaxHistoryPanel({caseId}:{caseId?:number}){
 const [items,setItems]=useState<HistoryItem[]>([]);
 const [kind,setKind]=useState("all");
 const [q,setQ]=useState("");
 const [term,setTerm]=useState("");
 const [offset,setOffset]=useState(0);
 const [hasMore,setHasMore]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let mounted=true;
  setLoading(true);setError("");
  getHistory(kind,term,0,caseId).then(data=>{
    if(!mounted)return;
    setItems(data.items);setOffset(data.nextOffset);setHasMore(data.hasMore);
  }).catch(e=>{if(mounted)setError(String(e.message||e));})
    .finally(()=>{if(mounted)setLoading(false);});
  return ()=>{mounted=false;};
 },[kind,term,caseId]);
 const more=async()=>{
  if(loading||!hasMore)return;
  setLoading(true);setError("");
  try{
    const data=await getHistory(kind,term,offset,caseId);
    setItems(rows=>[...rows,...data.items]);
    setOffset(data.nextOffset);setHasMore(data.hasMore);
  }catch(e){setError(String(e.message||e));}
  finally{setLoading(false);}
 };
 return <section dir="rtl" aria-label="MAX שטענדיגע היסטאריע"
  className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
  <div className="flex gap-2 items-center">
    <History className="w-5 h-5 shrink-0"/>
    <div>
      <h3 className="font-bold text-lg">מיין גאנצע עסקנות־געשיכטע</h3>
      <p className="text-xs text-muted-foreground">
        אלעס וואס איז געטון געווארן בלייבט דא — אויך פארענדיגטע פראיעקטן,
        באצאלטע התחייבויות און פארטיגע נאכפאלגן.
        פארטיג מאכן מיינט נישט אויסמעקן.
      </p>
    </div>
  </div>
  <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();setTerm(q);}}>
    <Input aria-label="זוכן אין דער געשיכטע" value={q} maxLength={120}
      onChange={e=>setQ(e.target.value)}
      placeholder="זוך א מענטש, פראיעקט, באמערקונג..." className="flex-1 min-w-40"/>
    <Button type="submit" variant="outline" disabled={loading}>
      <Search className="w-4 h-4 ml-1"/> זוכן
    </Button>
  </form>
  <div className="flex flex-wrap gap-2">
    {groups.map(g=><Button key={g.kind} type="button" size="sm"
      variant={kind===g.kind?"default":"outline"}
      onClick={()=>setKind(g.kind)}>{g.name}</Button>)}
  </div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {loading&&items.length===0&&<p role="status" className="text-sm">לאדנט היסטאריע...</p>}
  {!loading&&items.length===0&&<p className="text-sm text-muted-foreground">
    נישט געפונען קיין איינטראגן מיט די אויסגעקליבענע פילטערס.
  </p>}
  <div className="space-y-2">
    {items.map((item,i)=><article key={item.kind+":"+item.id+":"+i}
      className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="w-3.5 h-3.5"/>
        <strong className="text-foreground">
          {actionNames[item.action]||item.action}
        </strong>
        <span>{groups.find(g=>g.kind===item.kind)?.name||item.kind}</span>
        <span dir="ltr">{new Date(item.happenedAt).toLocaleString()}</span>
      </div>
      <h4 className="font-semibold text-sm">{item.title}</h4>
      {item.details&&<p className="text-xs leading-relaxed whitespace-pre-wrap">
        {presentDetails(item)}
      </p>}
      {item.caseId&&<a href={"/my?case="+item.caseId}
        className="inline-flex text-xs underline min-h-8 items-center">
        צום פארבונדענעם פראיעקט
      </a>}
    </article>)}
  </div>
  {hasMore&&<Button type="button" variant="outline" className="w-full"
    disabled={loading} onClick={()=>void more()}>ווייז נאך אלטע איינטראגן</Button>}
  <p className="text-xs text-muted-foreground">
    איינטראגן ווערן נישט אוטאמאטיש אויסגעמעקט ווען מען ענדיגט אן אויפגאבע.
    א בפירוש אויסמעקונג איז א באזונדערע פעולה. פינאנציעלע אודיט־רעקארדס
    קענען בלייבן אפגעהיטן אויך נאך אזא פעולה.
  </p>
 </section>;
}
