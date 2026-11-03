import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {validRecordedPath} from "./yemot-news-engagement";

export const forumDialPath="9702";
export const forumOptionsPath="97021";
export const forumRecordPath="970211";
export const forumVoiceIntro="To hear discussions, stay on the line. For other options, press 1.";
export const forumVoiceOptions="To record a message, press 1.";
export const forumVoiceReview="Press 1 to listen to your recording, 2 to record it again, 3 to cancel, or 4 to publish immediately. Press zero to go back.";
// Dedicated, per-call private capture name. Prevents one caller publishing a
// guessed WAV from another Yemot folder or member's session.
const forumRecordingDirectory="/GavhahForumVoice";
export function forumRecordTarget(callHash:string,step:number):string{
 const h=createHash("sha256").update("gavhah-forum-voice-v1|"+callHash+"|"+step).digest("hex").slice(0,32);
 return "ivr2:"+forumRecordingDirectory+"/gvf_"+h+".wav";
}
export function isOwnedForumRecording(path:string,callHash:string,step:number):boolean{
 return path===forumRecordTarget(callHash,step);
}
export function isForumRecordingFile(path:string):boolean{
 return /^ivr2:\/GavhahForumVoice\/gvf_[a-f0-9]{32}\.wav$/.test(path);
}
export const forumVoiceTitle="שמועס פונעם גבהה־ליין";
export const forumVoiceContent="🎙️ שמועס אויפן ליין — דרוקט שפילן כדי צו הערן די רעקארדירונג.";

function speak(input:unknown,max=275):string{
  const s=String(input??"").replace(/<[^>]*>/g," ").replace(/https?:\/\/\S+/gi," ").trim();
  if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(s))return "This discussion is available on the Gavhah website.";
  return s.replace(/[^ -~]/g," ").replace(/\s+/g," ").slice(0,max);
}

export async function phoneForumItem(client:PoolClient,offset:number){
 const safeOffset=Math.max(0,Math.min(300,Math.trunc(offset)||0));
 const q=await client.query<{id:number;title:string;content:string;provider_recording_path:string|null}>(
  "SELECT d.id,d.title,d.content,v.provider_recording_path "+
  "FROM public.discussions d LEFT JOIN public.gavhah_forum_voice_posts v ON v.discussion_id=d.id "+
  "ORDER BY d.created_at DESC,d.id DESC LIMIT 1 OFFSET $1",[safeOffset]);
 const row=q.rows[0];
 if(!row)return {prompt:"There are no further discussions. For options, press 1. To start again, press 2.",audioPath:null};
 const audio=validRecordedPath(row.provider_recording_path);
 return {prompt:"Discussion number "+row.id+". "+(audio?"Listen to the recorded discussion.":speak(row.title)+". "+speak(row.content))+
  " To hear the next discussion, stay on the line. For options, press 1.",audioPath:audio};
}

// Called only for a server-verified, time-limited Gavhah member session.
// Never trust caller ID; a recording does not become public before # + explicit 4.
export async function publishPhoneForumRecording(client:PoolClient,opts:{
 memberId:number;callHash:string;recordingPath:string;
}):Promise<{ok:boolean;message:string;discussionId?:number}>{
 const valid=validRecordedPath(opts.recordingPath);
 if(!valid||!isForumRecordingFile(valid))return {ok:false,message:"The recording could not be verified. Please record it again."};
 const verified=await client.query<{id:number}>(
  "SELECT id FROM public.users WHERE id=$1 AND status='active'",[opts.memberId]);
 if(!verified.rowCount)return {ok:false,message:"Sign in to your own Gavhah account before publishing."};
 const fingerprint=createHash("sha256").update("forum-voice-v1|"+opts.callHash+"|"+valid).digest("hex");
 const prior=await client.query<{discussion_id:number}>(
  "SELECT discussion_id FROM public.gavhah_forum_voice_posts WHERE recording_fingerprint=$1",[fingerprint]);
 if(prior.rows[0])return {ok:true,message:"This recording was already published.",discussionId:prior.rows[0].discussion_id};
 const post=await client.query<{id:number}>(
  "INSERT INTO public.discussions(title,content,category,author_id,author_name) "+
  "VALUES($1,$2,$3,$4,$5) RETURNING id",
  [forumVoiceTitle,forumVoiceContent,"u:עסקנים־שמועסן",opts.memberId,"גבהה־ליין"]);
 const id=post.rows[0].id;
 await client.query(
  "INSERT INTO public.gavhah_forum_voice_posts "+
  "(discussion_id,member_id,provider_recording_path,recording_fingerprint) VALUES($1,$2,$3,$4)",
  [id,opts.memberId,valid,fingerprint]);
 return {ok:true,message:"Your recorded discussion was published to the Gavhah website.",discussionId:id};
}
