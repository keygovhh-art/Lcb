import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAdmin,getSessionUserId} from "../middlewares/auth";
import {fetchModeratedNewsAudio,validRecordedPath} from "../lib/yemot-news-engagement";
import {notifyUser} from "../lib/notify";

// All recorded helper/request records are private, even after staff review.
const router=Router();
const fields={title:"voice_title",details:"voice_details",location:"voice_location",goal:"voice_goal"} as const;
function sameOrigin(req:Request){
 if(req.get("sec-fetch-site")==="cross-site")return false;
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin)return true; // authenticated internal service caller only
 try{return !!host&&new URL(origin).protocol==="https:"&&new URL(origin).host===host;}
 catch{return false;}
}
router.get("/admin/gavhah-phone3/intake",requireAdmin,async(_req,res,next)=>{
 try{
  const q=await pool.query(
   "SELECT p.id,p.member_id,p.kind,p.category,p.availability,p.urgency,"+
   "p.voice_title IS NOT NULL AS title_audio,p.voice_details IS NOT NULL AS details_audio,"+
   "p.voice_location IS NOT NULL AS location_audio,p.voice_goal IS NOT NULL AS goal_audio,"+
   "p.project_id,p.source,p.status,p.created_at,p.staff_notes "+
   "FROM public.gavhah_phone3_intake p WHERE p.status IN ('pending','reviewing') "+
   "ORDER BY p.created_at ASC LIMIT 250");
  res.set("Cache-Control","private,no-store").json(q.rows);
 }catch(e){next(e);}
});
router.get("/admin/gavhah-phone3/:id/audio/:field",requireAdmin,async(req,res,next)=>{
 try{
  const id=Number(req.params.id),key=String(req.params.field);
  const column=fields[key as keyof typeof fields];
  if(!Number.isSafeInteger(id)||id<=0||!column){res.sendStatus(404);return;}
  // SQL column is strictly whitelisted; never accept arbitrary stored paths.
  const q=await pool.query("SELECT "+column+" AS audio "+
    "FROM public.gavhah_phone3_intake WHERE id=$1",[id]);
  const path=validRecordedPath(q.rows[0]?.audio);
  if(!path){res.sendStatus(404);return;}
  const bytes=await fetchModeratedNewsAudio(path);
  res.set("Content-Type","audio/wav").set("Cache-Control","private,no-store")
   .set("X-Content-Type-Options","nosniff").send(Buffer.from(bytes));
 }catch(e){next(e);}
});
router.post("/admin/gavhah-phone3/:id/review",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const id=Number(req.params.id),decision=String(req.body?.decision||"");
  const note=String(req.body?.note||"").trim();
  if(!Number.isSafeInteger(id)||id<=0||
     !["reviewing","completed","rejected"].includes(decision)||note.length>1500){
   res.status(400).json({error:"Invalid private intake review"});return;
  }
  const client=await pool.connect();
  let result:{member_id:number;status:string}|null=null;
  try{
   await client.query("BEGIN");
   const row=await client.query<{member_id:number;kind:string;project_id:number|null;status:string}>(
     "SELECT member_id,kind,project_id,status FROM public.gavhah_phone3_intake WHERE id=$1 FOR UPDATE",[id]);
   if(!row.rows[0]||!["pending","reviewing"].includes(row.rows[0].status)){
    await client.query("ROLLBACK");res.status(409).json({error:"Intake no longer pending"});return;
   }
   if(row.rows[0].kind==="project"&&decision!=="reviewing"){
    await client.query("ROLLBACK");
    res.status(409).json({error:"Use the project team-review panel to approve or reject this project, after checking the voice recordings"});return;
   }
   const changed=await client.query<{member_id:number;status:string}>(
    "UPDATE public.gavhah_phone3_intake SET status=$2,staff_notes=$3,reviewed_by=$4,"+
    "reviewed_at=now() WHERE id=$1 RETURNING member_id,status",
    [id,decision,note,getSessionUserId(req)!]);
   result=changed.rows[0];
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
  finally{client.release();}
  if(result)await notifyUser(result.member_id,"private_assistance_review",
    "Gavhah staff has updated your private community coordination application.",
    "/directory");
  res.json({ok:true,id,status:decision});
 }catch(e){next(e);}
});
export default router;
