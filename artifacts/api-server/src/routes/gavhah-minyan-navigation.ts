import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAuth,requireAdmin,getSessionUserId} from "../middlewares/auth";
import {notifyStaff,notifyUser} from "../lib/notify";
import {validRecordedPath,fetchModeratedNewsAudio} from "../lib/yemot-news-engagement";
import {deterministicTrip,getGeoFromAddress,validGeo,upcomingEvents,type Place,type Rule,type Geo,type Mode} from "../lib/gavhah-minyan-route-engine";

const router=Router();
const id=(x:unknown):number|null=>{
 const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:null;
};
const originOK=(req:Request):boolean=>{
 const src=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!src||!host||req.get("sec-fetch-site")==="cross-site")return false;
 try{return new URL(src).protocol==="https:"&&new URL(src).host===host;}catch{return false;}
};
function queryTerm(q:unknown){
 return typeof q==="string"&&q.length<=100?q.trim():null;
}
const cityCodes:Record<string,string[]>={
 "1":["williamsburg","וויליאמסבורג","brooklyn"],
 "2":["monsey","מאנסי","spring valley"],
 "3":["kiryas joel","קרית יואל","monroe","מאנרא"],
 "4":["boro park","borough park","בארא פארק","brooklyn"],
 "5":["lakewood","לעיקוואד"]
};
function allowedCity(city:string,choice:string):boolean{
 const options=cityCodes[choice]||[];
 return options.some(w=>city.toLowerCase().includes(w.toLowerCase()));
}
export async function minyanReadList(opts:{cityChoice?:string;search?:string;memberId?:number;onlySaved?:boolean;limit?:number;}={}){
 const minyans=await pool.query(
  "SELECT m.id,m.synagogue_name,m.city,m.country,m.address,m.community,m.shacharis,m.mincha,m.maariv,"+
  "m.weekday_schedules,m.notes,d.dial_code,d.latitude,d.longitude,d.address_verified,d.timezone,"+
  "d.last_schedule_verified_at "+
  "FROM public.minyans m INNER JOIN public.gavhah_minyan_directory d ON d.minyan_id=m.id "+
  "WHERE m.status='approved' ORDER BY d.dial_code ASC LIMIT 10000");
 const saved=opts.memberId?await pool.query<{minyan_id:number}>(
  "SELECT minyan_id FROM public.gavhah_minyan_saved_places WHERE member_id=$1",[opts.memberId]):null;
 const mine=new Set((saved?.rows||[]).map(x=>x.minyan_id));
 let list=minyans.rows.filter(x=>!opts.onlySaved||mine.has(x.id));
 if(opts.cityChoice&&cityCodes[opts.cityChoice])list=list.filter(x=>allowedCity(x.city,opts.cityChoice!));
 const s=opts.search?.toLowerCase().trim();
 if(s)list=list.filter(x=>[x.synagogue_name,x.city,x.address,x.community,x.dial_code].some(v=>
  String(v||"").toLowerCase().includes(s)));
 return list.slice(0,Math.max(1,Math.min(opts.limit||200,600))).map(x=>({
  id:x.id,dialCode:x.dial_code,synagogueName:x.synagogue_name,city:x.city,country:x.country,
  address:x.address,shacharis:x.shacharis,mincha:x.mincha,maariv:x.maariv,
  weekdaySchedules:x.weekday_schedules,notes:x.notes,
  geoVerified:x.address_verified===true&&x.latitude!==null&&x.longitude!==null,
  latitude:x.address_verified?x.latitude:null,longitude:x.address_verified?x.longitude:null,
  timezone:x.timezone,ownSaved:mine.has(x.id),lastScheduleVerified:x.last_schedule_verified_at
 }));
}
async function planPlaces(searchCity?:string):Promise<Place[]>{
 const results=await pool.query(
  "SELECT m.id,m.synagogue_name AS name,m.city,m.address,d.dial_code,d.latitude,d.longitude,d.timezone,"+
  "r.prayer,r.week_day,r.local_time::text AS local_time,r.recurrence_minutes,"+
  "r.until_local_time::text AS until_time,r.rabeinu_tam_offset_min,"+
  "z.local_day::text AS zman_day,z.rabeinu_tam_at::text AS rt_time "+
  "FROM public.minyans m JOIN public.gavhah_minyan_directory d ON d.minyan_id=m.id "+
  "LEFT JOIN public.gavhah_minyan_service_rules r ON r.minyan_id=m.id AND r.active=true "+
  "AND r.approved_at IS NOT NULL "+
  "LEFT JOIN public.gavhah_minyan_verified_zmanim z ON z.minyan_id=m.id AND "+
  "z.local_day BETWEEN current_date-interval '2 day' AND current_date+interval '370 days' "+
  "WHERE m.status='approved' AND d.address_verified=true AND d.latitude IS NOT NULL "+
  "AND d.longitude IS NOT NULL AND m.address IS NOT NULL ORDER BY d.dial_code LIMIT 1500");
 const places=new Map<number,Place>();
 for(const r of results.rows){
  if(searchCity&&!r.city.toLowerCase().includes(searchCity.toLowerCase()))continue;
  if(!places.has(r.id))places.set(r.id,{
   id:r.id,dialCode:r.dial_code,name:r.name,address:r.address,city:r.city,
   timezone:r.timezone,point:{latitude:r.latitude,longitude:r.longitude},rules:[],zmanim:{}
  });
  const place=places.get(r.id)!;
  if(r.zman_day&&r.rt_time)place.zmanim![r.zman_day]=new Date(r.rt_time).toISOString();
  if(r.prayer&&r.week_day!==null){
   const rule:Rule={
    prayer:r.prayer,weekDay:r.week_day,time:r.local_time?String(r.local_time).slice(0,5):null,
    intervalMinutes:r.recurrence_minutes,untilTime:r.until_time?String(r.until_time).slice(0,5):null,
    rtOffsetMinutes:r.rabeinu_tam_offset_min
   };
   if(!place.rules.some(p=>JSON.stringify(p)===JSON.stringify(rule)))place.rules.push(rule);
  }
 }
 return [...places.values()].slice(0,500);
}
router.get("/minyans/advanced",async(req,res,next)=>{
 try{
  const cityChoice=queryTerm(req.query.cityCode);
  const search=queryTerm(req.query.q);
  if(req.query.cityCode!==undefined&&!cityChoice||req.query.q!==undefined&&!search){
   res.status(400).json({error:"Invalid search term"});return;
  }
  const result=await minyanReadList({cityChoice:cityChoice||undefined,search:search||undefined,limit:500});
  res.set("Cache-Control","public,max-age=30").json(result);
 }catch(e){next(e);}
});
router.get("/minyans/dial/:code",async(req,res,next)=>{
 try{
  const code=id(req.params.code);
  if(!code||code<100||code>9999){res.sendStatus(404);return;}
  const rows=await minyanReadList({search:String(code),limit:500});
  const exact=rows.find(x=>x.dialCode===code);
  if(!exact){res.sendStatus(404);return;}
  res.set("Cache-Control","public,max-age=30").json(exact);
 }catch(e){next(e);}
});
router.get("/me/minyans/saved",requireAuth,async(req,res,next)=>{
 try{
  const list=await minyanReadList({memberId:getSessionUserId(req)!,onlySaved:true,limit:300});
  res.set("Cache-Control","private,no-store").json(list);
 }catch(e){next(e);}
});
router.put("/me/minyans/saved/:id",requireAuth,async(req,res,next)=>{
 if(!originOK(req)){res.sendStatus(403);return;}
 const placeId=id(req.params.id),memberId=getSessionUserId(req);
 if(!placeId||!memberId){res.sendStatus(404);return;}
 try{
  const found=await pool.query("SELECT m.id FROM public.minyans m "+
   "WHERE m.id=$1 AND m.status='approved'",[placeId]);
  if(!found.rowCount){res.sendStatus(404);return;}
  await pool.query("INSERT INTO public.gavhah_minyan_saved_places(member_id,minyan_id) "+
    "VALUES($1,$2) ON CONFLICT DO NOTHING",[memberId,placeId]);
  res.json({saved:true});
 }catch(e){next(e);}
});
router.delete("/me/minyans/saved/:id",requireAuth,async(req,res,next)=>{
 if(!originOK(req)){res.sendStatus(403);return;}
 const placeId=id(req.params.id),memberId=getSessionUserId(req);
 if(!placeId||!memberId){res.sendStatus(404);return;}
 try{
  await pool.query("DELETE FROM public.gavhah_minyan_saved_places WHERE member_id=$1 AND minyan_id=$2",[memberId,placeId]);
  res.json({saved:false});
 }catch(e){next(e);}
});
router.post("/me/minyans/planner",requireAuth,async(req,res,next)=>{
 if(!originOK(req)){res.sendStatus(403);return;}
 const member=getSessionUserId(req)!;
 const mode=req.body?.travelMode as Mode,rawAt=req.body?.startAt;
 const skip=req.body?.skipIds||[];
 const preferred=id(req.body?.preferredId);
 if(!["walking","driving"].includes(mode)||!Array.isArray(skip)||skip.length>50||
  skip.some((x:unknown)=>!id(x))||
  (rawAt!==undefined&&(typeof rawAt!=="string"||!Number.isFinite(Date.parse(rawAt))))){
  res.status(400).json({error:"Travel mode, date or skipped-place list invalid"});return;
 }
 const startAt=rawAt?Date.parse(rawAt):Date.now();
 if(startAt<Date.now()-300000||startAt>Date.now()+365*86400000){
  res.status(400).json({error:"Use now or a future departure within 365 days"});return;
 }
 let origin:Geo;
 try{
  if(validGeo(req.body?.origin))origin=req.body.origin;
  else if(typeof req.body?.address==="string"&&req.body.address.length<=300){
   origin=await getGeoFromAddress(req.body.address);
  }else{res.status(400).json({error:"Share GPS location with permission or type a full starting address"});return;}
  const places=await planPlaces();
  const result=await deterministicTrip({
   origin,places,mode,startAt,avoid:skip.map(Number),preferredId:preferred,maxStops:8,maxWaitMinutes:90
  });
  res.set("Cache-Control","private,no-store").json({
   ...result,startAt:new Date(startAt).toISOString(),source:"verified places and Google Routes live matrix",
   gpsTracking:false,
   note:"Routes reflect the current requested position, not continuous phone tracking. Re-request to update traffic."
  });
 }catch(e){
  const code=e instanceof Error?e.message:"UNKNOWN";
  if(["ROUTING_NOT_CONFIGURED","GEOCODING_NOT_CONFIGURED"].includes(code)){
   res.status(503).json({error:"Routing/geocoding provider is not connected; no ETA can be promised",code});return;
  }
  if(code==="ADDRESS_AMBIGUOUS"||code==="ADDRESS_NOT_VERIFIED"){
   res.status(422).json({error:"Starting address could not be verified; enter the complete street address",code});return;
  }
  next(e);
 }
});
router.post("/admin/minyans/:id/verified-location",requireAdmin,async(req,res,next)=>{
 if(!originOK(req)){res.sendStatus(403);return;}
 const placeId=id(req.params.id),location=req.body?.location;
 if(!placeId||!validGeo(location)){res.status(400).json({error:"Valid reviewed coordinates required"});return;}
 const zone=String(req.body?.timezone||"America/New_York");
 try{new Intl.DateTimeFormat("en-US",{timeZone:zone});}catch{res.status(400).json({error:"Invalid timezone"});return;}
 if(!req.body?.staffConfirmedAddress){res.status(400).json({error:"Staff must confirm the mapped place address"});return;}
 try{
  const r=await pool.query(
   "UPDATE public.gavhah_minyan_directory d SET latitude=$2,longitude=$3,"+
   "address_verified=true,timezone=$4,verified_by=$5,verified_at=now() "+
   "FROM public.minyans m WHERE d.minyan_id=$1 AND m.id=d.minyan_id "+
   "AND m.status='approved' AND m.address IS NOT NULL RETURNING d.dial_code",
   [placeId,location.latitude,location.longitude,zone,getSessionUserId(req)]);
  if(!r.rowCount){res.sendStatus(404);return;}
  res.json({ok:true,dialCode:r.rows[0].dial_code});
 }catch(e){next(e);}
});
router.post("/admin/minyans/:id/service-rules",requireAdmin,async(req,res,next)=>{
 if(!originOK(req)){res.sendStatus(403);return;}
 const placeId=id(req.params.id),entries=req.body?.rules;
 if(!placeId||!Array.isArray(entries)||entries.length<1||entries.length>120){
  res.status(400).json({error:"At least one, up to 120 service rules required"});return;
 }
 const prayers=new Set(["shacharis","mincha","maariv","mincha_maariv"]);
 const clean:Array<{
  prayer:string;day:number;time:string|null;offset:number|null;interval:number|null;until:string|null
 }>=[];
 for(const e of entries){
  const day=Number(e?.weekDay),time=e?.time||null,offset=e?.rtOffsetMinutes??null,
   interval=e?.intervalMinutes??null,until=e?.untilTime||null;
  if(!prayers.has(e?.prayer)||!Number.isInteger(day)||day<0||day>6||
    ((time===null)===(offset===null))||
    (time!==null&&!(typeof time==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))||
    (offset!==null&&(!Number.isInteger(offset)||offset<0||offset>240))||
    (interval!==null&&(!Number.isInteger(interval)||interval<5||interval>240))||
    (until!==null&&(typeof until!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(until)))||
    ((interval===null)!==(until===null))){
   res.status(400).json({error:"Time, Rabbeinu Tam offset or recurrence rule invalid"});return;
  }
  clean.push({prayer:e.prayer,day,time,offset,interval,until});
 }
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const m=await c.query("SELECT id FROM public.minyans WHERE id=$1 AND status='approved' FOR UPDATE",[placeId]);
  if(!m.rowCount){await c.query("ROLLBACK");res.sendStatus(404);return;}
  // Replace all structured rules for this location only, never change legacy content.
  await c.query("DELETE FROM public.gavhah_minyan_service_rules WHERE minyan_id=$1",[placeId]);
  for(const x of clean)await c.query(
   "INSERT INTO public.gavhah_minyan_service_rules "+
   "(minyan_id,prayer,week_day,local_time,rabeinu_tam_offset_min,"+
   "recurrence_minutes,until_local_time,submitted_by_user_id,approved_by,approved_at) "+
   "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,now())",
   [placeId,x.prayer,x.day,x.time,x.offset,x.interval,x.until,getSessionUserId(req)]);
  await c.query("UPDATE public.gavhah_minyan_directory SET last_schedule_verified_at=now() "+
   "WHERE minyan_id=$1",[placeId]);
  await c.query("COMMIT");
  res.json({ok:true,placeId,count:clean.length});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});next(e);}finally{c.release();}
});
router.get("/admin/minyans/phone-submissions",requireAdmin,async(_req,res,next)=>{
 try{
  const r=await pool.query("SELECT id,member_id,city,synagogue_typed,address_typed,"+
   "schedule_json,status,review_notes,created_at,"+
   "synagogue_audio IS NOT NULL AS has_name_audio,address_audio IS NOT NULL AS has_address_audio,"+
   "city_audio IS NOT NULL AS has_city_audio,notes_audio IS NOT NULL AS has_notes_audio "+
   "FROM public.gavhah_minyan_phone_submissions ORDER BY created_at DESC LIMIT 200");
  res.set("Cache-Control","private,no-store").json(r.rows);
 }catch(e){next(e);}
});
router.get("/admin/minyans/phone-submissions/:id/audio/:field",requireAdmin,async(req,res,next)=>{
 try{
  const submissionId=id(req.params.id);
  const fields:Record<string,string>={name:"synagogue_audio",address:"address_audio",city:"city_audio",notes:"notes_audio"};
  const field=fields[String(req.params.field||"")];
  if(!submissionId||!field){res.sendStatus(404);return;}
  const r=await pool.query("SELECT "+field+" AS audio FROM public.gavhah_minyan_phone_submissions WHERE id=$1",[submissionId]);
  const path=validRecordedPath(r.rows[0]?.audio);
  if(!path){res.sendStatus(404);return;}
  const voice=await fetchModeratedNewsAudio(path);
  res.set("Cache-Control","private,no-store").set("Content-Type","audio/wav")
   .set("X-Content-Type-Options","nosniff").send(Buffer.from(voice));
 }catch(e){next(e);}
});
router.post("/admin/minyans/phone-submissions/:id/review",requireAdmin,async(req,res,next)=>{
 if(!originOK(req)){res.sendStatus(403);return;}
 const submissionId=id(req.params.id);
 const decision=req.body?.decision,notes=String(req.body?.notes||"");
 if(!submissionId||!["reviewing","rejected","approved"].includes(decision)||notes.length>1000){
  res.status(400).json({error:"Invalid phone submission review"});return;
 }
 const title=String(req.body?.synagogueName||"").trim();
 const city=String(req.body?.city||"").trim();
 const address=String(req.body?.address||"").trim();
 const times=req.body?.times;
 if(decision==="approved"&&(title.length<3||city.length<2||address.length<6||
   !times||typeof times!=="object"||
   !["shacharis","mincha","maariv"].some(k=>String(times[k]||"").trim()))){
  res.status(400).json({error:"Transcribe and verify name, full address, city and at least one prayer time before submission"});return;
 }
 const c=await pool.connect();
 let member:number|null=null,createdId:number|null=null;
 try{
  await c.query("BEGIN");
  const m=await c.query<{member_id:number;status:string;reviewed_minya_id:number|null}>(
   "SELECT member_id,status,reviewed_minya_id FROM public.gavhah_minyan_phone_submissions "+
   "WHERE id=$1 FOR UPDATE",[submissionId]);
  const record=m.rows[0];
  if(!record||!["pending","reviewing"].includes(record.status)){
   await c.query("ROLLBACK");res.status(409).json({error:"Submission already reviewed"});return;
  }
  member=record.member_id;
  if(decision==="approved"){
   const result=await c.query<{id:number}>(
    "INSERT INTO public.minyans "+
    "(synagogue_name,community,city,country,address,shacharis,mincha,maariv,notes,"+
    "status,submitted_by_user_id) VALUES($1,'',$2,'USA',$3,$4,$5,$6,$7,'pending',$8) RETURNING id",
    [title.slice(0,240),city.slice(0,160),address.slice(0,300),
     String(times.shacharis||"").slice(0,2400),
     String(times.mincha||"").slice(0,2400),
     String(times.maariv||"").slice(0,2400),notes,member]);
   createdId=result.rows[0].id;
  }
  await c.query("UPDATE public.gavhah_minyan_phone_submissions SET status=$2,"+
   "reviewed_minya_id=$3,reviewed_by=$4,review_notes=$5,reviewed_at=now() WHERE id=$1",
   [submissionId,decision,createdId,getSessionUserId(req),notes]);
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});next(e);return;}finally{c.release();}
 if(member)await notifyUser(member,"minyan_phone_review",
  decision==="approved"?"Your phone minyan submission was transcribed into a staff-pending listing; it is not public yet.":
  decision==="rejected"?"Your phone minyan submission was not approved.":"Your minyan submission is under review.",
  "/minyans");
 res.json({id:submissionId,status:decision,minyanId:createdId,
  public:false,message:"The existing /admin/minyans final approval is required for publication and a dial code"});
});
export default router;
