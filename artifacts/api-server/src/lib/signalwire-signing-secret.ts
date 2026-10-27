import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {pool} from "@workspace/db";
const AAD=Buffer.from("gavhah:signalwire:webhook-signing-key:v1");
const table="public.gavhah_signalwire_signing_keys";
function key(){
 const value=String(process.env.YEMOT_ENCRYPTION_KEY||"");
 const decoded=Buffer.from(value,"base64");
 if(decoded.length!==32||decoded.toString("base64")!==value)
  throw Error("Server encryption key missing");
 return decoded;
}
type Stored={project_id:string;key_nonce:string;key_ciphertext:string;key_tag:string};
export function encryptionForSignalWireSigningReady(){
 try{key();return true;}catch{return false;}
}
export async function signalWireSigningKeyStatus(){
 const env=String(process.env.SIGNALWIRE_SIGNING_KEY||"");
 if(env.length>=24)return {configured:true,source:"server_environment" as const};
 const r=await pool.query<{project_id:string}>(
  "SELECT k.project_id FROM "+table+" k "+
  "JOIN public.gavhah_signalwire_credentials c ON c.id=1 AND c.project_id=k.project_id "+
  "WHERE k.id=1 AND c.verified_at IS NOT NULL");
 return {configured:r.rowCount>0,source:r.rowCount?"encrypted_dashboard" as const:"missing" as const};
}
export async function getSignalWireSigningKey(){
 const env=String(process.env.SIGNALWIRE_SIGNING_KEY||"");
 if(env.length>=24)return env;
 const r=await pool.query<Stored>(
  "SELECT k.project_id,k.key_nonce,k.key_ciphertext,k.key_tag FROM "+table+" k "+
  "JOIN public.gavhah_signalwire_credentials c ON c.id=1 AND c.project_id=k.project_id "+
  "WHERE k.id=1 AND c.verified_at IS NOT NULL");
 const row=r.rows[0];
 if(!row)return "";
 try{
  const decrypt=createDecipheriv("aes-256-gcm",key(),Buffer.from(row.key_nonce,"base64"));
  decrypt.setAAD(AAD);
  decrypt.setAuthTag(Buffer.from(row.key_tag,"base64"));
  return Buffer.concat([
   decrypt.update(Buffer.from(row.key_ciphertext,"base64")),decrypt.final()
  ]).toString("utf8");
 }catch{return "";}
}
export async function storeSignalWireSigningKey(projectId:string,signingKey:string,actorId:number){
 const nonce=randomBytes(12);
 const encrypt=createCipheriv("aes-256-gcm",key(),nonce);
 encrypt.setAAD(AAD);
 const ciphertext=Buffer.concat([encrypt.update(signingKey,"utf8"),encrypt.final()]);
 const tag=encrypt.getAuthTag();
 await pool.query(
  "INSERT INTO "+table+"(id,project_id,key_nonce,key_ciphertext,key_tag,updated_by) "+
  "VALUES(1,$1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET "+
  "project_id=EXCLUDED.project_id,key_nonce=EXCLUDED.key_nonce,"+
  "key_ciphertext=EXCLUDED.key_ciphertext,key_tag=EXCLUDED.key_tag,"+
  "updated_by=EXCLUDED.updated_by,updated_at=now()",
  [projectId,nonce.toString("base64"),ciphertext.toString("base64"),tag.toString("base64"),actorId]
 );
}
export async function clearSignalWireSigningKey(){
 await pool.query("DELETE FROM "+table+" WHERE id=1");
}
