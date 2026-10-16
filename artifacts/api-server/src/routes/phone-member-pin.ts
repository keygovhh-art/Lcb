import { Router, type Request } from "express";
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { isReservedSuperAdminName } from "../lib/super-admin";

const router=Router();
const derive=promisify(scrypt);
const PIN=/^[0-9]{12,16}$/;
const PEPPER_NAMESPACE="gavhah:phone-pin:v1:";
function originAllowed(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin||!host||req.get("sec-fetch-site")==="cross-site")return false;
 try{return new URL(origin).protocol==="https:"&&new URL(origin).host===host;}catch{return false;}
}
function key(){
 const value=process.env.YEMOT_ENCRYPTION_KEY||"";
 const decoded=Buffer.from(value,"base64");
 if(decoded.length!==32||decoded.toString("base64")!==value)throw Error("Phone PIN secure storage unavailable");
 return decoded;
}
function lookup(pin:string){
 return createHmac("sha256",key()).update(PEPPER_NAMESPACE+pin).digest("hex");
}
async function slowHash(pin:string,salt:string){
 return (await derive(pin,salt,64) as Buffer).toString("hex");
}
function validPin(pin:unknown):pin is string{
 return typeof pin==="string"&&PIN.test(pin)&&
  !/^(\d)\1+$/.test(pin)&&!/(?:0123456789|9876543210)/.test(pin);
}
async function storePin(userId:number,pin:string,actorId:number,requiresActivation=false){
 const salt=randomBytes(16).toString("hex");
 const verifier=await slowHash(pin,salt);
 await pool.query(
  "INSERT INTO public.gavhah_phone_member_pins(user_id,pin_index,pin_salt,pin_verifier,assigned_by,activation_required,failed_attempts,locked_until,updated_at) "+
  "VALUES($1,$2,$3,$4,$5,$6,0,NULL,now()) ON CONFLICT(user_id) DO UPDATE SET "+
  "pin_index=EXCLUDED.pin_index,pin_salt=EXCLUDED.pin_salt,pin_verifier=EXCLUDED.pin_verifier,"+
  "assigned_by=EXCLUDED.assigned_by,activation_required=EXCLUDED.activation_required,failed_attempts=0,locked_until=NULL,updated_at=now()",
  [userId,lookup(pin),salt,verifier,actorId,requiresActivation]);
}
// Return only Gavhah's *own* account ID; no Campaign Center account IDs,
// Neon Auth subjects, JWTs, or cross-service identities may be persisted here.
export async function verifyGavhahPhonePin(pin:string):Promise<number|null>{
 if(!validPin(pin))return null;
 const digest=lookup(pin);
 const match=await pool.query<{
  user_id:number;pin_salt:string;pin_verifier:string;locked_until:Date|null;status:string;activation_required:boolean;
 }>(
  "SELECT p.user_id,p.pin_salt,p.pin_verifier,p.locked_until,p.activation_required,u.status "+
  "FROM public.gavhah_phone_member_pins p JOIN public.users u ON u.id=p.user_id "+
  "WHERE p.pin_index=$1",[digest]);
 const row=match.rows[0];
 if(!row||row.activation_required||["suspended","banned"].includes(row.status)||
    (row.locked_until&&new Date(row.locked_until).getTime()>Date.now()))return null;
 const actual=await slowHash(pin,row.pin_salt);
 const expected=Buffer.from(row.pin_verifier,"hex"),given=Buffer.from(actual,"hex");
 const good=expected.length===given.length&&timingSafeEqual(expected,given);
 if(!good){
  await pool.query(
   "UPDATE public.gavhah_phone_member_pins SET failed_attempts=failed_attempts+1,"+
   "locked_until=CASE WHEN failed_attempts>=4 THEN now()+interval '30 minutes' ELSE locked_until END "+
   "WHERE user_id=$1",[row.user_id]);
  return null;
 }
 await pool.query("UPDATE public.gavhah_phone_member_pins SET failed_attempts=0,locked_until=NULL WHERE user_id=$1",[row.user_id]);
 return row.user_id;
}
// Unverified phone applications remain PENDING and confer NO membership.
// All application details stay in Gavhah's database, not Yemot folders.
export async function requestGavhahPhoneAccount(contact:string,pin:string,callHash:string){
 if(!/^[0-9]{10,15}$/.test(contact)||!validPin(pin)||!/^[a-f0-9]{64}$/.test(callHash))
  return "The phone number or numerical password is invalid.";
 const existing=await pool.query(
  "SELECT 1 FROM public.users WHERE phone=$1 LIMIT 1",[contact]);
 if(existing.rowCount)return "If you have an existing account, please use the login option.";
 const recent=await pool.query(
  "SELECT 1 FROM public.gavhah_phone_join_requests WHERE (call_hash=$1 AND submitted_at>now()-interval '24 hours') "+
  "OR (contact_phone=$2 AND status='pending') LIMIT 1",[callHash,contact]);
 if(recent.rowCount)return "A registration request for this call or number is already awaiting verification.";
 const salt=randomBytes(16).toString("hex");
 const verifier=await slowHash(pin,salt);
 const pwHash=await hashPassword(pin);
 try{
  await pool.query(
   "INSERT INTO public.gavhah_phone_join_requests(call_hash,contact_phone,website_password_hash,pin_index,pin_salt,pin_verifier) "+
   "VALUES($1,$2,$3,$4,$5,$6)",[callHash,contact,pwHash,lookup(pin),salt,verifier]);
 }catch(e){
  if((e as {code?:string})?.code==="23505")return "A request is already awaiting contact verification.";
  throw e;
 }
 return "Your Gavhah membership request was saved in our website administration system. Your phone number must be verified by our team before the account can become active. The chosen numeric password will work on the website after approval. Your request is not yet a membership.";
}
router.get("/admin/phone/join-requests",requireAuth,async(req,res,next)=>{
 try{
  const actor=await getCurrentSessionUser(req);
  if(!actor||!["admin","super_admin"].includes(actor.role)){res.sendStatus(403);return;}
  const requests=await pool.query(
   "SELECT id,contact_phone,status,submitted_at FROM public.gavhah_phone_join_requests "+
   "WHERE status='pending' ORDER BY submitted_at ASC LIMIT 100");
  res.set("Cache-Control","private,no-store").json({requests:requests.rows});
 }catch(e){next(e);}
});
router.post("/admin/phone/join-requests/:id/review",requireAuth,async(req,res,next)=>{
 try{
  if(!originAllowed(req)){res.sendStatus(403);return;}
  const actor=await getCurrentSessionUser(req);
  if(!actor||!["admin","super_admin"].includes(actor.role)){res.sendStatus(403);return;}
  const own=await pool.query<{password_hash:string}>(
   "SELECT password_hash FROM public.users WHERE id=$1",[actor.id]);
  if(!own.rows[0]||!await verifyPassword(String(req.body?.adminPassword||""),own.rows[0].password_hash)){
   res.status(401).json({error:"Administrator website password confirmation required"});return;
  }
  const id=Number(req.params.id),decision=req.body?.decision;
  if(!Number.isSafeInteger(id)||id<=0||!["approved","rejected"].includes(decision)){
   res.status(400).json({error:"Invalid review"});return;
  }
  if(decision==="approved"&&req.body?.contactVerified!==true){
   res.status(400).json({error:"Explicit independent contact verification required before membership approval"});return;
  }
  const name=String(req.body?.name||"").trim().slice(0,120);
  const nickname=String(req.body?.nickname||name).trim().slice(0,120);
  if(decision==="approved"&&
      (!name||!nickname||isReservedSuperAdminName(name)||isReservedSuperAdminName(nickname))){
   res.status(400).json({error:"Valid verified member name and nickname required"});return;
  }
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const result=await client.query(
    "SELECT * FROM public.gavhah_phone_join_requests WHERE id=$1 AND status='pending' FOR UPDATE",[id]);
   const pending=result.rows[0];
   if(!pending){await client.query("ROLLBACK");res.status(409).json({error:"Request already reviewed"});return;}
   let memberId:number|null=null;
   if(decision==="approved"){
    const exists=await client.query("SELECT id FROM public.users WHERE phone=$1",[pending.contact_phone]);
    if(exists.rowCount){await client.query("ROLLBACK");res.status(409).json({error:"Phone number already belongs to another account"});return;}
    const created=await client.query<{id:number}>(
     "INSERT INTO public.users(name,nickname,phone,password_hash,role,status) "+
     "VALUES($1,$2,$3,$4,'member','active') RETURNING id",
     [name,nickname,pending.contact_phone,pending.website_password_hash]);
    memberId=created.rows[0].id;
    await client.query(
     "INSERT INTO public.gavhah_phone_member_pins(user_id,pin_index,pin_salt,pin_verifier,assigned_by,activation_required) "+
     "VALUES($1,$2,$3,$4,$5,false)",
     [memberId,pending.pin_index,pending.pin_salt,pending.pin_verifier,actor.id]);
   }
   await client.query(
    "UPDATE public.gavhah_phone_join_requests SET status=$1,reviewed_at=now(),reviewed_by=$2,created_user_id=$3 "+
    "WHERE id=$4",[decision,actor.id,memberId,id]);
   await client.query("COMMIT");
   res.json({reviewed:true,decision,memberId,owner:"gavhah"});
  }catch(e){
   await client.query("ROLLBACK").catch(()=>{});
   if((e as {code?:string})?.code==="23505"){res.status(409).json({error:"Account identity or PIN already exists"});return;}
   throw e;
  }finally{client.release();}
 }catch(e){next(e);}
});
router.get("/account/phone-pin",requireAuth,async(req,res,next)=>{
 try{
  const user=await getCurrentSessionUser(req);
  if(!user){res.sendStatus(401);return;}
  const r=await pool.query("SELECT updated_at,activation_required FROM public.gavhah_phone_member_pins WHERE user_id=$1",[user.id]);
  res.set("Cache-Control","no-store").json({configured:!!r.rowCount,requiresActivation:!!r.rows[0]?.activation_required,lastChangedAt:r.rows[0]?.updated_at||null,owner:"gavhah",minimumDigits:12,maximumDigits:16});
 }catch(e){next(e);}
});
router.put("/account/phone-pin",requireAuth,async(req,res,next)=>{
 try{
  if(!originAllowed(req)){res.sendStatus(403);return;}
  const user=await getCurrentSessionUser(req);
  if(!user){res.sendStatus(401);return;}
  const pin=req.body?.pin,currentPassword=req.body?.currentPassword;
  if(!validPin(pin)||typeof currentPassword!=="string"||currentPassword.length>256){
   res.status(400).json({error:"Choose a 12–16 digit PIN and enter your current website password"});return;
  }
  const member=await pool.query<{password_hash:string}>("SELECT password_hash FROM public.users WHERE id=$1",[user.id]);
  if(!member.rows[0]||!await verifyPassword(currentPassword,member.rows[0].password_hash)){
   res.status(401).json({error:"Current website password is incorrect"});return;
  }
  if(await verifyPassword(pin,member.rows[0].password_hash)){
   res.status(400).json({error:"Phone PIN must be different from your website password"});return;
  }
  try{await storePin(user.id,pin,user.id);}
  catch(e){
   if((e as {code?:string})?.code==="23505"){res.status(409).json({error:"Choose a different private PIN"});return;}
   throw e;
  }
  res.set("Cache-Control","no-store").json({configured:true,owner:"gavhah"});
 }catch(e){next(e);}
});
router.post("/account/phone-pin/activate",requireAuth,async(req,res,next)=>{
 try{
  if(!originAllowed(req)){res.sendStatus(403);return;}
  const user=await getCurrentSessionUser(req);
  if(!user){res.sendStatus(401);return;}
  const pin=req.body?.pin;
  if(!validPin(pin)){res.status(400).json({error:"Enter your admin-issued 12–16 digit code"});return;}
  const current=await pool.query<{password_hash:string}>(
   "SELECT password_hash FROM public.users WHERE id=$1",[user.id]);
  if(!current.rows[0]||!await verifyPassword(String(req.body?.currentPassword||""),current.rows[0].password_hash)){
   res.status(401).json({error:"Your personal Gavhah website password is required"});return;
  }
  const candidate=await pool.query<{pin_salt:string;pin_verifier:string;pin_index:string}>(
   "SELECT pin_salt,pin_verifier,pin_index FROM public.gavhah_phone_member_pins WHERE user_id=$1 AND activation_required=true",[user.id]);
  const row=candidate.rows[0];
  if(!row||row.pin_index!==lookup(pin)){res.status(401).json({error:"Incorrect PIN or activation already complete"});return;}
  const actual=Buffer.from(await slowHash(pin,row.pin_salt),"hex");
  const expected=Buffer.from(row.pin_verifier,"hex");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){
   res.status(401).json({error:"Incorrect PIN"});return;
  }
  await pool.query(
   "UPDATE public.gavhah_phone_member_pins SET activation_required=false,updated_at=now() WHERE user_id=$1",[user.id]);
  res.json({configured:true,activated:true,owner:"gavhah"});
 }catch(e){next(e);}
});
router.delete("/account/phone-pin",requireAuth,async(req,res,next)=>{
 try{
  if(!originAllowed(req)){res.sendStatus(403);return;}
  const user=await getCurrentSessionUser(req);
  if(!user){res.sendStatus(401);return;}
  const member=await pool.query<{password_hash:string}>("SELECT password_hash FROM public.users WHERE id=$1",[user.id]);
  if(!member.rows[0]||!await verifyPassword(String(req.body?.currentPassword||""),member.rows[0].password_hash)){
   res.status(401).json({error:"Website password verification required"});return;
  }
  await pool.query("DELETE FROM public.gavhah_phone_member_pins WHERE user_id=$1",[user.id]);
  res.json({configured:false});
 }catch(e){next(e);}
});
router.post("/admin/phone/member-pin",requireAuth,async(req,res,next)=>{
 try{
  if(!originAllowed(req)){res.sendStatus(403);return;}
  const actor=await getCurrentSessionUser(req);
  if(!actor||!["admin","super_admin"].includes(actor.role)){res.sendStatus(403);return;}
  const id=Number(req.body?.userId);
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Valid Gavhah member ID required"});return;}
  const own=await pool.query<{password_hash:string}>("SELECT password_hash FROM public.users WHERE id=$1",[actor.id]);
  if(!own.rows[0]||!await verifyPassword(String(req.body?.adminPassword||""),own.rows[0].password_hash)){
   res.status(401).json({error:"Re-enter administrator website password"});return;
  }
  const target=await pool.query("SELECT id FROM public.users WHERE id=$1 AND status NOT IN ('suspended','banned')",[id]);
  if(!target.rowCount){res.sendStatus(404);return;}
  const requested=req.body?.pin;
  const pin=requested===undefined?String(randomInt(0,1000000000000)).padStart(12,"0"):requested;
  if(!validPin(pin)){res.status(400).json({error:"PIN must contain 12 to 16 digits"});return;}
  try{await storePin(id,pin,actor.id,true);}
  catch(e){
   if((e as {code?:string})?.code==="23505"){res.status(409).json({error:"PIN already assigned to an account"});return;}
   throw e;
  }
  // Show generated one time only, never log it or return it in status/list APIs.
  res.set("Cache-Control","no-store").json({updated:true,userId:id,generated:requested===undefined,...(requested===undefined?{oneTimePin:pin}:{})});
 }catch(e){next(e);}
});
export default router;
