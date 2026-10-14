import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Flag, RefreshCw, CheckCircle } from "lucide-react";

type Report = {id:number;groupId:number;postId:number;reason:string;postExcerpt?:string;status:"open"|"resolved";createdAt:string};

export function GroupReportsManagement() {
  const [items,setItems]=useState<Report[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<number|null>(null);
  const {toast}=useToast();
  const load=async()=>{
    setLoading(true);
    try{
      const res=await fetch("/api/admin/group-reports",{credentials:"include",cache:"no-store"});
      if(!res.ok)throw Error("Cannot load private team reports");
      setItems(await res.json());
    }catch(e){
      toast({title:"גבהה־גרופ באריכטן זענען נישט געלאדנט",description:String(e),variant:"destructive"});
    }finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const resolve=async(report:Report)=>{
    setBusy(report.id);
    try{
      const res=await fetch(`/api/admin/group-reports/${report.id}`,{
        method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({status:"resolved"}),
      });
      if(!res.ok)throw Error("Could not resolve report");
      await load();
      toast({title:"דער באריכט איז באהאנדלט"});
    }catch(e){toast({title:"נישט געלונגען",description:String(e),variant:"destructive"});}
    finally{setBusy(null);}
  };
  return <section className="space-y-4" dir="rtl">
    <div className="flex justify-between items-center gap-2 flex-wrap">
      <div>
        <h2 className="text-2xl font-serif font-bold text-primary">גבהה־מערכת · גרופ־רעפארטס</h2>
        <p className="text-sm text-muted-foreground">
          באזונדערער מערכת־אינבאקס. גרופ־אדמינס האבן נישט קיין צוטריט אדער וויסנשאפט וועלכע באריכטן זענען אהער געשיקט געווארן.
        </p>
      </div>
      <Button variant="outline" disabled={loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4 me-2"/>דערפרישן</Button>
    </div>
    {loading&&<p className="text-sm text-muted-foreground">לאדט באריכטן...</p>}
    {!loading&&!items.length&&<p className="rounded-xl border bg-muted/10 p-6 text-sm text-muted-foreground">נישטא קיין באריכטן.</p>}
    {items.map(item=><div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-2 items-center"><Flag className="h-4 w-4 text-secondary"/>
          <span className="text-sm font-semibold">גרופ #{item.groupId} · פאוסט #{item.postId}</span>
        </div>
        <span className="text-xs text-muted-foreground">{item.createdAt.slice(0,10)} · {item.status==="resolved"?"באהאנדלט":"נאך אפן"}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{item.reason}</p>
      {item.postExcerpt&&<p className="rounded-lg border bg-muted/20 p-3 text-xs whitespace-pre-wrap break-words">
        אריגינעלער באריכטעטע אינהאלט: {item.postExcerpt}
      </p>}
      <div className="flex flex-wrap gap-2 items-center">
        <Link href={`/groups/${item.groupId}`} className="text-sm underline text-secondary">עפענען גרופ</Link>
        {item.status!=="resolved"&&<Button size="sm" variant="outline" disabled={busy!==null}
          onClick={()=>void resolve(item)} className="gap-1">
          <CheckCircle className="h-4 w-4"/> {busy===item.id?"היט אפ...":"מארקירן באהאנדלט"}
        </Button>}
      </div>
    </div>)}
  </section>;
}
