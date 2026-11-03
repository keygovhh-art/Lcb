import {Router, type Request, type Response, type NextFunction} from "express";
import {createHmac,timingSafeEqual} from "node:crypto";
import {pool} from "@workspace/db";
import {getCurrentSessionUser} from "../middlewares/auth";

const router=Router();
const table="public.gavhah_olam_voice_recordings";
const root="https://gavhah-cloudflare-native.keygovhh.workers.dev";
const validPath=(p:string)=>p==="root"||/^[1-9][0-9]{0,11}$/.test(p);
const urlSign=(path:string,version:string)=>{
 const secret=process.env.SIGNALWIRE_SIGNING_KEY||"";
 if(secret.length<24)throw Error("SignalWire voice signing key unavailable");
 return createHmac("sha256",secret).update("gavhah-olam-public-menu-audio-v1:"+path+":"+version).digest("hex");
};
export async function olamMenuAudioUrl(path:string):Promise<string|null>{
 if(!validPath(path))return null;
 const data=await pool.query<{audio_version:string}>(
  "SELECT audio_version::text AS audio_version FROM "+table+" WHERE path=$1 AND is_active=true AND audio_data IS NOT NULL",[path]);
 const version=data.rows[0]?.audio_version;
 if(!version)return null;
 return root+"/api/signalwire/olam-voice/"+encodeURIComponent(path)+"/"+version+"?sig="+urlSign(path,version);
}
async function requireVoiceAdmin(req:Request,res:Response,next:NextFunction){
 try{
  const user=await getCurrentSessionUser(req);
  if(user?.role!=="super_admin"){res.status(403).json({error:"Superadmin required"});return;}
  if(req.method!=="GET"){
   const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
   let valid=false;
   if(origin&&host&&req.get("sec-fetch-site")!=="cross-site"&&req.get("sec-fetch-site")!=="same-site"){
    try{const url=new URL(origin);valid=url.protocol==="https:"&&url.host===host}catch{}
   }
   if(!valid){res.status(403).json({error:"Wrong origin"});return;}
  }
  res.setHeader("Cache-Control","private,no-store");next();
 }catch(e){next(e)}
}
function check(req:Request,res:Response):boolean{
 if(typeof req.params.path==="string"&&validPath(req.params.path))return true;
 res.status(404).json({error:"Invalid extension"});return false;
}
function wrap(f:(req:Request,res:Response)=>Promise<void>){
 return (req:Request,res:Response,next:NextFunction)=>{void f(req,res).catch(next)};
}
router.get("/admin/max/ivr-editor/voice-audio/:path",requireVoiceAdmin,wrap(async(req,res)=>{
 if(!check(req,res))return;
 const row=(await pool.query("SELECT octet_length(audio_data) AS size,is_active,updated_at FROM "+table+" WHERE path=$1",[req.params.path])).rows[0];
 res.json({hasAudio:!!row?.size,isActive:!!row?.is_active,size:row?.size||0,updatedAt:row?.updated_at||null});
}));
router.get("/admin/max/ivr-editor/voice-audio/:path/file",requireVoiceAdmin,wrap(async(req,res)=>{
 if(!check(req,res))return;
 const row=(await pool.query("SELECT audio_data FROM "+table+" WHERE path=$1",[req.params.path])).rows[0];
 if(!row?.audio_data){res.status(404).json({error:"No recording"});return;}
 res.set("X-Content-Type-Options","nosniff").type("audio/wav").send(row.audio_data);
}));
router.post("/admin/max/ivr-editor/voice-audio/:path",requireVoiceAdmin,wrap(async(req,res)=>{
 if(!check(req,res))return;
 const encoded=req.body?.base64,mime=req.body?.mime;
 if(mime!=="audio/wav"||typeof encoded!=="string"||encoded.length>5400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)){res.status(400).json({error:"Use WAV below 4 MB"});return;}
 const buffer=Buffer.from(encoded,"base64");
 if(buffer.length<46||buffer.length>3900000||buffer.toString("ascii",0,4)!=="RIFF"||buffer.toString("ascii",8,12)!=="WAVE"||buffer.readUInt16LE(20)!==1||buffer.readUInt16LE(22)!==1||buffer.readUInt32LE(24)!==16000||buffer.readUInt16LE(34)!==16||buffer.readUInt32LE(40)+44>buffer.length){
  res.status(415).json({error:"Invalid 16kHz mono PCM WAV"});return;
 }
 await pool.query("INSERT INTO "+table+"(path,audio_data,mime_type,is_active,audio_version) VALUES($1,$2,'audio/wav',false,1) ON CONFLICT(path) DO UPDATE SET audio_data=EXCLUDED.audio_data,mime_type='audio/wav',is_active=false,audio_version=gavhah_olam_voice_recordings.audio_version+1,updated_at=now()",[req.params.path,buffer]);
 res.json({ok:true,live:false,needsPublish:true});
}));
router.post("/admin/max/ivr-editor/voice-audio/:path/activate",requireVoiceAdmin,wrap(async(req,res)=>{
 if(!check(req,res))return;if(req.body?.confirm!=="ACTIVATE_OLAM_VOICE_AUDIO"){res.status(400).json({error:"Confirm"});return;}
 const r=await pool.query("UPDATE "+table+" SET is_active=true,updated_at=now() WHERE path=$1 AND audio_data IS NOT NULL RETURNING path",[req.params.path]);
 if(!r.rowCount){res.status(404).json({error:"Save audio first"});return;}res.json({ok:true,active:true});
}));
router.post("/admin/max/ivr-editor/voice-audio/:path/deactivate",requireVoiceAdmin,wrap(async(req,res)=>{
 if(!check(req,res))return;if(req.body?.confirm!=="DEACTIVATE_OLAM_VOICE_AUDIO"){res.status(400).json({error:"Confirm"});return;}
 await pool.query("UPDATE "+table+" SET is_active=false,updated_at=now() WHERE path=$1",[req.params.path]);res.json({ok:true,active:false});
}));
router.delete("/admin/max/ivr-editor/voice-audio/:path",requireVoiceAdmin,wrap(async(req,res)=>{
 if(!check(req,res))return;if(req.body?.confirm!=="DELETE_OLAM_VOICE_AUDIO"){res.status(400).json({error:"Confirm"});return;}
 await pool.query("DELETE FROM "+table+" WHERE path=$1",[req.params.path]);res.json({ok:true,deleted:true});
}));
router.get("/signalwire/olam-voice/:path/:version",wrap(async(req,res)=>{
 const path=typeof req.params.path==="string"?req.params.path:"";
 const version=typeof req.params.version==="string"?req.params.version:"";
 const sig=String(req.query.sig||"");
 if(!validPath(path)||!/^[1-9][0-9]{0,18}$/.test(version)||!/^[a-f0-9]{64}$/.test(sig)){res.sendStatus(404);return;}
 const expected=urlSign(path,version);
 if(!timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(expected,"hex"))){res.sendStatus(404);return;}
 const row=(await pool.query("SELECT audio_data FROM "+table+" WHERE path=$1 AND audio_version=$2 AND is_active=true",[path,version])).rows[0];
 if(!row?.audio_data){res.sendStatus(404);return;}
 res.set("Cache-Control","no-store").set("X-Content-Type-Options","nosniff").type("audio/wav").send(row.audio_data);
}));
export default router;
