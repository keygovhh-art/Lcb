import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, BookOpen, Brain, CheckCircle2, Clock, History, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getListAskanusNotesQueryKey } from "@workspace/api-client-react";

type NextTask = { id:number;title:string;deadline?:string|null;priority?:string;caseTitle?:string };
type NextFollowup = { id:number;caseId:number;project?:string;note:string;dueDate?:string|null;url:string };
type NextPledge = { id:number;project?:string;remaining:number;url:string };
type TodayData = {
  dateUtc:string;
  summary:{openTasks:number;dueOrOverdueFollowups:number;totalOpenFollowups:number;totalOutstandingPledges:number;};
  nextTasks:NextTask[];nextFollowups:NextFollowup[];openPledges:NextPledge[];
};
type FocusItem={key:string;label:string;detail:string;href?:string;onAction?:()=>void;rank:number};

async function getToday():Promise<TodayData>{
  const r=await fetch("/api/askanus/max/today",{credentials:"include",cache:"no-store"});
  if(!r.ok)throw new Error("מיין היינט קען יעצט נישט ווערן געלאדנט ("+r.status+")");
  return r.json() as Promise<TodayData>;
}
const todayLocal=()=>new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0")+"-"+String(new Date().getDate()).padStart(2,"0");

export function PersonalFocusBrainDump({onOpenTasks,onOpenNotes,onOpenHistory}:{
  onOpenTasks:()=>void;onOpenNotes:()=>void;onOpenHistory:()=>void;
}){
  const qc=useQueryClient();
  const {data,isPending,error,refetch,isFetching}=useQuery({
    queryKey:["gavhah","personal-focus","today"],
    queryFn:getToday,staleTime:30_000,
  });
  const [dump,setDump]=useState("");
  const [saving,setSaving]=useState(false);
  const [saveMessage,setSaveMessage]=useState("");
  const local=todayLocal();
  const suggestions:FocusItem[]=[];
  if(data){
    for(const f of data.nextFollowups){
      const overdue=!!f.dueDate&&f.dueDate<=local;
      suggestions.push({key:"f"+f.id,label:f.note,detail:(overdue?"יעצט דארף מען נאכפאלגן":"קומענדיגער נאכפאלג")+(f.project?" · "+f.project:""),
        href:f.url,rank:overdue?0:3});
    }
    for(const t of data.nextTasks){
      const overdue=!!t.deadline&&t.deadline<=local;
      suggestions.push({key:"t"+t.id,label:t.title,detail:(overdue?"טערמין היינט/פארשפעטיגט":"אויפגאבע")+(t.caseTitle?" · "+t.caseTitle:""),
        rank:(overdue?0:4)+(t.priority==="high"?-0.5:0),onAction:onOpenTasks});
    }
    for(const p of data.openPledges){
      if(Number(p.remaining)<=0)continue;
      suggestions.push({key:"p"+p.id,label:"אויסשטייענדיגע התחייבות",detail:p.project+" · $"+Number(p.remaining).toLocaleString("en-US")+" נאך אויסשטייענדיג",
        href:p.url,rank:2});
    }
    suggestions.sort((a,b)=>a.rank-b.rank||a.key.localeCompare(b.key));
  }
  async function capture(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const content=dump.trim();
    if(!content||saving)return;
    if(content.length>10000){setSaveMessage("די נאטיץ איז צו לאנג (מער ווי 10,000 אותיות).");return;}
    setSaving(true);setSaveMessage("");
    try{
      // One canonical note record in existing personal askanusnotes.
      const title="מחשבות: "+content.split(/\n/)[0].slice(0,220);
      const r=await fetch("/api/askanus/notes",{method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({title,content})});
      if(!r.ok){const info=await r.json().catch(()=>({})) as {error?:string};
        throw new Error(info.error||"נאטיץ נישט אפגעהיטן");}
      setDump("");setSaveMessage("אפגעהיטן אין דיינע פריוואטע נאטיצן.");
      await qc.invalidateQueries({queryKey:getListAskanusNotesQueryKey()});
    }catch(e){setSaveMessage(e instanceof Error?e.message:"נישט געלונגען — פרוביר נאכאמאל");}
    finally{setSaving(false);}
  }
  return <div dir="rtl" className="space-y-5">
    <section className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h2 className="text-xl font-bold text-primary flex gap-2 items-center"><Brain className="h-5 w-5"/> מיין Focus Center</h2>
          <p className="text-sm text-muted-foreground mt-1">נאר דיינע אייגענע שוין־רעקארדירטע אויפגאבן, נאכפאלגן און התחייבויות. נישט קיין אויסגעטראכטע רעקאמענדאציעס.</p></div>
        <Button variant="outline" size="sm" onClick={()=>void refetch()} disabled={isFetching}>
          <RefreshCcw className="h-4 w-4 ml-2"/> דערפרישן
        </Button>
      </div>
      {isPending&&<p role="status" className="flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin"/> מען לאדט דיין היינט־פלאן…</p>}
      {error&&<p role="alert" className="text-destructive">{error.message}</p>}
      {data&&<>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/40 p-3"><strong className="text-2xl">{data.summary.openTasks}</strong><p className="text-xs">אפענע אויפגאבן</p></div>
          <div className="rounded-xl bg-muted/40 p-3"><strong className="text-2xl">{data.summary.dueOrOverdueFollowups}</strong><p className="text-xs">יעצטיגע נאכפאלגן</p></div>
          <div className="rounded-xl bg-muted/40 p-3"><strong className="text-2xl">{data.summary.totalOutstandingPledges}</strong><p className="text-xs">אפענע התחייבויות</p></div>
        </div>
        <div><h3 className="font-semibold mb-2">דריי באגרינדעטע קומענדיגע שריט</h3>
          {suggestions.length===0?<p className="text-sm text-muted-foreground">קיין אפענע אקציעס פון דיינע רעקארדס. לייג אריין א פערזענליכע אויפגאבע אדער נאכפאלג.</p>:
            <div className="space-y-2">{suggestions.slice(0,3).map((item,i)=>
              <div key={item.key} className="flex items-start gap-3 rounded-xl border p-3">
                <span className="w-7 h-7 rounded-full bg-primary/10 shrink-0 flex items-center justify-center text-primary font-bold">{i+1}</span>
                <div className="min-w-0 flex-1"><p className="font-medium break-words">{item.label}</p><p className="text-xs text-muted-foreground mt-1">{item.detail}</p></div>
                {item.href?<Link href={item.href} className="text-sm text-primary underline shrink-0">עפענען</Link>:
                  <Button variant="outline" size="sm" onClick={item.onAction}>עפענען</Button>}
              </div>)}</div>}
        </div>
      </>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onOpenTasks}><CheckCircle2 className="h-4 w-4 ml-2"/> אויפגאבן</Button>
        <Button variant="outline" onClick={onOpenHistory}><History className="h-4 w-4 ml-2"/> מיין געשיכטע</Button>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-2"><AlertCircle className="h-4 w-4 shrink-0"/> דער אויפשטעל איז א שנעלע פאראויס־אויסוואל פון רעקארדירטע אקציעס; ער איז נאך נישט דער פארגעשריטענער 7/30־טאגיקער Focus Memory.</p>
    </section>
    <section className="rounded-2xl border bg-card p-4 sm:p-6">
      <h2 className="text-xl font-bold text-primary flex gap-2 items-center"><BookOpen className="h-5 w-5"/> Brain Dump — מיין מחשבות־קארטל</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">שרייב שנעל וואס דו ווילסט געדענקען. מיט איין דרוק ווערט עס אפגעהיטן אין דיינע שוין עקזיסטירנדע פריוואטע נאטיצן, נישט אין א צווייטער דאטאבעיס.</p>
      <form className="space-y-3" onSubmit={e=>void capture(e)}>
        <Textarea value={dump} onChange={e=>setDump(e.target.value)} maxLength={10000} rows={5} className="text-base" placeholder="איך דארף געדענקען… וויכטיגע מחשבות… געדאנקען פאר מארגן…"/>
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="submit" disabled={saving||!dump.trim()}>{saving?<Loader2 className="h-4 w-4 animate-spin ml-2"/>:<Clock className="h-4 w-4 ml-2"/>}אפהיטן פריוואט</Button>
          <Button type="button" variant="outline" onClick={onOpenNotes}>זען מיינע נאטיצן</Button>
        </div>
        {saveMessage&&<p role="status" className="text-sm">{saveMessage}</p>}
      </form>
    </section>
  </div>;
}
