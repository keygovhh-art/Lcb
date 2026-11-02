import {Router, type Request, type Response, type NextFunction} from "express";
import type {PoolClient} from "pg";
import {pool} from "@workspace/db";
import {requireAuth,getCurrentSessionUser} from "../middlewares/auth";
import {gavhahHotlineSpeechLibraryHtml} from "./gavhah-hotline-speech-library-ui";

const router=Router();
type HotlineProvider="yemot"|"signalwire";
const table="public.gavhah_hotline_spoken_phrases";
function wrap(fn:(req:Request,res:Response)=>Promise<void>){return(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next)}}
function sameOrigin(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin||!host||req.get("sec-fetch-site")==="cross-site"||req.get("sec-fetch-site")==="same-site")return false;
 try{const u=new URL(origin);return u.protocol==="https:"&&u.host===host}catch{return false}
}
async function superadmin(req:Request,res:Response,next:NextFunction){
 try{const account=await getCurrentSessionUser(req);
  if(account?.role!=="super_admin"){res.status(403).json({error:"Superadmin access required"});return}
  if(req.method!=="GET"&&!sameOrigin(req)){res.status(403).json({error:"Same origin required"});return}
  res.set("Cache-Control","private,no-store");next();
 }catch(e){next(e)}
}
router.get("/admin/hotline/speech-library",requireAuth,superadmin,wrap(async(req,res)=>{
 if(String(req.query.data||"")==="1"){
  const q=await pool.query("SELECT id,provider,source_text,replacement_text,category,active,updated_at FROM "+table+" ORDER BY provider,category,id LIMIT 2000");
  res.json({messages:q.rows,count:q.rows.length});return;
 }
 res.type("text/html; charset=utf-8").send(gavhahHotlineSpeechLibraryHtml);
}));
router.put("/admin/hotline/speech-library/:id",requireAuth,superadmin,wrap(async(req,res)=>{
 const id=Number(req.params.id),active=req.body?.active===true;
 const text=typeof req.body?.replacementText==="string"?req.body.replacementText.trim():null;
 if(!Number.isSafeInteger(id)||id<1||req.body?.confirm!=="UPDATE_GAVHAH_SPEECH"||active&&(!text||text.length>950||/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text))){res.status(400).json({error:"Invalid speech edit"});return}
 const row=await pool.query("UPDATE "+table+" SET replacement_text=$2,active=$3,updated_at=now() WHERE id=$1 RETURNING id,provider,source_text,replacement_text,category,active,updated_at",[id,active?text:null,active]);
 if(!row.rowCount){res.status(404).json({error:"Message not found"});return}
 res.json({ok:true,message:row.rows[0]});
}));
export async function applyFixedPhonePhraseEdits(client:Pick<PoolClient,"query">,provider:HotlineProvider,text:string):Promise<string>{
 if(!text||text.length<10||text.length>15000)return text;
 const q=await client.query<{source_text:string;replacement_text:string}>(
  "SELECT source_text,replacement_text FROM "+table+" WHERE provider=$1 AND active=true AND replacement_text IS NOT NULL AND $2 LIKE '%' || source_text || '%' ORDER BY length(source_text) DESC LIMIT 100",[provider,text]);
 let result=text;
 for(const item of q.rows)if(item.source_text.length>=22&&result.includes(item.source_text))result=result.split(item.source_text).join(item.replacement_text);
 return result;
}
export default router;
