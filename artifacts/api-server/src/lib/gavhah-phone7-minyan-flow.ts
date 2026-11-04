import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {validRecordedPath,fetchModeratedNewsAudio} from "./yemot-news-engagement";
import {deterministicTrip,getGeoFromAddress,type Mode,type Geo,type Place,type Rule} from "./gavhah-minyan-route-engine";

type M7Stage=
 "main"|"search"|"city"|"city-options"|"saved"|"search-method"|"search-input"|
 "by-code"|"listing"|"plan-start"|"plan-method"|"plan-address"|"plan-clock"|"plan-ampm"|
 "plan-confirm"|"plan-travel"|"plan-results"|
 "submit-name-method"|"submit-name"|"submit-city"|"submit-other-city-method"|"submit-other-city"|
 "submit-address-method"|"submit-address"|"submit-prayer"|"submit-time-mode"|"submit-time"|
 "submit-ampm"|"submit-time-confirm"|"submit-more"|"submit-confirm";
type M7Record={prayer:string;time?:string;rtOffsetMinutes?:number;days:number[]};
export type Minyan7Draft={
 kind:"minyan7";stage:M7Stage;memberId:number|null;validUntil:number;
 cityCode:string;city:string;search:string;searchVia:"voice"|"keypad";
 name:string;nameAudio:string;address:string;addressAudio:string;cityAudio:string;
 searchAddress:string;listIds:number[];page:number;lastDial:number|null;
 planStart:string;clockDigits:string;clockHour:number;clockMinute:number;meridiem:"am"|"pm"|"";
 transport:Mode;origin:Geo|null;chosenPlace:number|null;skipped:number[];
 suggested:Array<{id:number;name:string;dial:number;time:string;minutes:number;address:string}>;
 services:M7Record[];currentPrayer:string;timeMode:"clock"|"rt";pendingTime:string;notesAudio:string;
};
const goodStages=new Set<M7Stage>([
 "main","search","city","city-options","saved","search-method","search-input","by-code","listing",
 "plan-start","plan-method","plan-address","plan-clock","plan-ampm","plan-confirm","plan-travel","plan-results",
 "submit-name-method","submit-name","submit-city","submit-other-city-method","submit-other-city",
 "submit-address-method","submit-address","submit-prayer","submit-time-mode","submit-time","submit-ampm",
 "submit-time-confirm","submit-more","submit-confirm"
]);
const cities:Record<string,string>={
 "1":"Williamsburg, Brooklyn, NY","2":"Monsey, NY",
 "3":"Kiryas Joel, Monroe, NY","4":"Borough Park, Brooklyn, NY",
 "5":"Lakewood, NJ"
};
const tags:Record<string,string>={"1":"shacharis","2":"mincha","3":"maariv","4":"mincha_maariv"};
const cleanSpeech=(s:unknown)=>String(s||"").replace(/[=,#]/g," ").replace(/[^\x20-\x7e]/g," ").slice(0,430);
function fresh(memberId:number|null):Minyan7Draft{
 return {kind:"minyan7",stage:"main",memberId,validUntil:Date.now()+25*60*1000,
 cityCode:"",city:"",search:"",searchVia:"voice",name:"",nameAudio:"",address:"",addressAudio:"",cityAudio:"",
 searchAddress:"",listIds:[],page:0,lastDial:null,
 planStart:"",clockDigits:"",clockHour:0,clockMinute:0,meridiem:"",
 transport:"walking",origin:null,chosenPlace:null,skipped:[],suggested:[],
 services:[],currentPrayer:"",timeMode:"clock",pendingTime:"",notesAudio:""};
}
export function decodeMinyan7Draft(raw:string):Minyan7Draft|null{
 try{
  const d=JSON.parse(raw) as Minyan7Draft;
  if(d?.kind!=="minyan7"||!goodStages.has(d.stage)||
    !Number.isFinite(d.validUntil)||d.validUntil<Date.now()||
    !Array.isArray(d.services)||d.services.length>100||
    !Array.isArray(d.skipped)||d.skipped.length>50)return null;
  return d;
 }catch{return null;}
}
export function minyan7Input(path:string,flash:string):"record"|"text"|"digits"|"menu"{
 if(!path.startsWith("9707"))return "menu";
 const d=decodeMinyan7Draft(flash);
 if(!d)return "menu";
 if(["search-input","plan-address","submit-name","submit-other-city","submit-address"].includes(d.stage))
  return d.searchVia==="voice"?"record":"text";
 if(["by-code","plan-clock","submit-time"].includes(d.stage))return "digits";
 return "menu";
}
// Multi-tap keypad: 2=A,22=B,222=C; 0 separates letters; 1=space;
// 00 toggles numeric mode (for street numbers and ZIP digits).
// Does not claim predictive T9 or allow arbitrary unverified name/address.
export function decodeMultitap(raw:string):string|null{
 if(!/^\d{1,180}$/.test(raw))return null;
 const abc:Record<string,string>={"2":"ABC","3":"DEF","4":"GHI","5":"JKL",
  "6":"MNO","7":"PQRS","8":"TUV","9":"WXYZ"};
 let out="",numeric=false;
 for(let i=0;i<raw.length;){
  if(raw.slice(i,i+2)==="00"){numeric=!numeric;i+=2;continue;}
  const digit=raw[i];
  if(numeric){out+=digit;i++;continue;}
  if(digit==="1"){out+=" ";i++;continue;}
  if(digit==="0"){i++;continue;}
  let j=i;while(j<raw.length&&raw[j]===digit)j++;
  const letters=abc[digit];
  if(!letters)return null;
  out+=letters[(j-i-1)%letters.length];i=j;
 }
 const text=out.replace(/\s+/g," ").trim();
 return text.length>=2&&text.length<=150?text:null;
}
function parseClock(s:string):{hour:number;minute:number}|null{
 if(!/^\d{3,4}$/.test(s))return null;
 const hour=Number(s.slice(0,-2)),minute=Number(s.slice(-2));
 return hour>=1&&hour<=12&&minute>=0&&minute<=59?{hour,minute}:null;
}
function timeLabel(d:Minyan7Draft):string{
 return d.clockHour+":"+String(d.clockMinute).padStart(2,"0")+" "+
  (d.meridiem==="am"?"in the morning":"in the afternoon or evening");
}
function safeRecord(s:unknown):string{
 return validRecordedPath(s)||"";
}
async function speechToText(recordingPath:string):Promise<string|null>{
 const key=process.env.GOOGLE_CLOUD_SPEECH_API_KEY;
 if(!key)return null;
 const file=await fetchModeratedNewsAudio(recordingPath);
 if(file.length>2_200_000)return null;
 const response=await fetch("https://speech.googleapis.com/v1/speech:recognize?key="+
  encodeURIComponent(key),{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({config:{languageCode:"en-US",
   enableAutomaticPunctuation:true,model:"default"},
   audio:{content:Buffer.from(file).toString("base64")}})
 });
 if(!response.ok)return null;
 const data=await response.json() as {results?:Array<{alternatives?:Array<{transcript:string;confidence?:number}>}>};
 const best=data.results?.[0]?.alternatives?.[0];
 if(!best||typeof best.transcript!=="string"||best.confidence!==undefined&&best.confidence<0.7)return null;
 const spoken=best.transcript.trim().replace(/[<>]/g,"");
 return spoken.length>=3&&spoken.length<=200?spoken:null;
}
type Approved={id:number;synagogue_name:string;address:string;city:string;dial_code:number;latitude:number|null;longitude:number|null;timezone:string};
async function approved(client:PoolClient,where:string,params:unknown[]):Promise<Approved[]>{
 const result=await client.query<Approved>(
  "SELECT m.id,m.synagogue_name,m.address,m.city,d.dial_code,d.latitude,d.longitude,d.timezone "+
  "FROM public.minyans m JOIN public.gavhah_minyan_directory d ON d.minyan_id=m.id "+
  "WHERE m.status='approved' AND "+where+" ORDER BY d.dial_code LIMIT 150",
  params);
 return result.rows;
}
async function listReply(client:PoolClient,d:Minyan7Draft):Promise<string>{
 const row=d.listIds[d.page];
 if(!row)return "There are no more approved minyan locations in this list. Press 2 to start over or zero to go back.";
 const r=await client.query<{
  id:number;synagogue_name:string;city:string;address:string|null;
  shacharis:string;mincha:string;maariv:string;dial_code:number
 }>("SELECT m.id,m.synagogue_name,m.city,m.address,m.shacharis,m.mincha,m.maariv,d.dial_code "+
    "FROM public.minyans m JOIN public.gavhah_minyan_directory d ON d.minyan_id=m.id "+
    "WHERE m.status='approved' AND m.id=$1",[row]);
 const m=r.rows[0];
 if(!m)return "This minyan is no longer available. Press 1 for next.";
 return "Minyan place "+(d.page+1)+" of "+d.listIds.length+
  ". Dial ID "+m.dial_code+". "+cleanSpeech(m.synagogue_name)+
  ", "+cleanSpeech(m.address)+", "+cleanSpeech(m.city)+
  ". Shacharis "+cleanSpeech(m.shacharis||"not specified")+
  ". Mincha "+cleanSpeech(m.mincha||"not specified")+
  ". Maariv "+cleanSpeech(m.maariv||"not specified")+
  ". Press 1 for next, 8 for previous, 2 to restart, 3 to save to your member list, 4 to plan a trip to this place, or 0 back.";
}
async function getPlanPlaces(client:PoolClient,origin:Geo):Promise<Place[]>{
 const r=await client.query(
  "SELECT m.id,m.synagogue_name AS name,m.city,m.address,d.dial_code,d.latitude,d.longitude,d.timezone,"+
  "r.prayer,r.week_day,r.local_time::text AS local_time,r.recurrence_minutes,r.until_local_time::text AS until_time,"+
  "r.rabeinu_tam_offset_min "+
  "FROM public.minyans m JOIN public.gavhah_minyan_directory d ON d.minyan_id=m.id "+
  "JOIN public.gavhah_minyan_service_rules r ON r.minyan_id=m.id "+
  "AND r.active AND r.approved_at IS NOT NULL "+
  "WHERE m.status='approved' AND d.address_verified AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL "+
  "ORDER BY d.dial_code LIMIT 1200");
 const places=new Map<number,Place>();
 for(const x of r.rows){
  if(!places.has(x.id))places.set(x.id,{
   id:x.id,dialCode:x.dial_code,name:x.name,city:x.city,address:x.address,
   timezone:x.timezone,point:{latitude:x.latitude,longitude:x.longitude},
   rules:[],zmanim:{}
  });
  const p=places.get(x.id)!;
  const rule:Rule={prayer:x.prayer,weekDay:x.week_day,
   time:x.local_time?.slice(0,5)||null,intervalMinutes:x.recurrence_minutes,
   untilTime:x.until_time?.slice(0,5)||null,rtOffsetMinutes:x.rabeinu_tam_offset_min};
  if(!p.rules.some(y=>JSON.stringify(y)===JSON.stringify(rule)))p.rules.push(rule);
 }
 const approx=(p:Place)=>{
  const dx=(origin.latitude-p.point.latitude)*111.2,
   dy=(origin.longitude-p.point.longitude)*82;
  return dx*dx+dy*dy;
 };
 return [...places.values()].sort((a,b)=>approx(a)-approx(b)).slice(0,75);
}
async function computePhonePlan(client:PoolClient,d:Minyan7Draft):Promise<string>{
 const origin=d.origin||d.searchAddress?await getGeoFromAddress(d.searchAddress):null;
 if(!origin)return "A valid address or linked website location is needed before live route planning.";
 const from=d.planStart?Date.parse(d.planStart):Date.now();
 if(!Number.isFinite(from))return "Your chosen time is invalid. Enter the time again.";
 const options=await getPlanPlaces(client,origin);
 if(!options.length)return "No reviewed and mapped minyans with precise schedules nearby. No travel time was invented.";
 const plan=await deterministicTrip({origin,places:options,mode:d.transport,startAt:from,
  avoid:d.skipped,preferredId:d.chosenPlace,maxStops:6,maxWaitMinutes:90});
 d.suggested=plan.stops.map(x=>({
  id:x.place.id,name:x.place.name,dial:x.place.dialCode,
  time:x.event.localTime,minutes:x.durationMinutes,address:x.place.address
 }));
 d.stage="plan-results";
 if(!d.suggested.length)return "No minyan can be confirmed as reachable within this time window. Press 1 to refresh, or zero to go back.";
 return "Your reviewed minyan route, "+d.transport+" with verified route times. "+
  d.suggested.slice(0,3).map((x,i)=>
   "Stop "+(i+1)+". "+cleanSpeech(x.name)+", dial number "+x.dial+
   ". Minyan at "+x.time+". Travel "+x.minutes+" minutes.").join(" ")+
  " Press 1 to refresh from this address. Press 2 to skip the first suggested place."+
  " Press 3 to choose a specific suggested place by its list number. Press 8 to hear more.";
}
function routePreview(d:Minyan7Draft):string{
 return d.suggested.slice(d.page*3,d.page*3+3).map((x,i)=>
  "Option "+(d.page*3+i+1)+". "+cleanSpeech(x.name)+
  ", place "+x.dial+". Minyan "+x.time+". Travel "+x.minutes+" minutes.").join(" ")+
  " Press 1 to refresh, 2 to skip the first, 3 to pick a preferred location, or 8 for more.";
}
export async function nextMinyan7(client:PoolClient,path:string,digit:string,flash:string,
 verifiedUser:number|null,callHash:string):Promise<{path:string;flash:string;feedback:string}>{
 let d=decodeMinyan7Draft(flash);
 if(!d||d.memberId!==verifiedUser)d=fresh(verifiedUser);
 let msg="";
 const auth=!!verifiedUser;
 if(path==="9707"){
  if(digit==="1"){path="97071";d.stage="search";}
  else if(digit==="2"){
   if(!auth)msg="To submit a minyan, securely link your Gavhah member account using the website pairing code.";
   else{path="97072";d=fresh(verifiedUser);d.stage="submit-name-method";}
  }
 }else if(path==="97071"){
  if(digit==="1"){path="970711";d.stage="city";}
  else if(digit==="2"){
   if(!auth)msg="To open your saved minyan list, first link your private member account.";
   else{
    const rows=await client.query<{minyan_id:number}>(
     "SELECT s.minyan_id FROM public.gavhah_minyan_saved_places s "+
     "JOIN public.minyans m ON m.id=s.minyan_id AND m.status='approved' "+
     "WHERE s.member_id=$1 ORDER BY s.created_at DESC LIMIT 100",[verifiedUser]);
    d.listIds=rows.rows.map(x=>x.minyan_id);d.page=0;d.stage="listing";path="970712";
   }
  }else if(digit==="3"){path="970713";d.stage="search-method";}
  else if(digit==="4"){path="970714";d.stage="plan-start";}
  else if(digit==="5"){path="970715";d.stage="by-code";}
 }else if(d.stage==="city"){
  if(cities[digit]){d.cityCode=digit;d.city=cities[digit];d.stage="city-options";}
 }else if(d.stage==="city-options"){
  if(digit==="1"||digit==="3"){
   d.stage="search-method";d.searchVia="voice";
   d.searchAddress="";
   path=digit==="1"?"970713":"970714";
   if(digit==="3")d.stage="plan-method";
  }else if(digit==="2"){
   const rows=await approved(client,"lower(m.city) LIKE $1",[ "%" +
    (d.cityCode==="3"?"monroe":d.cityCode==="4"?"brooklyn":
      d.cityCode==="1"?"brooklyn":d.cityCode==="2"?"monsey":"lakewood")+"%"]);
   d.listIds=rows.map(x=>x.id);d.page=0;d.stage="listing";path="970712";
  }else if(digit==="4"){path="970714";d.stage="plan-start";}
 }else if(d.stage==="by-code"){
  if(/^\d{3,4}$/.test(digit)){
   const found=await approved(client,"d.dial_code=$1",[Number(digit)]);
   if(found.length){d.listIds=[found[0].id];d.page=0;d.stage="listing";path="970712";}
   else msg="There is no approved minyan with this dial code. Enter another 3 or 4 digit code.";
  }
 }else if(d.stage==="listing"){
  if(digit==="1")d.page=Math.min(d.listIds.length, d.page+1);
  else if(digit==="8")d.page=Math.max(0,d.page-1);
  else if(digit==="2")d.page=0;
  else if(digit==="3"&&auth){
   const minyanId=d.listIds[d.page];
   if(minyanId){
    await client.query("INSERT INTO public.gavhah_minyan_saved_places(member_id,minyan_id) "+
     "VALUES($1,$2) ON CONFLICT DO NOTHING",[verifiedUser,minyanId]);
    msg="Minyan saved to your private list.";
   }
  }else if(digit==="4"){
   d.chosenPlace=d.listIds[d.page]||null;
   path="970714";d.stage="plan-start";
  }
 }else if(d.stage==="search-method"||d.stage==="plan-method"||
   d.stage==="submit-name-method"||d.stage==="submit-address-method"||
   d.stage==="submit-other-city-method"){
  if(digit==="1"||digit==="2"){
   d.searchVia=digit==="1"?"voice":"keypad";
   if(d.stage==="search-method")d.stage="search-input";
   else if(d.stage==="plan-method")d.stage="plan-address";
   else if(d.stage==="submit-name-method")d.stage="submit-name";
   else if(d.stage==="submit-address-method")d.stage="submit-address";
   else d.stage="submit-other-city";
  }
 }else if(d.stage==="search-input"){
  let text:string|null=d.searchVia==="voice"&&safeRecord(digit)?await speechToText(digit):null;
  if(d.searchVia==="keypad")text=decodeMultitap(digit);
  if(text){
   d.search=text;
   const rows=await approved(client,
    "lower(m.synagogue_name||' '||m.city||' '||coalesce(m.address,'')) LIKE $1",
    ["%"+text.toLowerCase()+"%"]);
   d.listIds=rows.map(x=>x.id);d.page=0;d.stage="listing";path="970712";
  }else msg="Address or name not confidently recognized. Use numeric minyan ID search or the website advanced search.";
 }else if(d.stage==="plan-start"){
  if(digit==="1")msg="The route planner checks approved minyan times, the nearest usable locations, and real travel-time with traffic. You can pass any location or choose another. This is a computer-programmed route, not artificial intelligence. ";
  else if(digit==="2"){d.stage="plan-method";}
  else if(digit==="3"&&auth){
   const saved=await client.query<{start_address:string;start_lat:number|null;start_lng:number|null}>(
    "SELECT start_address,start_lat,start_lng FROM public.gavhah_minyan_trip_plans "+
    "WHERE member_id=$1 AND start_lat IS NOT NULL AND start_lng IS NOT NULL "+
    "ORDER BY updated_at DESC LIMIT 1",[verifiedUser]);
   if(saved.rows[0]){
    d.searchAddress=saved.rows[0].start_address;
    d.origin={latitude:saved.rows[0].start_lat!,longitude:saved.rows[0].start_lng!};
    d.stage="plan-clock";
   }else msg="There is no saved location. Press two to enter your address.";
  }
 }else if(d.stage==="plan-address"){
  let address:string|null=d.searchVia==="voice"&&safeRecord(digit)?await speechToText(digit):null;
  if(d.searchVia==="keypad")address=decodeMultitap(digit);
  if(address&&address.length>=6){
   d.searchAddress=address+(d.city?", "+d.city:"");
   d.origin=null;d.stage="plan-clock";
  }else msg="A full address was not verified. Please enter it by the website or try again with speech recognition enabled.";
 }else if(d.stage==="plan-clock"){
  const t=parseClock(digit);
  if(t){d.clockHour=t.hour;d.clockMinute=t.minute;d.stage="plan-ampm";}
  else msg="Enter time in three or four digits, for example 834, then pound.";
 }else if(d.stage==="plan-ampm"){
  if(digit==="1"||digit==="2"){
   d.meridiem=digit==="1"?"am":"pm";
   d.stage="plan-confirm";
  }
 }else if(d.stage==="plan-confirm"){
  if(digit==="1")d.stage="plan-travel";
  else if(digit==="2")d.stage="plan-clock";
 }else if(d.stage==="plan-travel"){
  if(digit==="1"||digit==="2"){
   d.transport=digit==="1"?"driving":"walking";
   // The selected clock time applies to the next local date containing it;
   // for future-day precision use the website date picker.
   const ny=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",
    year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const match=ny.match(/(\d{2})\/(\d{2})\/(\d{4})/);
   if(match){
    const hour=(d.clockHour%12)+(d.meridiem==="pm"?12:0);
    const local=match[3]+"-"+match[1]+"-"+match[2]+"T"+String(hour).padStart(2,"0")+":"+
      String(d.clockMinute).padStart(2,"0")+":00-05:00";
    // Local daylight offset is determined by the member's website planner;
    // in phone mode use NOW when no verified future departure is available.
    d.planStart=Date.parse(local)>Date.now()+60_000?new Date(local).toISOString():"";
   }
   try{msg=await computePhonePlan(client,d);}catch(e){
    msg=e instanceof Error&&/NOT_CONFIGURED|ADDRESS_/.test(e.message)
      ?"The routing or address provider is not connected. No walking or traffic arrival time can be verified."
      :"We cannot verify live route timings at this moment. No travel estimate will be invented.";
   }
  }
 }else if(d.stage==="plan-results"){
  if(digit==="1"){
   d.page=0;try{msg=await computePhonePlan(client,d);}catch{msg="Live route provider unavailable; no verified ETA.";}
  }else if(digit==="2"){
   if(d.suggested[0])d.skipped.push(d.suggested[0].id);
   d.page=0;try{msg=await computePhonePlan(client,d);}catch{msg="Cannot recheck routing. Please try later.";}
  }else if(digit==="3")d.stage="plan-preference" as M7Stage;
  else if(digit==="8")d.page=Math.min(2,d.page+1);
 }else if(d.stage==="submit-name"){
  const a=d.searchVia==="voice"?safeRecord(digit):"";
  const t=d.searchVia==="keypad"?decodeMultitap(digit):null;
  if(a||t){d.nameAudio=a;d.name=t||"";d.stage="submit-city";}
  else msg="The synagogue name was not received. Please record or enter it again.";
 }else if(d.stage==="submit-city"){
  if(cities[digit]){d.city=cities[digit];d.stage="submit-address-method";}
  else if(digit==="6")d.stage="submit-other-city-method";
 }else if(d.stage==="submit-other-city"){
  const path=d.searchVia==="voice"?safeRecord(digit):"";
  const t=d.searchVia==="keypad"?decodeMultitap(digit):null;
  if(path||t){d.cityAudio=path;d.city=t||"Other area";d.stage="submit-address-method";}
  else msg="Other area was not saved. Please try again.";
 }else if(d.stage==="submit-address"){
  const a=d.searchVia==="voice"?safeRecord(digit):"";
  const t=d.searchVia==="keypad"?decodeMultitap(digit):null;
  if(a||t){d.addressAudio=a;d.address=t||"";d.stage="submit-prayer";}
  else msg="The complete address was not received. Try again.";
 }else if(d.stage==="submit-prayer"){
  if(tags[digit]){d.currentPrayer=tags[digit];d.stage="submit-time-mode";}
 }else if(d.stage==="submit-time-mode"){
  if(digit==="1"){d.timeMode="clock";d.stage="submit-time";}
  else if(digit==="2"){d.timeMode="rt";d.stage="submit-time";}
 }else if(d.stage==="submit-time"){
  if(d.timeMode==="rt"){
   if(/^\d{1,3}$/.test(digit)&&Number(digit)>=0&&Number(digit)<=240){
    d.pendingTime="RT-"+digit;d.stage="submit-time-confirm";
   }else msg="Enter the number of minutes before Rabbeinu Tam, then pound.";
  }else{
   const t=parseClock(digit);
   if(t){d.clockHour=t.hour;d.clockMinute=t.minute;d.stage="submit-ampm";}
   else msg="Enter three or four digits for the minyan time, for example 325 and pound.";
  }
 }else if(d.stage==="submit-ampm"){
  if(digit==="1"||digit==="2"){
   d.meridiem=digit==="1"?"am":"pm";d.pendingTime=timeLabel(d);d.stage="submit-time-confirm";
  }
 }else if(d.stage==="submit-time-confirm"){
  if(digit==="1"){
   const service:M7Record={prayer:d.currentPrayer,days:[0,1,2,3,4,5]};
   if(d.timeMode==="rt")service.rtOffsetMinutes=Number(d.pendingTime.replace("RT-",""));
   else{
    const hour=d.clockHour%12+(d.meridiem==="pm"?12:0);
    service.time=String(hour).padStart(2,"0")+":"+String(d.clockMinute).padStart(2,"0");
   }
   d.services.push(service);d.stage="submit-more";
  }else if(digit==="2")d.stage="submit-time";
 }else if(d.stage==="submit-more"){
  if(digit==="1")d.stage="submit-prayer";
  else if(digit==="2")d.stage="submit-confirm";
 }else if(d.stage==="submit-confirm"){
  if(digit==="1"&&auth&&d.services.length&& (d.name||d.nameAudio)&&(d.address||d.addressAudio)){
   const requestKey=createHash("sha256").update("gavhah-minyan-phone-v1:"+callHash+":"+
    d.validUntil+":"+JSON.stringify(d.services)).digest("hex");
   const prior=await client.query<{id:number}>(
    "SELECT id FROM public.gavhah_minyan_phone_submissions WHERE request_key=$1",[requestKey]);
   const result=prior.rows[0]?prior:await client.query<{id:number}>(
    "INSERT INTO public.gavhah_minyan_phone_submissions "+
    "(member_id,synagogue_audio,synagogue_typed,city,city_audio,address_audio,address_typed,schedule_json,notes_audio,request_key) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id",
    [verifiedUser,d.nameAudio||null,d.name||null,d.city,d.cityAudio||null,d.addressAudio||null,
     d.address||null,JSON.stringify(d.services),d.notesAudio||null,requestKey]);
   await client.query("INSERT INTO public.notifications(user_id,type,message,link_url) "+
    "VALUES($1,'minyan_phone_submission',$2,'/minyans')",
    [verifiedUser,"Your minyan #"+result.rows[0].id+" is in team review and is not public."]);
   await client.query("INSERT INTO public.notifications(user_id,type,message,link_url) "+
    "SELECT id,'admin_minyan',$1,'/founder' FROM public.users "+
    "WHERE role IN ('admin','moderator','super_admin') AND status='active'",
    ["Phone minyan submission #"+result.rows[0].id+" needs staff review."]);
   msg="Your minyan application number "+result.rows[0].id+
    " was submitted for team review. It is not public until approved.";
   d=fresh(verifiedUser);d.stage="search";path="97071";
  }else if(digit==="2")d.stage="submit-prayer";
  else if(digit==="4"){d=fresh(verifiedUser);path="9707";msg="Cancelled. Nothing submitted.";}
 }
 return {path,flash:JSON.stringify(d),feedback:msg};
}
export async function minyan7Speech(client:PoolClient,path:string,flash:string,feedback:string):Promise<{
 text:string;input:"record"|"text"|"digits"|"menu";listen:boolean
}>{
 const d=decodeMinyan7Draft(flash)||fresh(null);
 let text=feedback+" ";
 if(path==="9707")text+="Minyan Center. To hear or search approved minyanim, press 1. To submit a new minyan for staff approval, press 2.";
 else if(path==="97071")text+="Advanced minyan search. By city press 1. Your saved minyan list press 2. Search by any information press 3. Plan the holy minyan trip press 4. Search by a three or four digit ID press 5.";
 else if(d.stage==="city")text+="For Williamsburg 1, Monsey 2, Kiryas Joel 3, Boro Park 4, Lakewood 5.";
 else if(d.stage==="city-options")text+="You selected "+cleanSpeech(d.city)+". To enter a specific address press 1. To hear approved minyanim one by one press 2. For minyanim near an address press 3. To plan a trip press 4.";
 else if(d.stage==="listing")text+=await listReply(client,d);
 else if(d.stage==="search-method")text+="To say a name or address after the beep press 1. To enter with multi-tap keypad press 2. For a known minyan you can search its 3 or 4 digit ID instead.";
 else if(d.stage==="search-input")text+=d.searchVia==="voice"?
  "Say the minyan name, street or city clearly, then press pound. The speech-recognition provider must be connected.":
  "Enter the name or address with multi-tap. Two is A, two twice B, two three times C. Zero separates letters. One is a space, double-zero enters numeric mode for street numbers. Finish with pound.";
 else if(d.stage==="by-code")text+="Enter the minyan's three or four digit ID and press pound.";
 else if(d.stage==="plan-start")text+="Welcome to Plan The Holy Mitzvah. To hear how the deterministic planner works press 1. To enter your starting address press 2. To use an address you previously saved on your website account press 3.";
 else if(d.stage==="plan-method")text+="To speak the full starting address press one. To type using multi-tap keypad press two.";
 else if(d.stage==="plan-address")text+=d.searchVia==="voice"?
  "Say the entire street address, city and state clearly, then pound. The service will verify the address. Phone calls do not provide automatic GPS.":
  "Enter full address using multi-tap keypad. Double-zero toggles number mode, one is space, zero separates letters, finish with pound.";
 else if(d.stage==="plan-clock")text+="Enter the start hour and minute, for example eight thirty four is 834, then pound. On the website you can choose any future date.";
 else if(d.stage==="plan-ampm")text+="For morning press 1, for afternoon or evening press 2.";
 else if(d.stage==="plan-confirm")text+="You selected "+timeLabel(d)+". If correct press 1. To re-enter the time press 2.";
 else if(d.stage==="plan-travel")text+="If you plan to travel by car press 1. On foot press 2.";
 else if(d.stage==="plan-results")text+=routePreview(d);
 else if(d.stage==="submit-name-method")text+="To enter the synagogue name by voice press 1; by multi-tap keypad press 2.";
 else if(d.stage==="submit-name")text+=d.searchVia==="voice"?
  "Record the synagogue or minyan shtiebel name after the beep and finish with pound.":
  "Enter the name using multi-tap, zero between letters, one for space, pound to finish.";
 else if(d.stage==="submit-city")text+="Address area. Williamsburg press 1, Monsey 2, Monroe or Kiryas Joel 3, Boro Park 4, Lakewood 5, another neighborhood 6.";
 else if(d.stage==="submit-other-city-method")text+="For another city, say it after the beep press 1, or enter with multi-tap press 2.";
 else if(d.stage==="submit-other-city")text+=d.searchVia==="voice"?
  "Record the neighborhood or city and finish with pound.":
  "Type the city with multi-tap and finish with pound.";
 else if(d.stage==="submit-address-method")text+="To record the full address by voice press 1, or enter it by multi-tap keypad press 2.";
 else if(d.stage==="submit-address")text+=d.searchVia==="voice"?
  "Record the entire street address including city and state, then pound.":
  "Enter the full street address using multi-tap, double-zero for number mode, one for space and pound to finish.";
 else if(d.stage==="submit-prayer")text+="For Shacharis press 1, Mincha 2, Maariv 3, combined Mincha and Maariv 4.";
 else if(d.stage==="submit-time-mode")text+="To enter an exact clock time press 1. For minutes before the verified Rabbeinu Tam time press 2.";
 else if(d.stage==="submit-time")text+=d.timeMode==="rt"?
  "Enter the minutes before Rabbeinu Tam, such as 25, then pound. Team verification of the day's zman is required.":
  "Enter time digits, for example 325 then pound.";
 else if(d.stage==="submit-ampm")text+="Morning press one, afternoon or evening press two.";
 else if(d.stage==="submit-time-confirm")text+="You entered "+
  (d.timeMode==="rt"?d.pendingTime+" minutes before Rabbeinu Tam":timeLabel(d))+
  ". To confirm press one. To change press two.";
 else if(d.stage==="submit-more")text+="Your minyan has been added to this private submission. To add another prayer time press 1. To finish and submit for review press 2.";
 else if(d.stage==="submit-confirm")text+="Your private application contains "+d.services.length+
  " minyan times. Press 1 to submit to the Gavhah team for review, 2 to add another minyan time, 4 to cancel. No public listing is created until team approval.";
 else text+="Please follow the menu options.";
 return {text,input:minyan7Input(path,JSON.stringify(d)),listen:false};
}
