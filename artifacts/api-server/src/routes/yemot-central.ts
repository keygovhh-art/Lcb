import { Router, type Request, type Response } from "express";
import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";

const router = Router();
type ProviderRow = {
  token_nonce: string; token_ciphertext: string; token_tag: string;
  line_number: string; enabled: boolean; last_verified_at: string | null;
  last_test_at: string | null; updated_at: string;
};
const table = "public.gavhah_yemot_global";
const err = (res: Response, status: number, message: string) => res.status(status).json({ error: message });
const isSameOrigin = (req: Request) => {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") || req.get("host");
  if (req.get("sec-fetch-site") === "cross-site" || req.get("sec-fetch-site") === "same-site") return false;
  if (!origin) return true;
  try { const u = new URL(origin); return !!host && u.host === host && u.protocol === "https:"; }
  catch { return false; }
};
const key = (): Buffer | null => {
  const value = process.env.YEMOT_ENCRYPTION_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 32 && bytes.toString("base64") === value ? bytes : null;
};
const encode = (token: string) => {
  const secret = key();
  if (!secret) throw Object.assign(new Error("Set YEMOT_ENCRYPTION_KEY on Gavhah Render before saving"), { status: 503 });
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, nonce);
  cipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { nonce: nonce.toString("base64"), body: encrypted.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
};
const decode = (row: ProviderRow): string => {
  const secret = key();
  if (!secret) throw Object.assign(new Error("Global Yemot storage is not configured"), { status: 503 });
  const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(row.token_nonce, "base64"));
  decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
  decipher.setAuthTag(Buffer.from(row.token_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext, "base64")), decipher.final()]).toString("utf8");
};
const getRow = async (): Promise<ProviderRow | null> => {
  const result = await pool.query("SELECT token_nonce, token_ciphertext, token_tag, line_number, enabled, last_verified_at, last_test_at, updated_at FROM " + table + " WHERE id = 1");
  return result.rows[0] || null;
};
const publicStatus = (row: ProviderRow | null) => ({
  configured: !!row,
  enabled: !!row?.enabled,
  verified: !!row?.last_verified_at,
  lineNumber: row?.line_number ?? null,
  lastVerifiedAt: row?.last_verified_at ?? null,
  lastTestAt: row?.last_test_at ?? null,
  updatedAt: row?.updated_at ?? null,
  storageReady: !!key(),
  lineNumberVerified: false, // GetTemplates tests account access, not ownership of the typed telephone DID.
  token: "NEVER_RETURNED",
  menu: [
    { digit: "1", label: "גבהה", extension: "/1", installed: false },
    { digit: "2", label: "קאמפיין סענטער", extension: "/2", installed: false }
  ],
  menuNote: "Two routes are planned; no Yemot extensions or caller greeting have been changed."
});
const admin = async (req: Request, res: Response, next: (error?: unknown) => void) => {
  try {
    const user = await getCurrentSessionUser(req);
    if (!user || user.role !== "super_admin") { err(res, 403, "Gavhah super administrator only"); return; }
    if (req.method !== "GET" && !isSameOrigin(req)) { err(res, 403, "Same-origin request required"); return; }
    next();
  } catch (e) { next(e); }
};
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: (e?: unknown) => void) => {
    try { await fn(req, res); }
    catch (e) { next(e); }
  };
