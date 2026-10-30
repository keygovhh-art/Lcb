/** Super-admin website API for the MAX menu builder. Draft-only, zero provider mutation. */
import {Router,type Request,type Response} from "express";
import {getCurrentSessionUser,requireAuth} from "../middlewares/auth";
import {listDraft,readDraft,saveNode,saveButton,removeDraftButton,issuePhoneCode,pathAllowed,digitAllowed,
 MAX_EDITOR_ACTIONS,BUILTINS,VOICES,ADMIN_EXTENSION} from "../lib/max-ivr-editor";
import {getOlamVoiceProfiles,setOlamVoiceProfile} from "../lib/olam-signalwire-voice";
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
// LIVE voice-only controls; never change CallSid routing or Yemot settings.
router.get(prefix+"/voice-profiles",wrap(async(_req,res)=>{
 res.setHeader("Cache-Control","private,no-store").json({
  system:"Olam Hachesed Communication",provider:"SignalWire",
  paths:await getOlamVoiceProfiles(),voice:"man"
 });
}));
router.put(prefix+"/voice-profiles/:path",wrap(async(req,res)=>{
 const result=await setOlamVoiceProfile(String(req.params.path||""),req.body);
 if(!result.ok){problem(res,400,String(result.error));return;}
 res.setHeader("Cache-Control","private,no-store").json(result);
}));
router.get(prefix+"/voice-studio",wrap(async(_req,res)=>{
 res.set("Cache-Control","private,no-store").type("text/html; charset=utf-8").send("<!doctype html><html lang=\"yi\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>עולם החסד — שטימע פאר יעדער עקסטענשאן</title>\n<style>body{font:16px/1.6 system-ui,sans-serif;background:#f3f6fa;color:#182438;margin:0;padding:18px}main{max-width:640px;margin:auto;background:#fff;border:1px solid #dbe3ec;border-radius:16px;padding:20px}h1{font-size:23px}label{display:block;margin:15px 0;font-weight:600}select,input[type=range]{display:block;width:100%;margin-top:6px;padding:9px;box-sizing:border-box}button{margin-top:18px;background:#175990;color:white;border:0;border-radius:8px;padding:12px 22px;font-size:17px}small{color:#536075}#feedback{white-space:pre-wrap;font-weight:600;margin-top:12px}output{font-weight:500;margin-inline-start:8px}</style>\n</head><body><main><h1>עולם החסד — שטימע־סטודיא</h1>\n<p>באזונדער פאר יעדער עקסטענשאן: מענערישע ענגלישע שטימע, שנעלקייט און קורצע אטעם־הפסקות. די מעניו־קנעפלעך בלייבן אומגעענדערט.</p>\n<label>עקסטענשאן <select id=\"path\"></select></label>\n<label>שנעלקייט — <output id=\"rv\"></output><input id=\"rate\" type=\"range\" min=\"90\" max=\"115\" step=\"1\"></label>\n<label>הפסקה ביי א קאמע — <output id=\"cv\"></output><input id=\"comma\" type=\"range\" min=\"60\" max=\"350\" step=\"5\"></label>\n<label>הפסקה ביי א פינטל — <output id=\"sv\"></output><input id=\"sentence\" type=\"range\" min=\"150\" max=\"750\" step=\"10\"></label>\n<label><input type=\"checkbox\" id=\"enabled\"> אנגעשטעלט</label>\n<button id=\"save\">אפהיטן די איינשטעלונגען</button><p id=\"feedback\" role=\"status\"></p>\n<p><small>בלויז SignalWire — עולם החסד קאמיוניקאציע. נישט ימות און נישט מיין עסקנות. מען דארף זיין איינגעשריבן אלס הויפט־אדמיניסטראטאר.</small></p></main>\n<script>\nconst root='/api/admin/max/ivr-editor/voice-profiles',elt=x=>document.getElementById(x);let rows=[];\nfunction show(){const x=rows.find(r=>r.path===elt('path').value);if(!x)return;elt('rate').value=x.rate_percent;elt('comma').value=x.comma_pause_ms;elt('sentence').value=x.sentence_pause_ms;elt('enabled').checked=x.enabled;update()}\nfunction update(){elt('rv').textContent=elt('rate').value+'%';elt('cv').textContent=elt('comma').value+' ms';elt('sv').textContent=elt('sentence').value+' ms'}\nasync function load(){const r=await fetch(root,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('הויפט־אדמיניסטראטאר־צוטריט נויטיג');rows=(await r.json()).paths||[];elt('path').replaceChildren(...rows.map(x=>{const o=document.createElement('option');o.value=x.path;o.textContent=x.path==='root'?'הויפט־מעניו':'עקסטענשאן '+x.path;return o}));show()}\nelt('path').onchange=show;for(const x of ['rate','comma','sentence'])elt(x).oninput=update;\nelt('save').onclick=async()=>{elt('save').disabled=true;elt('feedback').textContent='';try{const r=await fetch(root+'/'+encodeURIComponent(elt('path').value),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({rate_percent:Number(elt('rate').value),comma_pause_ms:Number(elt('comma').value),sentence_pause_ms:Number(elt('sentence').value),enabled:elt('enabled').checked})});if(!r.ok)throw Error('די סעטינגס זענען נישט אפגעהיטן');elt('feedback').textContent='סוקסעספול אפגעהיטן';await load()}catch(e){elt('feedback').textContent=e.message}finally{elt('save').disabled=false}};\nload().catch(e=>elt('feedback').textContent=e.message);\n</script></body></html>");
}));
router.get(prefix+"/:path",wrap(async(req,res)=>{
 const path=String(req.params.path||"");
 if(!pathAllowed(path)){problem(res,400,"Reserved or invalid extension");return;}
 res.setHeader("Cache-Control","private, no-store").json(await readDraft(path));
}));
router.put(prefix+"/:path",wrap(async(req,res)=>{
 const path=String(req.params.path||"");
 const result=await saveNode(path,req.body||{},Number(res.locals.maxAdminId));
 if("error" in result){problem(res,400,String(result.error||"Invalid draft request"));return;}
 res.setHeader("Cache-Control","no-store").json(result);
}));
router.put(prefix+"/:path/buttons/:digit",wrap(async(req,res)=>{
 const result=await saveButton(String(req.params.path||""),String(req.params.digit||""),req.body,Number(res.locals.maxAdminId));
 if("error" in result){problem(res,400,String(result.error||"Invalid draft request"));return;}
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
