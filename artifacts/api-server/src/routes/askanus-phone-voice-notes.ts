import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";
import { fetchModeratedNewsAudio } from "../lib/yemot-news-engagement";

const router=Router();
router.get("/askanus/phone-voice-notes",requireAuth,async(req,res,next)=>{
 try{
  const user=await getCurrentSessionUser(req);
  if(!user||["suspended","banned"].includes(user.status)){res.sendStatus(403);return;}
  const result=await pool.query(
   "SELECT p.note_id AS id,n.title,p.created_at "+
   "FROM public.gavhah_phone_private_note_audio p "+
   "JOIN public.askanus_notes n ON n.id=p.note_id AND n.user_id=p.user_id "+
   "WHERE p.user_id=$1 ORDER BY p.created_at DESC,p.note_id DESC LIMIT 100",
   [user.id]);
  res.set("Cache-Control","private,no-store").json(result.rows.map(x=>({
   id:Number(x.id),title:x.title,createdAt:x.created_at,
   audioUrl:"/api/askanus/phone-voice-notes/"+x.id+"/audio"
  })));
 }catch(e){next(e);}
});
router.get("/askanus/phone-voice-notes/:noteId/audio",requireAuth,async(req,res,next)=>{
 try{
  const user=await getCurrentSessionUser(req);
  if(!user||["suspended","banned"].includes(user.status)){res.sendStatus(403);return;}
  const id=Number(req.params.noteId);
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid private audio note"});return;}
  const r=await pool.query<{provider_recording_path:string}>(
   "SELECT p.provider_recording_path FROM public.gavhah_phone_private_note_audio p "+
   "JOIN public.askanus_notes n ON n.id=p.note_id AND n.user_id=p.user_id "+
   "WHERE p.note_id=$1 AND p.user_id=$2",[id,user.id]);
  if(!r.rows[0]){res.sendStatus(404);return;}
  const bytes=await fetchModeratedNewsAudio(r.rows[0].provider_recording_path);
  res.set("Content-Type","audio/wav")
   .set("Cache-Control","private,no-store")
   .set("X-Content-Type-Options","nosniff")
   .set("Content-Disposition","inline").send(Buffer.from(bytes));
 }catch(e){next(e);}
});
export default router;
