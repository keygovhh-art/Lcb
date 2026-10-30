/**
 * MAX IVR editor: independent, versioned, draft-only menu/button configuration.
 * Never provisions SignalWire, changes provider callbacks, or alters 55555.
 * Telephone edits and website edits write the SAME Neon tables.
 */
import {createHmac,randomInt} from "node:crypto";
import {pool} from "@workspace/db";

export const ADMIN_EXTENSION="8899";
export const MAX_EDITOR_ACTIONS=["submenu","read_message","builtin","repeat","back","hangup"] as const;
export type EditorAction=typeof MAX_EDITOR_ACTIONS[number];
export const BUILTINS=["my_tishl","donor_360","call_reports","projects","finance","followups","account"] as const;
export const VOICES=["original","deep","bright","radio","warm","soft"] as const;
const RESERVED=["55555","4444",ADMIN_EXTENSION];
export const pathAllowed=(p:string)=>p==="root"||
  (/^[1-9][0-9]{0,11}$/.test(p)&&!RESERVED.some(x=>p===x||p.startsWith(x)));
export const digitAllowed=(d:string)=>/^[1-9]$/.test(d);
export const cleanText=(value:unknown,max:number)=>{
 if(typeof value!=="string"||value.length>max||/[\u0000-\u001f\u007f]/.test(value.replace(/\r?\n/g,"")))return null;
 return value.trim();
};
export function normalizeAction(input:unknown){
 if(!input||typeof input!=="object")return null;
 const x=input as Record<string,unknown>;
 const action=x.action;
 if(typeof action!=="string"||!MAX_EDITOR_ACTIONS.includes(action as EditorAction))return null;
 const label=cleanText(x.label,130),message=cleanText(x.message,900);
 if(label===null||message===null)return null;
 const target=String(x.target||"");
 if(action==="submenu"&&(!pathAllowed(target)||target==="root"))return null;
 if(action==="builtin"&&!BUILTINS.includes(target as typeof BUILTINS[number]))return null;
 if(!["submenu","builtin"].includes(action)&&target)return null;
 return {action:action as EditorAction,label,message,target};
}
export async function ensureEditor(){
 await pool.query("CREATE TABLE IF NOT EXISTS public.gavhah_max_ivr_draft_nodes ("+
  "path text PRIMARY KEY,title text NOT NULL DEFAULT '',guide text NOT NULL DEFAULT '',"+
  "voice_preset text NOT NULL DEFAULT 'original',"+
  "timeout_seconds integer NOT NULL DEFAULT 8 CHECK(timeout_seconds BETWEEN 3 AND 30),"+
  "revision integer NOT NULL DEFAULT 1,updated_by integer,updated_at timestamptz NOT NULL DEFAULT now())");
 await pool.query("CREATE TABLE IF NOT EXISTS public.gavhah_max_ivr_draft_buttons ("+
  "path text NOT NULL,digit text NOT NULL,action text NOT NULL,label text NOT NULL DEFAULT '',"+
  "message text NOT NULL DEFAULT '',target text NOT NULL DEFAULT '',"+
  "updated_by integer,updated_at timestamptz NOT NULL DEFAULT now(),"+
  "PRIMARY KEY(path,digit))");
 await pool.query("CREATE TABLE IF NOT EXISTS public.gavhah_max_ivr_edit_codes ("+
  "code_hash text PRIMARY KEY,user_id integer NOT NULL,"+
  "issued_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,"+
  "used_at timestamptz)");
 await pool.query("CREATE TABLE IF NOT EXISTS public.gavhah_max_ivr_editor_calls ("+
  "call_hash text PRIMARY KEY,user_id integer,stage text NOT NULL DEFAULT 'login',"+
  "path text NOT NULL DEFAULT 'root',selected_digit text NOT NULL DEFAULT '',"+
  "failed_attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,"+
  "updated_at timestamptz NOT NULL DEFAULT now())");
}
export const securityHash=(kind:string,text:string)=>{
 const key=process.env.SIGNALWIRE_SIGNING_KEY||"";
 if(key.length<24)throw Error("SignalWire signing key unavailable");
 return createHmac("sha256",key).update("gavhah:max-ivr-editor:"+kind+":"+text).digest("hex");
};
export async function issuePhoneCode(userId:number){
 await ensureEditor();
 const code=String(randomInt(0,100000000)).padStart(8,"0"),hash=securityHash("login",code);
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const count=await client.query<{n:number}>(
   "SELECT count(*)::int AS n FROM public.gavhah_max_ivr_edit_codes WHERE user_id=$1 AND issued_at>now()-interval '15 minutes'",[userId]);
  if((count.rows[0]?.n||0)>=3){await client.query("ROLLBACK");return {rateLimited:true as const};}
  await client.query("UPDATE public.gavhah_max_ivr_edit_codes SET expires_at=now() "+
   "WHERE user_id=$1 AND used_at IS NULL",[userId]);
  await client.query("INSERT INTO public.gavhah_max_ivr_edit_codes(code_hash,user_id,expires_at) "+
   "VALUES($1,$2,now()+interval '5 minutes')",[hash,userId]);
  await client.query("COMMIT");
  return {code,expiresInSeconds:300};
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();}
}
export async function readDraft(path:string){
 await ensureEditor();
 const [node,buttons]=await Promise.all([
  pool.query("SELECT path,title,guide,voice_preset,timeout_seconds,revision,updated_at FROM public.gavhah_max_ivr_draft_nodes WHERE path=$1",[path]),
  pool.query("SELECT digit,action,label,message,target,updated_at FROM public.gavhah_max_ivr_draft_buttons WHERE path=$1 ORDER BY digit",[path])
 ]);
 return {node:node.rows[0]||null,buttons:buttons.rows,live:false};
}
export async function listDraft(){
 await ensureEditor();
 const [nodes,buttons]=await Promise.all([
  pool.query("SELECT path,title,guide,voice_preset,timeout_seconds,revision,updated_at FROM public.gavhah_max_ivr_draft_nodes ORDER BY length(path),path"),
  pool.query("SELECT path,digit,action,label,message,target FROM public.gavhah_max_ivr_draft_buttons ORDER BY path,digit")
 ]);
 return {nodes:nodes.rows,buttons:buttons.rows,live:false};
}
export async function saveNode(path:string,input:Record<string,unknown>,adminId:number){
 if(!pathAllowed(path))return {error:"Reserved or invalid extension"};
 const title=cleanText(input.title,130),guide=cleanText(input.guide,1200);
 const voice=String(input.voicePreset||"original"),timeout=Number(input.timeoutSeconds??8);
 if(title===null||guide===null||!VOICES.includes(voice as typeof VOICES[number])||
  !Number.isInteger(timeout)||timeout<3||timeout>30)return {error:"Invalid node settings"};
 await ensureEditor();
 const r=await pool.query(
  "INSERT INTO public.gavhah_max_ivr_draft_nodes"+
  "(path,title,guide,voice_preset,timeout_seconds,updated_by) VALUES($1,$2,$3,$4,$5,$6) "+
  "ON CONFLICT(path) DO UPDATE SET title=EXCLUDED.title,guide=EXCLUDED.guide,"+
  "voice_preset=EXCLUDED.voice_preset,timeout_seconds=EXCLUDED.timeout_seconds,"+
  "updated_by=EXCLUDED.updated_by,revision=gavhah_max_ivr_draft_nodes.revision+1,updated_at=now() "+
  "RETURNING path,revision,updated_at",[path,title,guide,voice,timeout,adminId]
 );
 return {ok:true,draft:true,live:false,node:r.rows[0]};
}
export async function saveButton(path:string,digit:string,input:unknown,adminId:number){
 if(!pathAllowed(path)||!digitAllowed(digit))return {error:"Reserved extension or button"};
 const cfg=normalizeAction(input);
 if(!cfg)return {error:"Invalid or unsafe button action"};
 // A submenu is always beneath its parent. This prevents cross-system routing.
 if(cfg.action==="submenu"&&cfg.target!==((path==="root"?"":path)+digit))
  return {error:"Submenu must match the selected button's child extension"};
 await ensureEditor();
 const r=await pool.query(
  "INSERT INTO public.gavhah_max_ivr_draft_buttons"+
  "(path,digit,action,label,message,target,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) "+
  "ON CONFLICT(path,digit) DO UPDATE SET action=EXCLUDED.action,label=EXCLUDED.label,"+
  "message=EXCLUDED.message,target=EXCLUDED.target,updated_by=EXCLUDED.updated_by,updated_at=now() "+
  "RETURNING path,digit,updated_at",[path,digit,cfg.action,cfg.label,cfg.message,cfg.target,adminId]
 );
 return {ok:true,draft:true,live:false,button:r.rows[0]};
}
export async function removeDraftButton(path:string,digit:string){
 if(!pathAllowed(path)||!digitAllowed(digit))return false;
 await ensureEditor();
 await pool.query("DELETE FROM public.gavhah_max_ivr_draft_buttons WHERE path=$1 AND digit=$2",[path,digit]);
 return true; // ONLY the unpublished draft table is affected, never an existing phone route.
}
