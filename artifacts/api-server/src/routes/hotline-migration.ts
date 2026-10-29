import { Router, type Request, type Response } from "express";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";
import signalwireCredentialsRouter,{readSignalWireInventory} from "./signalwire-credentials";
import signalwireVoiceSwitchRouter from "./signalwire-voice-switch";
import {normalizedSignalWireNumber,isProtectedSignalWireNumber} from "../lib/signalwire-number-safety";

const router=Router();
const CALLBACK="https://gavhah.onrender.com/api/yemot/next-ivr";
const SIGNALWIRE_CALLBACK="https://gavhah.onrender.com/api/signalwire/next-ivr";
const signalwireSigningKey=()=>String(process.env.SIGNALWIRE_SIGNING_KEY||"");
const digits=/^[0-9]{7,15}$/;
async function assertSafeSignalWireCandidate(candidateNumber:string){
 if(isProtectedSignalWireNumber(candidateNumber))
  throw new Error("This telephone number belongs to another system and is permanently reserved.");
 const listing=await readSignalWireInventory();
 const requested=normalizedSignalWireNumber(candidateNumber);
 const selected=listing.numbers.find(x=>normalizedSignalWireNumber(x.number)===requested);
 if(!selected)throw new Error(listing.hasMore
  ?"The provider list contains more numbers; this candidate has not been checked safely."
  :"This number is not owned by the connected SignalWire project.");
 if(!selected.canConsider)
  throw new Error("This SignalWire number is already routed, voice is unavailable, or it belongs to another system. No changes permitted.");
 return true;
}
const err=(res:Response,status:number,message:string)=>res.status(status).json({error:message});
function sameOrigin(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(req.get("sec-fetch-site")==="cross-site"||req.get("sec-fetch-site")==="same-site")return false;
 if(!origin)return false; // mutating API calls require same-origin browser evidence
 try{
  const u=new URL(origin);
  return u.protocol==="https:"&&u.host===host;
 }catch{return false;}
}
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:(e?:unknown)=>void)=>{
 void fn(req,res).catch(next);
};
router.use(requireAuth);
router.use(async(req,res,next)=>{
 try{
  const user=await getCurrentSessionUser(req);
  if(!user||user.role!=="super_admin")return void err(res,403,"Super administrator only");
  if(!["GET","HEAD"].includes(req.method)&&!sameOrigin(req))
   return void err(res,403,"Same-origin request required");
  next();
 }catch(error){next(error);}
});
// Attached only AFTER administrator identity and same-origin checks.
router.use("/signalwire",signalwireCredentialsRouter);
// Same super-admin and same-origin guard as the existing credentials router.
router.use("/signalwire",signalwireVoiceSwitchRouter);
type Migration={
 provider_kind:"signalwire"|"yemot"|"other";provider_label:string;candidate_number:string;
 stage:"draft"|"testing";callback_hash:string|null;generation:string;
 tested_calls:number;last_test_at:string|null;test_started_at:string|null;
 updated_at:string;
};
async function state():Promise<Migration|null>{
 const result=await pool.query<Migration>(
 "SELECT provider_kind,provider_label,candidate_number,stage,callback_hash,generation,"+
 "tested_calls,last_test_at,test_started_at,updated_at FROM public.gavhah_hotline_migration WHERE id=1");
 return result.rows[0]||null;
}
const summary=(r:Migration|null)=>({
 configured:!!r,
 providerKind:r?.provider_kind||null,
 providerLabel:r?.provider_label||null,
 candidateNumber:r?.candidate_number||null,
 stage:r?.stage||"not_configured",
 endpoint:r?.provider_kind==="signalwire"?SIGNALWIRE_CALLBACK:r?.provider_kind==="yemot"?CALLBACK:null,
 signalwireSigningKeyReady:signalwireSigningKey().length>=24,
 testingEnabled:r?.stage==="testing"&&!!r.callback_hash,
 testedCalls:Number(r?.tested_calls||0),
 lastTestAt:r?.last_test_at||null,
 updatedAt:r?.updated_at||null,
 secret:"NEVER_RETURNED",
 productionLineUntouched:true,
 cutoverEnabled:false,
 stillToCheck:[
 "איבערקוקן דעם נייעם נומער און די רעכטן ביים פראוויידער",
 "פארבינדן בלויז דעם נייעם IVR־וועג — נישט טוישן דעם אלטן האטליין",
 "אויסהערן דעם נייעם מעניו מיט א אמת'ן רוף; פראבירן קנעפלעך 1 ביז 9",
 "פראבירן איינלאגיר־קאוד, נייעס, MAX און נישט־רופן־צייכן",
 "איבערקוקן און באזונדער אריבערפירן פראוויידער־ריקארדירונגען אויב נויטיג",
 "באזונדער באשטעטיגן קאנפרענצן, ארויסרופן און Caller ID",
 "אויסקלארן צי /0־פארוואלטונג איז דא ביים נייעם פראוויידער",
 "שפעטער באשטעטיגן א באזונדערע לייוו־איבערשאלטונג און אנווייזן פאר אלטע רופער"
 ],
 whatRemainsOnGavhah:[
 "מעמבערס און אריינלאגירן","MAX־קאנטאקטן און נדבנים","אויפגאבן און נאכפאלגן",
 "נייעס און אפדעיטס","וועבסייט און פריוואטקייט־רעכטן","טעלעפאן־רופן־היסטאריע אין Neon",
 "סיסטעם־פונקציעס און הויפט־מעניו־קאוד"
 ],
 note:"This dashboard prepares and tests a replacement; it does not activate the new line or migrate provider-hosted recordings."
});
router.get("/status",wrap(async(_req,res)=>{
 res.set("Cache-Control","private,no-store");
 res.json(summary(await state()));
}));
router.post("/draft",wrap(async(req,res)=>{
 const providerKind=req.body?.providerKind;
 const providerLabel=typeof req.body?.providerLabel==="string"?req.body.providerLabel.trim().slice(0,60):"";
 const candidateNumber=typeof req.body?.candidateNumber==="string"?req.body.candidateNumber.replace(/[^\d]/g,""):"";
 if(!["signalwire","yemot","other"].includes(providerKind)||!providerLabel||
    (candidateNumber&&!digits.test(candidateNumber))){
  err(res,400,"Choose a provider and optionally a new valid telephone number");return;
 }
 const currentLine=(await pool.query(
  "SELECT line_number FROM public.gavhah_yemot_global WHERE id=1")).rows[0]?.line_number;
 if(candidateNumber&&currentLine===candidateNumber){
  err(res,409,"The replacement must not overwrite the existing Gavhah number");return;
 }
 if(candidateNumber&&isProtectedSignalWireNumber(candidateNumber)){
  err(res,409,"The existing +16056558080 is reserved pending safe 55555 sharing; cannot be selected as a free number.");return;
 }
 if(providerKind==="signalwire"&&candidateNumber){
  try{await assertSafeSignalWireCandidate(candidateNumber);}
  catch(e){err(res,409,e instanceof Error?e.message:"Candidate phone number is not safe");return;}
 }
 const installed=await state();
 if(installed?.stage==="testing"&&req.body?.confirmReset!==true){
  err(res,409,"An isolated test is already configured. Confirm resetting that test before changing the candidate; the old live line is not affected.");return;
 }
 const actor=(await getCurrentSessionUser(req))!.id;
 const generation=randomBytes(16).toString("hex");
 await pool.query(
  "INSERT INTO public.gavhah_hotline_migration "+
  "(id,provider_kind,provider_label,candidate_number,stage,callback_hash,generation,tested_calls,updated_by) "+
  "VALUES(1,$1,$2,$3,'draft',NULL,$4,0,$5) "+
  "ON CONFLICT(id) DO UPDATE SET provider_kind=EXCLUDED.provider_kind,"+
  "provider_label=EXCLUDED.provider_label,candidate_number=EXCLUDED.candidate_number,"+
  "stage='draft',callback_hash=NULL,generation=EXCLUDED.generation,tested_calls=0,"+
  "test_started_at=NULL,last_test_at=NULL,updated_by=EXCLUDED.updated_by,updated_at=now()",
  [providerKind,providerLabel,candidateNumber,generation,actor]
 );
 res.set("Cache-Control","private,no-store").json({
  ...summary(await state()),message:"Replacement hotline draft saved. Existing number, tokens, root, recordings and members were not changed."
 });
}));
router.post("/prepare-test",wrap(async(req,res)=>{
 const existing=await state();
 if(!existing){err(res,409,"Choose and save the new provider first");return;}
 if(existing.provider_kind==="other"){
  err(res,409,"This provider needs its own webhook adapter before an incoming call test. No old settings have been changed.");return;
 }
 if(existing.provider_kind==="signalwire"&&signalwireSigningKey().length<24){
  err(res,503,"Set SIGNALWIRE_SIGNING_KEY in Gavhah Render Environment first. Never put the signing key in the website form.");return;
 }
 if(!digits.test(existing.candidate_number)){
  err(res,409,"Enter the new number before preparing a test callback");return;
 }
 if(existing.provider_kind==="signalwire"){
  try{await assertSafeSignalWireCandidate(existing.candidate_number);}
  catch(e){err(res,409,e instanceof Error?e.message:"Cannot use this SignalWire number");return;}
 }
 if(existing.stage==="testing"&&req.body?.confirmRotate!==true){
  err(res,409,"A test callback already exists. Explicitly confirm rotation to invalidate the previous TEST secret.");return;
 }
 const actor=(await getCurrentSessionUser(req))!.id;
 // Only the secret's digest persists. The operator gets the secret ONCE
 // to enter on the new line's settings; no provider API write occurs here.
 const generation=randomBytes(16).toString("hex");
 const entryKey=existing.provider_kind==="signalwire"
  ?createHmac("sha256",signalwireSigningKey()).update("gavhah-signalwire-next-ivr-v1:"+generation).digest("hex")
  :randomBytes(32).toString("hex");
 const digest=createHash("sha256").update(entryKey).digest("hex");
 const updated=await pool.query(
  "UPDATE public.gavhah_hotline_migration SET callback_hash=$1,generation=$2,"+
  "stage='testing',test_started_at=now(),tested_calls=0,last_test_at=NULL,"+
  "updated_by=$3,updated_at=now() WHERE id=1 AND provider_kind=$5 AND candidate_number=$4 RETURNING id",
  [digest,generation,actor,existing.candidate_number,existing.provider_kind]
 );
 if(!updated.rowCount){err(res,409,"Candidate changed. Refresh status.");return;}
 res.set("Cache-Control","private,no-store").json({
  ...summary(await state()),
  callbackUrl:existing.provider_kind==="signalwire"?SIGNALWIRE_CALLBACK:CALLBACK,
  ...(existing.provider_kind==="yemot"?{entryKey,providerParameter:"entryKey="+entryKey}:{}),
  newLineOnly:true,
  instruction:existing.provider_kind==="signalwire"
   ?"On the NEW SignalWire number only: use a cXML/LaML voice webhook with HTTP POST to callbackUrl. Set the SignalWire project Signing Key securely as SIGNALWIRE_SIGNING_KEY in Gavhah Render. Do NOT modify the existing Yemot line or its recordings."
   :"On the NEW Yemot number only: use type=api, api_link=callbackUrl, api_url_post=yes and api_add_0=providerParameter. Do not change the old Gavhah line or /0.",
  phoneTestingRequired:true,
  cutoverEnabled:false
 });
}));
export default router;
