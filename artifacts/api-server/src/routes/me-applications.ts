import {Router,type IRouter} from "express";
import {pool} from "@workspace/db";
import {requireAuth,getSessionUserId} from "../middlewares/auth";
import {notifyStaff} from "../lib/notify";
import {readMemberApplications,saveMemberApplicationFollowup,type ApplicationKind} from "../lib/member-application-status";

const router:IRouter=Router();
const sameOrigin:import("express").RequestHandler=(req,res,next)=>{
 if(req.get("sec-fetch-site")==="cross-site"||req.get("sec-fetch-site")==="same-site"){
  res.status(403).json({error:"Cross-site request not allowed"});return;
 }
 const origin=req.get("origin");
 if(origin){
  try{
   const given=new URL(origin),host=req.get("x-forwarded-host")||req.get("host");
   if(given.protocol!=="https:"||given.host!==host){
    res.status(403).json({error:"Invalid request origin"});return;
   }
  }catch{res.status(403).json({error:"Invalid request origin"});return;}
 }
 next();
};
router.get("/me/applications",requireAuth,async(req,res,next):Promise<void>=>{
 const client=await pool.connect();
 try{
  const uid=getSessionUserId(req);
  if(!uid){res.status(401).json({error:"Sign in required"});return;}
  const items=await readMemberApplications(client,uid);
  res.setHeader("Cache-Control","private,no-store").json({items});
 }catch(e){next(e);}finally{client.release();}
});
router.post("/me/applications/:kind/:id/followups",requireAuth,sameOrigin,async(req,res,next):Promise<void>=>{
 const kind=String(req.params.kind);
 const id=Number(req.params.id);
 const userId=getSessionUserId(req);
 if(!userId||!["volunteer","help"].includes(kind)||!Number.isSafeInteger(id)||id<=0){
  res.status(400).json({error:"Invalid member application"});return;
 }
 if(typeof req.body?.message!=="string"){
  res.status(400).json({error:"A written follow-up message is required"});return;
 }
 const client=await pool.connect();
 try{
  const saved=await saveMemberApplicationFollowup(client,userId,kind as ApplicationKind,id,req.body.message);
  res.setHeader("Cache-Control","private,no-store").status(201).json({saved:true,reference:saved.id});
  // Staff review inbox already has the new private message even if notification fails.
  void notifyStaff("New private "+kind+" application follow-up #"+id,"/founder","admin_support")
   .catch(()=>{});
 }catch(e){
  const message=e instanceof Error?e.message:"Could not send follow-up";
  res.status(/not found/.test(message)?404:400).json({error:message});
 }finally{client.release();}
});
export default router;
