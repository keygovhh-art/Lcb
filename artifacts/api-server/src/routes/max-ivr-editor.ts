/** Super-admin website API for the MAX menu builder. Draft-only, zero provider mutation. */
import {Router,type Request,type Response} from "express";
import {getCurrentSessionUser,requireAuth} from "../middlewares/auth";
import {listDraft,readDraft,saveNode,saveButton,removeDraftButton,issuePhoneCode,pathAllowed,digitAllowed,
 MAX_EDITOR_ACTIONS,BUILTINS,VOICES,ADMIN_EXTENSION} from "../lib/max-ivr-editor";
const router=Router();
const problem=(res:Response,status:number,error:string)=>res.status(status).json({error});
function sameOrigin(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(["cross-site","same-site"].includes(req.get("sec-fetch-site")||""))return false;
 if(!origin)return true;
 try{const url=new URL(origin);return url.protocol==="https:"&&url.host===host;}catch{return false;}
}
async function owner(req:Request,res:Response,next:(e?:unknown)=>void){
 try{
  const user=await getCurrentSessionUser(req);
  if(!user||user.role!=="super_admin"){problem(res,403,"Super-admin access required");return;}
  if(req.method!=="GET"&&!sameOrigin(req)){problem(res,403,"Same-origin request required");return;}
  res.locals.maxAdminId=user.id;
  next();
 }catch(e){next(e);}
}
function wrap(fn:(req:Request,res:Response)=>Promise<void>){
 return (req:Request,res:Response,next:(e?:unknown)=>void)=>{void fn(req,res).catch(next);};
}
const prefix="/admin/max/ivr-editor";
router.use(prefix,requireAuth,owner);
router.get(prefix,wrap(async(_req,res)=>{
 res.setHeader("Cache-Control","private, no-store");
 res.json({...await listDraft(),
  actions:MAX_EDITOR_ACTIONS,builtins:BUILTINS,voices:VOICES,
  phoneEditorExtension:ADMIN_EXTENSION,
  notice:"No live IVR routing changes. Draft-only until signed real-call and protected 55555 checks pass."});
}));
router.get(prefix+"/:path",wrap(async(req,res)=>{
 const path=String(req.params.path||"");
 if(!pathAllowed(path)){problem(res,400,"Reserved or invalid extension");return;}
 res.setHeader("Cache-Control","private, no-store").json(await readDraft(path));
}));
router.put(prefix+"/:path",wrap(async(req,res)=>{
 const path=String(req.params.path||"");
 const result=await saveNode(path,req.body||{},Number(res.locals.maxAdminId));
 if("error" in result){problem(res,400,result.error);return;}
 res.setHeader("Cache-Control","no-store").json(result);
}));
router.put(prefix+"/:path/buttons/:digit",wrap(async(req,res)=>{
 const result=await saveButton(String(req.params.path||""),String(req.params.digit||""),req.body,Number(res.locals.maxAdminId));
 if("error" in result){problem(res,400,result.error);return;}
 res.setHeader("Cache-Control","no-store").json(result);
}));
router.delete(prefix+"/:path/buttons/:digit",wrap(async(req,res)=>{
 const path=String(req.params.path||""),digit=String(req.params.digit||"");
 if(!pathAllowed(path)||!digitAllowed(digit)){problem(res,400,"Reserved or invalid button");return;}
 await removeDraftButton(path,digit);
 res.setHeader("Cache-Control","no-store").json({ok:true,draft:true,live:false});
}));
router.post(prefix+"/phone-code",wrap(async(_req,res)=>{
 const result=await issuePhoneCode(Number(res.locals.maxAdminId));
 if("rateLimited" in result){problem(res,429,"Only 3 phone editing codes per 15 minutes");return;}
 res.setHeader("Cache-Control","no-store").json({...result,phoneEditorExtension:ADMIN_EXTENSION,
  notice:"Access code is one-time and expires in five minutes. The editor is not mapped to the live provider until certified."});
}));
export default router;
