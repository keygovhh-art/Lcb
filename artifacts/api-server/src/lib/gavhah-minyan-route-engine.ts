// Deterministic minyan journey engine, no generative AI.
// Each ETA must originate from an actual routing API; no straight-line guess
// masquerades as road/walking duration or realtime traffic.
export type Geo={latitude:number;longitude:number};
export type Mode="driving"|"walking";
export type Rule={prayer:"shacharis"|"mincha"|"maariv"|"mincha_maariv";
 weekDay:number;time:string|null;intervalMinutes:number|null;untilTime:string|null;
 rtOffsetMinutes:number|null;};
export type Place={id:number;dialCode:number;name:string;address:string;city:string;timezone:string;
 point:Geo;rules:Rule[];zmanim?:Record<string,string>};
export type Event={placeId:number;prayer:Rule["prayer"];startsAt:string;localTime:string};
export type RouteResult={place:Place;event:Event;durationMinutes:number;distanceMeters:number;
 departure:string;arrival:string;minutesEarly:number;provider:string};
export type PlanResult={stops:RouteResult[];later:Event[];routingMode:Mode;provider:string;warning:string|null};

const hm=/^(?:([01]?\d|2[0-3]):([0-5]\d))(?:\s*(am|pm))?$/i;
function timeMinute(s:string):number|null{
 const match=hm.exec(s.trim());if(!match)return null;
 let hour=Number(match[1]),min=Number(match[2]);
 if(match[3]){
  if(hour<1||hour>12)return null;
  hour=hour%12+(match[3].toLowerCase()==="pm"?12:0);
 }
 return hour*60+min;
}
function zoneParts(epoch:number,tz:string):{y:number;m:number;d:number;weekday:number;hh:number;mm:number}{
 const f=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",
  weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const d=Object.fromEntries(f.formatToParts(new Date(epoch)).map(x=>[x.type,x.value]));
 return {y:Number(d.year),m:Number(d.month),d:Number(d.day),
  weekday:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(d.weekday),
  hh:Number(d.hour),mm:Number(d.minute)};
}
// Compare wall clock in source timezone, accounting for DST. Invalid wall
// clocks (e.g. 02:30 in the spring skip) are rejected, not silently shifted.
function zonedTime(y:number,m:number,d:number,minute:number,zone:string):number|null{
 const hr=Math.floor(minute/60),mm=minute%60,want=Date.UTC(y,m-1,d,hr,mm);
 let guess=want;
 for(let k=0;k<4;k++){
  const p=zoneParts(guess,zone);
  const actual=Date.UTC(p.y,p.m-1,p.d,p.hh,p.mm);
  guess+=want-actual;
 }
 const p=zoneParts(guess,zone);
 return p.y===y&&p.m===m&&p.d===d&&p.hh===hr&&p.mm===mm?guess:null;
}
function localYmd(epoch:number,zone:string):string{
 const p=zoneParts(epoch,zone);
 return [p.y,String(p.m).padStart(2,"0"),String(p.d).padStart(2,"0")].join("-");
}
export function upcomingEvents(place:Place,from:number,to:number):Event[]{
 if(!place?.point||!place.address||place.rules.length===0||to<=from)return [];
 const events:Event[]=[];
 // Date offset in wall-clock calendar, NEVER by just adding 24h (DST).
 const begin=zoneParts(from,place.timezone);
 const anchor=Date.UTC(begin.y,begin.m-1,begin.d);
 for(let day=0;day<Math.min(8,Math.ceil((to-from)/86400000)+2);day++){
  const calendar=new Date(anchor+day*86400000),y=calendar.getUTCFullYear(),m=calendar.getUTCMonth()+1,
   d=calendar.getUTCDate(),weekday=calendar.getUTCDay();
  const key=[y,String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
  for(const rule of place.rules){
   if(rule.weekDay!==weekday)continue;
   if(rule.rtOffsetMinutes!=null){
    const actual=place.zmanim?.[key];
    if(!actual||!Number.isFinite(Date.parse(actual)))continue;
    const at=Date.parse(actual)-rule.rtOffsetMinutes*60000;
    if(at>=from&&at<=to)events.push({
     placeId:place.id,prayer:rule.prayer,startsAt:new Date(at).toISOString(),
     localTime:new Intl.DateTimeFormat("en-US",{timeZone:place.timezone,
      hour:"numeric",minute:"2-digit"}).format(new Date(at))
    });
    continue;
   }
   const first=rule.time?timeMinute(rule.time):null;
   if(first===null)continue;
   const end=rule.intervalMinutes&&rule.untilTime?timeMinute(rule.untilTime):null;
   if(end!==null&&end<first)continue;
   const max=rule.intervalMinutes&&end!==null?Math.min(end,first+720):first;
   for(let atMin=first;atMin<=max;atMin+=rule.intervalMinutes||1440){
    const utc=zonedTime(y,m,d,atMin,place.timezone);
    if(utc===null||utc<from||utc>to)continue;
    events.push({
     placeId:place.id,prayer:rule.prayer,startsAt:new Date(utc).toISOString(),
     localTime:new Intl.DateTimeFormat("en-US",{timeZone:place.timezone,
      hour:"numeric",minute:"2-digit"}).format(new Date(utc))
    });
   }
  }
 }
 return events.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
}
export function validGeo(point:unknown):point is Geo{
 if(!point||typeof point!=="object")return false;
 const p=point as Geo;
 return Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
}
type RouteTime={minutes:number;meters:number;provider:string};
const MAX_DESTINATIONS=14;
function seconds(s:unknown):number|null{
 if(typeof s==="string"&&/^\d+(?:\.\d+)?s$/.test(s))return Number(s.slice(0,-1));
 return typeof s==="number"&&Number.isFinite(s)?s:null;
}
export async function liveRouteTimes(origin:Geo,destinations:Geo[],mode:Mode,
 departTime:number):Promise<RouteTime[]>{
 if(!validGeo(origin)||destinations.length<1||destinations.length>MAX_DESTINATIONS||
    destinations.some(x=>!validGeo(x)))throw Error("Invalid or too many verified navigation coordinates");
 const key=process.env.GOOGLE_MAPS_API_KEY||"";
 if(!key)throw Error("ROUTING_NOT_CONFIGURED");
 if(!Number.isFinite(departTime)||departTime<Date.now()-600000||
     departTime>Date.now()+365*86400000)throw Error("Invalid route departure");
 const location=(p:Geo)=>({waypoint:{location:{latLng:{latitude:p.latitude,longitude:p.longitude}}}});
 const req:{
  origins:ReturnType<typeof location>[];destinations:ReturnType<typeof location>[];
  travelMode:string;routingPreference?:string;departureTime?:string
 }={
  origins:[location(origin)],destinations:destinations.map(location),
  travelMode:mode==="driving"?"DRIVE":"WALK"
 };
 // GOOGLE TRAFFIC_AWARE considers live traffic for near-now departures,
 // historical predictions for future schedules. No traffic for walking.
 if(mode==="driving"){
  req.routingPreference="TRAFFIC_AWARE";
  req.departureTime=new Date(Math.max(departTime,Date.now()+5000)).toISOString();
 }
 const abort=new AbortController();
 const timer=setTimeout(()=>abort.abort(),9000);
 try{
  const r=await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",{
   method:"POST",signal:abort.signal,
   headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,
    "X-Goog-FieldMask":"originIndex,destinationIndex,duration,distanceMeters,status,condition"},
   body:JSON.stringify(req)
  });
  if(!r.ok)throw Error("ROUTING_PROVIDER_ERROR_"+r.status);
  const json=await r.json();
  if(!Array.isArray(json))throw Error("ROUTING_PROVIDER_INVALID");
  const result:Array<RouteTime|null>=Array(destinations.length).fill(null);
  for(const element of json){
   const index=Number(element?.destinationIndex),raw=seconds(element?.duration);
   if(Number.isInteger(index)&&index>=0&&index<result.length&&raw!==null&&raw>=0&&
     element?.condition!=="ROUTE_NOT_FOUND"){
    result[index]={minutes:Math.ceil(raw/60),meters:Math.max(0,Math.round(Number(element.distanceMeters||0))),
      provider:"google-routes-traffic-aware"};
   }
  }
  if(result.some(x=>!x))throw Error("ROUTING_PROVIDER_NO_VERIFIED_ROUTE");
  return result as RouteTime[];
 }finally{clearTimeout(timer);}
}
export async function getGeoFromAddress(address:string):Promise<Geo>{
 if(!address||address.length<7||address.length>300)throw Error("Complete address required");
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(!key)throw Error("GEOCODING_NOT_CONFIGURED");
 const url=new URL("https://maps.googleapis.com/maps/api/geocode/json");
 url.searchParams.set("address",address);url.searchParams.set("key",key);
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),7000);
 try{
  const response=await fetch(url.toString(),{signal:abort.signal});
  if(!response.ok)throw Error("GEOCODING_PROVIDER_ERROR");
  const data=await response.json() as {status?:string;results?:Array<{partial_match?:boolean;geometry?:{location?:{lat?:number;lng?:number}}}>};
  if(data?.status!=="OK"||!data?.results?.length)throw Error("ADDRESS_NOT_VERIFIED");
  const result=data.results[0],loc=result.geometry?.location;
  if(result.partial_match||!validGeo({latitude:loc?.lat,longitude:loc?.lng}))
   throw Error("ADDRESS_AMBIGUOUS");
  return {latitude:loc.lat,longitude:loc.lng};
 }finally{clearTimeout(timer);}
}
export async function deterministicTrip(input:{
 origin:Geo;places:Place[];mode:Mode;startAt:number;avoid?:number[];
 preferredId?:number|null;maxStops?:number;maxWaitMinutes?:number;
}):Promise<PlanResult>{
 if(!validGeo(input.origin)||!Number.isFinite(input.startAt))throw Error("Verified starting location needed");
 const maxStops=Math.max(1,Math.min(8,input.maxStops||5));
 const avoided=new Set(input.avoid||[]);
 const km=(a:Geo,b:Geo)=>{
  const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,
   dlng=(b.longitude-a.longitude)*rad;
  const z=Math.sin(dlat/2)**2+
   Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
 };
 const eligible=input.places.filter(p=>p.address&&validGeo(p.point)&&p.rules.length&&
    !avoided.has(p.id)).sort((a,b)=>
     (a.id===input.preferredId?-1:0)-(b.id===input.preferredId?-1:0)||
     km(input.origin,a.point)-km(input.origin,b.point)).slice(0,MAX_DESTINATIONS);
 if(!eligible.length)return {stops:[],later:[],routingMode:input.mode,provider:"none",
  warning:"No approved and geocoded minyan locations were eligible; no approximate ETA was invented."};
 const horizon=input.startAt+Math.min(48,Math.max(1,(input.maxWaitMinutes||90)/60+2))*3600000;
 let point=input.origin,now=input.startAt;
 const result:RouteResult[]=[];
 const plannedKeys=new Set<string>();
 let provider="none";
 for(let i=0;i<maxStops;i++){
  const routes=await liveRouteTimes(point,eligible.map(x=>x.point),input.mode,now);
  provider=routes[0]?.provider||provider;
  const options:Array<RouteResult&{rank:number}>=[];
  for(let j=0;j<eligible.length;j++){
   const place=eligible[j],metric=routes[j],travel=metric.minutes;
   const reachable=now+travel*60000;
   const latest=now+(input.maxWaitMinutes||90)*60000;
   for(const event of upcomingEvents(place,reachable,Math.min(horizon,latest))){
    const key=place.id+":"+event.startsAt;
    if(plannedKeys.has(key))continue;
    // Allow revisits only when a NEW later minyan is actually available.
    const last=[...result].reverse().find(x=>x.place.id===place.id);
    if(last&&Date.parse(event.startsAt)<Date.parse(last.event.startsAt)+20*60000)continue;
    const early=Math.round((Date.parse(event.startsAt)-reachable)/60000);
    // Strict nearest-first among currently feasible prayer times.
    // Preferred place overrides nearest only upon explicit user action.
    const rank=input.preferredId===place.id?-100000:
      metric.minutes*1000+Math.max(0,early)*2;
    options.push({
     place,event,durationMinutes:metric.minutes,distanceMeters:metric.meters,
     departure:new Date(now).toISOString(),arrival:new Date(reachable).toISOString(),
     minutesEarly:early,provider:metric.provider,rank
    });
   }
  }
  if(!options.length)break;
  options.sort((a,b)=>a.rank-b.rank||
    Date.parse(a.event.startsAt)-Date.parse(b.event.startsAt)||
    a.place.dialCode-b.place.dialCode);
  const winner=options[0];
  const {rank,...route}=winner;
  result.push(route);plannedKeys.add(route.place.id+":"+route.event.startsAt);
  // Conservative configurable dwell: 25 minutes for each visit. Do not claim
  // a person can attend multiple minyanim at once.
  now=Date.parse(route.event.startsAt)+25*60000;
  point=route.place.point;
  if(now>horizon)break;
 }
 const done=new Set(result.map(x=>x.place.id+":"+x.event.startsAt));
 const later=eligible.flatMap(p=>upcomingEvents(p,input.startAt,horizon))
  .filter(e=>!done.has(e.placeId+":"+e.startsAt))
  .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)).slice(0,18);
 return {stops:result,later,routingMode:input.mode,provider,
  warning:"ETA depends on current provider traffic and validated schedules. Recheck traffic and zmanim before leaving."};
}