// All browser-accessible credential operations are super-admin-only.
// This server is the only holder of the provider token; CC does not receive it.
router.get("/admin/yemot/status", requireAuth, admin, wrap(async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(publicStatus(await getRow()));
}));
router.put("/admin/yemot/connection", requireAuth, admin, wrap(async (req, res) => {
  const token = req.body?.token;
  const lineNumber = req.body?.lineNumber;
  if (typeof token !== "string" || token.length < 12 || token.length > 768 ||
      !/^[\x21-\x7e]+$/.test(token) ||
      typeof lineNumber !== "string" || !/^\d{7,15}$/.test(lineNumber)) {
    err(res, 400, "A valid provider token and one numeric hotline number are required");
    return;
  }
  const sealed = encode(token);
  const actor = (await getCurrentSessionUser(req))!.id;
  await pool.query(
    "INSERT INTO " + table + " (id, token_nonce, token_ciphertext, token_tag, line_number, updated_by, enabled, last_verified_at, last_test_at) " +
    "VALUES (1,$1,$2,$3,$4,$5,false,NULL,NULL) ON CONFLICT (id) DO UPDATE SET " +
    "token_nonce=EXCLUDED.token_nonce, token_ciphertext=EXCLUDED.token_ciphertext, token_tag=EXCLUDED.token_tag, " +
    "line_number=EXCLUDED.line_number, updated_by=EXCLUDED.updated_by, enabled=false, " +
    "last_verified_at=NULL, last_test_at=NULL, updated_at=now()",
    [sealed.nonce, sealed.body, sealed.tag, lineNumber, actor]
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ ...publicStatus(await getRow()), message: "Saved encrypted. Provider test required before enabling." });
}));
router.post("/admin/yemot/test", requireAuth, admin, wrap(async (_req, res) => {
  const row = await getRow();
  if (!row) { err(res, 404, "Save the single hotline connection first"); return; }
  // An atomic throttle prevents accidental repeated provider requests.
  const lock = await pool.query(
    "UPDATE " + table + " SET last_test_at=now() WHERE id=1 " +
    "AND (last_test_at IS NULL OR last_test_at < now()-interval '20 seconds') RETURNING id"
  );
  if (!lock.rowCount) { err(res, 429, "Please wait 20 seconds between API tests"); return; }
  let token: string;
  try { token = decode(row); }
  catch { err(res, 503, "Encrypted token cannot be read; verify the server encryption key"); return; }
  let verified = false;
  let templates = 0;
  try {
    const response = await fetch("https://www.call2all.co.il/ym/api/GetTemplates", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ token }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("Provider rejected request");
    const data: any = await response.json();
    if (!data || data.responseStatus !== "OK" || !Array.isArray(data.templates)) throw new Error("Provider validation failed");
    verified = true;
    templates = data.templates.length;
  } catch {
    // If provider verification stops working, revoke the stored verification and disable use.
    await pool.query("UPDATE " + table + " SET enabled=false,last_verified_at=NULL WHERE id=1 AND token_ciphertext=$1", [row.token_ciphertext]);
    res.status(502).json({ connected: false, error: "ימות API connection test failed. Check the provider token and permissions." });
    return;
  } finally { token = ""; }
  if (verified) {
    await pool.query("UPDATE " + table + " SET last_verified_at=now() WHERE id=1 AND token_ciphertext=$1", [row.token_ciphertext]);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ connected: true, readOnly: true, templateCount: templates, lineNumber: row.line_number });
  }
}));
router.patch("/admin/yemot/enabled", requireAuth, admin, wrap(async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") { err(res, 400, "Explicit enabled boolean required"); return; }
  const updated = await pool.query(
    "UPDATE " + table + " SET enabled=$1,updated_at=now() WHERE id=1 " +
    "AND ($1=false OR last_verified_at IS NOT NULL) RETURNING enabled",
    [req.body.enabled]
  );
  if (!updated.rowCount) { err(res, 409, "Save and verify the global connection first"); return; }
  res.json({ enabled: updated.rows[0].enabled });
}));
router.delete("/admin/yemot/connection", requireAuth, admin, wrap(async (req, res) => {
  if (req.body?.confirm !== "REMOVE_GLOBAL_YEMOT_TOKEN") { err(res, 400, "Explicit deletion confirmation required"); return; }
  await pool.query("DELETE FROM " + table + " WHERE id=1");
  res.json({ configured: false, enabled: false });
}));
// A brand-new Yemot line can already contain its default ext.ini. This
// is configuration, not user content. UpdateExtension updates supplied keys
// within ext.ini without deleting the file or unrelated keys. Block when any
// other file, audio message or child extension is present or the current
// extension settings are not clearly the default menu.
function rootPreflight(result:any) {
 const groups=["dirs","files","ini","messages","html"] as const;
 const valid=groups.every(k=>Array.isArray(result?.[k]));
 const counts=Object.fromEntries(groups.map(k=>[k,Array.isArray(result?.[k])?result[k].length:null]));
 const fileName=(x:any)=>String(x?.name??x?.fileName??x?.what??"").split("/").pop()?.toLowerCase()||"";
 const iniNames:string[]=Array.isArray(result?.ini)?result.ini.map(fileName):[];
 const defaultIni=iniNames.every(name=>name==="ext.ini");
 const settings=result?.extIni;
 const keys=(settings&&typeof settings==="object"&&!Array.isArray(settings))?Object.keys(settings):[];
 const allowedSettings=keys.every(k=>["type","title","language"].includes(k)) &&
   (!settings?.type||["menu","playfile"].includes(String(settings.type).toLowerCase()));
 const noContent=valid&&result.dirs.length===0&&result.files.length===0&&
  result.messages.length===0&&result.html.length===0;
 const canInstall=noContent&&defaultIni&&allowedSettings;
 let reason="Root can accept a single API entry without replacing existing content.";
 if(!valid)reason="Provider returned an incomplete root inventory; no changes made.";
 else if(!noContent)reason="Provider has existing folders, files, audio messages or reports; root needs review.";
 else if(!defaultIni)reason="Provider contains non-default .ini settings files; root needs review.";
 else if(!allowedSettings)reason="Provider has non-default root settings; root needs review.";
 return {canInstall,counts,reason,settingKeys:keys.slice(0,30),iniNames:iniNames.slice(0,30)};
}

