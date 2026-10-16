import { Router, type Request } from "express";
import { randomInt, createHmac } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";

const router=Router();
function hashCode(code:string):string{
 const key=process.env.YEMOT_ENCRYPTION_KEY||"";
 if(key.length<36)throw new Error("Phone security not configured");
 return createHmac("sha256",key).update("gavhah-phone-link-v1:"+code).digest("hex");
}
function sameOrigin(req:Request):boolean{
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(req.get("sec-fetch-site")==="cross-site"||req.get("sec-fetch-site")==="same-site")return false;
 if(!origin||!host)return false;
 try{return new URL(origin).host===host&&new URL(origin).protocol==="https:"}catch{return false}
}
router.post("/phone/account-code",requireAuth,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.status(403).json({error:"Phone linking requires same-site sign-in"});return;}
  const user=await getCurrentSessionUser(req);
  if(!user){res.status(401).json({error:"Please sign in again"});return;}
  // Prevent unlimited issued tokens for a signed-in session.
  const existing=await pool.query("SELECT COUNT(*)::int AS n FROM public.gavhah_phone_pair_codes WHERE user_id=$1 AND issued_at>now()-interval '15 minutes'",[user.id]);
  if(Number(existing.rows[0]?.n)>=3){res.status(429).json({error:"Please wait 15 minutes before requesting another phone code"});return;}
  const code=String(randomInt(0,100000000)).padStart(8,"0");
  const digest=hashCode(code);
  await pool.query("UPDATE public.gavhah_phone_pair_codes SET expires_at=now() WHERE user_id=$1 AND redeemed_at IS NULL",[user.id]);
  await pool.query("INSERT INTO public.gavhah_phone_pair_codes(code_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[digest,user.id]);
  res.set("Cache-Control","no-store").json({
    code,expiresInSeconds:300,
    instructions:"Call the Gavhah hotline, choose 1, 2, 5 and enter this eight-digit code. Never share it with anyone. Your phone session expires after 30 minutes."
  });
 }catch(err){next(err);}
});
export default router;
