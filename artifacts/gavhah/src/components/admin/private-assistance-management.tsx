import { useCallback,useEffect,useMemo,useState } from "react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { HandHeart, Users, Search, RefreshCcw, ShieldCheck, ArrowRightLeft } from "lucide-react";

type Contact = {primaryMethod:string;primaryValue:string;backupMethod:string|null;backupValue:string|null;mayConsiderSharing:string}|null;
type Suggestion = {volunteerId:number;volunteerName:string;location:string;score:number;reasons:string[]};
type Request = {
 id:number;userId:number;name:string;description:string;needType:string;urgency:string;
 location:string|null;status:string;createdAt:string;privateContact:Contact;
 activeConnections:Array<{caseId:number;status:string}>;suggestions:Suggestion[];
};
type Volunteer = {
 id:number;userId:number;userName:string;location:string;skills:string[];
 areasOfInterest:string[];availability:string;bio:string|null;privateContact:Contact;
};
export function PrivateAssistanceManagement(){
  const {lang}=useLanguage(),yi=lang==="yi",{toast}=useToast();
  const [requests,setRequests]=useState<Request[]>([]);
  const [volunteers,setVolunteers]=useState<Volunteer[]>([]);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("active");
  const [selected,setSelected]=useState<Record<number,string>>({});
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [volSearch,setVolSearch]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/admin/private-assistance",{credentials:"include",cache:"no-store"});
      if(!r.ok)throw Error("Unable to load private assistance center");
      const data=await r.json();setRequests(data.requests||[]);setVolunteers(data.volunteers||[]);
    }catch(e){toast({title:e instanceof Error?e.message:"Unable to load",variant:"destructive"});}
    finally{setLoading(false);}
  },[toast]);
  useEffect(()=>{void load();},[]);
  const visible=useMemo(()=>requests.filter(r=>{
    if(filter==="active"&&!["pending","open"].includes(r.status))return false;
    if(filter!=="all"&&filter!=="active"&&r.status!==filter)return false;
    const q=search.trim().toLowerCase();
    return !q||[r.name,r.description,r.needType,r.location,r.id].some(x=>String(x||"").toLowerCase().includes(q));
  }),[requests,filter,search]);
  const match=async(help:Request)=>{
    const candidate=Number(selected[help.id]||help.suggestions[0]?.volunteerId);
    const note=(notes[help.id]||"").trim();
    if(!Number.isSafeInteger(candidate)||candidate<=0||note.length<10){
      toast({title:yi?"קלייב אויס אן עסקן און שרייב א הסבר":"Choose a volunteer and write a staff decision",variant:"destructive"});return;
    }
    if(!window.confirm(yi
      ?"די מערכת וועט מאכן א פריוואטן פארבינדונג־פאל. קיינער'ס פרטים ווערן נישט איבערגעגעבן ביז ביידע זענען מסכים און גבהה גיט דעם לעצטן אישור. ווייטער?"
      :"Create a PRIVATE introduction case? Contact stays hidden pending both personal approvals AND separate final Gavhah authorization."))return;
    setBusy(help.id);
    try{
      const r=await fetch(`/api/admin/private-assistance/${help.id}/match`,{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({volunteerId:candidate,note}),
      });
      if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"Matching failed");}
      const result=await r.json();
      toast({title:yi?"דער פריוואטער פאל איז געעפנט געווארן":"Private matching case created",
        description:yi?`פאל #${result.caseId}. גיי צום אפעראציע־אינבאקס בעטן רשות פון ביידע.`:
          `Case #${result.caseId}. Open Operations Inbox to request both participants' consent.`});
      await load();
    }catch(e){toast({title:e instanceof Error?e.message:"Match failed",variant:"destructive"});}
    finally{setBusy(null);}
  };
  return <section className="space-y-5" dir={yi?"rtl":"ltr"}>
    <header>
      <h2 className="text-2xl font-semibold text-primary flex items-center gap-2">
        <HandHeart className="h-6 w-6"/>{yi?"גבהה — פריוואטער הילף־פארבינדונג צענטער":"Private Assistance Matching Center"}
      </h2>
      <p className="text-sm text-muted-foreground mt-2">
        {yi?"קיין אייגנטליכע הילף־בקשה אדער עסקן־ליסטע איז פובליק. די סיסטעם רעכנט אויס פאסיגע עסקנים לויט קענטענישן און געגנט; די מערכת באטראכט און פירט יעדן פאל."
          :"All requests and volunteer applications are confidential. The system ranks possible helpers by skill and locality; Gavhah staff reviews each case and controls introductions."}
      </p>
    </header>
    <div className="grid grid-cols-2 gap-3">
      <div className="border rounded-xl p-4 bg-card"><p className="text-xs text-muted-foreground">{yi?"הילף־בקשות":"Private help requests"}</p><p className="text-2xl font-bold">{requests.length}</p></div>
      <div className="border rounded-xl p-4 bg-card"><p className="text-xs text-muted-foreground">{yi?"עסקנים־ליסטע":"Private volunteers"}</p><p className="text-2xl font-bold">{volunteers.length}</p></div>
    </div>
    <div className="flex gap-2 flex-wrap">
      <div className="flex-1 min-w-[12rem] relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
        <Input value={search} className="pl-9" onChange={e=>setSearch(e.target.value)}
          placeholder={yi?"זוך בקשה, נאמען, סארט הילף אדער געגנט":"Search help requests and locations"}/>
      </div>
      <select value={filter} className="h-10 rounded-md border bg-background px-3" onChange={e=>setFilter(e.target.value)}>
        <option value="active">{yi?"אפענע און ווארטנדיגע":"Active"}</option>
        <option value="all">{yi?"אלע":"All"}</option>
        <option value="pending">{yi?"ווארט אויף איבערזיכט":"Pending"}</option>
        <option value="open">{yi?"אינערליך באהאנדלט":"Being handled"}</option>
        <option value="resolved">{yi?"ערלעדיגט":"Resolved"}</option>
        <option value="rejected">{yi?"אפגעזאגט":"Not accepted"}</option>
      </select>
      <Button variant="outline" disabled={loading} onClick={()=>void load()}>
        <RefreshCcw className="h-4 w-4"/>{yi?"דערפריש":"Refresh"}
      </Button>
    </div>
    {loading?<p className="border rounded-xl p-8">{yi?"לאדנט פריוואטע דאטע":"Loading confidential records"}</p>:
    visible.length===0?<p className="border rounded-xl p-8 text-muted-foreground">
      {yi?"קיין בקשות נישט געפונען":"No requests found"}</p>:
    <div className="space-y-4">
      {visible.map(help=>{
        const recommended=help.suggestions.filter(s=>s.score>0);
        const query=(volSearch[help.id]||"").trim().toLowerCase();
        const options=volunteers.filter(v=>v.userId!==help.userId &&
          (!query||[v.userName,v.location,v.availability,v.bio,...v.skills,...v.areasOfInterest]
            .some(field=>String(field||"").toLowerCase().includes(query))));
        const selectedId=selected[help.id]||String(recommended[0]?.volunteerId||options[0]?.id||"");
        return <article key={help.id} className="rounded-xl border p-4 sm:p-5 bg-card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg">{help.name}</h3>
              <p className="text-xs text-muted-foreground">#{help.id} · {help.location||"—"} · {new Date(help.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={help.urgency==="critical"?"destructive":"outline"}>{help.urgency}</Badge>
              <Badge variant="secondary">{help.needType}</Badge>
              <Badge>{help.status}</Badge>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">{help.description}</p>
          <div className="rounded-md bg-muted/30 border p-3 text-xs space-y-1">
            <p className="font-semibold">{yi?"פריוואטער קאנטאקט — נאר פאר דער מערכת":"Private contact — staff only"}</p>
            {help.privateContact?<p className="break-all">{help.privateContact.primaryMethod}: {help.privateContact.primaryValue}
              {help.privateContact.backupMethod&&help.privateContact.backupValue&&` · ${help.privateContact.backupMethod}: ${help.privateContact.backupValue}`}
              {" · "}{help.privateContact.mayConsiderSharing==="yes"?(yi?"קען מען בעטן רשות":"May ask for consent"):(yi?"נאר דורך גבהה":"Gavhah mediation only")}
            </p>:<p>{yi?"נאך נישטא קיין קאנטאקט־איינשטעלונגען":"No contact methods on file"}</p>}
          </div>
          {help.activeConnections.length>0&&<div className="rounded-md border p-3 text-sm font-medium">
            {yi?"דער פאל ווערט שוין באהאנדלט אין אפעראציע־אינבאקס":"Active introduction already in Operations Inbox"}
            {" · "}{help.activeConnections.map(c=>"#"+c.caseId).join(", ")}
          </div>}
          {["pending","open"].includes(help.status)&&help.activeConnections.length===0&&<>
            <div className="space-y-2">
              <p className="font-semibold text-sm flex gap-2 items-center"><Users className="h-4 w-4"/>
                {yi?"אויטאמאטישע פארשלאגן פון דער פריוואטער עסקנים־ליסטע":"Suggested matches from private volunteer registry"}
              </p>
              {recommended.length>0?
                <div className="space-y-1">{recommended.slice(0,4).map(s=><div key={s.volunteerId}
                  className="flex flex-wrap justify-between gap-2 rounded-md border p-2 text-xs">
                  <span><strong>{s.volunteerName}</strong> · {s.location}</span>
                  <span>{s.score} {yi?"פונקטן":"points"} · {s.reasons.join("; ")}</span>
                </div>)}</div>:
                <p className="text-xs text-muted-foreground">
                  {yi?"קיין שטארקע פאסיגע רעזולטאטן; די מערכת קען אויסקלייבן אן עסקן פערזענליך.":
                    "No strong automatic match. Staff may search and select an available volunteer manually."}
                </p>}
              <label className="space-y-1 block">
                <span className="text-sm font-semibold">{yi?"זוך אין דער פריוואטער עסקנים־ליסטע":"Search staff-only volunteer registry"}</span>
                <Input value={volSearch[help.id]||""}
                  onChange={e=>setVolSearch(v=>({...v,[help.id]:e.target.value}))}
                  placeholder={yi?"נאמען, געגנט, קענטעניש אדער אוועילעביליטי":"Name, location, skills or availability"}/>
              </label>
              <label className="space-y-1 block">
                <span className="text-sm font-semibold">{yi?"קלייב דעם פאסיגן עסקן":"Choose volunteer"}</span>
                <select value={selectedId} onChange={e=>setSelected(v=>({...v,[help.id]:e.target.value}))}
                  className="w-full h-10 rounded-md border bg-background px-2">
                  <option value="">{yi?"קלייב אויס":"Select"}</option>
                  {options.map(vol=><option key={vol.id} value={vol.id}>
                    {vol.userName} · {vol.location} · {vol.skills.slice(0,3).join(", ")}
                  </option>)}
                </select>
              </label>
              {selectedId&&options.some(v=>v.id===Number(selectedId))&&<div className="text-xs text-muted-foreground rounded-md border p-3 bg-muted/20">
                {(()=>{
                  const vol=options.find(v=>v.id===Number(selectedId));
                  return vol?<div className="space-y-1">
                    <p>{yi?"עסקן־אינפארמאציע — נאר פאר דער מערכת":"Private volunteer details"}</p>
                    <p>{vol.bio||"—"}</p>
                    <p>{yi?"ווען ער קען העלפן: ":"Availability: "}{vol.availability}</p>
                    <p className="break-all">{vol.privateContact?.primaryMethod||"—"}: {vol.privateContact?.primaryValue||"—"}</p>
                  </div>:null;
                })()}
              </div>}
              <Textarea rows={2} value={notes[help.id]||""}
                onChange={e=>setNotes(x=>({...x,[help.id]:e.target.value}))}
                placeholder={yi?"פארוואס איז דער עסקן פאסיג? שרייב אן אינערליכן באשלוס.":"Document why this volunteer is suitable (staff-only decision)."}/>
              <Button disabled={busy!==null||!selectedId||!options.some(v=>v.id===Number(selectedId))||(notes[help.id]||"").trim().length<10}
                onClick={()=>void match(help)} className="gap-2">
                <ArrowRightLeft className="h-4 w-4"/>
                {yi?"עפן א פריוואטן פארבינדונג־פאל":"Create private introduction case"}
              </Button>
              <p className="text-xs text-muted-foreground flex gap-2 items-start">
                <ShieldCheck className="h-4 w-4 shrink-0"/>
                {yi?"נאך דעם וועט דער אדמין אינעם אפעראציע־אינבאקס בעטן רשות פון ביידע, און געבן א באזונדערע לעצטע ערלויבעניש נאר נאכדעם."
                :"Next, request separate permission from BOTH in Operations Inbox. No contact is released without an additional final Gavhah authorization."}
              </p>
            </div>
          </>}
        </article>;
      })}
    </div>}
  </section>;
}
