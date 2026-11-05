import {Router} from "express";
import {pool} from "@workspace/db";
import {requireAuth,requireAdmin,getSessionUserId,getCurrentSessionUser} from "../middlewares/auth";
import {phoneTree} from "./yemot-whole-platform-ivr";

type TreeEntry={label:string;phone:string;web?:string;children?:Record<string,TreeEntry>};
export type KeypadEntry={digits:string;depth:number;label:string;status:string;reason:string;web:string|null};
const readable=new Set(["111","1121","1122","1123","1124","1125","1126","1127","1128","1129",
"113","114","131","133","134","141","142","143","144","151","152","153","154",
"161","162","163","164","171","172","182","191","192","193","194"]);
const activeAction=new Set(["115","121","122","123","124","125","126","132","155","166",
"167","173","181","1831","1832","1833","1834","185"]);
export function getKeypadMap():KeypadEntry[]{
 const result:KeypadEntry[]=[];
 const walk=(nodes:Record<string,TreeEntry>,parent:string,depth:number)=>{
  for(const [key,node] of Object.entries(nodes)){
   const digits=parent+key;
   let status="וועב־מאפע";let reason="דער קנעפל איז אין מעניו־בוים, אבער נישט באשטעטיגט אלס פולע קיפעד־פונקציע";
   if(digits==="159"||digits.startsWith("159")){
    status="SignalWire";reason="באזונדערער עולם החסד־צוטריט; נישט די ימות־קאמוניקאציע";
   }else if(digits==="2"||digits.startsWith("2")){
    status="4444־מאפע";reason="קאמפיין סענטער איז באזונדער פארבונדן; אונטער־אקציעס זענען נישט אלע פונקציאנעל באשטעטיגט";
   }else if(node.children){
    status="מעניו";reason="די נאוויגאציע עקזיסטירט; אונטער־קנעפלעך האבן אייגענע מצב";
   }else if(activeAction.has(digits)){
    status="טיילווייז לייוו";reason="קיפעד־לאגיק עקזיסטירט, מיט באגרענעצונגען אדער וועריפיקאציע";
   }else if(readable.has(digits)){
    status="לייענען";reason="באגרענעצטע לייענען־פונקציע; פריוואטע דאטן פאדערן באשטעטיגטן אקאונט";
   }
   result.push({digits,depth,label:node.label,status,reason,web:node.web||null});
   if(node.children)walk(node.children,digits,depth+1);
  }
 };
 walk(phoneTree as Record<string,TreeEntry>,"",0);
 return result;
}
const router=Router();
const clean=(v:unknown,n=900)=>String(v??"").trim().slice(0,n);
function sameOrigin(req:any):boolean{
 const o=req.get("origin");
 if(!o)return req.get("sec-fetch-site")!=="cross-site";
 try{return new URL(o).host===(req.get("x-forwarded-host")||req.get("host"))}catch{return false}
}
router.get("/olam-chesed/access",requireAuth,async(req,res,next)=>{
 try{
  const r=await pool.query("SELECT status,reason,requested_at,reviewed_at FROM public.gavhah_olam_chesed_access WHERE user_id=$1",[getSessionUserId(req)!]);
  res.set("Cache-Control","private, no-store").json(r.rows[0]||{status:"not_requested"});
 }catch(e){next(e)}
});
router.post("/olam-chesed/access",requireAuth,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.status(403).json({error:"Only same-site applications are permitted"});return;}
  const reason=clean(req.body?.reason);
  if(reason.length<6){res.status(400).json({error:"Describe your request in at least 6 characters"});return;}
  const id=getSessionUserId(req)!;
  const r=await pool.query(
   "INSERT INTO public.gavhah_olam_chesed_access(user_id,reason) VALUES($1,$2) "+
   "ON CONFLICT(user_id) DO NOTHING RETURNING status",[id,reason]);
  if(r.rowCount){res.status(201).json({status:"requested"});return;}
  const prev=await pool.query("SELECT status FROM public.gavhah_olam_chesed_access WHERE user_id=$1",[id]);
  res.json({status:prev.rows[0]?.status||"requested",alreadyFiled:true});
 }catch(e){next(e)}
});
router.get("/admin/olam-chesed/access",requireAdmin,async(_req,res,next)=>{
 try{
  const r=await pool.query(
   "SELECT a.user_id,a.status,a.reason,a.requested_at,a.reviewed_at,a.review_note,u.name "+
   "FROM public.gavhah_olam_chesed_access a JOIN public.users u ON u.id=a.user_id "+
   "ORDER BY CASE WHEN a.status='requested' THEN 0 WHEN a.status='reviewing' THEN 1 ELSE 2 END, a.requested_at DESC LIMIT 150");
  res.set("Cache-Control","private, no-store").json(r.rows);
 }catch(e){next(e)}
});
router.post("/admin/olam-chesed/access/:id/status",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.status(403).json({error:"Cross-site changes blocked"});return;}
  const admin=await getCurrentSessionUser(req);
  if(admin?.role!=="super_admin"){res.status(403).json({error:"Only founder can link SignalWire access"});return;}
  const id=Number(req.params.id),status=String(req.body?.status||""),note=clean(req.body?.note,1000);
  if(!Number.isSafeInteger(id)||id<1||!["reviewing","linked","denied"].includes(status)){
   res.status(400).json({error:"Invalid decision"});return;
  }
  if(status==="linked"&&(req.body?.confirm!=="SIGNALWIRE_ACCOUNT_VERIFIED"||note.length<12)){
   res.status(400).json({error:"Explicit verified account attestation and note required"});return;
  }
  const q=await pool.query(
   "UPDATE public.gavhah_olam_chesed_access SET status=$2,reviewed_at=now(),reviewed_by=$3,review_note=$4 "+
   "WHERE user_id=$1 RETURNING user_id,status",[id,status,admin.id,note]);
  if(!q.rowCount){res.status(404).json({error:"Request not found"});return;}
  res.set("Cache-Control","no-store").json({ok:true,...q.rows[0]});
 }catch(e){next(e)}
});
router.get("/admin/hotline-keypad-map",requireAdmin,(_req,res)=>{
 const esc=(v:unknown)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const rows=getKeypadMap();
 const stats=rows.reduce<Record<string,number>>((a,x)=>{a[x.status]=(a[x.status]||0)+1;return a},{});
 const table=rows.map(x=>"<tr data-text=\""+esc((x.digits+" "+x.label+" "+x.status).toLowerCase())+"\" data-status=\""+esc(x.status)+"\"><td dir=\"ltr\"><b>"+esc(x.digits)+"</b></td><td style=\"padding-right:"+(10+x.depth*12)+"px\">"+esc(x.label)+"</td><td><span class=\"status\">"+esc(x.status)+"</span></td><td>"+esc(x.reason)+"</td><td>"+(x.web?"<a href=\""+esc(x.web)+"\" target=\"_blank\" rel=\"noopener\">וועב־בלאט</a>":"—")+"</td></tr>").join("");
 const options=Object.keys(stats).map(k=>"<option value=\""+esc(k)+"\">"+esc(k)+"</option>").join("");
 const summary=Object.entries(stats).map(([k,v])=>"<span class=\"pill\">"+esc(k)+": <b>"+v+"</b></span>").join("");
 const html=[
 "<!doctype html><html lang=\"yi\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>גבהה — קיפעד מפתח</title>",
 "<style>body{margin:0;background:#f6f8fb;color:#182d43;font:14px/1.6 system-ui,Arial}main{max-width:1200px;margin:auto;padding:16px}h1{font-size:25px}h2{font-size:19px}section{background:white;border:1px solid #e0e7ef;border-radius:15px;padding:17px;margin:13px 0}.pill,.status{display:inline-block;background:#ebf2fa;border:1px solid #d6e1ee;border-radius:10px;padding:3px 8px;margin:3px;font-size:12px}.toolbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center}input,select,button{font:inherit;padding:10px;border:1px solid #b9ccdf;border-radius:9px}button{background:#185d95;color:white;cursor:pointer}p{line-height:1.7}.small{color:#657487}table{width:100%;border-collapse:collapse;min-width:700px}td,th{text-align:right;border-bottom:1px solid #e3eaf2;padding:9px;vertical-align:top}th{background:#edf3f9}tr[hidden]{display:none}.scroll{overflow-x:auto}a{color:#12659d}</style></head><body><main>",
 "<section><h1>גבהה — פונקטליכער קיפעד־מפתח</h1><p>דער אמתער קנעפּל־בוים, מיט פונקציע־מצב און וועב־פארבינדונג. א נאמען אינעם מעניו איז נישט א באשטעטיגונג אז דער פונקציע ארבעט שוין.</p><div>"+summary+"</div></section>",
 "<section><h2>הויפט־אנווייזונגען</h2><p><b>0</b> — איין מעניו צוריק; אויפן הויפט־מעניו בלייבט דער עקזיסטירנדער ימות־מענעדזשמענט. <b>4444</b> — קאמפיין סענטער. <b>159</b> — עולם החסד־צוטריט־טויער; די עכטע קאמוניקאציע בלייבט אויף SignalWire.</p><p class=\"small\">די אפציעס מיט „וועב־מאפע“ אדער „4444־מאפע“ זענען נישט באשטעטיגט אלס לייווע קיפעד־פונקציעס. פריוואטע דאטן פאדערן א באשטעטיגטן אקאונט.</p></section>",
 "<section><h2>אלע קנעפלעך</h2><div class=\"toolbar\"><input id=\"q\" placeholder=\"זוך עקסטענשאן אדער אפציע\"><select id=\"f\"><option value=\"\">אלע מצבים</option>"+options+"</select><button id=\"reset\">אויסמעקן</button></div><p id=\"count\" class=\"small\">"+rows.length+" איינטרעגונגען</p><div class=\"scroll\"><table><thead><tr><th>קנעפּל</th><th>אפטיילונג</th><th>מצב</th><th>וואס ארבעט</th><th>וועב</th></tr></thead><tbody>"+table+"</tbody></table></div></section>",
 "<section><h2>עולם החסד־צוטריט־בקשות</h2><p>נאר דער גרינדער קען באשטעטיגן אן עקזיסטירנדן SignalWire־אקאונט. צוטריט צום גבהה־וועב אליין גיט נישט אויטאמאטיש דעם רעכט.</p><button id=\"refresh\">דערהיינטיגן</button><p id=\"reviewState\" class=\"small\"></p><div id=\"applications\"></div></section><p><a href=\"/founder\">צוריק צום דעשבאורד</a></p></main>",
 "<script>const q=document.getElementById('q'),f=document.getElementById('f'),trs=[...document.querySelectorAll('tbody tr')];function filt(){let n=0;for(const r of trs){let ok=r.dataset.text.includes(q.value.toLowerCase().trim())&&(!f.value||r.dataset.status===f.value);r.hidden=!ok;if(ok)n++;}document.getElementById('count').textContent=n+' פון '+trs.length+' איינטרעגונגען'}q.oninput=filt;f.onchange=filt;document.getElementById('reset').onclick=()=>{q.value='';f.value='';filt()};",
 "const escapeHtml=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));async function refresh(){const s=document.getElementById('reviewState');try{const r=await fetch('/api/admin/olam-chesed/access',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const items=await r.json();s.textContent=items.length+' בקשות';document.getElementById('applications').innerHTML=items.map(x=>'<div style=\"border-bottom:1px solid #dae4ed;padding:12px 0\"><b>'+escapeHtml(x.name)+'</b> #'+x.user_id+' · '+escapeHtml(x.status)+'<p>'+escapeHtml(x.reason)+'</p><div class=\"toolbar\"><select id=\"st'+x.user_id+'\"><option value=\"reviewing\">אין באהאנדלונג</option><option value=\"linked\">וועריפיצירט פארבונדן</option><option value=\"denied\">אפגעזאגט</option></select><input id=\"nt'+x.user_id+'\" placeholder=\"נאטיץ וועגן וועריפיקאציע\"><button data-id=\"'+x.user_id+'\">אפהיטן</button></div></div>').join('')||'<p>קיין בקשות</p>'}catch(e){s.textContent='נישט געלונגען: '+e.message}}document.getElementById('refresh').onclick=refresh;document.getElementById('applications').onclick=async e=>{const id=e.target.dataset.id;if(!id)return;const status=document.getElementById('st'+id).value,note=document.getElementById('nt'+id).value;if(status==='linked'&&!confirm('האסטו טאקע וועריפיצירט דעם באזונדערן SignalWire אקאונט?'))return;const body={status,note,...(status==='linked'?{confirm:'SIGNALWIRE_ACCOUNT_VERIFIED'}:{})};try{const r=await fetch('/api/admin/olam-chesed/access/'+id+'/status',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw Error(x.error);refresh()}catch(e){alert(e.message)}};refresh();</script></body></html>"
 ].join("");
 res.set("Cache-Control","private, no-store").type("text/html; charset=utf-8").send(html);
});
export default router;
