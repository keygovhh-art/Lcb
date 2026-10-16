import { createHash, createDecipheriv } from "node:crypto";
import type { PoolClient } from "pg";

// The phone uses the exact same entity_likes and news.like_count rows as the
// website's /api/news/:id/like. Duplicate provider callbacks are idempotent.
export async function phoneNewsVote(client:PoolClient,userId:number,articleId:number,desired:boolean){
 const locked=await client.query("SELECT id FROM public.news WHERE id=$1 FOR UPDATE",[articleId]);
 if(!locked.rowCount)return {ok:false,info:"This update is no longer available."};
 const result=desired
   ? await client.query(
     "INSERT INTO public.entity_likes(user_id,entity_type,entity_id) VALUES($1,'news',$2) "+
     "ON CONFLICT(user_id,entity_type,entity_id) DO NOTHING RETURNING id",[userId,articleId])
   : await client.query(
     "DELETE FROM public.entity_likes WHERE user_id=$1 AND entity_type='news' AND entity_id=$2 RETURNING id",[userId,articleId]);
 if(result.rowCount){
   await client.query("UPDATE public.news SET like_count=GREATEST(0,like_count+$2) WHERE id=$1",
     [articleId,desired?1:-1]);
 }
 const status=await client.query<{like_count:number}>(
    "SELECT like_count FROM public.news WHERE id=$1",[articleId]);
 return{ok:true,info:desired?"Upvote saved on the website.":"Upvote removed on the website.",
   count:status.rows[0]?.like_count??0};
}
export function validRecordedPath(input:unknown):string|null{
 if(typeof input!=="string"||input.length>220)return null;
 // Only Yemot IVR-owned WAV paths. Never allow an arbitrary URL or file.
 return /^ivr2:\/(?:[A-Za-z0-9_-]+\/){0,8}[A-Za-z0-9_-]+\.wav$/i.test(input)?input:null;
}
export async function saveVoiceNewsReply(client:PoolClient,newsId:number,userId:number,callHash:string,path:string){
 const valid=validRecordedPath(path);
 if(!valid)return {ok:false,info:"The recording was not accepted. Please try again."};
 const found=await client.query("SELECT id FROM public.news WHERE id=$1",[newsId]);
 if(!found.rowCount)return{ok:false,info:"The original news item was not found."};
 const fingerprint=createHash("sha256").update(callHash+"|"+newsId+"|"+path).digest("hex");
 const inserted=await client.query(
   "INSERT INTO public.gavhah_news_voice_replies(news_id,member_id,provider_recording_path,recording_fingerprint) "+
   "VALUES($1,$2,$3,$4) ON CONFLICT(recording_fingerprint) DO NOTHING RETURNING id",
   [newsId,userId,valid,fingerprint]);
 return {ok:true,info:inserted.rowCount
   ?"Your recorded reply is saved and waiting for review. It will appear on the website only after approval."
   :"This recording was already submitted for review."};
}
// Never expose the account API token to frontend or phone callers. Provider
// recording bytes are fetched only for an approved, known DB audio pointer.
export async function fetchModeratedNewsAudio(path:string):Promise<Uint8Array>{
 const row=await (await import("@workspace/db")).pool.query(
   "SELECT token_nonce,token_ciphertext,token_tag FROM public.gavhah_yemot_global WHERE id=1");
 if(!row.rows[0])throw new Error("Central provider not configured");
 const key=Buffer.from(process.env.YEMOT_ENCRYPTION_KEY||"","base64");
 if(key.length!==32)throw new Error("Provider encryption key unavailable");
 const d=createDecipheriv("aes-256-gcm",key,Buffer.from(row.rows[0].token_nonce,"base64"));
 d.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
 d.setAuthTag(Buffer.from(row.rows[0].token_tag,"base64"));
 let token=Buffer.concat([d.update(Buffer.from(row.rows[0].token_ciphertext,"base64")),d.final()]).toString("utf8");
 try{
  const response=await fetch("https://www.call2all.co.il/ym/api/DownloadFile",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token,path}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)
  });
  const advertised=Number(response.headers.get("content-length")||0);
  if(!response.ok||(advertised>6*1024*1024))throw new Error("Recording not available");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.length||bytes.length>6*1024*1024)throw new Error("Recording size not valid");
  return bytes;
 }finally{token="";}
}


// Telephone save and report use the SAME canonical rows as website /saved
// and /reports. Their state is per verified website-linked member.
export async function phoneNewsSave(client:PoolClient,userId:number,newsId:number,desired:boolean){
 const news=await client.query<{title:string}>("SELECT title FROM public.news WHERE id=$1",[newsId]);
 if(!news.rows[0])return "News update not found.";
 if(desired){
  await client.query(
   "INSERT INTO public.saved_items(user_id,content_type,content_id,content_title,content_url) "+
   "VALUES($1,'news',$2,$3,$4) ON CONFLICT(user_id,content_type,content_id) DO NOTHING",
   [userId,newsId,news.rows[0].title,"/news/"+newsId]);
  return "This update is saved to your website account.";
 }
 await client.query(
  "DELETE FROM public.saved_items WHERE user_id=$1 AND content_type='news' AND content_id=$2",
  [userId,newsId]);
 return "This update was removed from your website saved list.";
}
export async function phoneNewsReport(client:PoolClient,userId:number,newsId:number,reasonDigit:string){
 const reasons:Record<string,string>={
  "1":"spam","2":"inappropriate","3":"misinformation","4":"harassment","5":"other"
 };
 const reason=reasons[reasonDigit];
 if(!reason)return "Invalid report reason. Please select one through five.";
 const exists=await client.query("SELECT id FROM public.news WHERE id=$1",[newsId]);
 if(!exists.rowCount)return "News update not found.";
 // Same-site one-pending-report-per-member rule; rate limit also prevents
 // serial anonymous misuse across news records. Caller is web-code verified.
 const repeated=await client.query(
  "SELECT id FROM public.reports WHERE content_type='news' AND content_id=$1 "+
  "AND reporter_id=$2 AND status='pending' LIMIT 1",[newsId,userId]);
 if(repeated.rowCount)return "You already have a pending report on this update.";
 const volume=await client.query<{total:string}>(
  "SELECT COUNT(*)::text AS total FROM public.reports WHERE reporter_id=$1 AND created_at>now()-interval '1 hour'",[userId]);
 if(Number(volume.rows[0]?.total||0)>=5)return "Report limit reached. Please try again later.";
 await client.query(
  "INSERT INTO public.reports(content_type,content_id,reason,description,reporter_id,status) "+
  "VALUES('news',$1,$2,NULL,$3,'pending')",[newsId,reason,userId]);
 return "Your report has been saved to the same website administration review queue.";
}