// Read-only provider inventory before proposing ANY changes to root or child extensions.
router.get("/admin/yemot/provider-directory", requireAuth, admin, wrap(async (req, res) => {
  const requested=typeof req.query.path==="string"?req.query.path:"/";
  if(!/^\/(?:[0-9]{1,3}(?:\/[0-9]{1,3}){0,2})?$/.test(requested)){
    err(res,400,"Only a short numeric extension path is permitted");return;
  }
  const row=await getRow();
  if(!row){err(res,404,"Configure the global hotline first");return;}
  let token:string;
  try{token=decode(row);}catch{err(res,503,"Stored Yemot secret unavailable");return;}
  let result:any;
  try{
    const response=await fetch("https://www.call2all.co.il/ym/api/GetIVR2Dir",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token,path:requested}),
      redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Error("Provider unavailable");
    result=await response.json();
  }catch{
    err(res,502,"Could not read current provider extension directory");return;
  }finally{token="";}
  if(result?.responseStatus!=="OK"){
    err(res,502,"Provider declined the read-only directory inspection");return;
  }
  // GetIVR2Dir uses separate dirs and files arrays. Never mistake a nonempty
  // directory for a free test extension simply because the files list is empty.
  const dirs=Array.isArray(result.dirs)?result.dirs:[];
  const files=Array.isArray(result.files)?result.files:[];
  const ini=Array.isArray(result.ini)?result.ini:[];
  // Unknown provider response schemas must fail CLOSED.
  if(!Array.isArray(result.dirs)||!Array.isArray(result.files)){
    err(res,502,"Provider directory response does not contain verified dirs/files arrays");
    return;
  }
  const safeName=(x:any)=>String(x?.name??x?.fileName??x?.what??"").slice(0,100);
  const groups=[
    {items:dirs,label:"directory"},{items:files,label:"file"},
    {items:ini,label:"ini"},{items:Array.isArray(result.messages)?result.messages:[],label:"audio/message"},
    {items:Array.isArray(result.html)?result.html:[],label:"html"}
  ];
  const entries=groups.flatMap(g=>g.items.slice(0,60).map((x:any)=>({
    name:safeName(x),type:g.label
  }))).filter(x=>x.name&&!x.name.includes("\\0"));
  const preflight=requested==="/"?rootPreflight(result):null;
  res.setHeader("Cache-Control","private, no-store");
  res.json({path:requested,entries,responseOk:true,
    providerTotal:groups.reduce((count,g)=>count+g.items.length,0),
    totalDirectories:dirs.length,totalFiles:files.length,totalSettings:ini.length,
    truncated:groups.some(g=>g.items.length>60),preflight,
    safeToOverwrite:false,
    note:"Read only. A default ext.ini does not itself mean a previous user configured the hotline. No content is deleted."});
}));


