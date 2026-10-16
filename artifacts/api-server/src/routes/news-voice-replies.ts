import { Router, type Request } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, getCurrentSessionUser } from "../middlewares/auth";
import { fetchModeratedNewsAudio } from "../lib/yemot-news-engagement";

const router=Router();
router.get("/news/:id/voice-replies",async(req,res,next)=>{
 try{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid news id"});return;}
  const r=await pool.query<{id:string;member_id:number;created_at:string}>(
    "SELECT id,member_id,created_at FROM public.gavhah_news_voice_replies "+
    "WHERE news_id=$1 AND status='approved' ORDER BY created_at ASC,id ASC LIMIT 200",[id]);
  res.set("Cache-Control","no-store").json(r.rows.map(x=>({
    id:String(x.id),postedAt:x.created_at,
    audioUrl:"/api/news/voice-replies/"+x.id+"/audio"
  })));
 }catch(e){next(e);}
});
router.get("/news/voice-replies/:replyId/audio",async(req,res,next)=>{
 try{
  const id=Number(req.params.replyId);
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid recording"});return;}
  const user=await getCurrentSessionUser(req);
  const isStaff=user&&["admin","moderator","super_admin"].includes(user.role);
  const r=await pool.query(
    "SELECT provider_recording_path,status FROM public.gavhah_news_voice_replies WHERE id=$1",[id]);
  const row=r.rows[0];
  if(!row||(row.status!=="approved"&&!isStaff)){res.sendStatus(404);return;}
  const bytes=await fetchModeratedNewsAudio(row.provider_recording_path);
  res.set("Content-Type","audio/wav").set("Cache-Control","private,no-store")
   .set("X-Content-Type-Options","nosniff").send(Buffer.from(bytes));
 }catch(e){next(e);}
});
router.get("/admin/news/voice-replies",requireAdmin,async(_req,res,next)=>{
 try{
  const result=await pool.query(
    "SELECT v.id,v.news_id,v.member_id,v.status,v.created_at,n.title AS news_title "+
    "FROM public.gavhah_news_voice_replies v JOIN public.news n ON n.id=v.news_id "+
    "WHERE v.status='pending' ORDER BY v.created_at ASC LIMIT 100");
  res.set("Cache-Control","private,no-store").json(result.rows.map(x=>({
    id:String(x.id),newsId:x.news_id,newsTitle:x.news_title,
    postedAt:x.created_at,memberId:x.member_id,
    audioUrl:"/api/news/voice-replies/"+x.id+"/audio"
  })));
 }catch(e){next(e);}
});
function sameOrigin(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin||!host||req.get("sec-fetch-site")==="cross-site")return false;
 try{return new URL(origin).protocol==="https:"&&new URL(origin).host===host;}catch{return false;}
}
router.post("/admin/news/voice-replies/:replyId/review",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.status(403).json({error:"Same-origin approval required"});return;}
  const id=Number(req.params.replyId);
  const decision=req.body?.decision;
  if(!Number.isSafeInteger(id)||id<=0||!["approved","rejected"].includes(decision)){
   res.status(400).json({error:"Invalid moderation decision"});return;
  }
  const user=await getCurrentSessionUser(req);
  if(!user){res.sendStatus(401);return;}
  const r=await pool.query(
   "UPDATE public.gavhah_news_voice_replies SET status=$1,reviewed_by=$2,reviewed_at=now() "+
   "WHERE id=$3 AND status='pending' RETURNING id,news_id,status",
   [decision,user.id,id]);
  if(!r.rowCount){res.status(409).json({error:"Not pending or missing"});return;}
  res.json({id:String(id),newsId:r.rows[0].news_id,status:decision});
 }catch(e){next(e);}
});
export default router;
