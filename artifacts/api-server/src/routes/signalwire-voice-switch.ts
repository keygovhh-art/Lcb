import {Router} from "express";
import {createDecipheriv} from "node:crypto";
import {pool} from "@workspace/db";

const router=Router();
const E164="+16056558080";
const CALLBACK="https://gavhah-cloudflare-native.keygovhh.workers.dev/api/signalwire/shared-ivr";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Address={id:string;handler_type:string;resource_id:string|null;phone_number:string};
type R={id:string;display_name?:string;name?:string;type:string;cxml_webhook?:{name?:string;used_for?:string;primary_request_url?:string;primary_request_method?:string}};
const error=(s:number,m:string)=>Object.assign(new Error(m),{status:s});
function apiURL(space:string,part:string){return "https://"+space+"/api/fabric/"+part;}
async function credential(){
 const r=await pool.query<{
  space_hostname:string;project_id:string;token_nonce:string;token_tag:string;token_ciphertext:string;verified_at:Date|null
 }>("SELECT space_hostname,project_id,token_nonce,token_tag,token_ciphertext,verified_at FROM public.gavhah_signalwire_credentials WHERE id=1");
 const x=r.rows[0];if(!x?.verified_at||!uuid.test(x.project_id)||!/^[a-z0-9.-]+\.signalwire\.com$/.test(x.space_hostname))
  throw error(409,"Stored SignalWire project is not verified");
 const keyText=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(keyText,"base64");
 if(key.length!==32||key.toString("base64")!==keyText)throw error(503,"Provider encryption key unavailable");
 let token="";
 try{
  const d=createDecipheriv("aes-256-gcm",key,Buffer.from(x.token_nonce,"base64"));
  d.setAAD(Buffer.from("gavhah:signalwire:replacement:v1"));
  d.setAuthTag(Buffer.from(x.token_tag,"base64"));
  token=Buffer.concat([d.update(Buffer.from(x.token_ciphertext,"base64")),d.final()]).toString("utf8");
 }catch{throw error(503,"SignalWire token cannot be decrypted using the current encryption key");}
 return {space:x.space_hostname,auth:"Basic "+Buffer.from(x.project_id+":"+token,"utf8").toString("base64")};
}
async function sw(c:Awaited<ReturnType<typeof credential>>,part:string,method:"GET"|"PATCH"="GET",body?:object){
 const response=await fetch(apiURL(c.space,part),{
  method,headers:{Authorization:c.auth,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw error(response.status===401||response.status===403?403:502,
  method==="GET"?"SignalWire inventory unavailable; check Calling and Voice API token scopes":
  "SignalWire rejected voice-only reassignment; no SMS request was made");
 return await response.json() as any;
}
async function inventory(c:Awaited<ReturnType<typeof credential>>){
 const [addresses,resources]=await Promise.all([
  sw(c,"phone_number_addresses?page_size=1000"),
  sw(c,"resources/cxml_webhooks?page_size=1000")
 ]);
 if(!Array.isArray(addresses.data)||addresses.links?.next||!Array.isArray(resources.data)||resources.links?.next)
  throw error(409,"Provider returned incomplete inventory; refusing voice switch");
 const entries=addresses.data.filter((a:Address)=>a.phone_number===E164);
 const calling=entries.filter((a:Address)=>a.handler_type==="calling");
 const messaging=entries.filter((a:Address)=>a.handler_type==="messaging");
 if(calling.length!==1||messaging.length!==1||!uuid.test(calling[0].id)||!uuid.test(messaging[0].id))
  throw error(409,"Calling/Messaging channel for this exact number not uniquely identified");
 const targets=(resources.data as R[]).filter(x=>x.type==="cxml_webhook"&&
  (x.display_name==="Olam Hachesed MAX"||x.cxml_webhook?.name==="Olam Hachesed MAX")&&
  x.cxml_webhook?.used_for==="calling"&&
  x.cxml_webhook?.primary_request_url===CALLBACK&&
  x.cxml_webhook?.primary_request_method==="POST"&&uuid.test(x.id));
 if(targets.length!==1)throw error(409,
  "Find exactly one Olam Hachesed MAX Calling cXML Webhook with the Cloudflare primary URL and POST");
 const target=targets[0];
 if(!calling[0].resource_id||!uuid.test(calling[0].resource_id))
  throw error(409,"Current calling handler missing; cannot preserve rollback destination");
 return {calling:calling[0] as Address,messaging:messaging[0] as Address,targetId:target.id};
}
async function preflight(){
 if(process.env.CF_WORKER_RUNTIME!=="1"||process.env.CF_PHONE_WEBHOOKS_ENABLED!=="true"||
   String(process.env.SIGNALWIRE_SIGNING_KEY||"").length<24)
   throw error(503,"Cloudflare MAX webhook is not ready to accept signed calls");
 const db=await pool.query<{cutover_enabled:boolean;original_voice_url:string|null;original_call_handler:string|null}>(
  "SELECT cutover_enabled,original_voice_url,original_call_handler FROM public.gavhah_signalwire_shared_route WHERE id=1"
 );
 const old=db.rows[0];if(!old?.original_voice_url?.startsWith("https://emes-newsroom.vercel.app/")||
   old.original_call_handler!=="laml_webhooks")
   throw error(409,"Previous Emes Newsroom voice route was not preserved");
 const c=await credential();
 const live=await inventory(c);
 const existing=await sw(c,"resources/"+live.calling.resource_id);
 const oldUrl=String(existing?.cxml_webhook?.primary_request_url||"");
 if(!oldUrl.startsWith("https://emes-newsroom.vercel.app/"))
  throw error(409,"Current live calling resource no longer matches saved old Emes Newsroom");
 return {...live,auth:c,alreadySwitched:live.calling.resource_id===live.targetId,markedCutover:old.cutover_enabled};
}
router.get("/voice-switch/preflight",async(_req,res,next)=>{
 try{
  const x=await preflight();res.set("Cache-Control","private,no-store").json({
   number:E164,voiceOnly:true,oldCallingResourceId:x.calling.resource_id,
   newCallingResourceId:x.targetId,callingAddressId:x.calling.id,
   messagingResourceId:x.messaging.resource_id,messagingAddressId:x.messaging.id,
   alreadySwitched:x.alreadySwitched,webhookPrepared:true,
   note:"Current old Emes Newsroom handler and SMS remain unmodified by this check. Live call has not been physically tested."
  });
 }catch(e){next(e);}
});
router.post("/voice-switch/apply",async(req,res,next)=>{
 try{
  if(req.body?.confirm!=="MOVE_6056558080_CALLING_ONLY"||
    typeof req.body?.expectedCallingResourceId!=="string"||
    !uuid.test(req.body.expectedCallingResourceId))
   throw error(400,"Explicit voice-only reassignment confirmation and expected current resource required");
  const x=await preflight();
  if(x.alreadySwitched||x.markedCutover)throw error(409,"Calling route already switched; refuse duplicate");
  if(x.calling.resource_id!==req.body.expectedCallingResourceId)
   throw error(409,"Calling route changed since preflight; refuse stale switch");
  // Snapshot the original calling+messaging assignment for reversibility BEFORE any provider write.
  const snapshot=JSON.stringify({callingAddressId:x.calling.id,oldCallingResourceId:x.calling.resource_id,
   newCallingResourceId:x.targetId,messagingAddressId:x.messaging.id,messagingResourceId:x.messaging.resource_id});
  const saved=await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route "+
   "SET original_route_details=coalesce(original_route_details,'{}'::jsonb)||jsonb_build_object('voice_only_cutover_snapshot',$1::jsonb),updated_at=now() "+
   "WHERE id=1 AND cutover_enabled=false RETURNING id",[snapshot]
  );
  if(!saved.rowCount)throw error(409,"Cutover state changed");
  const result=await sw(x.auth,"phone_number_addresses/"+x.calling.id,"PATCH",{resource_id:x.targetId});
  if(result.id!==x.calling.id||result.handler_type!=="calling"||
    result.phone_number!==E164||result.resource_id!==x.targetId)
   throw error(502,"Provider response did not prove correct Calling-only switch; check console before more actions");
  // The provider has already acknowledged the changed calling resource.
  // Mark the cutover BEFORE the secondary read-back so a temporary provider
  // GET failure never hides the safe rollback control in the admin dashboard.
  await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route SET cutover_enabled=true,updated_at=now() WHERE id=1");
  const confirmation=await inventory(x.auth);
  if(confirmation.calling.resource_id!==x.targetId||
    confirmation.messaging.resource_id!==x.messaging.resource_id)
   throw error(502,"Post-switch verification mismatch; use saved rollback control or inspect SignalWire");
  res.set("Cache-Control","private,no-store").json({
   switched:true,number:E164,callingResourceChanged:true,messagingUnchanged:true,
   previousCallingResourceId:x.calling.resource_id,newCallingResourceId:x.targetId,
   next:"Place a real inbound call. If the main MAX menu fails, restore the previous Calling resource in SignalWire."
  });
 }catch(e){next(e);}
});
router.post("/voice-switch/rollback",async(req,res,next)=>{
 try{
  if(req.body?.confirm!=="RESTORE_6056558080_CALLING_ONLY")
   throw error(400,"Explicit rollback confirmation required");
  const prior=await pool.query<{cutover_enabled:boolean;original_route_details:any}>(
   "SELECT cutover_enabled,original_route_details FROM public.gavhah_signalwire_shared_route WHERE id=1");
  if(!prior.rows[0]?.cutover_enabled)
   throw error(409,"Recorded cutover is not active; refusing to overwrite a live calling handler");
  const saved=prior.rows[0].original_route_details?.voice_only_cutover_snapshot;
  if(!saved||!uuid.test(saved.oldCallingResourceId)||!uuid.test(saved.newCallingResourceId)||
    !uuid.test(saved.callingAddressId)||!uuid.test(saved.messagingAddressId))
   throw error(409,"Original calling resource snapshot not available for safe rollback");
  const c=await credential();
  const current=await inventory(c);
  if(current.calling.id!==saved.callingAddressId||current.calling.resource_id!==saved.newCallingResourceId||
     current.messaging.id!==saved.messagingAddressId||
     current.messaging.resource_id!==saved.messagingResourceId)
   throw error(409,"Provider route changed; cannot safely rollback automatically");
  const response=await sw(c,"phone_number_addresses/"+current.calling.id,"PATCH",
   {resource_id:saved.oldCallingResourceId});
  if(response.id!==current.calling.id||response.handler_type!=="calling"||
     response.phone_number!==E164||response.resource_id!==saved.oldCallingResourceId)
   throw error(502,"Provider rollback response could not be verified");
  const verify=await sw(c,"phone_number_addresses?page_size=1000");
  const entries=(verify.data||[]).filter((x:Address)=>x.phone_number===E164);
  if(entries.find((x:Address)=>x.handler_type==="calling")?.resource_id!==saved.oldCallingResourceId||
     entries.find((x:Address)=>x.handler_type==="messaging")?.resource_id!==saved.messagingResourceId)
   throw error(502,"Provider rollback verification failed. Inspect SignalWire.");
  await pool.query("UPDATE public.gavhah_signalwire_shared_route SET cutover_enabled=false,updated_at=now() WHERE id=1");
  res.set("Cache-Control","private,no-store").json({
   restored:true,number:E164,messagingUnchanged:true,
   note:"Calling handler restored to the original resource. Neither SMS nor the resource definitions were edited."
  });
 }catch(e){next(e);}
});
router.use((err:any,_req:any,res:any,_next:any)=>{
 res.status(typeof err?.status==="number"&&err.status>=400&&err.status<600?err.status:502)
  .json({error:String(err?.message||"SignalWire voice migration unavailable")});
});
export default router;
