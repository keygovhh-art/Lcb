import { Router, type Request, type Response } from "express";
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
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
