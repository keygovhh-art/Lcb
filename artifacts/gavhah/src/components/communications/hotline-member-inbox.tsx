import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {formatGregorianDateTime} from "@/lib/gregorian-date";

type Mail={id:number;subject:string;message:string;readAt:string|null;createdAt:string};
type Inbox={items:Mail[];unreadCount:number;providerPlaybackConnected:boolean};
export function HotlineMemberInbox(){
 const [inbox,setInbox]=useState<Inbox|null>(null);
 const [error,setError]=useState("");
 const [pending,setPending]=useState<number|null>(null);
 const reload=useCallback(async()=>{
  try{
   const r=await fetch("/api/askanus/hotline-mailbox",{credentials:"include",cache:"no-store"});
   if(!r.ok)throw Error("מען קען יעצט נישט עפענען דעם פערזענליכן אינבאקס.");
   setInbox(await r.json());setError("");
  }catch(e){setError(e instanceof Error?e.message:"אינבאקס־פראבלעם");}
 },[]);
 useEffect(()=>{void reload();},[reload]);
 const read=async(id:number)=>{
  setPending(id);try{
   const r=await fetch("/api/askanus/hotline-mailbox/"+id+"/read",{method:"POST",credentials:"include"});
   if(!r.ok)throw Error("נישט געלונגען אנצומערקן אלס געליינט");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"פראבלעם");}
  finally{setPending(null);}
 };
 return <section dir="rtl" className="space-y-3">
   <div className="flex items-center justify-between gap-2 flex-wrap">
    <h2 className="font-semibold text-xl">מיין האטליין־אינבאקס</h2>
    <Button variant="outline" onClick={()=>void reload()}>דערפרישן</Button>
   </div>
   <p className="text-sm text-muted-foreground">
    דא קומען אריין פריוואטע מעסעדזשעס פון דער מערכת. עס ווערט נישט געשיקט קיין SMS און מען רופט דיר נישט ארויס. 
    דאס הערן אויפן טעלעפאן וועט ווערן אקטיוו ערשט נאכן זיכער פארבינדן דעם האטליין־IVR.
   </p>
   <Badge variant="outline">נישט־געליינטע מעסעדזשעס: {inbox?.unreadCount??"…"}</Badge>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   {!inbox?.items.length&&<p className="border rounded-lg p-4 text-sm">נאך קיין מעסעדזשעס אין דיין אינבאקס.</p>}
   {inbox?.items.map(m=><article key={m.id} className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex justify-between gap-2 flex-wrap"><strong>{m.subject}</strong>{!m.readAt&&<Badge>נייע</Badge>}</div>
      <p className="text-sm whitespace-pre-wrap">{m.message}</p>
      <p className="text-xs text-muted-foreground">{formatGregorianDateTime(m.createdAt)}</p>
      {!m.readAt&&<Button size="sm" variant="outline" disabled={pending===m.id} onClick={()=>void read(m.id)}>
       אנמערקן אלס געליינט
      </Button>}
   </article>)}
 </section>;
}
