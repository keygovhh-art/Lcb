import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {MapPin,Navigation,CalendarClock,RotateCcw} from "lucide-react";

type Coords={latitude:number;longitude:number};
type Stop={place:{id:number;dialCode:number;name:string;address:string;city:string;point:Coords};
 event:{startsAt:string;localTime:string;prayer:string};
 durationMinutes:number;distanceMeters:number;minutesEarly:number;
 departure:string;arrival:string;provider:string};
type Trip={stops:Stop[];later:Array<{placeId:number;prayer:string;startsAt:string;localTime:string}>;
 warning:string|null;provider:string};
type Minyan={id:number;dialCode:number;synagogueName:string;city:string;address:string|null;
 shacharis:string;mincha:string;maariv:string;geoVerified:boolean};
type Props={existingPlaces?:Minyan[]};
const dateFormatter=(date:string)=>new Intl.DateTimeFormat("en-US",{
 weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"
}).format(new Date(date));
const routeLink=(origin:string,destination:string,mode:"driving"|"walking")=>
 "https://www.google.com/maps/dir/?api=1&origin="+encodeURIComponent(origin)+
 "&destination="+encodeURIComponent(destination)+"&travelmode="+mode;
export function MinyanTravelPlanner({existingPlaces=[]}:Props){
 const [address,setAddress]=useState("");
 const [gps,setGps]=useState<Coords|null>(null);
 const [useGps,setUseGps]=useState(false);
 const [liveWatch,setLiveWatch]=useState(false);
 const [start,setStart]=useState("");
 const [mode,setMode]=useState<"driving"|"walking">("walking");
 const [trip,setTrip]=useState<Trip|null>(null);
 const [skipIds,setSkipIds]=useState<number[]>([]);
 const [preferredId,setPreferredId]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [lastChecked,setLastChecked]=useState("");
 const watch=useRef<number|null>(null);
 const mostRecentCall=useRef(0);
 const pinnedGps=useRef<Coords|null>(null);
 const inputAddress=useRef("");
 const settings=useRef({start:"",mode:"walking" as "walking"|"driving",skipIds:[] as number[],preferredId:null as number|null});
 useEffect(()=>{inputAddress.current=address;settings.current={start,mode,skipIds,preferredId}},[address,start,mode,skipIds,preferredId]);
 const gpsPermission=()=>{
  if(!navigator.geolocation){setError("דער בראוזער האט נישט קיין GPS.");return;}
  setError("");
  navigator.geolocation.getCurrentPosition(position=>{
   const p={latitude:position.coords.latitude,longitude:position.coords.longitude};
   pinnedGps.current=p;setGps(p);setUseGps(true);
  },()=>setError("לאָקעישן־ערלויבעניש נישט באקומען. מען קען אריינלייגן אדרעס."),
   {enableHighAccuracy:true,timeout:15000,maximumAge:30000});
 };
 async function build(override?:{skipIds?:number[];preferredId?:number|null;origin?:Coords|null;silent?:boolean}){
  const current=settings.current;
  const point=override?.origin??(useGps?pinnedGps.current:null);
  if(!point&&!inputAddress.current.trim()){setError("לייג אריין אן אנהייב־אדרעס, אדער ערלויב GPS.");return;}
  if(busy)return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/me/minyans/planner",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     ...(point?{origin:point}:{address:inputAddress.current}),
     travelMode:current.mode,
     ...(current.start?{startAt:new Date(current.start).toISOString()}:{}),
     skipIds:override?.skipIds??current.skipIds,
     preferredId:override?.preferredId===undefined?current.preferredId:override.preferredId
    })
   });
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data.error||"דער פלאנער קען יעצט נישט אויסרעכענען א אמתע רוטע.");
   setTrip(data);setLastChecked(new Date().toLocaleTimeString());
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 }
 useEffect(()=>{
  if(!liveWatch||!navigator.geolocation||!useGps)return;
  watch.current=navigator.geolocation.watchPosition(p=>{
   const next={latitude:p.coords.latitude,longitude:p.coords.longitude};
   pinnedGps.current=next;setGps(next);
   // Explicit opt-in. Recheck at most once per two minutes to cap provider cost.
   if(Date.now()-mostRecentCall.current>120000){
    mostRecentCall.current=Date.now();
    void build({origin:next,silent:true});
   }
  },()=>{setError("די לייוו GPS־פארבינדונג איז פארלוירן געווארן.");setLiveWatch(false);},
   {enableHighAccuracy:true,maximumAge:15000,timeout:25000});
  return()=>{if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null};
 },[liveWatch,useGps]);
 const pass=(id:number)=>{
  const next=Array.from(new Set([...skipIds,id]));
  setSkipIds(next);void build({skipIds:next,preferredId:null});
 };
 const prioritize=(id:number)=>{setPreferredId(id);void build({preferredId:id});};
 const reset=()=>{
  setSkipIds([]);setPreferredId(null);setTrip(null);setStart("");setError("");
 };
 return <section dir="rtl" className="space-y-4 rounded-xl border bg-card p-5">
  <div className="space-y-2">
   <h2 className="text-2xl font-bold">פלאן די הייליגע מצוה — מנינים־רוטע פלאנער</h2>
   <p className="text-sm text-muted-foreground">
    נישט AI. דער פלאנער זוכט בלויז באשטעטיגטע צייטן און אדרעסן,
    מיט אמתע רייזע־צייטן פונעם רוטינג־פראוויידער.
    די נענטסטע מעגליכע מנינים קומען קודם.
   </p>
  </div>
  <div className="space-y-2">
   <label className="text-sm font-semibold">פון וועלכער אדרעס ווילסטו אנהייבן?</label>
   <Input value={address} onChange={e=>{setAddress(e.target.value);setUseGps(false);}}
     placeholder="123 Main St, Monroe, NY" autoComplete="street-address"/>
   <div className="flex gap-2 flex-wrap">
    <Button type="button" variant="outline" onClick={gpsPermission}><MapPin className="size-4 me-1"/> ניצן מיין GPS מיט ערלויבעניש</Button>
    {gps&&useGps&&<span className="text-xs my-auto">GPS איז אויסגעוועלט</span>}
   </div>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <div>
    <label className="text-sm font-semibold">ווען ווילסטו אנהייבן?</label>
    <Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} aria-label="אנהייב־דאטום און צייט"/>
    <p className="text-xs text-muted-foreground">לאז ליידיג פאר יעצט; אדער פלאן פאר א קומענדיגן טאג.</p>
   </div>
   <div>
    <label className="text-sm font-semibold">וויאזוי גייסטו?</label>
    <Select value={mode} onValueChange={x=>setMode(x as "walking"|"driving")}>
     <SelectTrigger><SelectValue/></SelectTrigger>
     <SelectContent>
      <SelectItem value="walking">צופיס</SelectItem>
      <SelectItem value="driving">מיט א קאר — טרעפיק אריינגערעכנט</SelectItem>
     </SelectContent>
    </Select>
   </div>
  </div>
  <div className="flex gap-2 flex-wrap">
   <Button onClick={()=>void build()} disabled={busy}>
    <Navigation className="size-4 me-1"/>{busy?"מען רעכנט די רוטע...":"געב מיר נענטסטע מנינים און א פלאן"}
   </Button>
   <Button variant="outline" onClick={reset}><RotateCcw className="size-4 me-1"/> אנהייבן א נייעם פלאן</Button>
  </div>
  <label className="flex items-center gap-2 text-sm">
   <input type="checkbox" checked={liveWatch} onChange={e=>{
    if(e.target.checked&&!useGps){setError("ערשט ערלויב GPS און דרוק דערנאך לייוו.");return;}
    setLiveWatch(e.target.checked);
   }}/>
   לויט מיין דערלויבעניש: פרישע GPS און רוטע־טשעק יעדע צוויי מינוט
  </label>
  {error&&<p role="alert" className="rounded-lg border p-3 text-sm text-destructive">{error}</p>}
  {trip&&<div className="space-y-4 border-t pt-4">
   <div className="flex items-center justify-between gap-2">
    <h3 className="font-bold">דער צוגעפאסטער מנינים־פלאן</h3>
    <span className="text-xs text-muted-foreground">לעצטע טשעק: {lastChecked}</span>
   </div>
   {trip.stops.length===0&&<p className="text-sm">
    קיין באשטעטיגטע מנינים מיט אמתע אנקומען־צייטן זענען נישט געפונען געווארן אין דעם צייט־פענצטער.
   </p>}
   {trip.stops.map((stop,index)=><article key={stop.place.id+":"+stop.event.startsAt} className="border rounded-xl p-4 space-y-2">
    <div className="flex items-center justify-between gap-3">
     <h4 className="font-bold">{index+1}. {stop.place.name} <span className="text-sm text-muted-foreground">#{stop.place.dialCode}</span></h4>
     <span className="text-sm">{stop.event.prayer}</span>
    </div>
    <p className="text-sm">{stop.place.address}, {stop.place.city}</p>
    <div className="grid grid-cols-2 gap-2 text-sm">
     <p>מנין: <strong>{dateFormatter(stop.event.startsAt)}</strong></p>
     <p>רייזע: <strong>{stop.durationMinutes} מינוטן</strong></p>
     <p>וועג: <strong>{(stop.distanceMeters/1609.344).toFixed(1)} מייל</strong></p>
     <p>צייט צו אנקומען: <strong>{dateFormatter(stop.arrival)}</strong></p>
    </div>
    <div className="flex flex-wrap gap-2">
     <a href={routeLink(useGps&&gps?gps.latitude+","+gps.longitude:address,stop.place.address+", "+stop.place.city,mode)}
       target="_blank" rel="noopener noreferrer" className="underline text-primary text-sm py-2">
       עפענען לייוו דירעקשאנס
     </a>
     <Button size="sm" variant="outline" onClick={()=>pass(stop.place.id)}>פעס — גיי צום נעקסטן</Button>
     <Button size="sm" variant="outline" onClick={()=>prioritize(stop.place.id)}>גיי קודם דא</Button>
    </div>
   </article>)}
   <div className="space-y-2">
    <h4 className="font-semibold">נאך מעגליכע מנינים — געדענקען פאר שפעטער</h4>
    {trip.later.slice(0,8).map((event,i)=><div key={i} className="rounded-md border p-2 text-sm flex justify-between gap-2">
      <span>מנין {event.placeId} · {event.prayer} · {dateFormatter(event.startsAt)}</span>
      <Button size="sm" variant="ghost" onClick={()=>prioritize(event.placeId)}>קודם דאס</Button>
    </div>)}
   </div>
   {trip.warning&&<p className="text-xs text-muted-foreground">{trip.warning}</p>}
  </div>}
  <p className="text-xs text-muted-foreground">
   א טעלעפאן־קאל האט נישט אייגענע GPS־ערלויבעניש. פאר לייוו־רוטינג אויף סמארטפאן
   דארף מען ערלויבן דעם בראוזער לאקאציע. אומבאשטעטיגטע מנינים און צייטן ווערן נישט געשאצט.
  </p>
 </section>;
}
