import { useState } from "react";
import { BookOpen, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Answer={
  intent:string;found:boolean;answer:string;limitation:string;
  contactId?:number;contactName?:string;
  sources:Array<{table:string;id:number;caseId?:number}>;
  items?:Array<{id:number;caseId:number;note:string;dueDate:string|null;dueTime:string|null}>;
};
const options=[
  {intent:"last_call",label:"ווען האב איך אים לעצט גערופן?",contact:true},
  {intent:"donor_money",label:"וואס האט ער געגעבן און צוגעזאגט?",contact:true},
  {intent:"overdue",label:"וואס האב איך פארשפעטיגט?",contact:false},
  {intent:"my_projects",label:"וויאזוי שטייען מיינע פראיעקטן?",contact:false},
];
export function MaxSourceHelper({contactId,contactName}:{contactId:number|null;contactName?:string}){
  const [answer,setAnswer]=useState<Answer|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const ask=async(intent:string,requiresContact:boolean)=>{
    if(requiresContact&&!contactId){setError("קלייב קודם אויס דעם קאנטאקט ביי מענטשן.");setAnswer(null);return;}
    setError("");setLoading(true);setAnswer(null);
    try{
      const params=new URLSearchParams({intent});
      if(requiresContact&&contactId)params.set("contactId",String(contactId));
      const r=await fetch("/api/askanus/max/assistant?"+params.toString(),
        {credentials:"include",cache:"no-store"});
      const data=await r.json();
      if(!r.ok)throw Error(data.error||"נישט געלונגען אויפזוכן");
      setAnswer(data);
    }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
    finally{setLoading(false);}
  };
  return <section dir="rtl" className="rounded-xl border bg-card p-4 sm:p-6 space-y-3"
    aria-label="מיין קלוגער עסקנות־העלפער">
    <h3 className="font-bold text-lg flex gap-2 items-center"><Sparkles className="h-5 w-5"/> מיין קלוגער עסקנות־העלפער</h3>
    <p className="text-sm text-muted-foreground">
      דער העלפער זוכט אויס אמת׳ע רעקארדס פון דיין אקאונט. ער שאצט נישט
      קיין מענטשן און ער מאכט נישט קיין השערות איבער באצאלונגען.
      דערווייל ארבעט ער מיט די אויסגעקליבענע פראגעס, נישט מיט א פולן AI־שמועס.
    </p>
    {contactName&&<p className="text-xs font-medium">אויסגעקליבענער קאנטאקט: {contactName}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map(o=><Button key={o.intent} type="button" variant="outline"
        className="h-auto min-h-11 text-right whitespace-normal justify-start"
        disabled={loading} onClick={()=>void ask(o.intent,o.contact)}>
        <Search className="w-4 h-4 ml-2 shrink-0"/>{o.label}
      </Button>)}
    </div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading&&<p role="status" className="text-sm">זוכט אין די ערלויבטע רעקארדס...</p>}
    {answer&&<div className="rounded-lg border bg-muted/20 p-3 space-y-3" role="status">
      <p className="font-medium text-sm whitespace-pre-wrap">{answer.answer}</p>
      {answer.items?.map(i=><a key={i.id} href={"/my?case="+i.caseId}
        className="block border rounded p-2 text-sm hover:underline">
        {i.note} · {i.dueDate||"קיין דאטום"}{i.dueTime?" "+i.dueTime:""}
      </a>)}
      {answer.sources.length>0&&<div className="space-y-1">
        <h4 className="font-semibold text-xs flex gap-1 items-center"><BookOpen className="h-3 w-3"/> מקורות צום עפענען</h4>
        <div className="flex flex-wrap gap-2">
          {answer.sources.slice(0,12).map((x,i)=><a
            key={x.table+":"+x.id+":"+i}
            href={x.caseId?"/my?case="+x.caseId:"/my"}
            className="text-xs underline text-secondary">
            {x.table} #{x.id}
          </a>)}
        </div>
      </div>}
      <p className="text-xs text-muted-foreground">{answer.limitation}</p>
    </div>}
  </section>;
}
