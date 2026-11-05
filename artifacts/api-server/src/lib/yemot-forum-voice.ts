import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {validRecordedPath} from "./yemot-news-engagement";

export type ForumVoiceDraft={
  kind:"forum_voice"; stage:"record"|"review"; path?:string; userId:number; expiresAt:number;
};

export function readForumVoiceDraft(raw:string):ForumVoiceDraft|null{
  try {
    const x=JSON.parse(raw) as ForumVoiceDraft;
    if(x?.kind!=="forum_voice"||!["record","review"].includes(x.stage)||
       !Number.isSafeInteger(x.userId)||x.userId<=0||
       !Number.isFinite(x.expiresAt)||x.expiresAt<Date.now())return null;
    if(x.stage==="review"&&!validRecordedPath(x.path))return null;
    return x;
  }catch{return null;}
}
export function forumRecordingPlaySegment(input:unknown):string{
  const valid=validRecordedPath(input);
  return valid?"f-"+valid.slice("ivr2:".length).replace(/\.wav$/i,""):"";
}
export async function phoneForumArticle(client:PoolClient,position:number){
  const r=await client.query<{
    id:number;title:string;content:string;category:string;provider_recording_path:string|null;
    browser_audio:boolean;
  }>(
    "SELECT d.id,d.title,d.content,d.category,v.provider_recording_path,"+
    "v.audio_data IS NOT NULL AS browser_audio FROM public.discussions d "+
    "LEFT JOIN public.gavhah_discussion_voice_posts v ON v.discussion_id=d.id "+
    "ORDER BY d.created_at DESC,d.id DESC LIMIT 1 OFFSET $1",
    [Math.max(0,Math.min(position,300))]
  );
  return r.rows[0]||null;
}
export async function publishPhoneForumVoice(
  client:PoolClient,userId:number,callHash:string,providerPath:string
):Promise<{ok:boolean;message:string;discussionId?:number}>{
  const valid=validRecordedPath(providerPath);
  if(!valid)return {ok:false,message:"The voice recording was not received. Please record again."};
  const member=await client.query<{id:number}>(
    "SELECT id FROM public.users WHERE id=$1 AND status='active'",[userId]);
  if(!member.rowCount)return {ok:false,message:"Your account is no longer active. Nothing published."};
  const fingerprint=createHash("sha256")
    .update("gavhah-forum-v1|"+callHash+"|"+userId+"|"+valid).digest("hex");
  const repeated=await client.query<{discussion_id:number}>(
    "SELECT discussion_id FROM public.gavhah_discussion_voice_posts WHERE fingerprint=$1",[fingerprint]);
  if(repeated.rows[0])return {ok:true,message:"Your voice discussion was already published.",discussionId:repeated.rows[0].discussion_id};
  const volume=await client.query<{n:string}>(
    "SELECT count(*)::text AS n FROM public.discussions "+
    "WHERE author_id=$1 AND category IN ('voice:phone','voice:web') "+
    "AND created_at>NOW()-interval '1 hour'",[userId]);
  if(Number(volume.rows[0]?.n||0)>=12)return {ok:false,message:"Voice posting limit reached. Please try later."};
  const post=await client.query<{id:number}>(
    "INSERT INTO public.discussions(title,content,category,author_id,author_name) "+
    "VALUES($1,$2,$3,$4,$5) RETURNING id",
    ["🎙️ א שמועס פונעם גבהה־ליין","🎙️ א רעקארדירטער שמועס. הערט עס אינעם שפילער.","voice:phone",userId,"גבהה־מעמבער"]
  );
  const id=post.rows[0].id;
  await client.query(
    "INSERT INTO public.gavhah_discussion_voice_posts "+
    "(discussion_id,member_id,provider_recording_path,fingerprint) VALUES($1,$2,$3,$4)",
    [id,userId,valid,fingerprint]
  );
  return {ok:true,message:"Your voice discussion is now published in the Gavhah public forum.",discussionId:id};
}
