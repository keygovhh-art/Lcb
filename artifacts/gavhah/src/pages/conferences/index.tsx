import {useCallback,useEffect,useState} from "react";
import {Layout} from "@/components/layout/layout";
import {useAuth} from "@/context/auth-context";
import {Button} from "@/components/ui/button";
import {Phone,Mic,Users,Hand,CalendarClock,ShieldCheck} from "lucide-react";
type Public={name:string;description:string;enabled:boolean;connected:boolean;currentlyOpen:boolean;
 waitingRoom:boolean;entryMode:string;mode:string;scheduledStart:string|null;scheduledEnd:string|null;maxParticipants:number};
type Mine={role:string;allowed:boolean;message:string;handState:string|null;mayRequestHand:boolean;providerConnected:boolean};
const date=(s:string|null)=>s?new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",
 day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}).format(new Date(s)):"נישט אנגעשטעלט";
export default function UnifiedConference(){
 const {isAuthenticated}=useAuth();
 const [details,setDetails]=useState<Public|null>(null),[mine,setMine]=useState<Mine|null>(null);
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[loading,setLoading]=useState(false);
 const read=useCallback(async()=>{
  try{
   const [publicResponse,privateResponse]=await Promise.all([
    fetch("/api/conference",{cache:"no-store"}),
    isAuthenticated?fetch("/api/me/conference",{cache:"no-store",credentials:"same-origin"}):Promise.resolve(null)
   ]);
   if(!publicResponse.ok)throw Error("די קאנפרענץ־סיסטעם קען נישט געליינט ווערן.");
   setDetails(await publicResponse.json());setMine(privateResponse?.ok?await privateResponse.json():null);setError("");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
 },[isAuthenticated]);
 useEffect(()=>{void read();},[read]);
 const requestHand=async()=>{
  if(loading||!isAuthenticated)return;
  setLoading(true);setError("");setSuccess("");
  try{
   const r=await fetch("/api/me/conference/raise-hand",{method:"POST",credentials:"same-origin"});
   const result=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(result.error||"מען קען נישט בעטן רעדן.");
   setSuccess("דיין בקשה צו רעדן איז אנגעקומען. דער פארוואלטער קען עס איבערקוקן.");
   await read();
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setLoading(false);}
 };
 return <Layout>
  <main dir="rtl" lang="yi" className="container mx-auto px-4 py-9 space-y-6 max-w-4xl">
   <header className="space-y-2">
    <h1 className="text-3xl font-bold">התקבצו — גבהה קאנפרענץ</h1>
    <p className="text-muted-foreground">איין געמיינזאמער קאנפרענץ־צימער פאר מגידי שיעור און אנדערע באטייליגטע, מיט דער זעלבער שווארצער/ווייסער ליסטע און פארוואלטער־רעכטן.</p>
   </header>
   {error&&<p role="alert" className="rounded-lg border p-3 text-destructive">{error}</p>}
   {success&&<p role="status" className="rounded-lg border p-3">{success}</p>}
   {details&&<section className="rounded-xl bg-card border p-5 space-y-4">
    <h2 className="text-xl font-bold">{details.name}</h2>
    {details.description&&<p>{details.description}</p>}
    <div className="grid grid-cols-2 gap-3 text-sm">
     <div className="border rounded-lg p-3"><ShieldCheck className="w-4 h-4 inline me-1"/>
      מצב: <strong>{details.currentlyOpen?"דער צימער איז אפן":
       details.connected?"דער צימער איז פארמאכט":"די ימות־פארבינדונג ווארט נאך אויף באשטעטיגונג"}</strong>
     </div>
     <div className="border rounded-lg p-3"><Users className="w-4 h-4 inline me-1"/>
       סארט: <strong>{details.mode==="lecture"?"שיעור":details.mode==="qa"?"שאלות ותשובות":"שמועס"}</strong>
     </div>
     <div className="border rounded-lg p-3"><CalendarClock className="w-4 h-4 inline me-1"/>
       אנהייב: <strong>{date(details.scheduledStart)}</strong>
     </div>
     <div className="border rounded-lg p-3"><CalendarClock className="w-4 h-4 inline me-1"/>
       סוף: <strong>{date(details.scheduledEnd)}</strong>
     </div>
    </div>
    {details.waitingRoom&&<p className="text-sm">ווארט־צימער איז אנגעשטעלט. די הנהלה קען באשטעטיגן ווער ס'גייט אריין.</p>}
    <div className="flex flex-wrap gap-2">
     <a href="tel:+16055621286" className="inline-flex items-center rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground">
       <Phone className="size-4 me-1"/> רוף גבהה האטליין — 605-562-1286
     </a>
     <Button variant="outline" onClick={()=>void read()}>דערפרישן לייוו סטאטוס</Button>
    </div>
    <p className="text-xs text-muted-foreground">אינעם האטליין ווערן די קאנפרענץ־קנעפלעך דערקלערט. די וועבזייט שפילט נישט א פיקטיוון לייוו־אודיא־סטרים.</p>
   </section>}
   <section className="rounded-xl bg-card border p-5 space-y-3">
    <h2 className="text-xl font-bold">מיין צוטריט און בעטן רעדן</h2>
    {!isAuthenticated?<a href="/login" className="text-primary underline">לאָג אריין צו דערזען דיין קאנפרענץ־צוטריט.</a>:
     mine?<div className="space-y-3">
      <p className="text-sm">דיין ראלע: <strong>{mine.role==="moderator"?"פארוואלטער":mine.role==="speaker"?"מגיד שיעור":mine.role==="blocked"?"באגרעניצט":"באטייליגטער"}</strong></p>
      <p className="text-sm">{mine.message}</p>
      <p className="text-sm">רעדן־בקשה: {mine.handState||"קיין בקשה"}</p>
      <Button disabled={loading||!mine.mayRequestHand}
       onClick={()=>void requestHand()}><Hand className="w-4 h-4 me-1"/> איך וויל רעדן</Button>
     </div>:<p className="text-sm">מען קאָנטראָלירט דעם פארבונדענעם אקאונט...</p>}
   </section>
  </main>
 </Layout>;
}
