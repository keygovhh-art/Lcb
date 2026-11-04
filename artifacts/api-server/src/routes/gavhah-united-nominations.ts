import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAdmin,getSessionUserId} from "../middlewares/auth";
import {fetchModeratedNewsAudio,validRecordedPath} from "../lib/yemot-news-engagement";
import {notifyUser} from "../lib/notify";

const router=Router();
const safeOrigin=(req:Request)=>{
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin||!host||req.get("sec-fetch-site")==="cross-site")return false;
 try{return new URL(origin).protocol==="https:"&&new URL(origin).host===host;}
 catch{return false;}
};
router.get("/admin/united/phone-nominations",requireAdmin,async(_req,res,next)=>{
 try{
  const r=await pool.query(
   "SELECT n.id,n.member_id,n.urgency,n.status,n.created_at,n.staff_notes,"+
   "u.nickname AS member_nickname "+
   "FROM public.gavhah_phone4_nominations n JOIN public.users u ON u.id=n.member_id "+
   "ORDER BY n.created_at DESC LIMIT 150");
  res.set("Cache-Control","private,no-store").json(r.rows);
 }catch(e){next(e);}
});
router.get("/admin/united/phone-nominations/:id/audio/:field",requireAdmin,async(req,res,next)=>{
 try{
  const id=Number(req.params.id),field=String(req.params.field||"");
  const fields:Record<string,string>={
   title:"cause_title_audio",details:"cause_details_audio",location:"cause_location_audio"
  };
  if(!Number.isSafeInteger(id)||id<1||!fields[field]){res.sendStatus(404);return;}
  const r=await pool.query("SELECT "+fields[field]+" AS audio "+
   "FROM public.gavhah_phone4_nominations WHERE id=$1",[id]);
  const path=validRecordedPath(r.rows[0]?.audio);
  if(!path){res.sendStatus(404);return;}
  const audio=await fetchModeratedNewsAudio(path);
  res.set("Content-Type","audio/wav").set("Cache-Control","private,no-store")
   .set("X-Content-Type-Options","nosniff").send(Buffer.from(audio));
 }catch(e){next(e);}
});
router.post("/admin/united/phone-nominations/:id/review",requireAdmin,async(req,res,next)=>{
 if(!safeOrigin(req)){res.sendStatus(403);return;}
 const id=Number(req.params.id),decision=String(req.body?.decision||"");
 const title=String(req.body?.title||"").trim(),description=String(req.body?.description||"").trim();
 const location=String(req.body?.location||"").trim(),notes=String(req.body?.note||"").trim();
 if(!Number.isSafeInteger(id)||id<1||!["approved","rejected"].includes(decision)||
    decision==="approved"&&(title.length<3||description.length<12)||
    title.length>200||description.length>5000||location.length>200||notes.length>1200){
  res.status(400).json({error:"Review decision plus transcribed cause title and details required"});return;
 }
 const c=await pool.connect();
 let memberId=0,submissionId:number|null=null;
 try{
  await c.query("BEGIN");
  const selected=await c.query<{
   member_id:number;urgency:string;status:string
  }>("SELECT member_id,urgency,status FROM public.gavhah_phone4_nominations "+
    "WHERE id=$1 FOR UPDATE",[id]);
  const n=selected.rows[0];
  if(!n||n.status!=="pending"){await c.query("ROLLBACK");res.status(409).json({error:"Nomination already handled"});return;}
  memberId=n.member_id;
  if(decision==="approved"){
   const user=await c.query<{name:string;nickname:string|null}>(
    "SELECT name,nickname FROM public.users WHERE id=$1",[memberId]);
   const display=String(user.rows[0]?.nickname||user.rows[0]?.name||"Gavhah member").slice(0,160);
   const created=await c.query<{id:number}>(
    "INSERT INTO public.cause_submissions "+
    "(title,description,submitted_by,location,urgency,status,user_id,admin_notes) "+
    "VALUES($1,$2,$3,$4,$5,'pending',$6,$7) RETURNING id",
    [title,description,display,location||null,n.urgency,memberId,
      "Transcribed from private Yemot nomination #"+id+". "+notes]);
   submissionId=created.rows[0].id;
  }
  await c.query("UPDATE public.gavhah_phone4_nominations SET "+
   "status=$2,staff_notes=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1",
   [id,decision,notes,getSessionUserId(req)]);
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});next(e);return;}
 finally{c.release();}
 await notifyUser(memberId,"united_phone_nomination_review",
  decision==="approved"
    ?"Your phone cause proposal was accepted for the staff's public cause review queue, but is not yet published."
    :"Your phone cause proposal was not approved.",
  "/united");
 res.json({id,status:decision,submissionId,published:false,
  note:"Approval here only creates a pending public cause proposal; final Featured Cause approval is a separate staff action."});
});
export default router;
