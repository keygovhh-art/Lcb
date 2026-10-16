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
