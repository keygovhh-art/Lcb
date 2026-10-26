import {Router,type Request,type Response} from "express";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {pool} from "@workspace/db";
import {getCurrentSessionUser} from "../middlewares/auth";

/**
 * The router is mounted AFTER existing super-admin + same-origin middleware
 * in /api/admin/hotline-migration. Never expose sealed tokens or decrypt them
 * for the browser. No provider writes, number purchases, SMS or outgoing calls.
 */
const router=Router();
const rowTable="public.gavhah_signalwire_credentials";
const AAD=Buffer.from("gavhah:signalwire:replacement:v1");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const spaceName=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function key(){
 // Existing encryption key remains server-only. Distinct AES-GCM AAD prevents
 // accidental cross-decryption with legacy Yemot account credentials.
 const text=process.env.YEMOT_ENCRYPTION_KEY||"";
 const buffer=Buffer.from(text,"base64");
 if(buffer.length!==32||buffer.toString("base64")!==text)throw Error("Server encryption key not configured");
 return buffer;
}
export function normalizeSignalWireSpace(value:string):string|null{
 let valueText=value.trim().toLowerCase().replace(/^https:\/\//,"").replace(/\/$/,"");
 if(valueText.endsWith(".signalwire.com"))valueText=valueText.slice(0,-".signalwire.com".length);
 return spaceName.test(valueText)?valueText+".signalwire.com":null;
}
function encrypt(token:string){
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key(),iv);
 cipher.setAAD(AAD);
 const body=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return {nonce:iv.toString("base64"),ciphertext:body.toString("base64"),tag:cipher.getAuthTag().toString("base64")};
}
type Credential={space_hostname:string;project_id:string;token_nonce:string;token_ciphertext:string;token_tag:string;verified_at:Date|null;last_test_at:Date|null;updated_at:Date|null};
function decrypt(row:Credential){
 const dec=createDecipheriv("aes-256-gcm",key(),Buffer.from(row.token_nonce,"base64"));
 dec.setAAD(AAD);
 dec.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([dec.update(Buffer.from(row.token_ciphertext,"base64")),dec.final()]).toString("utf8");
}
const fail=(res:Response,status:number,message:string)=>res.status(status).json({error:message});
async function current(){
 const result=await pool.query<Credential>(
  "SELECT space_hostname,project_id,token_nonce,token_ciphertext,token_tag,verified_at,last_test_at,updated_at "+
  "FROM "+rowTable+" WHERE id=1"
 );
 return result.rows[0]||null;
}
function status(row:Credential|null){
 return {configured:!!row,spaceUrl:row?.space_hostname||null,
  projectId:row?.project_id||null,verified:!!row?.verified_at,
  lastVerifiedAt:row?.verified_at||null,lastTestAt:row?.last_test_at||null,
  updatedAt:row?.updated_at||null,secret:"NEVER_RETURNED",
  encryptionReady:(()=>{try{key();return true;}catch{return false;}})(),
  provider:"signalwire",cutoverEnabled:false,oldYemotUntouched:true};
}
router.get("/status",async(_req,res,next)=>{
 try{res.set("Cache-Control","private,no-store").json(status(await current()));}
 catch(e){next(e);}
});
router.put("/connection",async(req,res,next)=>{
 try{
  const space=typeof req.body?.spaceUrl==="string"?normalizeSignalWireSpace(req.body.spaceUrl):null;
  const project=typeof req.body?.projectId==="string"?req.body.projectId.trim():"";
  const token=typeof req.body?.apiToken==="string"?req.body.apiToken:"";
  if(!space||!uuid.test(project)||token.length<12||token.length>1024||!/^[\x21-\x7e]+$/.test(token)){
   fail(res,400,"Provide a valid SignalWire Space URL, Project ID (UUID) and API Token");return;
  }
  let sealed:{nonce:string;ciphertext:string;tag:string};
  try{sealed=encrypt(token);}catch{
   fail(res,503,"Encryption key not configured on the server");return;
  }
  const actor=(await getCurrentSessionUser(req))!.id;
  await pool.query("INSERT INTO "+rowTable+
   "(id,space_hostname,project_id,token_nonce,token_ciphertext,token_tag,updated_by,verified_at,last_test_at) "+
   "VALUES(1,$1,$2,$3,$4,$5,$6,NULL,NULL) ON CONFLICT(id) DO UPDATE SET "+
   "space_hostname=EXCLUDED.space_hostname,project_id=EXCLUDED.project_id,"+
   "token_nonce=EXCLUDED.token_nonce,token_ciphertext=EXCLUDED.token_ciphertext,token_tag=EXCLUDED.token_tag,"+
   "updated_by=EXCLUDED.updated_by,verified_at=NULL,last_test_at=NULL,updated_at=now()",
   [space,project,sealed.nonce,sealed.ciphertext,sealed.tag,actor]);
  res.set("Cache-Control","private,no-store").json({
   ...status(await current()),
   message:"SignalWire token saved encrypted. Run read-only connection test next. Existing Yemot hotline unchanged."
  });
 }catch(e){next(e);}
});
router.post("/test",async(_req,res,next)=>{
 try{
  const row=await current();
  if(!row){fail(res,409,"Save SignalWire credentials first");return;}
  const throttle=await pool.query(
   "UPDATE "+rowTable+" SET last_test_at=now() WHERE id=1 "+
   "AND (last_test_at IS NULL OR last_test_at<now()-interval '20 seconds') RETURNING id"
  );
  if(!throttle.rowCount){fail(res,429,"Wait 20 seconds before another test");return;}
  let token="";
  try{token=decrypt(row);}catch{
   fail(res,503,"Encrypted SignalWire credentials unavailable");return;
  }
  let ok=false,ownedNumbers=0;
  try{
   // Official read-only Compatibility API: /IncomingPhoneNumbers, token scope Numbers.
   // No phone is provisioned and no call is placed by this GET.
   const endpoint="https://"+row.space_hostname+"/api/laml/2010-04-01/Accounts/"+
    row.project_id+"/IncomingPhoneNumbers?PageSize=1";
   const auth="Basic "+Buffer.from(row.project_id+":"+token,"utf8").toString("base64");
   const response=await fetch(endpoint,{method:"GET",headers:{Authorization:auth,Accept:"application/json"},
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error("SignalWire token authentication or Numbers scope failed");
   const data:any=await response.json();
   if(!Array.isArray(data?.incoming_phone_numbers))throw Error("SignalWire returned unexpected response");
   ok=true;ownedNumbers=data.incoming_phone_numbers.length;
  }catch{
   await pool.query("UPDATE "+rowTable+" SET verified_at=NULL WHERE id=1 AND token_ciphertext=$1",[row.token_ciphertext]);
   fail(res,502,"SignalWire API test failed. Check Space, Project ID, token and Numbers permission.");return;
  }finally{token="";}
  if(ok){
   await pool.query("UPDATE "+rowTable+" SET verified_at=now() WHERE id=1 AND token_ciphertext=$1",[row.token_ciphertext]);
   res.set("Cache-Control","private,no-store").json({
    ...status(await current()),connected:true,readOnly:true,returnedPhoneEntries:ownedNumbers,
    note:"Token authenticated for read-only Numbers API. Phone webhook signing and actual IVR call still require separate checks."
   });
  }
 }catch(e){next(e);}
});
router.delete("/connection",async(req,res,next)=>{
 try{
  if(req.body?.confirm!=="REMOVE_SIGNALWIRE_TOKEN_ONLY"){
   fail(res,400,"Explicit confirmation required");return;
  }
  await pool.query("DELETE FROM "+rowTable+" WHERE id=1");
  res.set("Cache-Control","private,no-store").json({
   configured:false,oldYemotUntouched:true,cutoverEnabled:false
  });
 }catch(e){next(e);}
});
export default router;
