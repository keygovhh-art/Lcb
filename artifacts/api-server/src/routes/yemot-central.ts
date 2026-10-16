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
  const entries=[
    ...dirs.slice(0,100).map((x:any)=>({name:safeName(x),type:"directory"})),
    ...files.slice(0,100).map((x:any)=>({name:safeName(x),type:String(x.fileType??"file").slice(0,25)}))
  ].filter(x=>x.name&&!x.name.includes("\\0"));
  res.setHeader("Cache-Control","private, no-store");
  res.json({path:requested,entries,responseOk:true,
    providerTotal:dirs.length+files.length+ini.length,
    totalDirectories:dirs.length,totalFiles:files.length,totalSettings:ini.length,
    truncated:dirs.length>100||files.length>100,
    safeToOverwrite:false,
    note:"Read only. A missing directory in a partial listing is not proof that it is safe to create or replace."});
}));


// Install exactly ONE provider-side root API gateway after a conscious action
// by the signed-in Gavhah super administrator. Never modify provider menus
// automatically during startup, and never modify any nested extension.
router.get("/admin/yemot/installation", requireAuth, admin, wrap(async(_req,res)=>{
  const status=await pool.query(
    "SELECT line_number,state,provider_summary,safe_message,updated_at FROM public.gavhah_yemot_ivr_install WHERE id=1");
  res.setHeader("Cache-Control","private, no-store");
  res.json(status.rows[0]||{state:"not_queued"});
}));
router.post("/admin/yemot/install-root",requireAuth,admin,wrap(async(req,res)=>{
  const line="6055621286";
  if(req.body?.confirm!=="INSTALL_EMPTY_6055621286"){
    err(res,400,"Explicit confirmation for the new empty 6055621286 hotline required");return;
  }
  const row=await getRow();
  if(!row||row.line_number!==line||!row.last_verified_at){
    err(res,409,"Configured and verified hotline must be 6055621286");return;
  }
  const lock=await pool.query(
    "UPDATE public.gavhah_yemot_ivr_install SET state='installing',"+
    "safe_message='Checking provider root before installation',updated_at=now() "+
    "WHERE id=1 AND line_number=$1 AND state IN ('queued','blocked') RETURNING id",
    [line]);
  if(!lock.rowCount){
    err(res,409,"Hotline installation was already started or completed");return;
  }
  let providerAccepted=false;
  let token="";
  try{
    token=decode(row);
    const callProvider=async(action:string,params:Record<string,string>)=>{
      const response=await fetch("https://www.call2all.co.il/ym/api/"+action,{
        method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({token,...params}),redirect:"error",cache:"no-store",
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok)throw Error("Could not reach Yemot provider API");
      const data:any=await response.json();
      if(data?.responseStatus!=="OK")throw Error("Yemot declined the "+action+" request");
      return data;
    };
    // Official GetIVR2Dir ROOT path is "/", NOT "ivr2:/".
    const inventory=await callProvider("GetIVR2Dir",{path:"/"});
    if(!Array.isArray(inventory.dirs)||!Array.isArray(inventory.files)||
       !Array.isArray(inventory.ini)||!Array.isArray(inventory.messages)||
       !Array.isArray(inventory.html)){
      throw Error("Provider returned incomplete root inventory. Nothing changed.");
    }
    if(inventory.dirs.length||inventory.files.length||inventory.ini.length||
       inventory.messages.length||inventory.html.length){
      throw Error("Provider root is not empty. Refusing to replace any existing files.");
    }
    if(inventory.extIni&&typeof inventory.extIni==="object"&&
       Object.keys(inventory.extIni).some(key=>!["title","language"].includes(key))){
      throw Error("Root already has extension settings. Refusing to replace them.");
    }
    // The voice callback is identified by a random key sent only to Yemot's
    // provider-side root settings; the app stores its SHA-256 digest.
    const callbackSecret=randomBytes(32).toString("hex");
    const callbackHash=createHash("sha256").update(callbackSecret).digest("hex");
    await pool.query(
      "UPDATE public.gavhah_yemot_ivr_install SET callback_hash=$1,"+
      "safe_message='Provider root verified empty; preparing API gateway',updated_at=now() WHERE id=1",
      [callbackHash]);
    await callProvider("UpdateExtension",{
      path:"ivr2:/",type:"api",title:"Gavhah and Campaign Center",
      api_link:"https://gavhah.onrender.com/api/yemot/ivr",api_url_post:"yes",
      api_add_0:"entryKey="+callbackSecret,language:"en"
    });
    providerAccepted=true;
    await pool.query("UPDATE public.gavhah_yemot_global SET enabled=true,updated_at=now() WHERE id=1 AND last_verified_at IS NOT NULL");
    await pool.query("UPDATE public.gavhah_yemot_ivr_install SET state='live',"+
      "safe_message='Yemot acknowledged root API gateway; a real telephone call is still required',"+
      "provider_summary=$1::jsonb,updated_at=now() WHERE id=1",
      [JSON.stringify({providerAccepted:true,callerVerified:false,rootApiOnly:true,number:line})]);
    res.setHeader("Cache-Control","private, no-store");
    res.json({installedByProvider:true,phoneCallVerified:false,lineNumber:line,
      message:"Yemot accepted the single API bridge. Call 6055621286 to verify the English welcome."});
  }catch(e){
    const safe=e instanceof Error?e.message:"Provider installation was not completed";
    // A network timeout after a provider write is ambiguous; do not retry
    // without another provider inspection. No implicit second write.
    await pool.query("UPDATE public.gavhah_yemot_ivr_install SET state='blocked',"+
      "safe_message=$1,updated_at=now() WHERE id=1",[safe.slice(0,160)]).catch(()=>{});
    if(!providerAccepted){
      await pool.query("UPDATE public.gavhah_yemot_global SET enabled=false WHERE id=1").catch(()=>{});
    }
    res.status(409).json({installedByProvider:providerAccepted,phoneCallVerified:false,
      error:"Installation stopped: "+safe.slice(0,140)});
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
