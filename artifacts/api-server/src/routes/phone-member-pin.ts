import { Router, type Request } from "express";
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";
import { verifyPassword } from "../lib/crypto";

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
async function storePin(userId:number,pin:string,actorId:number){
 const salt=randomBytes(16).toString("hex");
 const verifier=await slowHash(pin,salt);
 await pool.query(
  "INSERT INTO public.gavhah_phone_member_pins(user_id,pin_index,pin_salt,pin_verifier,assigned_by,failed_attempts,locked_until,updated_at) "+
  "VALUES($1,$2,$3,$4,$5,0,NULL,now()) ON CONFLICT(user_id) DO UPDATE SET "+
  "pin_index=EXCLUDED.pin_index,pin_salt=EXCLUDED.pin_salt,pin_verifier=EXCLUDED.pin_verifier,"+
  "assigned_by=EXCLUDED.assigned_by,failed_attempts=0,locked_until=NULL,updated_at=now()",
  [userId,lookup(pin),salt,verifier,actorId]);
}
// Return only Gavhah's *own* account ID; no Campaign Center account IDs,
// Neon Auth subjects, JWTs, or cross-service identities may be persisted here.
export async function verifyGavhahPhonePin(pin:string):Promise<number|null>{
 if(!validPin(pin))return null;
 const digest=lookup(pin);
 const match=await pool.query<{
  user_id:number;pin_salt:string;pin_verifier:string;locked_until:Date|null;status:string;
 }>(
  "SELECT p.user_id,p.pin_salt,p.pin_verifier,p.locked_until,u.status "+
  "FROM public.gavhah_phone_member_pins p JOIN public.users u ON u.id=p.user_id "+
  "WHERE p.pin_index=$1",[digest]);
 const row=match.rows[0];
 if(!row||["suspended","banned"].includes(row.status)||
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
router.get("/account/phone-pin",requireAuth,async(req,res,next)=>{
 try{
  const user=await getCurrentSessionUser(req);
  if(!user){res.sendStatus(401);return;}
  const r=await pool.query("SELECT updated_at FROM public.gavhah_phone_member_pins WHERE user_id=$1",[user.id]);
  res.set("Cache-Control","no-store").json({configured:!!r.rowCount,lastChangedAt:r.rows[0]?.updated_at||null,owner:"gavhah",minimumDigits:12,maximumDigits:16});
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
  try{await storePin(id,pin,actor.id);}
  catch(e){
   if((e as {code?:string})?.code==="23505"){res.status(409).json({error:"PIN already assigned to an account"});return;}
   throw e;
  }
  // Show generated one time only, never log it or return it in status/list APIs.
  res.set("Cache-Control","no-store").json({updated:true,userId:id,generated:requested===undefined,...(requested===undefined?{oneTimePin:pin}:{})});
 }catch(e){next(e);}
});
export default router;
