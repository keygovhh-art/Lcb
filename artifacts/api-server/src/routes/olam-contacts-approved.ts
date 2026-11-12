import {Router} from "express";
import {pool} from "@workspace/db";
import {requireAuth,getSessionUserId} from "../middlewares/auth";

/**
 * Approved "קאנטאקט'ס" voice/web data API.
 * One shared Neon source; no independent donor database and no unverified dial.
 * On calls, the SQL trigger creates a nameless contact and appends past statuses.
 */
const router=Router();
router.use("/askanus/max/contacts/approved",requireAuth);
const clean=(v:unknown,n:number)=>String(v??"").trim().slice(0,n);
const idOK=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const num=(v:unknown)=>{
 const x=String(v??"");
 if(!/^[\d+\s().-]{10,30}$/.test(x))return null;
 const d=x.replace(/\D/g,""),s=d.length===11&&d.startsWith("1")?d.slice(1):d;
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(s)?"+1"+s:null;
};
const allowedCategories=[
 "all","eligible","callbacks","pledge_pending","warm","do_not_call",
 "missed","donations","no_answer","not_interested","asked_no_more",
 "pledges","other","unreported","spoke"
] as const;
type Category=typeof allowedCategories[number];
const conditions:Record<Category,string>={
 all:"TRUE",
 eligible:"c.do_not_call=false AND EXISTS(SELECT 1 FROM public.max_contact_recontact_plans rp WHERE rp.user_id=c.user_id AND rp.contact_id=c.id AND rp.next_allowed_at<=now())",
 callbacks:"EXISTS(SELECT 1 FROM public.max_donor_recontact d WHERE d.user_id=c.user_id AND d.contact_id=c.id AND d.status='waiting' AND d.due_at<=now()) OR EXISTS(SELECT 1 FROM public.max_call_sessions s WHERE s.user_id=c.user_id AND s.contact_id=c.id AND s.outcome='callback' AND (s.report_details->>'callbackAt') IS NOT NULL AND (s.report_details->>'callbackAt')::timestamptz<=now())",
 pledge_pending:"EXISTS(SELECT 1 FROM public.max_pledges p WHERE p.user_id=c.user_id AND p.contact_id=c.id AND p.amount>p.paid_amount AND p.status NOT IN ('cancelled','paid'))",
 warm:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND (e.details->>'mood'='friendly' OR e.details->'report'->>'donationWarmth' IN ('very_warm','very_generous','warm','generous')))",
 do_not_call:"c.do_not_call=true",
 missed:"EXISTS(SELECT 1 FROM public.max_call_sessions s WHERE s.user_id=c.user_id AND s.contact_id=c.id AND s.direction='inbound' AND s.status='no_answer')",
 donations:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='donation')",
 no_answer:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='no_answer')",
 not_interested:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='not_interested')",
 asked_no_more:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='asked_no_more')",
 pledges:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='pledge')",
 other:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='other')",
 unreported:"EXISTS(SELECT 1 FROM public.max_call_sessions s WHERE s.user_id=c.user_id AND s.contact_id=c.id AND s.outcome='')",
 spoke:"EXISTS(SELECT 1 FROM public.max_contact_call_events e WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome='spoke')"
};
function isoDay(value:unknown){
 const x=clean(value,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return null;
 const d=new Date(x+"T12:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x?x:null;
}
function westernDateFromHebrewYearMonthDay(y:number,m:number,d:number):string|null{
 if(!Number.isSafeInteger(y)||y<5000||y>7000||!Number.isSafeInteger(m)||m<1||m>13||!Number.isSafeInteger(d)||d<1||d>30)return null;
 // Months are numbered from Tishrei; the leap-year Adar II adds month 7.
 const fmt=new Intl.DateTimeFormat("en-u-ca-hebrew",{timeZone:"America/New_York",year:"numeric",month:"long",day:"numeric"});
 const leap=[0,3,6,8,11,14,17].includes(y%19);
 const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
 const names=leap
  ? ["tishri","heshvan","kislev","tevet","shevat","adar i","adar ii","nisan","iyar","sivan","tamuz","av","elul"]
  : ["tishri","heshvan","kislev","tevet","shevat","adar","nisan","iyar","sivan","tamuz","av","elul"];
 const target=names[m-1];if(!target)return null;
 // A Hebrew year normally starts Sep/Oct in civil year y-3761.
 const start=Date.UTC(y-3761,7,15,12),end=Date.UTC(y-3760,11,31,12);
 for(let ms=start;ms<=end;ms+=86400000){
  const date=new Date(ms);
  const parts=Object.fromEntries(fmt.formatToParts(date).map(z=>[z.type,z.value]));
  let name=norm(String(parts.month||""));
  if(name==="adar1")name="adari";
  if(name==="adar2")name="adarii";
  const expected=norm(target);
  // Some Intl editions use Adar for Adar II, or Tishrei / Cheshvan variants.
  const match=name===expected||(expected==="tishri"&&name==="tishrei")||
   (expected==="heshvan"&&["cheshvan","marcheshvan"].includes(name))||
   (expected==="adarii"&&name==="adar")||
   (expected==="tamuz"&&name==="tammuz");
  if(Number(parts.year)===y&&Number(parts.day)===d&&match)return date.toISOString().slice(0,10);
 }
 return null;
}
function searchDate(query:any):string|null{
 if(query.dateSystem==="hebrew"){
  const day=westernDateFromHebrewYearMonthDay(Number(query.hebrewYear),Number(query.hebrewMonth),Number(query.hebrewDay));
  return day;
 }
 return query.dateSystem==="gregorian"?isoDay(query.callDate):null;
}
const queryContact=async(uid:number,ref:number)=> {
 const r=await pool.query("SELECT id,contact_ref,name,phone,postal_address,email,city,organization,notes,do_not_call,preferred_timezone,preferred_hours,relationship_notes FROM public.communication_contacts WHERE user_id=$1 AND contact_ref=$2 AND archived_at IS NULL",[uid,ref]);
 return r.rows[0]||null;
};
const ownedContact=async(uid:number,id:number)=>!!(await pool.query("SELECT 1 FROM public.communication_contacts WHERE id=$1 AND user_id=$2 AND archived_at IS NULL",[id,uid])).rowCount;
router.get("/askanus/max/contacts/approved/menu",(_req,res)=>{
 res.set("Cache-Control","private,no-store").json({
  title:"קאנטאקט'ס",
  keys:{"1":"list","2":"create","3":"search","4":"eligible","5":"callbacks","6":"pledge_pending","7":"warm","8":"do_not_call","9":"other_categories","*":"back"},
  otherCategories:{"1":"missed","2":"donations","3":"no_answer","4":"not_interested","5":"asked_no_more","6":"pledges","7":"other","8":"unreported","9":"spoke"},
  anyCategorySearch:{"1":"phone","2":"call_date_gregorian_or_hebrew","3":"contact_ref"},
  perContact:{"1":"edit","2":"all_call_statuses","3":"archive","*":"back"},
  editFields:{"1":"all_fields","2":"phone","3":"name","4":"address","5":"email","6":"city","7":"notes","8":"calling_permission","9":"recontact_plan"},
  list:{"1":"newest_first","2":"oldest_first"}
 });
});
router.get("/askanus/max/contacts/approved/list",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,cat=clean(req.query.category||"all",35) as Category;
  if(!allowedCategories.includes(cat)){res.status(400).json({error:"Invalid category"});return;}
  const sort=req.query.sort==="oldest"?"ASC":"DESC",limit=Math.min(100,Math.max(1,Number(req.query.limit)||30)),page=Math.min(10000,Math.max(0,Number(req.query.page)||0));
  let phonePattern: string|null=null;
  if(req.query.phone!==undefined){
   const digits=clean(req.query.phone,30).replace(/\D/g,"");
   if(digits.length<3||digits.length>11){res.status(400).json({error:"Phone search must contain 3-11 digits"});return;}
   phonePattern="%"+digits+"%";
  }
  const ref=req.query.contactRef===undefined?null:Number(req.query.contactRef);
  if(ref!==null&&!idOK(ref)){res.status(400).json({error:"Invalid contact ID"});return;}
  const dateProvided=req.query.dateSystem!==undefined;
  const day=dateProvided?searchDate(req.query):null;
  if(dateProvided&&!day){res.status(400).json({error:"Invalid Hebrew or Gregorian call date"});return;}
  // Match ANY historic call on a given civil/Hebrew date, not only the latest.
  const q=await pool.query(
   "SELECT c.id,c.contact_ref,c.name,c.phone,c.do_not_call,c.created_at,latest.outcome AS current_outcome,"+
   "latest.recorded_at AS current_recorded_at,latest.details AS current_details,"+
   "(SELECT count(*)::int FROM public.max_call_sessions s WHERE s.user_id=c.user_id AND s.contact_id=c.id) AS call_count "+
   "FROM public.communication_contacts c "+
   "LEFT JOIN LATERAL (SELECT outcome,recorded_at,details FROM public.max_contact_call_events e "+
   "WHERE e.user_id=c.user_id AND e.contact_id=c.id AND e.outcome<>'' ORDER BY e.recorded_at DESC,e.id DESC LIMIT 1) latest ON TRUE "+
   "WHERE c.user_id=$1 AND c.archived_at IS NULL AND ("+conditions[cat]+") "+
   "AND ($2::text IS NULL OR regexp_replace(c.phone,'[^0-9]','','g') LIKE $2) "+
   "AND ($3::date IS NULL OR EXISTS(SELECT 1 FROM public.max_contact_call_events e "+
   "WHERE e.user_id=$1 AND e.contact_id=c.id AND (e.call_at AT TIME ZONE 'America/New_York')::date=$3::date) "+
   "OR EXISTS(SELECT 1 FROM public.max_call_sessions s WHERE s.user_id=$1 AND s.contact_id=c.id "+
   "AND (s.created_at AT TIME ZONE 'America/New_York')::date=$3::date)) "+
   "AND ($4::integer IS NULL OR c.contact_ref=$4) "+
   "ORDER BY c.created_at "+sort+",c.id "+sort+" LIMIT $5 OFFSET $6",
   [uid,phonePattern,day,ref,limit,page*limit]);
  res.set("Cache-Control","private,no-store").json({category:cat,sort:sort==="ASC"?"oldest":"newest",items:q.rows,
    searchOptions:["phone","gregorianDate","hebrewDate","contactId"],statusOrder:"current_then_previous",page});
 }catch(e){next(e);}
});
router.get("/askanus/max/contacts/approved/:ref",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,ref=Number(req.params.ref);
  if(!idOK(ref)){res.sendStatus(400);return;}
  const c=await queryContact(uid,ref);if(!c){res.sendStatus(404);return;}
  res.set("Cache-Control","private,no-store").json(c);
 }catch(e){next(e);}
});
router.get("/askanus/max/contacts/approved/:ref/calls",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,ref=Number(req.params.ref);
  if(!idOK(ref)){res.sendStatus(400);return;}
  const c=await queryContact(uid,ref);if(!c){res.sendStatus(404);return;}
  const x=await pool.query(
   "SELECT e.id,e.call_session_id,e.call_at,e.recorded_at,e.source,e.direction,e.outcome,e.purpose_type,e.purpose_key,e.details "+
   "FROM public.max_contact_call_events e WHERE e.user_id=$1 AND e.contact_id=$2 "+
   "ORDER BY e.recorded_at DESC,e.id DESC LIMIT 300",[uid,c.id]);
  res.set("Cache-Control","private,no-store").json({contactRef:ref,phone:c.phone,
   latest:x.rows.find((r:any)=>r.outcome!=="")??null,allCurrentAndPrevious:x.rows,
   previousStatusIsNeverOverwritten:true});
 }catch(e){next(e);}
});
router.post("/askanus/max/contacts/approved",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,p=num(req.body?.phone),name=clean(req.body?.name,180),address=clean(req.body?.address,550);
  if(!p){res.status(400).json({error:"Valid phone required; name and address can be skipped"});return;}
  const old=(await pool.query("SELECT id,contact_ref,name,archived_at FROM public.communication_contacts WHERE user_id=$1 AND right(regexp_replace(phone,'[^0-9]','','g'),10)=$2 ORDER BY id LIMIT 1",[uid,p.slice(-10)])).rows[0];
  if(old){
   const r=await pool.query("UPDATE public.communication_contacts SET name=CASE WHEN name='' THEN $1 ELSE name END, postal_address=CASE WHEN postal_address='' THEN $2 ELSE postal_address END,archived_at=NULL,updated_at=now() WHERE id=$3 AND user_id=$4 RETURNING id,contact_ref,name,phone",[name,address,old.id,uid]);
   res.json({saved:true,existing:true,contact:r.rows[0]});return;
  }
  const q=await pool.query("INSERT INTO public.communication_contacts(user_id,name,phone,postal_address) VALUES($1,$2,$3,$4) RETURNING id,contact_ref,name,phone",[uid,name,p,address]);
  res.status(201).json({saved:true,contact:q.rows[0]});
 }catch(e){next(e);}
});
router.patch("/askanus/max/contacts/approved/:ref",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,ref=Number(req.params.ref);if(!idOK(ref)){res.sendStatus(400);return;}
  const c=await queryContact(uid,ref);if(!c){res.sendStatus(404);return;}
  const updates:Record<string,unknown>={};
  const fields:Record<string,number>={name:180,postal_address:550,email:250,city:120,notes:2500,organization:180,relationship_notes:2500,preferred_hours:180};
  for(const [key,max] of Object.entries(fields))if(Object.prototype.hasOwnProperty.call(req.body||{},key))updates[key]=clean(req.body[key],max);
  if(req.body?.phone!==undefined){const p=num(req.body.phone);if(!p){res.status(400).json({error:"Invalid phone"});return;}updates.phone=p;}
  if(req.body?.do_not_call!==undefined){
   if(typeof req.body.do_not_call!=="boolean"||req.body.confirm!=="CONFIRM_CALL_PERMISSION"){
    res.status(400).json({error:"Call permission requires explicit confirmation"});return;}
   updates.do_not_call=req.body.do_not_call;
  }
  if(!Object.keys(updates).length){res.status(400).json({error:"No accepted fields"});return;}
  const keys=Object.keys(updates);const params=[...keys.map(k=>updates[k]),uid,c.id];
  const q=await pool.query("UPDATE public.communication_contacts SET "+keys.map((k,i)=>k+"=$"+(i+1)).join(",")+",updated_at=now() WHERE user_id=$"+(keys.length+1)+" AND id=$"+(keys.length+2)+" RETURNING id,contact_ref,name,phone",params);
  res.json({saved:true,contact:q.rows[0]});
 }catch(e){next(e);}
});
router.post("/askanus/max/contacts/approved/:ref/archive",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,ref=Number(req.params.ref);
  if(!idOK(ref)||req.body?.confirm!=="ARCHIVE_CONTACT_ONLY"){res.status(400).json({error:"Explicit contact-only confirmation required"});return;}
  const c=await queryContact(uid,ref);if(!c){res.sendStatus(404);return;}
  const q=await pool.query("UPDATE public.communication_contacts SET archived_at=now(),updated_at=now() WHERE user_id=$1 AND id=$2 AND archived_at IS NULL RETURNING id",[uid,c.id]);
  res.json({archived:!!q.rowCount,allCallHistoryPreserved:true,allFinancePreserved:true});
 }catch(e){next(e);}
});
router.post("/askanus/max/contacts/approved/:ref/recontact",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,ref=Number(req.params.ref);
  const c=idOK(ref)?await queryContact(uid,ref):null;if(!c){res.sendStatus(404);return;}
  const scope=clean(req.body?.scope,22),pt=clean(req.body?.purposeType||"none",15),pk=clean(req.body?.purposeKey,80);
  const interval=Number(req.body?.intervalMonths);
  if(!["same_purpose","new_purpose","person"].includes(scope)||!["none","case","campaign","project"].includes(pt)||
      (pt==="none"&&pk)||(pt!=="none"&&!pk)||!Number.isInteger(interval)||interval<1||interval>120){
   res.status(400).json({error:"Select person/same/new purpose and interval 1-120 months"});return;
  }
  if(pt==="case"&&(!idOK(pk)||!(await pool.query("SELECT 1 FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[pk,uid])).rowCount)){
   res.status(404).json({error:"Case not owned"});return;
  }
  // Campaign memberships are NOT inferred from a previously selected project.
  // Until Campaign Connect reauthorizes, reject campaign-scoped writes.
  if(pt==="campaign"){res.status(409).json({error:"Campaign membership must be verified through Campaign Connect"});return;}
  const date=String(req.body?.nextAllowedAt||"");
  const future=date?new Date(date):null;
  if(future&&(!Number.isFinite(future.getTime())||future.getTime()<=Date.now())){res.status(400).json({error:"Future date required"});return;}
  const q=await pool.query(
   "INSERT INTO public.max_contact_recontact_plans(user_id,contact_id,scope,purpose_type,purpose_key,interval_months,next_allowed_at,note) "+
   "VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()+make_interval(months=>$6)),$8) "+
   "ON CONFLICT(user_id,contact_id,scope,purpose_type,purpose_key) DO UPDATE SET "+
   "interval_months=EXCLUDED.interval_months,next_allowed_at=EXCLUDED.next_allowed_at,note=EXCLUDED.note,updated_at=now() "+
   "RETURNING id,next_allowed_at",[uid,c.id,scope,pt,pk,interval,future?.toISOString()??null,clean(req.body?.note,500)]);
  res.json({saved:true,rule:q.rows[0],automaticDial:false});
 }catch(e){next(e);}
});
export default router;
