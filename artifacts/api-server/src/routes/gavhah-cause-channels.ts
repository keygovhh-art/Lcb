import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAdmin,requireAuth,getCurrentSessionUser,getSessionUserId} from "../middlewares/auth";
import {notifyUser,notifyStaff} from "../lib/notify";

const router=Router();
type Channel="united"|"daily";
type Purpose="announcement"|"join";
const channel=(v:unknown):Channel|null=>v==="united"||v==="daily"?v:null;
const purpose=(v:unknown):Purpose|null=>v==="announcement"||v==="join"?v:null;
const voicePath=(v:string):boolean=>/^ivr2:\/(?:[\w-]+\/){0,8}[\w-]+\.wav$/i.test(v);
function sameOrigin(req:Request):boolean{
 if(req.get("sec-fetch-site")==="cross-site")return false;
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin)return false; // Browser writes must carry an Origin.
 try{return !!host&&new URL(origin).protocol==="https:"&&new URL(origin).host===host;}
 catch{return false;}
}
function messageOK(s:string):boolean{return s.length<=4000&&!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s);}
function englishTts(s:string):boolean{
 return s.length<=3000&&/^[\x20-\x7E\n\r]*$/.test(s);
}
const MIME=["audio/webm","audio/ogg","audio/wav","audio/mpeg"];
function bytesFromSubmission(x:unknown,mime:unknown):{bytes:Buffer|null,mime:string|null}|null{
 if(x===undefined||x===null||x==="")return {bytes:null,mime:null};
 if(typeof x!=="string"||x.length>4_200_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(x))return null;
 const type=String(mime||"").toLowerCase().split(";")[0];
 if(!MIME.includes(type))return null;
 const bytes=Buffer.from(x,"base64");
 if(bytes.length<256||bytes.length>3*1024*1024)return null;
 const valid=type==="audio/webm"?bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])):
  type==="audio/ogg"?bytes.toString("ascii",0,4)==="OggS":
  type==="audio/wav"?bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WAVE":
  bytes.toString("ascii",0,3)==="ID3"||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
 return valid?{bytes,mime:type}:null;
}
function safeCheckoutUrl(value:unknown):string|null{
 if(value===null||value==="")return null;
 if(typeof value!=="string"||value.length>1000)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.port||
     /^(localhost|\d+\.\d+\.\d+\.\d+|.*\.local)$/i.test(u.hostname))return null;
  return u.toString();
 }catch{return null;}
}
export async function readCauseChannel(client:{query:(sql:string,values?:unknown[])=>Promise<{rows:any[]}>},which:Channel){
 const settings=(await client.query("SELECT channel,enabled,active_charity_id,phone_before_news,website_before_news,"+
  "website_autoplay,announcement_mode,join_mode,donation_hotline,donation_instructions_en,payment_adapter,checkout_url "+
  "FROM public.gavhah_cause_channels WHERE channel=$1",[which])).rows[0];
 if(!settings)return null;
 const c=which==="united"?(await client.query(
  "SELECT id,title,description,organizer_name,goal_amount,supporter_count,amount_raised,location,deadline "+
  "FROM public.featured_causes WHERE status='active' ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0]:
 (await client.query(
  "SELECT id,name AS title,description,goal_amount,raised_amount,phone_number,phone_extension,donation_url "+
  "FROM public.charities WHERE is_active=true "+
  "AND (publication_state='live' OR (publication_state='scheduled' AND scheduled_at<=now())) "+
  "AND ($1::integer IS NULL AND is_todays_featured=true OR id=$1::integer) "+
  "ORDER BY created_at DESC,id DESC LIMIT 1",[settings.active_charity_id||null])).rows[0];
 const messages=(await client.query(
  "SELECT purpose,text_en,audio_data IS NOT NULL AS has_audio,phone_audio_path "+
  "FROM public.gavhah_cause_messages WHERE channel=$1",[which])).rows as Array<{purpose:string,text_en:string,has_audio:boolean,phone_audio_path:string|null}>;
 // These figures have different financial meanings. Never add them together:
 //  1) BLN undertakings officially accepted / approved (including fulfilled);
 //  2) cash actually verified as received by staff.
 // Longer-dated applications awaiting review, rejected/cancelled submissions,
 // donation intentions and legacy amount_raised are NOT claimed as BLN accepted
 // or verified cash. Historical legacy promises need separate reconciliation.
 let verifiedCents:number|null=null;
 let pledgedCents=0;
 let pendingPledgeCents=0;
 let joinedCount=0;
 if(which==="united"&&c){
  const [received,undertakings]=await Promise.all([
   client.query("SELECT verified_cents FROM public.gavhah_united_verified_totals WHERE cause_id=$1",[c.id]),
   client.query(
    "SELECT coalesce(sum(amount_cents) FILTER "+
    "(WHERE status IN ('accepted_bln','approved_bln','fulfilled')),0)::text AS pledged_cents,"+
    "coalesce(sum(amount_cents) FILTER (WHERE status='pending_team'),0)::text AS pending_cents "+
    "FROM public.gavhah_united_pledges WHERE cause_id=$1",[c.id])
  ]);
  verifiedCents=received.rows[0]?Number(received.rows[0].verified_cents):null;
  pledgedCents=Number(undertakings.rows[0]?.pledged_cents||0);
  pendingPledgeCents=Number(undertakings.rows[0]?.pending_cents||0);
 }
 if(which==="daily"&&c){
  const [actual,undertakings,members]=await Promise.all([
   client.query(
    "SELECT coalesce(sum(d.amount),0)::numeric AS old_verified_dollars,count(*)::int AS old_count "+
    "FROM public.donations d WHERE d.charity_id=$1",[c.id]),
   client.query(
    "SELECT coalesce(sum(amount_cents) FILTER "+
    "(WHERE status IN ('accepted_bln','approved_bln','fulfilled')),0)::text AS pledged_cents,"+
    "coalesce(sum(amount_cents) FILTER (WHERE status='pending_team'),0)::text AS pending_cents "+
    "FROM public.gavhah_daily_pledges WHERE charity_id=$1",[c.id]),
   client.query("SELECT count(*)::int AS n FROM public.gavhah_daily_joined WHERE charity_id=$1",[c.id])
  ]);
  const reviewed=(await client.query(
   "SELECT verified_cents FROM public.gavhah_daily_verified_totals WHERE charity_id=$1",[c.id])).rows[0];
  const oldPaid=Number(actual.rows[0]?.old_verified_dollars||0)*100;
  // Old donations were created by staff-confirmed offline receipts. Direct
  // changes to legacy charities.raised_amount do not prove payment.
  verifiedCents=Number(actual.rows[0]?.old_count||0)>0||reviewed?
   oldPaid+Number(reviewed?.verified_cents||0):
   Number(c.raised_amount||0)>0?null:0;
  pledgedCents=Number(undertakings.rows[0]?.pledged_cents||0);
  pendingPledgeCents=Number(undertakings.rows[0]?.pending_cents||0);
  joinedCount=Number(members.rows[0]?.n||0);
 }
 return {
  channel:which,enabled:settings.enabled===true,
  phoneBeforeNews:settings.phone_before_news===true,websiteBeforeNews:settings.website_before_news===true,
  websiteAutoplay:settings.website_autoplay===true,
  announcementMode:settings.announcement_mode,joinMode:settings.join_mode,
  donationHotline:settings.donation_hotline||null,
  donationInstructionsEn:settings.donation_instructions_en||"",
  paymentAdapter:settings.payment_adapter,
  checkoutUrl:settings.payment_adapter==="hosted_checkout"&&settings.checkout_url?settings.checkout_url:null,
  checkoutAvailable:settings.payment_adapter==="hosted_checkout"&&!!settings.checkout_url,
  cause:c?{
   id:c.id,title:c.title,description:c.description,
   organizerName:c.organizer_name||null,location:c.location||null,
   goalAmount:Number(c.goal_amount||0),joinedCount:which==="daily"?joinedCount:Number(c.supporter_count||0),
   // Accepted BLN vs funds verified in the finance ledger are kept separate.
   pledgedDollars:pledgedCents/100,
   pendingApprovalPledgedDollars:pendingPledgeCents/100,
   verifiedRaisedDollars:verifiedCents===null?null:verifiedCents/100,
   reportedRaisedDollars:which==="daily"?Number(c.raised_amount||0):null,
   donationUrl:which==="daily"?c.donation_url||null:null,
   phoneNumber:which==="daily"?c.phone_number||null:null,
   phoneExtension:which==="daily"?c.phone_extension||null:null
  }:null,
  messages:Object.fromEntries(messages.map(m=>[m.purpose,{
   textEn:m.text_en||"",hasAudio:m.has_audio,phoneAudioReady:!!m.phone_audio_path,
   audioUrl:m.has_audio?"/api/cause-channels/"+which+"/"+m.purpose+"/audio":null
  }]))
 };
}
router.get("/cause-channels/:channel",async(req,res,next)=>{
 try{
  const which=channel(req.params.channel);
  if(!which){res.sendStatus(404);return;}
  const result=await readCauseChannel(pool,which);
  if(!result){res.sendStatus(404);return;}
  res.set("Cache-Control","public,max-age=20").json(result);
 }catch(e){next(e);}
});
router.get("/cause-channels/:channel/:purpose/audio",async(req,res,next)=>{
 try{
  const which=channel(req.params.channel),key=purpose(req.params.purpose);
  if(!which||!key){res.sendStatus(404);return;}
  const found=await pool.query("SELECT m.audio_data,m.mime_type "+
   "FROM public.gavhah_cause_messages m JOIN public.gavhah_cause_channels s ON s.channel=m.channel "+
   "WHERE s.enabled AND m.channel=$1 AND m.purpose=$2",[which,key]);
  const a=found.rows[0];
  if(!a?.audio_data){res.sendStatus(404);return;}
  res.set("Content-Type",a.mime_type||"application/octet-stream")
    .set("X-Content-Type-Options","nosniff").set("Cache-Control","public,max-age=60")
    .send(Buffer.from(a.audio_data));
 }catch(e){next(e);}
});
router.get("/admin/cause-channels",requireAdmin,async(_req,res,next)=>{
 try{
  const r=await pool.query("SELECT * FROM public.gavhah_cause_channels ORDER BY channel");
  const totals=await pool.query("SELECT cause_id,verified_cents,verification_note,recorded_at FROM public.gavhah_united_verified_totals ORDER BY recorded_at DESC LIMIT 30");
  res.set("Cache-Control","private,no-store").json({channels:r.rows,verifiedTotals:totals.rows});
 }catch(e){next(e);}
});
router.patch("/admin/cause-channels/:channel",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const which=channel(req.params.channel);if(!which){res.sendStatus(404);return;}
  const input=req.body||{},changes:Record<string,unknown>={};
  const flags:Record<string,string>={
   enabled:"enabled",phoneBeforeNews:"phone_before_news",websiteBeforeNews:"website_before_news",
   websiteAutoplay:"website_autoplay"
  };
  for(const [from,to] of Object.entries(flags))if(from in input){
   if(typeof input[from]!=="boolean"){res.status(400).json({error:from+" must be boolean"});return;}
   changes[to]=input[from];
  }
  for(const [from,to] of Object.entries({announcementMode:"announcement_mode",joinMode:"join_mode"})){
   if(from in input){
    if(!["tts","recording"].includes(input[from])){res.status(400).json({error:"Invalid playback mode"});return;}
    changes[to]=input[from];
   }
  }
  if("donationHotline" in input){
   if(input.donationHotline!==null&&
      (typeof input.donationHotline!=="string"||!/^[0-9+() -]{0,30}$/.test(input.donationHotline))){
     res.status(400).json({error:"Use a valid donation hotline number"});return;
   }
   changes.donation_hotline=input.donationHotline||null;
  }
  if("donationInstructionsEn" in input){
   if(typeof input.donationInstructionsEn!=="string"||!englishTts(input.donationInstructionsEn)){
    res.status(400).json({error:"Join instructions must be English TTS text (up to 3000 characters)"});return;}
   changes.donation_instructions_en=input.donationInstructionsEn;
  }
  if("activeCharityId" in input){
   if(which!=="daily"){res.status(400).json({error:"United has its own active cause; daily charity ID is separate"});return;}
   const id=input.activeCharityId;
   if(id!==null&&(!Number.isSafeInteger(id)||id<=0)){res.status(400).json({error:"Invalid charity"});return;}
   if(id!==null){
    const found=await pool.query("SELECT id FROM public.charities WHERE id=$1",[id]);
    if(!found.rowCount){res.status(404).json({error:"Daily charity not found"});return;}
   }
   changes.active_charity_id=id;
  }
  if("paymentAdapter" in input||"checkoutUrl" in input){
   // Hosted-only; never collect bank/card details in Gavhah. API-specific
   // charge creation and signed payment webhooks require provider integration.
   const previous=(await pool.query(
    "SELECT payment_adapter,checkout_url FROM public.gavhah_cause_channels WHERE channel=$1",[which])).rows[0];
   if(!previous){res.sendStatus(404);return;}
   const mode=input.paymentAdapter??previous.payment_adapter;
   const raw=input.checkoutUrl===undefined?previous.checkout_url:input.checkoutUrl;
   if(!["none","hosted_checkout"].includes(mode)){
    res.status(400).json({error:"Unsupported payment adapter"});return;
   }
   const url=safeCheckoutUrl(raw);
   if(raw&&!url){res.status(400).json({error:"Only a public HTTPS hosted-checkout URL is allowed"});return;}
   if(mode==="hosted_checkout"&&!url){res.status(400).json({error:"Configure a checkout provider URL first"});return;}
   changes.payment_adapter=mode;changes.checkout_url=url;
  }
  if(!Object.keys(changes).length){res.status(400).json({error:"No settings to change"});return;}
  const sets=Object.keys(changes).map((k,i)=>k+"=$"+(i+2)).join(",");
  const r=await pool.query("UPDATE public.gavhah_cause_channels SET "+sets+
   ",updated_by=$"+(Object.keys(changes).length+2)+",updated_at=now() WHERE channel=$1 RETURNING *",
   [which,...Object.values(changes),getSessionUserId(req)]);
  res.set("Cache-Control","private,no-store").json(r.rows[0]);
 }catch(e){next(e);}
});
router.put("/admin/united/:causeId/verified-raised",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const id=Number(req.params.causeId),cents=Number(req.body?.verifiedCents);
  const note=String(req.body?.verificationNote||"").trim();
  if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(cents)||cents<0||
     cents>100_000_000_000||note.length<8||note.length>1000){
   res.status(400).json({error:"Verified amount and an eight-character evidence note are required"});return;
  }
  const found=await pool.query("SELECT id FROM public.featured_causes WHERE id=$1",[id]);
  if(!found.rowCount){res.sendStatus(404);return;}
  const result=await pool.query(
   "INSERT INTO public.gavhah_united_verified_totals(cause_id,verified_cents,verification_note,recorded_by) "+
   "VALUES($1,$2,$3,$4) ON CONFLICT(cause_id) DO UPDATE SET "+
   "verified_cents=excluded.verified_cents,verification_note=excluded.verification_note,"+
   "recorded_by=excluded.recorded_by,recorded_at=now() RETURNING cause_id,verified_cents,recorded_at",
   [id,cents,note,getSessionUserId(req)]);
  res.json(result.rows[0]);
 }catch(e){next(e);}
});
// Staff sends a targeted notification requesting either official public
// introduction or join/donation instructions from the selected member.
router.post("/admin/cause-message-requests",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const which=channel(req.body?.channel),key=purpose(req.body?.purpose);
  const id=Number(req.body?.memberId),note=String(req.body?.note||"");
  if(!which||!key||!Number.isSafeInteger(id)||id<=0||note.length>1000){
   res.status(400).json({error:"Channel, message type and existing member ID required"});return;
  }
  const m=await pool.query("SELECT id FROM public.users WHERE id=$1 AND status='active'",[id]);
  if(!m.rowCount){res.status(404).json({error:"Active member not found"});return;}
  const r=await pool.query(
   "INSERT INTO public.gavhah_cause_message_requests(channel,purpose,member_id,requested_by,request_note) "+
   "VALUES($1,$2,$3,$4,$5) RETURNING id,channel,purpose,member_id,state",
   [which,key,id,getSessionUserId(req),note]);
  await notifyUser(id,"cause_message_request",
   "Gavhah is requesting your "+(key==="announcement"?"official cause announcement":"join/donation instructions")+
   " for "+(which==="united"?"United in Kindness":"Today's Cause")+
   ". Submit English text and optionally a recording for team review.",
   "/my/cause-messages");
  res.status(201).json(r.rows[0]);
 }catch(e){next(e);}
});
router.get("/me/cause-message-requests",requireAuth,async(req,res,next)=>{
 try{
  const id=getSessionUserId(req);
  const r=await pool.query(
   "SELECT id,channel,purpose,request_note,state,created_at,submitted_at,review_note "+
   "FROM public.gavhah_cause_message_requests WHERE member_id=$1 ORDER BY created_at DESC LIMIT 50",[id]);
  res.set("Cache-Control","private,no-store").json(r.rows);
 }catch(e){next(e);}
});
router.post("/me/cause-message-requests/:id/submit",requireAuth,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const id=Number(req.params.id),userId=getSessionUserId(req);
  const text=String(req.body?.textEn||"").trim();
  const sound=bytesFromSubmission(req.body?.audioBase64,req.body?.mimeType);
  if(!Number.isSafeInteger(id)||id<=0||!sound||!messageOK(text)||
     (text.length===0&&!sound.bytes)||text.length>3000||
     (text.length>0&&!englishTts(text))){
   res.status(400).json({error:"English TTS (up to 3000 characters) or a valid recording (up to 3 MB) required"});return;
  }
  const r=await pool.query(
   "UPDATE public.gavhah_cause_message_requests SET proposed_text_en=$3,"+
   "proposed_audio=$4,proposed_mime_type=$5,state='submitted',submitted_at=now() "+
   "WHERE id=$1 AND member_id=$2 AND state='requested' RETURNING id,channel,purpose",
   [id,userId,text||null,sound.bytes,sound.mime]);
  if(!r.rowCount){res.status(409).json({error:"This request is no longer awaiting a submission"});return;}
  await notifyStaff("A member submitted a "+r.rows[0].purpose+" cause message for review.","/founder","cause_message_review");
  res.status(201).json({ok:true,id,status:"submitted"});
 }catch(e){next(e);}
});
router.get("/admin/cause-message-requests",requireAdmin,async(_req,res,next)=>{
 try{
  const r=await pool.query(
   "SELECT id,channel,purpose,member_id,request_note,state,proposed_text_en,"+
   "proposed_audio IS NOT NULL AS has_audio,created_at,submitted_at,review_note "+
   "FROM public.gavhah_cause_message_requests ORDER BY created_at DESC LIMIT 100");
  res.set("Cache-Control","private,no-store").json(r.rows);
 }catch(e){next(e);}
});
router.get("/cause-message-requests/:id/audio",requireAuth,async(req,res,next)=>{
 try{
  const id=Number(req.params.id),user=await getCurrentSessionUser(req);
  if(!Number.isSafeInteger(id)||!user){res.sendStatus(404);return;}
  const r=await pool.query(
   "SELECT member_id,proposed_audio,proposed_mime_type FROM public.gavhah_cause_message_requests WHERE id=$1",[id]);
  const a=r.rows[0];
  if(!a?.proposed_audio||(a.member_id!==user.id&&!["admin","moderator","super_admin"].includes(user.role))){
   res.sendStatus(404);return;
  }
  res.set("Cache-Control","private,no-store").set("X-Content-Type-Options","nosniff")
   .type(a.proposed_mime_type).send(Buffer.from(a.proposed_audio));
 }catch(e){next(e);}
});
router.post("/admin/cause-message-requests/:id/review",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const id=Number(req.params.id),decision=String(req.body?.decision||"");
  const note=String(req.body?.note||"");
  if(!Number.isSafeInteger(id)||id<=0||!["approved","rejected"].includes(decision)||note.length>1000){
   res.status(400).json({error:"Invalid moderation decision"});return;
  }
  const c=await pool.connect();
  let member=0;
  try{
   await c.query("BEGIN");
   const r=await c.query(
    "SELECT id,channel,purpose,member_id,proposed_text_en,proposed_audio,proposed_mime_type "+
    "FROM public.gavhah_cause_message_requests WHERE id=$1 AND state='submitted' FOR UPDATE",[id]);
   const m=r.rows[0];
   if(!m){await c.query("ROLLBACK");res.status(409).json({error:"Submission already handled or missing"});return;}
   member=m.member_id;
   if(decision==="approved"){
    // Keep the old phone recording on the provider for rollback, but clear the
    // pointer so stale audio is never played for a new approved text/recording.
    await c.query(
     "INSERT INTO public.gavhah_cause_messages(channel,purpose,text_en,audio_data,mime_type,phone_audio_path,approved_by,approved_at) "+
     "VALUES($1,$2,$3,$4,$5,NULL,$6,now()) ON CONFLICT(channel,purpose) DO UPDATE SET "+
     "text_en=excluded.text_en,audio_data=excluded.audio_data,mime_type=excluded.mime_type,"+
     "phone_audio_path=NULL,approved_by=excluded.approved_by,approved_at=now(),updated_at=now()",
     [m.channel,m.purpose,m.proposed_text_en||"",m.proposed_audio,m.proposed_mime_type,getSessionUserId(req)]);
    // On a Yiddish/English phone, publish a new approved audio version
    // through the existing Yemot voice-studio folder after staff approval.
   }
   await c.query("UPDATE public.gavhah_cause_message_requests "+
    "SET state=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1",
    [id,decision,note,getSessionUserId(req)]);
   await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}
  finally{c.release();}
  await notifyUser(member,"cause_message_review",
   decision==="approved"?"Your submitted cause message was approved by Gavhah.":"Gavhah reviewed your submitted cause message.",
   "/my/cause-messages");
  res.json({ok:true,status:decision,phoneAudioRequiresPublishing:decision==="approved"});
 }catch(e){next(e);}
});
// Set only a Yemot-provider-confirmed, pre-uploaded WAV path; backend requires
// voice-studio to report the same published asset for this virtual phone path.
router.post("/admin/cause-channels/:channel/:purpose/use-published-audio",requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req)){res.sendStatus(403);return;}
  const which=channel(req.params.channel),key=purpose(req.params.purpose);
  if(!which||!key){res.sendStatus(404);return;}
  const mapped=which==="united"?(key==="announcement"?"9704":"97041"):(key==="announcement"?"9706":"97061");
  const r=await pool.query(
   "SELECT published_path FROM public.gavhah_yemot_voice_prompts WHERE path=$1",[mapped]);
  const published=String(r.rows[0]?.published_path||"");
  if(!voicePath(published)){res.status(409).json({error:"Publish a verified WAV in Yemot voice studio for "+mapped+" first"});return;}
  await pool.query(
   "UPDATE public.gavhah_cause_messages SET phone_audio_path=$3,updated_at=now() "+
   "WHERE channel=$1 AND purpose=$2",[which,key,published]);
  res.json({ok:true,phoneAudioReady:true});
 }catch(e){next(e);}
});
// Future processor adapter endpoint: no card fields or payment authorization
// ever pass through Gavhah until an actual provider integration is reviewed.
router.get("/cause-channels/:channel/checkout-status",async(req,res,next)=>{
 try{
  const which=channel(req.params.channel);if(!which){res.sendStatus(404);return;}
  const r=(await pool.query("SELECT payment_adapter,checkout_url FROM public.gavhah_cause_channels WHERE channel=$1",[which])).rows[0];
  if(!r){res.sendStatus(404);return;}
  res.json(r.payment_adapter==="hosted_checkout"&&r.checkout_url?
   {available:true,mode:"provider-hosted",checkoutUrl:r.checkout_url,automaticApiCharges:false}:
   {available:false,mode:"provider-not-connected",automaticApiCharges:false});
 }catch(e){next(e);}
});
export default router;
