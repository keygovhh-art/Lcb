import { Router, type Request } from "express";
import {createHash,timingSafeEqual} from "node:crypto";
import {hashPassword} from "../lib/crypto";
import {pool} from "@workspace/db";
import {createRateLimiter} from "../middlewares/rate-limit";

/**
 * Emergency owner recovery: only a 256-bit bearer token delivered to the
 * existing super_admin mailbox enables one single password change.
 * No unauthenticated token generation or privileged reset bypass endpoint.
 * Token hash and password-version binding persist in Neon, not the token.
 */
const router=Router();
const hex64=/^[a-f0-9]{64}$/i;
function sameOrigin(req:Request){
 const origin=req.get("origin");
 const host=req.get("x-forwarded-host")||req.get("host");
 if(req.get("sec-fetch-site")==="cross-site"||req.get("sec-fetch-site")==="same-site"||
   !origin||!host)return false;
 try{const u=new URL(origin);return u.protocol==="https:"&&u.host===host;}
 catch{return false;}
}
router.post("/auth/admin-reset/complete",async(req,res,next)=>{
 res.set("Cache-Control","no-store");
 try{
  if(!sameOrigin(req)){res.status(403).json({error:"Same-origin HTTPS required"});return;}
  const token=typeof req.body?.token==="string"?req.body.token.trim():"";
  const newPassword=typeof req.body?.newPassword==="string"?req.body.newPassword:"";
  if(!hex64.test(token)||newPassword.length<12||newPassword.length>256){
   res.status(400).json({error:"Invalid reset link or password; use at least 12 characters"});return;
  }
  const tokenHash=createHash("sha256").update(Buffer.from(token,"hex")).digest("hex");
  const client=await pool.connect();
  let saved=false;
  try{
   await client.query("BEGIN");
   const {rows}=await client.query<{
    user_id:number;token_hash:string;password_version:string;attempts:number;
    expires_at:Date;consumed_at:Date|null;current_hash:string;status:string;role:string
   }>("SELECT r.user_id,r.token_hash,r.password_version,r.attempts,r.expires_at,r.consumed_at,"+
     "u.password_hash AS current_hash,u.status,u.role "+
     "FROM public.gavhah_admin_password_resets r "+
     "JOIN public.users u ON u.id=r.user_id WHERE r.token_hash=$1 FOR UPDATE OF r,u",[tokenHash]);
   const item=rows[0];
   const version=item?createHash("sha256").update(item.current_hash).digest("hex"):"";
   const valid=!!item&&item.role==="super_admin"&&item.status==="active"&&
     item.consumed_at===null&&item.attempts<5&&item.expires_at.getTime()>Date.now()&&
     item.password_version.length===64&&
     timingSafeEqual(Buffer.from(version,"hex"),Buffer.from(item.password_version,"hex"));
   if(!valid){
    await client.query("COMMIT");
    res.status(400).json({error:"This link is invalid, expired or already used."});
    return;
   }
   // Hash before consuming; if hash fails, do not burn the link.
   const passwordHash=await hashPassword(newPassword);
   await client.query("UPDATE public.users SET password_hash=$1 WHERE id=$2 AND role='super_admin' AND status='active'",
    [passwordHash,item.user_id]);
   await client.query("UPDATE public.gavhah_admin_password_resets SET consumed_at=now(),attempts=attempts+1 WHERE user_id=$1",
    [item.user_id]);
   // Invalidate all server-side sessions for this owner, across devices.
   await client.query("DELETE FROM public.app_sessions WHERE sess->>'userId'=$1",[String(item.user_id)]);
   await client.query("COMMIT");
   saved=true;
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
  finally{client.release();}
  if(saved){res.status(200).json({ok:true,message:"Password changed. Please sign in again."});}
 }catch(e){next(e);}
});

/**
 * No-email owner recovery, authorized by an independently configured secret
 * on the actual Cloudflare Worker. The owner must manually install the exact
 * one-time proof into Worker Settings as secret_text; chat possession alone
 * cannot enable password reset. Proof expires in <=10 minutes.
 * This cannot be activated from the public site or by knowing an email.
 */
const ownerRecoveryLimiter=createRateLimiter({
 name:"cloudflare-owner-recovery",windowMs:10*60*1000,max:8,
 message:"Too many recovery attempts; try again later."
});
router.post("/auth/admin-reset/cloudflare",ownerRecoveryLimiter,async(req,res,next)=>{
 res.set("Cache-Control","private,no-store");
 try{
  if(!sameOrigin(req)||process.env.CF_WORKER_RUNTIME!=="1"){
   res.status(403).json({error:"Private Cloudflare owner recovery only"});return;
  }
  const sent=typeof req.body?.token==="string"?req.body.token.trim().toLowerCase():"";
  const newPassword=typeof req.body?.newPassword==="string"?req.body.newPassword:"";
  if(!hex64.test(sent)||newPassword.length<12||newPassword.length>256){
   res.status(400).json({error:"Invalid recovery proof or password length"});return;
  }
  // Secret is installed by the signed-in owner in Cloudflare Workers Settings.
  // Its form includes an absolute expiration, preventing permanent use.
  const proof=String(process.env.GAVHAH_OWNER_RESET_PROOF||"");
  const match=/^([0-9a-f]{64}):([0-9]{10,13})$/.exec(proof);
  if(!match){
   res.status(503).json({error:"Owner proof has not been installed in Cloudflare"});return;
  }
  const expiry=Number(match[2].length===10?Number(match[2])*1000:match[2]);
  const remaining=expiry-Date.now();
  if(!Number.isSafeInteger(expiry)||remaining<=0||remaining>10*60*1000){
   res.status(403).json({error:"Cloudflare recovery proof expired or outside 10-minute window"});return;
  }
  if(!timingSafeEqual(Buffer.from(sent,"hex"),Buffer.from(match[1],"hex"))){
   res.status(403).json({error:"Cloudflare owner verification failed"});return;
  }
  const tokenHash=createHash("sha256").update(Buffer.from(sent,"hex")).digest("hex");
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const owners=await client.query<{id:number;password_hash:string}>(
    "SELECT id,password_hash FROM public.users WHERE role='super_admin' AND status='active' FOR UPDATE"
   );
   if(owners.rows.length!==1)throw Error("Expected exactly one active super admin");
   const owner=owners.rows[0];
   const prior=await client.query<{token_hash:string;consumed_at:Date|null}>(
    "SELECT token_hash,consumed_at FROM public.gavhah_admin_password_resets WHERE user_id=$1 FOR UPDATE",
    [owner.id]
   );
   if(prior.rows[0]?.token_hash===tokenHash){
    // Prevent replay even if the Worker secret is mistakenly left configured.
    throw Object.assign(new Error("This owner recovery proof has already been used"),{httpCode:409});
   }
   // Bind the snapshot to the original password version, for the audit trail.
   const version=createHash("sha256").update(owner.password_hash).digest("hex");
   const pwHash=await hashPassword(newPassword);
   await client.query(
    "UPDATE public.users SET password_hash=$1 WHERE id=$2 AND role='super_admin' AND status='active'",
    [pwHash,owner.id]
   );
   await client.query(
    "INSERT INTO public.gavhah_admin_password_resets "+
    "(user_id,token_hash,password_version,expires_at,consumed_at,attempts,created_at) "+
    "VALUES($1,$2,$3,$4::timestamptz,now(),1,now()) "+
    "ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,"+
    "password_version=excluded.password_version,expires_at=excluded.expires_at,"+
    "consumed_at=excluded.consumed_at,attempts=1,created_at=now()",
    [owner.id,tokenHash,version,new Date(expiry).toISOString()]
   );
   await client.query("DELETE FROM public.app_sessions WHERE sess->>'userId'=$1",[String(owner.id)]);
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
  res.status(200).json({ok:true,message:"Owner password changed once; sign in again."});
 }catch(e){
  if((e as any)?.httpCode===409)res.status(409).json({error:"The one-time code was already used"});
  else next(e);
 }
});

export default router;
