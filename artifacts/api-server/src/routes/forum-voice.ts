import {Router, type Request} from "express";
import {createHash, randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {requireAuth, getSessionUserId} from "../middlewares/auth";
import {resolvePublicPostingName} from "../lib/user-display";
import {fetchModeratedNewsAudio,validRecordedPath} from "../lib/yemot-news-engagement";

// One recorded discussion is one existing public.discussions row. Both phone
// and browser recordings are accessible to the same public forum audio player.
const router=Router();
const MAX_BYTES=4*1024*1024;
function originAllowed(req:Request):boolean{
  const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
  if(!origin||!host||req.get("sec-fetch-site")==="cross-site")return false;
  try{
    const u=new URL(origin);
    return u.host===host&&u.protocol==="https:";
  }catch{return false;}
}
function validAudio(mime:string,bytes:Buffer):boolean{
  if(bytes.length<256||bytes.length>MAX_BYTES)return false;
  if(mime==="audio/wav"||mime==="audio/wave"||mime==="audio/x-wav")
    return bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WAVE";
  if(mime==="audio/webm")
    return bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if(mime==="audio/ogg")
    return bytes.toString("ascii",0,4)==="OggS";
  if(mime==="audio/mpeg")
    return bytes.toString("ascii",0,3)==="ID3"||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
  return false;
}
router.post("/discussions/voice",requireAuth,async(req,res,next)=>{
  try{
    if(!originAllowed(req)){res.status(403).json({error:"Same-origin submission required"});return;}
    const userId=getSessionUserId(req);
    if(!userId){res.sendStatus(401);return;}
    const mime=String(req.body?.mime||"").split(";")[0].trim().toLowerCase();
    const base64=req.body?.base64;
    if(typeof base64!=="string"||base64.length>Math.ceil(MAX_BYTES*4/3)+100||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)){
      res.status(400).json({error:"Choose a valid recording, four megabytes or less"});return;
    }
    const audio=Buffer.from(base64,"base64");
    if(!validAudio(mime,audio)){res.status(400).json({error:"Unsupported audio file"});return;}
    const name=await resolvePublicPostingName(userId,req.body?.authorName);
    const db=await pool.connect();
    try{
      await db.query("BEGIN");
      const count=await db.query<{n:string}>(
        "SELECT count(*)::text AS n FROM public.discussions "+
        "WHERE author_id=$1 AND category IN ('voice:phone','voice:web') "+
        "AND created_at>NOW()-interval '1 hour'",[userId]);
      if(Number(count.rows[0]?.n||0)>=12){
        await db.query("ROLLBACK");
        res.status(429).json({error:"Too many recent voice discussions; try later"});return;
      }
      const created=await db.query<{id:number}>(
        "INSERT INTO public.discussions(title,content,category,author_id,author_name) "+
        "VALUES($1,$2,'voice:web',$3,$4) RETURNING id",
        ["🎙️ א נייע שמועס","🎙️ א רעקארדירטער שמועס. הערט עס אינעם שפילער.",userId,name]);
      const id=created.rows[0].id;
      const fingerprint=createHash("sha256").update("web|"+randomUUID()+"|"+id).digest("hex");
      await db.query("INSERT INTO public.gavhah_discussion_voice_posts "+
        "(discussion_id,member_id,audio_data,mime_type,fingerprint) VALUES($1,$2,$3,$4,$5)",
        [id,userId,audio,mime,fingerprint]);
      await db.query("COMMIT");
      res.status(201).json({ok:true,id,audioUrl:"/api/discussions/"+id+"/voice",published:true});
    }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
    finally{db.release();}
  }catch(e){next(e);}
});
router.get("/discussions/:discussionId/voice",async(req,res,next)=>{
  try{
    const id=Number(req.params.discussionId);
    if(!Number.isSafeInteger(id)||id<=0){res.sendStatus(404);return;}
    const result=await pool.query<{
      provider_recording_path:string|null;audio_data:Buffer|null;mime_type:string;
    }>("SELECT provider_recording_path,audio_data,mime_type "+
      "FROM public.gavhah_discussion_voice_posts WHERE discussion_id=$1",[id]);
    const row=result.rows[0];
    if(!row){res.sendStatus(404);return;}
    let audio:Uint8Array;
    if(row.audio_data)audio=new Uint8Array(row.audio_data);
    else if(validRecordedPath(row.provider_recording_path))
      audio=await fetchModeratedNewsAudio(row.provider_recording_path!);
    else{res.sendStatus(404);return;}
    if(!audio.length||audio.length>6*1024*1024){res.sendStatus(502);return;}
    res.set("Content-Type",row.audio_data?row.mime_type:"audio/wav")
      .set("Cache-Control","private,no-store")
      .set("X-Content-Type-Options","nosniff")
      .send(Buffer.from(audio));
  }catch(e){next(e);}
});
export default router;
