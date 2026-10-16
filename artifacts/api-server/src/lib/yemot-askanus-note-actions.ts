import type { PoolClient } from "pg";
/**
 * A private Gavhah note can be deleted by its current owner only after the
 * caller pressed 9 to select that exact note ID and 9 again to confirm.
 * The original note text is not copied to the public audit event.
 */
export async function deleteMyPhoneNote(client:PoolClient,userId:number,id:number):Promise<string>{
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(id)||id<=0)
  return "No valid private note was selected.";
 const removed=await client.query<{id:number;title:string}>(
  "DELETE FROM public.askanus_notes WHERE user_id=$1 AND id=$2 RETURNING id,title",
  [userId,id]);
 const note=removed.rows[0];if(!note)return "This private note is no longer in your account.";
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,NULL,'note',$2,'note_explicitly_deleted',$3,$4)",
  [userId,note.id,note.title,JSON.stringify({source:"phone",confirmation:"twice",noteContentNotLogged:true})]);
 return "Private note "+id+" deleted from your own Gavhah website, and the action is recorded in your account history.";
}


/**
 * Create the canonical PRIVATE site note and attach a Yemot-owned recording.
 * It can only be played from the member-authenticated site endpoint.
 * This must run in the SAME transaction as call-state update.
 */
export async function createMyRecordedPhoneNote(
 client:PoolClient,userId:number,callHash:string,recordingPath:string
):Promise<{ok:boolean;message:string}>{
 if(!Number.isSafeInteger(userId)||userId<=0||!/^[a-f0-9]{64}$/.test(callHash))
  return{ok:false,message:"Member session was not verified. Nothing saved."};
 const {validRecordedPath}=await import("./yemot-news-engagement");
 const valid=validRecordedPath(recordingPath);
 if(!valid)return{ok:false,message:"No valid recorded audio was received. Please try again."};
 const {createHash}=await import("node:crypto");
 const fingerprint=createHash("sha256").update("private-note|"+userId+"|"+callHash+"|"+valid).digest("hex");
 const prior=await client.query(
  "SELECT note_id FROM public.gavhah_phone_private_note_audio WHERE fingerprint=$1 AND user_id=$2",
  [fingerprint,userId]);
 if(prior.rows[0])return{ok:true,message:"This private recording was already saved to your Gavhah website notes."};
 const recent=await client.query<{total:number}>(
  "SELECT count(*)::int AS total FROM public.gavhah_phone_private_note_audio "+
  "WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[userId]);
 if(Number(recent.rows[0]?.total||0)>=15)
  return{ok:false,message:"Voice-note hourly limit reached. Please try again later."};
 const row=await client.query<{id:number}>(
  "INSERT INTO public.askanus_notes(user_id,title,content) "+
  "VALUES($1,'Private phone voice note',$2) RETURNING id",
  [userId,"Private audio note recorded by the verified member on the Gavhah hotline. Playback is available in My Askanus, Notes."]);
 const noteId=row.rows[0]?.id;
 if(!noteId)return{ok:false,message:"The website note could not be saved."};
 const inserted=await client.query(
  "INSERT INTO public.gavhah_phone_private_note_audio(note_id,user_id,provider_recording_path,fingerprint) "+
  "VALUES($1,$2,$3,$4) ON CONFLICT(fingerprint) DO NOTHING RETURNING note_id",
  [noteId,userId,valid,fingerprint]);
 if(!inserted.rowCount){
  await client.query("DELETE FROM public.askanus_notes WHERE id=$1 AND user_id=$2",[noteId,userId]);
  return{ok:true,message:"This note was already submitted."};
 }
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,NULL,'note',$2,'note_created','Private phone voice note',$3)",
  [userId,noteId,JSON.stringify({source:"phone",audio:true,contentNotLogged:true})]);
 return{ok:true,message:"Private audio note saved in your own Gavhah website Notes. Note number "+noteId+"."};
}
