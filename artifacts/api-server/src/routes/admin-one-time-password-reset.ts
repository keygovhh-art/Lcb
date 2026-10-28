import { Router, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { hashPassword } from "./auth";

/**
 * Restores the existing LIVE Cloudflare-only password-reset completion path
 * in source-controlled builds. This route does not issue reset links.
 *
 * The existing recovery link must be created after separate verified email
 * ownership proof; never accept caller ID, email alone or a chat link as proof.
 * Tokens are 32 random bytes encoded as exactly 64 hexadecimal characters.
 * In Neon ONLY the SHA-256 of the original token is stored.
 */
const router = Router();
const hex64 = /^[a-f0-9]{64}$/i;

function sameOrigin(req: Request) {
 const origin = req.get("origin");
 const host = req.get("x-forwarded-host") || req.get("host");
 if (req.get("sec-fetch-site") === "cross-site" ||
     req.get("sec-fetch-site") === "same-site" || !origin || !host)
  return false;
 try {
  const u = new URL(origin);
  return u.protocol === "https:" && u.host === host;
 } catch {
  return false;
 }
}

// No GET handler: the raw reset token is never written into a response,
// logs, external redirects or a third-party recovery URL.
router.post("/auth/admin-reset/complete", async (req:Request,res:Response,next) => {
 res.set("Cache-Control", "no-store");
 res.set("Referrer-Policy","no-referrer");
 try {
  if (!sameOrigin(req)) {
   res.status(403).json({error:"Same-origin HTTPS required"});return;
  }
  const token=typeof req.body?.token==="string"?req.body.token.trim():"";
  const newPassword=typeof req.body?.newPassword==="string"?req.body.newPassword:"";
  if (!hex64.test(token) || newPassword.length<12 || newPassword.length>256) {
   res.status(400).json({error:"Invalid reset link or password; use at least 12 characters"});
   return;
  }
  const tokenHash=createHash("sha256").update(Buffer.from(token,"hex")).digest("hex");
  const client=await pool.connect();
  let saved=false;
  try {
   await client.query("BEGIN");
   const {rows}=await client.query<{
    user_id:number;token_hash:string;password_version:string;attempts:number;
    expires_at:Date;consumed_at:Date|null;current_hash:string;status:string;role:string
   }>(
    "SELECT r.user_id,r.token_hash,r.password_version,r.attempts,r.expires_at,r.consumed_at,"+
    "u.password_hash AS current_hash,u.status,u.role "+
    "FROM public.gavhah_admin_password_resets r JOIN public.users u ON u.id=r.user_id "+
    "WHERE r.token_hash=$1 FOR UPDATE OF r,u",[tokenHash]);
   const item=rows[0];
   const currentVersion=item?createHash("sha256").update(item.current_hash).digest("hex"):"";
   const valid=!!item && item.role==="super_admin" && item.status==="active" &&
     item.consumed_at===null && item.attempts<5 &&
     item.expires_at.getTime()>Date.now() &&
     item.password_version.length===64 &&
     timingSafeEqual(Buffer.from(currentVersion,"hex"),Buffer.from(item.password_version,"hex"));
   if(!valid) {
    await client.query("COMMIT");
    res.status(400).json({error:"This link is invalid, expired or already used."});
    return;
   }
   const passwordHash=await hashPassword(newPassword);
   await client.query(
    "UPDATE public.users SET password_hash=$1 "+
    "WHERE id=$2 AND role='super_admin' AND status='active'",
    [passwordHash,item.user_id]);
   await client.query(
    "UPDATE public.gavhah_admin_password_resets "+
    "SET consumed_at=now(),attempts=attempts+1 WHERE user_id=$1",
    [item.user_id]);
   // Remove signed-in admin sessions immediately. Linked-account session
   // switching also checks password versions before future account access.
   await client.query(
    "DELETE FROM public.app_sessions WHERE sess->>'userId'=$1",
    [String(item.user_id)]);
   await client.query("COMMIT");
   saved=true;
  } catch(e) {
   await client.query("ROLLBACK").catch(()=>{});
   throw e;
  } finally {
   client.release();
  }
  if(saved)res.status(200).json({ok:true,message:"Password changed. Please sign in again."});
 }catch(e){next(e);}
});
export default router;