// Child-only install, explicitly owner-approved. NEVER write the root ext.ini,
// modify an existing extension, delete content, or infer "unused" from an
// absent ext.ini alone. The existing line has 15 folders + 104 messages.
router.get("/admin/yemot/installation", requireAuth, admin, wrap(async(_req,res)=>{
 const status=await pool.query(
  "SELECT line_number,state,provider_summary,safe_message,updated_at FROM public.gavhah_yemot_ivr_install WHERE id=1");
 res.setHeader("Cache-Control","private, no-store");
 res.json(status.rows[0]||{state:"not_queued"});
}));
// Fail closed on the former root installer route even if stale phone/browser
// bundles continue calling it.
router.post("/admin/yemot/install-root", requireAuth, admin, wrap(async(_req,res)=>{
 err(res,410,"Root installation is permanently disabled. Use add-only isolated extension.");
}));
router.post("/admin/yemot/install-child",requireAuth,admin,wrap(async(req,res)=>{
 const line="6055621286";
 if(req.body?.confirm!=="ADD_ONLY_6055621286"){
  err(res,400,"Explicit approval to add only an unused child extension required");return;
 }
 const provider=await getRow();
 if(!provider||provider.line_number!==line||!provider.last_verified_at){
  err(res,409,"Saved, tested Yemot connection must correspond to 6055621286");return;
 }
 // Single install attempt at a time. A blocked previously ambiguous write must
 // be inspected and not blindly retried.
 const locked=await pool.query(
  "UPDATE public.gavhah_yemot_ivr_install SET state='installing',"+
  "safe_message='Checking existing provider folders without changing any files',updated_at=now() "+
  "WHERE id=1 AND line_number=$1 AND state IN ('queued','blocked') RETURNING id",
  [line]);
 if(!locked.rowCount){
  err(res,409,"Installation is already running or provider acceptance already recorded");return;
 }
 let providerAccepted=false;
 let token="";
 let candidate="";
 try{
  token=decode(provider);
  const callProvider=async(action:string,params:Record<string,string>)=>{
   const body=new URLSearchParams({token,...params});
   const r=await fetch("https://www.call2all.co.il/ym/api/"+action,{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
    body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)
   });
   if(!r.ok)throw Error("Yemot "+action+" network or permission error");
   return await r.json() as any;
  };
  const root=await callProvider("GetIVR2Dir",{path:"/"});
  if(root?.responseStatus!=="OK"||!Array.isArray(root.dirs)||
    !Array.isArray(root.files)||!Array.isArray(root.ini)||!Array.isArray(root.messages)||
    !Array.isArray(root.html)){
   throw Error("Could not safely read complete provider root listing");
  }
  const known=new Set<string>();
  for(const entry of root.dirs){
   const name=typeof entry==="string"?entry:String(entry?.name??entry?.fileName??entry?.path??entry?.what??entry?.dir??"");
   const trimmed=name.trim().replace(/\/+$/,"");
   if(!trimmed)throw Error("Provider returned an unnamed directory; cannot safely select a free extension.");
   const number=trimmed.split(/[/:]/).pop()||"";
   // Names like 'system' or 'recordings' are valid existing folders, but can
   // never collide with a purely numeric candidate. Preserve them unchanged.
   if(/^[0-9]{1,3}$/.test(number))known.add(number);
  }
  const choices=["99","98","97","96","95","94","93","92","91","90",
                 "899","898","897","896","895","894","893","892","891","890"];
  candidate=choices.find(x=>!known.has(x))||"";
  if(!candidate)throw Error("No unused child extension in the reserved candidate pool");
  const check=await callProvider("CheckIfFileExists",{path:"ivr2:"+candidate+"/ext.ini"});
  if(check?.responseStatus!=="OK"||check?.fileExists!==false){
   throw Error("Candidate child extension is not confirmed empty. No changes made.");
  }
  const callbackSecret=randomBytes(32).toString("hex");
  const callbackHash=createHash("sha256").update(callbackSecret).digest("hex");
  await pool.query(
   "UPDATE public.gavhah_yemot_ivr_install SET callback_hash=$1,"+
   "target_path=$2,provider_summary=$3::jsonb,updated_at=now() WHERE id=1",
   [callbackHash,"/"+candidate,JSON.stringify({
    rootFolders:root.dirs.length,rootMessages:root.messages.length,
    rootFiles:root.files.length,rootSettings:root.ini.length,
    reservedChild:"/"+candidate,addOnly:true,noRootChanges:true
   })]);
  const answer=await callProvider("UpdateExtension",{
   path:"ivr2:"+candidate,type:"api",title:"Gavhah API Gateway",
   api_link:"https://gavhah.onrender.com/api/yemot/ivr",api_url_post:"yes",
   api_add_0:"entryKey="+callbackSecret,language:"en"
  });
  if(answer?.responseStatus!=="OK")throw Error("Yemot did not accept the new child extension");
  providerAccepted=true;
  await pool.query("UPDATE public.gavhah_yemot_global SET enabled=true,updated_at=now() "+
   "WHERE id=1 AND last_verified_at IS NOT NULL");
  await pool.query("UPDATE public.gavhah_yemot_ivr_install SET state='live',"+
   "safe_message=$1,provider_summary=provider_summary||$2::jsonb,updated_at=now() WHERE id=1",
   ["Provider accepted NEW add-only extension /"+candidate+
      "; root unchanged. Verify access through existing root navigation.",
    JSON.stringify({providerAccepted:true,phoneCallVerified:false})]);
  res.setHeader("Cache-Control","private,no-store");
  res.json({providerAccepted:true,rootUntouched:true,extension:"/"+candidate,
   callTestVerified:false,
   message:"Yemot accepted NEW extension /"+candidate+
     ". Existing root, folders and recordings untouched. Test accessing extension "+
     candidate+" from the existing root menu. Exact DTMF routing needs phone verification."});
 }catch(e){
  const diagnostic=e instanceof Error?e.message:"Unknown provider install failure";
  // An ambiguous network response may have created the extension. The next
  // attempt must see that extension listed and refuse to overwrite it.
  await pool.query("UPDATE public.gavhah_yemot_ivr_install SET state='blocked',"+
   "safe_message=$1,provider_summary=provider_summary||$2::jsonb,updated_at=now() WHERE id=1",
   [diagnostic.slice(0,165),JSON.stringify({lastCandidate:candidate||null,providerAccepted})]).catch(()=>{});
  if(!providerAccepted){
   await pool.query("UPDATE public.gavhah_yemot_global SET enabled=false WHERE id=1").catch(()=>{});
  }
  res.status(409).json({providerAccepted,rootUntouched:true,
   error:"Add-only installation stopped: "+diagnostic.slice(0,140)});
 }finally{token="";}
}));

