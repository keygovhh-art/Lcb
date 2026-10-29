import {createDecipheriv,createHash} from "node:crypto";
import {pool} from "@workspace/db";
import {logger} from "./logger";
import {normalizedSignalWireNumber} from "./signalwire-number-safety";

// Phone number confirmed by the owner's SignalWire console screenshot.
// Do NOT confuse with previously reversed written digits 8080655605.
const NUMBER="6056558080";
const E164="+16056558080";
const AAD=Buffer.from("gavhah:signalwire:replacement:v1");
type CredentialRow={
 space_hostname:string;project_id:string;
 token_nonce:string;token_ciphertext:string;token_tag:string;verified_at:Date|null
};
type Route={
 source:"compatibility"|"native";
 id:string;
 voiceUrl:string|null;
 voiceMethod:"GET"|"POST";
 appId:string|null;
 fallback:string|null;
 fallbackMethod:"GET"|"POST";
 trunk:string|null;
 smsUrl:string|null;
 callHandler:string;
 details:Record<string,string|null>;
};
function secret(row:CredentialRow){
 const encoded=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(encoded,"base64");
 if(key.length!==32||key.toString("base64")!==encoded)throw Error("Missing server encryption key");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.token_nonce,"base64"));
 decipher.setAAD(AAD);
 decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
