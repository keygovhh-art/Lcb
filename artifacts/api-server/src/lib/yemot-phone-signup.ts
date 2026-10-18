import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { hashPassword, verifyPassword } from "./crypto";

// Gavhah website member self-enrollment through keypad only.
// Account uses SAME public.users as the website and gets a separate
// M + 10-digit login identifier, never a trusted caller ID.
// Never log, echo, email or save the raw numeric password.
export type PhoneEnrollmentResult = {
  message: string;
  completed: boolean;
  userId?: number;
};
const digits=/^\d{12,16}$/;
function unacceptable(pin:string){
  if(!digits.test(pin))return true;
  if(new Set(pin).size<5)return true;
  if(/(\d)\1{5,}/.test(pin))return true;
  if("01234567890123456789".includes(pin)||"98765432109876543210".includes(pin))return true;
  if(/^(19|20)\d{10,14}$/.test(pin)&&new Set(pin).size<7)return true;
  return false;
}
async function signupRateGate(db:PoolClient,callHash:string):Promise<boolean>{
  // Serialize against repeated callers and many concurrent new calls.
  await db.query("SELECT pg_advisory_xact_lock(hashtext('gavhah:phone-signup:global'))");
  const r=await db.query<{one_hour:number;one_day:number;this_call:number}>(
    "SELECT COUNT(*) FILTER(WHERE created_at>now()-interval '1 hour')::int one_hour,"+
    " COUNT(*) FILTER(WHERE created_at>now()-interval '24 hours')::int one_day,"+
    " COUNT(*) FILTER(WHERE call_hash=$1)::int this_call"+
    " FROM public.gavhah_phone_signup_events WHERE created_at>now()-interval '24 hours'",
    [callHash]);
  return r.rows[0].one_hour<200 && r.rows[0].one_day<1500 && r.rows[0].this_call<1;
}
function spokenNumber(id:string){
  const spaced=id.split("").join(" ");
  return "M "+spaced+". I repeat. M "+spaced+".";
}
export async function pendingPhoneSignup(db:PoolClient,callHash:string){
 const r=await db.query(
  "SELECT 1 FROM public.gavhah_phone_signup_pending WHERE call_hash=$1 AND expires_at>now() AND attempts<3",
  [callHash]);
 return r.rowCount>0;
}
export async function cancelPhoneSignup(db:PoolClient,callHash:string){
 await db.query("DELETE FROM public.gavhah_phone_signup_pending WHERE call_hash=$1",[callHash]);
}
export async function enrollFromKeypad(db:PoolClient,callHash:string,entered:string):Promise<PhoneEnrollmentResult>{
 // Do not grant any account until a TWO-ENTRY confirmation of the PIN.
 const pending=(await db.query<{password_hash:string;attempts:number}>(
  "SELECT password_hash,attempts FROM public.gavhah_phone_signup_pending"+
  " WHERE call_hash=$1 AND expires_at>now() AND attempts<3 FOR UPDATE",[callHash])).rows[0];
 if(!pending){
  if(unacceptable(entered))
   return {completed:false,message:"Please choose a stronger twelve to sixteen digit password. Avoid repeated or consecutive digits. "};
  // A distinct hashed challenge expires in 6 minutes. Not a website login.
  const secretHash=await hashPassword(entered);
  await db.query(
   "INSERT INTO public.gavhah_phone_signup_pending(call_hash,password_hash,expires_at,attempts) VALUES($1,$2,now()+interval '6 minutes',0)"+
   " ON CONFLICT(call_hash) DO UPDATE SET password_hash=excluded.password_hash,expires_at=excluded.expires_at,attempts=0",
   [callHash,secretHash]);
  return {completed:false,message:"Now enter the SAME private password one more time and press pound to confirm. "};
 }
 if(!digits.test(entered)||!await verifyPassword(entered,pending.password_hash)){
  const next=pending.attempts+1;
  if(next>=3){
   await cancelPhoneSignup(db,callHash);
   return {completed:false,message:"Too many unsuccessful confirmations. Start again with a new password. "};
  }
  await db.query("UPDATE public.gavhah_phone_signup_pending SET attempts=$2 WHERE call_hash=$1",[callHash,next]);
  return {completed:false,message:"The passwords did not match. Please enter the original password again. "};
 }
 if(!await signupRateGate(db,callHash)){
  await cancelPhoneSignup(db,callHash);
  return {completed:false,message:"Phone registration is temporarily busy. Please try again later or register on the website. "};
 }
 let memberNo="";
 for(let i=0;i<6;i++){
  const candidate=String(randomInt(1000000000,10000000000));
  const exists=await db.query("SELECT 1 FROM public.gavhah_phone_member_logins WHERE member_no=$1",[candidate]);
  if(!exists.rowCount){memberNo=candidate;break;}
 }
 if(!memberNo)throw new Error("Cannot allocate new phone member number");
 const created=await db.query<{id:number}>(
  "INSERT INTO public.users(name,nickname,email,phone,password_hash,role,status,preferred_language)"+
  " VALUES($1,$2,NULL,NULL,$3,'member','active','en') RETURNING id",
  ["Gavhah Phone Member "+memberNo.slice(-4),"Member "+memberNo,pending.password_hash]);
 const userId=created.rows[0].id;
 await db.query("INSERT INTO public.gavhah_phone_member_logins(member_no,user_id) VALUES($1,$2)",[memberNo,userId]);
 await db.query("INSERT INTO public.gavhah_phone_signup_events(call_hash,user_id) VALUES($1,$2)",[callHash,userId]);
 await cancelPhoneSignup(db,callHash);
 return {
  completed:true,
  userId,
  message:"Your Gavhah website member account is created. Your website login ID is "+spokenNumber(memberNo)+
   " Write it down. On the website choose Login and enter your member ID beginning with M and the private password you selected. "+
   "You can edit your account name on the website. This is a Gavhah account. Campaign Center requires its own separate verified signup. "
 };
}