// The reverse service endpoint exposes status only, NEVER the hotline token or caller lists.
// Disabled unless both Render instances intentionally share a 32+ byte secret.
router.get("/yemot/service/status", wrap(async (req, res) => {
  const configured = process.env.YEMOT_CENTRAL_SHARED_SECRET || "";
  const provided = req.get("x-gavhah-connect-secret") || "";
  const a = Buffer.from(configured), b = Buffer.from(provided);
  if (configured.length < 32 || a.length !== b.length || !timingSafeEqual(a,b)) {
    err(res, 403, "Service access denied"); return;
  }
  const row = await getRow();
  res.setHeader("Cache-Control", "no-store");
  res.json({ connectedToGlobalProvider: !!row?.enabled && !!row?.last_verified_at, configured: !!row, routes: ["gavhah", "campaign-center"], lineNumber: row?.line_number ?? null });
}));
/**
 * Owner-only Cloudflare cutover of the EXISTING root API callback.
 * Never change the hotline's number, child extensions, audio, recordings,
 * provider token, any settings other than root api_link, or SignalWire.
 * Fail closed if provider state differs from the saved Render baseline.
 */
const cloudflareIvrCallback="https://gavhah-cloudflare-native.keygovhh.workers.dev/api/yemot/ivr";
const previousIvrCallback="https://gavhah.onrender.com/api/yemot/ivr";
const cloudflareSwitchPath="/admin/yemot/cloudflare-switch";
type ProviderText={responseStatus?:string;contents?:string;message?:string};
async function yemotProviderCall(token:string,action:"GetTextFile"|"UpdateExtension",params:Record<string,string>){
 const response=await fetch("https://www.call2all.co.il/ym/api/"+action,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
  body:new URLSearchParams({token,...params}),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(18000)
 });
 if(!response.ok)throw Error("ימות provider request failed");
 const json=await response.json() as ProviderText;
 if(json?.responseStatus!=="OK")throw Error("ימות provider did not accept "+action);
 return json;
}
async function readProviderRoot(token:string){
 const result=await yemotProviderCall(token,"GetTextFile",{what:"ivr2:/ext.ini"});
 const raw=result.contents;
 if(typeof raw!=="string"||raw.length<10||raw.length>150000)throw Error("Unrecognised provider root configuration");
 const props:Record<string,string>={};
 for(const record of raw.split(/\r?\n/)){
  const trimmed=record.trim();
  if(!trimmed||trimmed.startsWith("#")||trimmed.startsWith(";"))continue;
  const equal=trimmed.indexOf("=");
  if(equal<1)continue;
  const key=trimmed.slice(0,equal).trim();
  if(!["type","api_link","api_add_0","api_url_post"].includes(key))continue;
  if(Object.prototype.hasOwnProperty.call(props,key))throw Error("Duplicate protected Yemot root setting");
  props[key]=trimmed.slice(equal+1).trim();
 }
 return props;
}
function verifiedProviderRoot(props:Record<string,string>,savedDigest:string){
 const credential=String(props.api_add_0||"");
 const supplied=credential.startsWith("entryKey=")?credential.slice("entryKey=".length):"";
 if(!/^[0-9a-f]{64}$/i.test(supplied))return false;
 const hashed=createHash("sha256").update(supplied).digest("hex");
 const a=Buffer.from(hashed,"hex"),b=Buffer.from(String(savedDigest||""),"hex");
 return a.length===32&&b.length===32&&timingSafeEqual(a,b)&&
   props.type==="api"&&["yes","true","1"].includes(String(props.api_url_post||"").toLowerCase());
}
async function getLiveCloudflareSwitchStatus(){
 const [installed,provider]=await Promise.all([
  pool.query("SELECT state,target_path,callback_hash,provider_summary->>'apiEndpoint' AS saved_callback FROM public.gavhah_yemot_ivr_install WHERE id=1"),
  pool.query("SELECT line_number,enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1")
 ]);
 const i=installed.rows[0],g=provider.rows[0];
 return {
  ready:!!i&&!!g&&g.line_number==="6055621286"&&!!g.enabled&&!!g.last_verified_at&&
    i.state==="live"&&i.target_path==="/"&&/^[0-9a-f]{64}$/i.test(String(i.callback_hash||"")),
  configuredCallback:i?.saved_callback||null,cloudflareCallback:cloudflareIvrCallback,
  note:"Saved provider callback is not independently verified until the read-only inspection succeeds."
 };
}
// Human-facing admin page: a new phone browser starts without a session.
// Send it through the existing same-origin sign-in flow. The `return`
// parameter is a fixed local path, NOT user-supplied (no open redirect).
// The actual page and all cutover actions remain super-admin protected.
router.get(cloudflareSwitchPath,async(req,res,next)=>{
 try{
  const user=await getCurrentSessionUser(req);
  if(!user){
   res.set("Cache-Control","no-store");
   res.redirect(303,"/login?return=%2Fapi%2Fadmin%2Fyemot%2Fcloudflare-switch");
   return;
  }
  next();
 }catch(error){next(error);}
});
router.get(cloudflareSwitchPath,requireAuth,admin,wrap(async(_req,res)=>{
 const status=await getLiveCloudflareSwitchStatus();
 const html=String.raw`<!doctype html>
<html lang="yi" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="referrer" content="no-referrer"><title>גבהה — ימות צו Cloudflare</title>
<style>body{background:#f3f6fa;color:#16243a;font:16px/1.6 system-ui,Arial,sans-serif;margin:0;padding:24px}main{max-width:650px;margin:auto;background:white;padding:24px;border:1px solid #dbe3ee;border-radius:18px}h1{font-size:23px}button{border:0;background:#164f8a;color:white;border-radius:9px;padding:12px 17px;margin:8px 0 8px 8px;font-size:16px;cursor:pointer}button:disabled{background:#91a4b8}.ghost{background:#e6eef8;color:#173c67}.status{background:#edf2f7;border-radius:8px;padding:12px;margin:14px 0;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#43536a}code{direction:ltr;display:block;text-align:left;overflow-wrap:anywhere}a{color:#164f8a}</style></head>
<body><main><h1>גבהה — ימות־המשיח אויף Cloudflare</h1>
<p>די עקזיסטירנדע טעלעפאן נומער, מעניוס, ריקארדירונגען און עקסטענשאנס בלייבן. נאר דער API־Callback ווערט געטוישט פון Render צו Cloudflare, נאכן דורכקוקן דעם עכטן ימות־חשבון.</p>
<small>דער פראוויידער־ענדערונג איז אומקערבאר דורך דער אלטער באשטעטיגטער לינק. קיין פארוואלטונג־פעסווארד ווערט נישט געוויזן.</small>
<div class="status" id="state">איצטיקער אפגעהיטענער Callback: <code id="callback">Loading</code></div>
<button class="ghost" id="check">1. זיכערהייט־דורכקוק</button>
<button id="activate" disabled>2. באשטעטיגן — ימות צו Cloudflare</button>
<p><a href="/founder">צוריק צום אדמיניסטראציע־דעשבאורד</a></p>
<script>
const check=document.getElementById('check'),go=document.getElementById('activate'),box=document.getElementById('state');
const route='/api/admin/yemot/cloudflare-switch';
const csrf={'Content-Type':'application/json'};
document.getElementById('callback').textContent=${JSON.stringify(status.configuredCallback).replace(/</g,'\\u003c')};
check.onclick=async()=>{check.disabled=true;go.disabled=true;box.textContent='איך פרוף דעם עכטן ימות־Callback...';
try{const r=await fetch(route+'/verify',{credentials:'same-origin',cache:'no-store'});const j=await r.json();box.textContent=(j.error||j.message||JSON.stringify(j));if(r.ok&&j.safeToSwitch)go.disabled=false;}
catch{box.textContent='דורכקוק נישט געלונגען; קיין ענדערונג נישט געמאכט.'}finally{check.disabled=false;}};
go.onclick=async()=>{if(!window.confirm('ביסטו זיכער? נאר דער עקזיסטירנדע ימות API־Callback ווערט געטוישט צו Cloudflare.'))return;
go.disabled=true;box.textContent='שיק די פארלאנג צום ימות־פראוויידער...';
try{const r=await fetch(route,{method:'POST',credentials:'same-origin',headers:csrf,body:JSON.stringify({confirm:'SWITCH_ONLY_YEMOT_TO_CLOUDFLARE'})});const j=await r.json();box.textContent=(j.error||j.message||JSON.stringify(j));}catch{box.textContent='נישט באשטעטיגט; קוק נאך דעם פראוויידער איידער איבערפרובירן.';}};
</script></main></body></html>`;
 res.set("Cache-Control","private, no-store").set("Content-Security-Policy","default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'");
 res.type("html").send(html);
}));
router.get(cloudflareSwitchPath+"/verify",requireAuth,admin,wrap(async(_req,res)=>{
 const status=await getLiveCloudflareSwitchStatus();
 if(!status.ready){err(res,409,"Stored Yemot connection is not ready for an isolated cutover");return;}
 const row=await getRow();
 if(!row){err(res,409,"Provider token unavailable");return;}
 const token=decode(row);
 const root=await readProviderRoot(token);
 const c=await pool.query("SELECT callback_hash FROM public.gavhah_yemot_ivr_install WHERE id=1");
 const keyOk=verifiedProviderRoot(root,c.rows[0]?.callback_hash||"");
 const providerEndpoint=root.api_link||null;
 const safeToSwitch=keyOk&&providerEndpoint===previousIvrCallback&&
    status.configuredCallback===previousIvrCallback;
 res.set("Cache-Control","private, no-store");
 res.json({safeToSwitch,providerCallback:providerEndpoint,cloudflareCallback:cloudflareIvrCallback,
  savedCallback:status.configuredCallback,credentialsMatch:keyOk,
  message:safeToSwitch?"The current Yemot root and pairing key match; changing only api_link is permitted.":
   "Provider settings have changed or are not verified. No modification is permitted."});
}));
router.post(cloudflareSwitchPath,requireAuth,admin,wrap(async(req,res)=>{
 // This is an authenticated, explicit single-purpose owner action, not
 // a public callback. Cross-site and missing-Origin requests are rejected.
 if(!req.get("origin")||!isSameOrigin(req)||req.body?.confirm!=="SWITCH_ONLY_YEMOT_TO_CLOUDFLARE"){
  err(res,403,"Same-origin owner confirmation required");return;
 }
 const lock=await pool.connect();
 let providerModified=false;
 let originalCallback=previousIvrCallback;
 let providerToken="";
 try{
  await lock.query("BEGIN");
  const installation=await lock.query(
   "SELECT state,target_path,callback_hash,provider_summary->>'apiEndpoint' AS saved_callback "+
   "FROM public.gavhah_yemot_ivr_install WHERE id=1 FOR UPDATE");
  const item=installation.rows[0];
  const globals=await lock.query(
   "SELECT line_number,enabled,last_verified_at,token_nonce,token_ciphertext,token_tag "+
   "FROM public.gavhah_yemot_global WHERE id=1");
  const conn=globals.rows[0] as ProviderRow|undefined;
  if(!item||item.state!=="live"||item.target_path!=="/"||
    !conn||conn.line_number!=="6055621286"||!conn.enabled||!conn.last_verified_at){
   throw Error("Existing Yemot root is not in the expected verified state");
  }
  if(item.saved_callback===cloudflareIvrCallback){
   await lock.query("COMMIT");
   res.json({ok:true,alreadyConfigured:true,message:"Cloudflare is already recorded; verify the real phone with a physical call."});return;
  }
  if(item.saved_callback!==previousIvrCallback)throw Error("Saved callback differs; no write permitted");
  // Confirm the line's original API pairing secret is intact.
  providerToken=decode(conn);
  const before=await readProviderRoot(providerToken);
  if(!verifiedProviderRoot(before,item.callback_hash)||
     before.api_link!==previousIvrCallback){
   throw Error("Provider root callback or secure pairing key differs. Stop without changes.");
  }
  const changed=await yemotProviderCall(providerToken,"UpdateExtension",{
   path:"ivr2:/",type:"api",api_link:cloudflareIvrCallback
  });
  if(changed.responseStatus!=="OK")throw Error("Yemot declined root callback update");
  providerModified=true;
  const after=await readProviderRoot(providerToken);
  if(after.api_link!==cloudflareIvrCallback||
     !verifiedProviderRoot(after,item.callback_hash)){
   throw Error("New provider callback or pairing secret not verified after update");
  }
  await lock.query(
   "UPDATE public.gavhah_yemot_ivr_install SET "+
   "provider_summary=provider_summary||jsonb_build_object('apiEndpoint',$1,'cloudflareCutoverVerifiedAt',now(),'previousCallback',$2),"+
   "safe_message='Provider callback switched to Cloudflare and read back. Physical telephone test still required.',updated_at=now() WHERE id=1",
   [cloudflareIvrCallback,previousIvrCallback]);
  await lock.query("COMMIT");
  res.set("Cache-Control","no-store");
  res.json({ok:true,providerVerified:true,message:"Yemot now points at Cloudflare. The API key, root content and recordings were preserved. Complete a real telephone test.",callback:cloudflareIvrCallback,physicalCallTest:false});
 }catch(e){
  await lock.query("ROLLBACK").catch(()=>{});
  // The only provider field we changed is api_link. Restore that field if
  // the provider accepted but the read-back or database update failed.
  let rolledBack=!providerModified;
  if(providerModified&&providerToken){
   try{
    await yemotProviderCall(providerToken,"UpdateExtension",{
     path:"ivr2:/",type:"api",api_link:originalCallback
    });
    const check=await readProviderRoot(providerToken);
    rolledBack=check.api_link===originalCallback;
   }catch{rolledBack=false;}
  }
  if(!rolledBack){
   await pool.query("UPDATE public.gavhah_yemot_ivr_install SET "+
     "provider_summary=provider_summary||jsonb_build_object('cloudflareCutoverUncertain',true),"+
     "safe_message='Cloudflare callback modification uncertain; manually inspect Yemot root ext.ini before retry.',updated_at=now() WHERE id=1").catch(()=>{});
  }
  res.status(409).json({ok:false,rolledBack,error:rolledBack?
   "The provider settings did not match or cutover verification failed; previous callback was preserved.":
   "Provider result uncertain. Manual inspection required; do NOT retry blindly."});
 }finally{providerToken="";lock.release();}
}));

export default router;