function safeHTTPS(raw:unknown):string|null{
 if(typeof raw!=="string"||!raw.trim())return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.href.length>1800)return null;
  if(u.hostname==="gavhah.onrender.com")return null;
  return u.href;
 }catch{return null;}
}
function method(raw:unknown):"GET"|"POST"{
 return String(raw||"POST").toUpperCase()==="GET"?"GET":"POST";
}
async function readJSON(url:string,auth:string){
 const r=await fetch(url,{method:"GET",headers:{Authorization:auth,Accept:"application/json"},
  redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(r.status>=300&&r.status<400||r.type==="opaqueredirect")throw Error("Provider read-only redirect rejected");
 if(!r.ok)throw Error("Provider read-only GET failed");
 return await r.json() as any;
}
function parseCompatibility(detail:any):Route{
 const id=String(detail.sid||"");
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id)||
    normalizedSignalWireNumber(detail.phone_number)!==NUMBER)
  throw Error("Compatibility phone number identity mismatch");
 return {
  source:"compatibility",id,
  voiceUrl:safeHTTPS(detail.voice_url),voiceMethod:method(detail.voice_method),
  appId:detail.voice_application_sid?String(detail.voice_application_sid):null,
  fallback:safeHTTPS(detail.voice_fallback_url),fallbackMethod:method(detail.voice_fallback_method),
  trunk:detail.trunk_sid?String(detail.trunk_sid):null,
  smsUrl:safeHTTPS(detail.sms_url),callHandler:detail.voice_application_sid?"laml_application":detail.voice_url?"laml_webhooks":"unknown",
  details:{
   voice_application_sid:detail.voice_application_sid?String(detail.voice_application_sid):null,
   trunk_sid:detail.trunk_sid?String(detail.trunk_sid):null,
   voice_fallback_url:safeHTTPS(detail.voice_fallback_url),
   voice_method:method(detail.voice_method)
  }
 };
}
function parseNative(detail:any):Route{
 const id=String(detail.id||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
    normalizedSignalWireNumber(detail.number)!==NUMBER)
  throw Error("Native SignalWire phone resource identity mismatch");
 const handler=String(detail.call_handler||"unknown").slice(0,60);
 const requestUrl=safeHTTPS(detail.call_request_url);
 return {
  source:"native",id,
  voiceUrl:handler==="laml_webhooks"?requestUrl:null,
  voiceMethod:method(detail.call_request_method),
  appId:detail.call_laml_application_id?String(detail.call_laml_application_id):null,
  fallback:safeHTTPS(detail.call_fallback_url),fallbackMethod:method(detail.call_fallback_method),
  trunk:null,
  smsUrl:safeHTTPS(detail.message_request_url),
  callHandler:handler,
  details:{
   call_handler:handler,
   calling_handler_resource_id:detail.calling_handler_resource_id?String(detail.calling_handler_resource_id):null,
   call_laml_application_id:detail.call_laml_application_id?String(detail.call_laml_application_id):null,
   call_relay_topic:detail.call_relay_topic?String(detail.call_relay_topic):null,
   call_relay_context:detail.call_relay_context?String(detail.call_relay_context):null,
   call_relay_application:detail.call_relay_application?String(detail.call_relay_application):null,
   call_relay_script_url:safeHTTPS(detail.call_relay_script_url),
   call_relay_connector_id:detail.call_relay_connector_id?String(detail.call_relay_connector_id):null,
   call_sip_endpoint_id:detail.call_sip_endpoint_id?String(detail.call_sip_endpoint_id):null,
   call_request_url:requestUrl,
   call_request_method:method(detail.call_request_method),
   call_fallback_url:safeHTTPS(detail.call_fallback_url),
   message_handler:detail.message_handler?String(detail.message_handler):null,
   message_request_url:safeHTTPS(detail.message_request_url)
  }
 };
}
async function findCompatibility(space:string,project:string,auth:string):Promise<Route|null>{
 const url="https://"+space+"/api/laml/2010-04-01/Accounts/"+project;
 const listing=await readJSON(url+"/IncomingPhoneNumbers?PageSize=1000",auth);
 if(!Array.isArray(listing.incoming_phone_numbers))throw Error("Bad Compatibility number inventory");
 const matches=listing.incoming_phone_numbers.filter((n:any)=>normalizedSignalWireNumber(n.phone_number)===NUMBER);
 if(matches.length>1||listing.next_page_uri)throw Error("Compatibility number inventory incomplete or ambiguous");
 if(matches.length===0)return null;
 const sid=String(matches[0].sid||"");
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(sid))throw Error("Compatibility phone ID invalid");
 const detail=await readJSON(url+"/IncomingPhoneNumbers/"+encodeURIComponent(sid),auth);
 return parseCompatibility(detail);
}
async function findNative(space:string,auth:string):Promise<Route|null>{
 // This is the SAME inventory API used by SignalWire's own Phone Numbers UI.
 // The Compatibility list can omit phone resources handled by Fabric.
 const base="https://"+space+"/api/relay/rest/phone_numbers";
 const listing=await readJSON(base+"?filter_number="+encodeURIComponent(E164)+"&page_size=100",auth);
 if(!Array.isArray(listing?.data))throw Error("Bad native phone number inventory");
 const matches=listing.data.filter((n:any)=>normalizedSignalWireNumber(n.number)===NUMBER);
 if(matches.length>1||listing.links?.next)throw Error("Native number search ambiguous or incomplete");
 if(matches.length===0)return null;
 const id=String(matches[0].id||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  throw Error("Native number ID invalid");
 const detail=await readJSON(base+"/"+encodeURIComponent(id),auth);
 return parseNative(detail);
}
async function store(route:Route){
 // A native Relay/Fabric/application handler may be opaque, even though the
 // provider confirms this number exists. Preserve its full selected route
 // description, and NEVER overwrite its provider configuration.
 const verified=!!route.voiceUrl&&route.callHandler==="laml_webhooks"&&!route.trunk&&!route.appId;
 const fingerprint=createHash("sha256").update(JSON.stringify(route)).digest("hex");
 await pool.query(
  "UPDATE public.gavhah_signalwire_shared_route SET "+
  "audit_state=$1,provider_number_sid=$2,original_voice_url=$3,original_voice_method=$4,"+
  "original_voice_application_sid=$5,original_voice_fallback_url=$6,"+
  "original_voice_fallback_method=$7,original_trunk_sid=$8,original_sms_url=$9,"+
  "route_fingerprint=$10,checked_at=now(),last_error=$11,updated_at=now(),"+
  "original_provider_api=$12,original_call_handler=$13,original_route_details=$14::jsonb "+
  "WHERE id=1 AND requested_number=$15 AND audit_state='inspecting' AND cutover_enabled=false",
  [verified?"verified_compatibility_voice_url":"unresolved",
   route.id,route.voiceUrl,route.voiceMethod,route.appId,route.fallback,route.fallbackMethod,
   route.trunk,route.smsUrl,fingerprint,
   verified?null:"Phone found using "+route.source+" API, but original route uses "+route.callHandler+
    ". Keep old route unchanged until 55555 can preserve this handler.",
   route.source,route.callHandler,JSON.stringify(route.details),NUMBER]);
 logger.info({phoneSuffix:"8080",foundSource:route.source,oldRouteSaved:true,needsManualReview:!verified},
   "Read-only SignalWire old-system route snapshot complete; provider unchanged");
}
/** One-shot account-scoped GET requests. Never rewrite the existing number. */
export async function inspectExisting8080RouteOnce(){
 if(process.env.NODE_ENV!=="production")return;
 const claim=await pool.query(
  "UPDATE public.gavhah_signalwire_shared_route SET audit_state='inspecting',last_error=NULL,updated_at=now() "+
  "WHERE id=1 AND requested_number=$1 AND old_extension='55555' AND audit_state='queued' AND cutover_enabled=false RETURNING id",
  [NUMBER]).catch(()=>({rowCount:0}));
 if(!claim.rowCount)return;
 try{
  const credentials=(await pool.query<CredentialRow>(
   "SELECT space_hostname,project_id,token_nonce,token_ciphertext,token_tag,verified_at "+
   "FROM public.gavhah_signalwire_credentials WHERE id=1")).rows[0];
  if(!credentials?.verified_at)throw Error("SignalWire account is not verified");
  const auth="Basic "+Buffer.from(credentials.project_id+":"+secret(credentials)).toString("base64");
  let route:Route|null=null;
  let nativeError:string|null=null;
  // First try native phone numbers (console screenshot), not the old LaML
  // Compatibility inventory which previously failed due reversed digits.
  try{route=await findNative(credentials.space_hostname,auth);}
  catch(e){nativeError=e instanceof Error?e.message:"Native GET failed";}
  if(!route){
   try{route=await findCompatibility(credentials.space_hostname,credentials.project_id,auth);}
   catch(e){
    if(nativeError)throw Error("Neither read-only number API returned a valid route");
    throw e;
   }
  }
  if(!route){
   await pool.query(
    "UPDATE public.gavhah_signalwire_shared_route SET audit_state='not_found',"+
    "last_error=$1,checked_at=now(),updated_at=now() "+
    "WHERE id=1 AND audit_state='inspecting' AND cutover_enabled=false",
    ["Number +16056558080 not found in available native and Compatibility reads"]);
   return;
  }
  await store(route);
 }catch(e){
  await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route SET audit_state='failed',last_error=$1,"+
   "checked_at=now(),updated_at=now() WHERE id=1 AND audit_state='inspecting' AND cutover_enabled=false",
   [String(e instanceof Error?e.message:"Provider GET failure").slice(0,190)]).catch(()=>{});
  logger.warn({phoneSuffix:"8080",providerRouteModified:false},
   "Read-only SignalWire route inspection could not be completed");
 }
}
