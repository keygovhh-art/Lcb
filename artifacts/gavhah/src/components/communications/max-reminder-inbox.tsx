import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Reminder={
  id:number;caseId:number;project:string;urgency:string;
  note:string;dueDate:string|null;dueTime:string|null;timeZone:string|null;
  repeatRule:string;donorId:number|null;donorName:string|null;
  status:"due"|"today"|"upcoming"|"undated";source:"case_followups";
  snoozed:boolean;snoozedUntil:string|null;
};
type Inbox={items:Reminder[];nextOffset:number;hasMore:boolean;
  viewTimeZone:string;asOf:string;note:string};

async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(path,{credentials:"include",cache:"no-store",...init});
  if(!response.ok){
    const body=await response.json().catch(()=>({}));
    throw Error(body.error||"נישט געלונגען");
  }
  return response.json() as Promise<T>;
}
function getTimeZone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York";}
  catch{return "America/New_York";}
}
/** A private in-app inbox. This does NOT claim background push notifications. */
export function MaxReminderInbox({onChanged}:{onChanged:()=>void}){
  const [items,setItems]=useState<Reminder[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [offset,setOffset]=useState(0);
  const [busy,setBusy]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState<"all"|"now"|"snoozed">("now");

  const reload=useCallback(async()=>{
    try{
      const data=await api<Inbox>("/api/askanus/max/reminders?limit=50&timeZone="+
        encodeURIComponent(getTimeZone()));
      setItems(data.items);setHasMore(data.hasMore);setOffset(data.nextOffset);
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען צו לאדן דערמאנונגען");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    void reload();
    const timer=window.setInterval(()=>{void reload();},60_000);
    return ()=>window.clearInterval(timer);
  },[reload]);
  const more=async()=>{
    if(loading||!hasMore)return;
    setLoading(true);
    try{
      const data=await api<Inbox>("/api/askanus/max/reminders?limit=50&offset="+offset+
        "&timeZone="+encodeURIComponent(getTimeZone()));
      setItems(old=>[...old,...data.items.filter(r=>!old.some(v=>v.id===r.id))]);
      setHasMore(data.hasMore);setOffset(data.nextOffset);
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setLoading(false);}
  };
  const action=async(id:number,kind:"complete"|"snooze"|"unsnooze",days=0)=>{
    setBusy(id);setError("");
    try{
      if(kind==="complete"){
        await api("/api/askanus/followups/"+id+"/toggle",{
          method:"PATCH",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({completed:true}),
        });
        onChanged();
      }else{
        const body=kind==="unsnooze"?{clear:true}:
          {until:new Date(Date.now()+days*86400000).toISOString()};
        await api("/api/askanus/max/reminders/"+id+"/snooze",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify(body),
        });
      }
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setBusy(null);}
  };
  const due=items.filter(r=>!r.snoozed&&r.status==="due");
  const upcoming=items.filter(r=>!r.snoozed&&r.status!=="due");
  const shown=(filter==="now"?due:filter==="snoozed"?items.filter(r=>r.snoozed):
    [...due,...upcoming,...items.filter(r=>r.snoozed)]);
  return <section aria-label="MAX פערזענליכע דערמאנונגען" dir="rtl"
    className="rounded-xl border bg-card p-4 sm:p-6 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold flex items-center gap-2"><BellRing className="h-5 w-5"/>
        MAX — מיינע דערמאנונגען
      </h3>
      <Button type="button" variant="outline" size="sm" onClick={()=>void reload()}
        disabled={loading||busy!==null}><RefreshCw className="h-4 w-4 ml-1"/> דערפרישן</Button>
    </div>
    <p className="text-xs text-muted-foreground">
      דיין פערזענליכער אינבאקס דערהיינטיגט זיך ווען די עפפ איז אפן.
      א דערמאנונג שפעטער מאכן טוישט <strong>נישט</strong> דעם אמת׳ן
      נאכפאלג אין „מיין עסקנות“. דאס איז דערווייל נישט קיין פוש־ אדער אימעיל־מעלדונג.
    </p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant={filter==="now"?"default":"outline"}
        onClick={()=>setFilter("now")}>יעצט ({due.length}{hasMore?"+":""})</Button>
      <Button type="button" size="sm" variant={filter==="all"?"default":"outline"}
        onClick={()=>setFilter("all")}>אלע קומענדיגע</Button>
      <Button type="button" size="sm" variant={filter==="snoozed"?"default":"outline"}
        onClick={()=>setFilter("snoozed")}>צייטווייליג אפגעשטופט</Button>
    </div>
    {loading&&items.length===0&&<p role="status" className="text-sm">לאדנט...</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {shown.length===0&&!loading&&<p className="text-sm text-muted-foreground">
      {filter==="now"?"דערווייל נישטא קיין דרינגליכע דערמאנונגען.":"קיין נאכפאלגן אין דער אויסגעקליבענער ליסטע."}
    </p>}
    {shown.map(r=><article key={r.id} className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <strong className="text-sm">{r.project}{r.donorName?" · "+r.donorName:""}</strong>
        <span className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
          <Clock3 className="h-3 w-3"/>
          {r.dueDate||"—"} {r.dueTime||""} {r.timeZone||""}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{r.note}</p>
      {r.snoozed&&<p className="text-xs text-muted-foreground">
        דערמאנונג אפגעשטופט ביז {new Date(r.snoozedUntil!).toLocaleString()}
      </p>}
      {r.repeatRule!=="none"&&<p className="text-xs text-muted-foreground">
        איבערחזרנדיג: {r.repeatRule==="daily"?"יעדן טאג":r.repeatRule==="weekly"?"יעדע וואך":"יעדן חודש"}
      </p>}
      <div className="flex gap-2 flex-wrap">
        <Button type="button" size="sm" disabled={busy!==null}
          onClick={()=>void action(r.id,"complete")}><CheckCircle2 className="h-4 w-4 ml-1"/> פארטיג</Button>
        {r.snoozed?
          <Button type="button" size="sm" variant="outline" disabled={busy!==null}
            onClick={()=>void action(r.id,"unsnooze")}>צוריק צום אינבאקס</Button>:
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy!==null}
              onClick={()=>void action(r.id,"snooze",1)}>דערמאן מארגן</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy!==null}
              onClick={()=>void action(r.id,"snooze",7)}>דערמאן אין א וואך</Button>
          </>}
        <a className="inline-flex items-center min-h-9 px-2 text-xs underline"
          href={"/my?case="+r.caseId}>עפענען אין מיין עסקנות</a>
      </div>
    </article>)}
    {hasMore&&<Button type="button" variant="outline" className="w-full" disabled={loading||busy!==null}
      onClick={()=>void more()}>ווייז נאך דערמאנונגען</Button>}
  </section>;
}
