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
   const name=typeof entry==="string"?entry:String(entry?.name??entry?.fileName??entry?.path??entry?.what??"");
   const trimmed=name.trim().replace(/\/+$/,"");
   const number=trimmed.split(/[/:]/).pop()||"";
   if(!/^[0-9]{1,3}$/.test(number)){
    throw Error("Unrecognized root extension name. Refusing to choose a slot.");
   }
   known.add(number);
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
export default router;
