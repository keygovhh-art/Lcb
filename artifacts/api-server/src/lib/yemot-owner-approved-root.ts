import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const LINE = "6055621286";
const ROOT = "ivr2:";
const WEBHOOK = "https://gavhah.onrender.com/api/yemot/ivr";
const PROVIDER = "https://www.call2all.co.il/ym/api/";
type Credential = {
  token_nonce: string;
  token_ciphertext: string;
  token_tag: string;
  line_number: string;
  last_verified_at: Date | null;
};

function decryptProviderToken(stored: Credential): string {
  const keyText = process.env.YEMOT_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(keyText, "base64");
  if (key.length !== 32 || key.toString("base64") !== keyText)
    throw Error("Provider encryption key unavailable");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.token_nonce, "base64"));
  decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
  decipher.setAuthTag(Buffer.from(stored.token_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(stored.token_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

async function provider(token:string, method:string, data:Record<string,string>):Promise<any> {
  // Form encoded is the provider's standard REST API request format.
  // No secrets are written to logs or GitHub.
  const body = new URLSearchParams({ token, ...data });
  const response = await fetch(PROVIDER+method, {
    method:"POST",
    body,
    headers: {
      "Content-Type":"application/x-www-form-urlencoded",
      "Accept":"application/json"
    },
    redirect:"error",
    cache:"no-store",
    signal:AbortSignal.timeout(18000)
  });
  if (!response.ok) throw Error("Yemot "+method+" HTTP "+response.status);
  const result:any = await response.json();
  if (result?.responseStatus !== "OK")
    throw Error("Yemot "+method+" rejected request");
  return result;
}

/**
 * Runs ONCE after the app is listening, only for the owner's explicit queued
 * approval of the main menu. This is deliberately NOT a generic installer:
 *
 * - Never deletes/moves/rewrites any audio, files, folders or child extensions.
 * - Does not condition root activation on existing provider content.
 * - UpdateExtension changes ONLY these named ext.ini settings; other settings
 *   and files remain untouched. Changing type=api replaces how NEW incoming
 *   calls navigate the root; this is exactly what the owner authorized.
 * - A single root API callback displays "1 Gavhah, 2 Campaign Center"; all
 *   children and action state are controlled by our server, NOT child menus.
 */
export async function activateOwnerApprovedYemotRoot():Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  let claimed=false;
  let requestAttempted=false;
  let providerAccepted=false;
  let token="";
  try {
    const queued=await pool.query(
      "UPDATE public.gavhah_yemot_ivr_install "+
      "SET state='installing',safe_message='Owner-approved root API install: no file deletions',updated_at=now() "+
      "WHERE id=1 AND line_number=$1 AND target_path='/' AND state='queued' RETURNING id",
      [LINE]);
    if (!queued.rowCount) return;
    claimed=true;

    const record=await pool.query<Credential>(
      "SELECT token_nonce,token_ciphertext,token_tag,line_number,last_verified_at "+
      "FROM public.gavhah_yemot_global WHERE id=1");
    const credentials=record.rows[0];
    if (!credentials || credentials.line_number !== LINE || !credentials.last_verified_at)
      throw Error("The saved Yemot account is not verified for the specified line");
    token=decryptProviderToken(credentials);

    // Existing 15 folders / 104 messages do NOT disqualify the root.
    // This read is diagnostics only, never a reason to delete old content.
    let previous:Record<string,number|null>={};
    try{
      const before=await provider(token,"GetIVR2Dir",{path:"/"});
      for(const key of ["dirs","files","ini","messages","html"]) {
        previous[key]=Array.isArray(before[key])?before[key].length:null;
      }
    }catch {
      previous={inventory:"unavailable"} as unknown as Record<string,number|null>;
    }

    const secret=randomBytes(32).toString("hex");
    const digest=createHash("sha256").update(secret).digest("hex");
    // The callback authenticates against the digest only. The plaintext is
    // given directly to Yemot in the new api_add_0 setting, not our DB.
    await pool.query(
      "UPDATE public.gavhah_yemot_ivr_install "+
      "SET callback_hash=$1,provider_summary=$2::jsonb,updated_at=now() WHERE id=1",
      [digest,JSON.stringify({
        ownerApprovedRoot:true,
        rootMenu:{ "1":"Gavhah", "2":"Campaign Center" },
        existingContentIgnored:true,
        existingInventory:previous,
        noFileDelete:true, requestAttempted:false
      })]);

    // Enable before the remote write so immediate first phone calls can
    // reach the authenticated /api/yemot/ivr handler.
    await pool.query(
      "UPDATE public.gavhah_yemot_global SET enabled=true,updated_at=now() "+
      "WHERE id=1 AND last_verified_at IS NOT NULL");

    requestAttempted=true;
    await provider(token,"UpdateExtension",{
      path:ROOT,
      type:"api",
      title:"Gavhah and Campaign Center",
      api_link:WEBHOOK,
      api_url_post:"yes",
      api_add_0:"entryKey="+secret,
      language:"en",
      api_hangup_send:"no"
    });
    providerAccepted=true;
    // Confirm remote provider call was accepted; never pretend to have
    // verified spoken welcome or DTMF on a physical phone call.
    await pool.query(
      "UPDATE public.gavhah_yemot_ivr_install "+
      "SET state='live',safe_message=$1,provider_summary=provider_summary||$2::jsonb,updated_at=now() WHERE id=1",
      ["Yemot accepted root type=api. Existing folders and recordings were NOT deleted. Call test needed.",
        JSON.stringify({providerAccepted:true,requestAttempted:true,physicalCallTest:false,root:"/",apiEndpoint:WEBHOOK})]);
    logger.info({line:"***1286",type:"api",root:true},"Owner-approved Yemot root API installation accepted");
  } catch (error) {
    if (!claimed) {
      logger.warn({details:"Root install queue unavailable"},"Yemot install not started");
      return;
    }
    const reason=error instanceof Error?error.message.slice(0,155):"Unexpected provider error";
    // No automatic retry after an ambiguous UpdateExtension network timeout;
    // doing so could generate a new callback secret while the old one is live.
    await pool.query(
      "UPDATE public.gavhah_yemot_ivr_install SET state='blocked', "+
      "safe_message=$1,provider_summary=provider_summary||$2::jsonb,updated_at=now() WHERE id=1",
      ["Root API setup stopped: "+reason,JSON.stringify({requestAttempted,providerAccepted,ownerApprovedRoot:true})]
    ).catch(()=>{});
    if (!requestAttempted) {
      await pool.query("UPDATE public.gavhah_yemot_global SET enabled=false WHERE id=1").catch(()=>{});
    }
    logger.warn({reason,requestAttempted,providerAccepted},"Owner-approved root activation not confirmed");
  } finally { token=""; }
}
