import {pool} from "@workspace/db";

/**
 * One saved callback time => one shared "My Tishl" work item.
 * It is a reminder, never an automatic outbound dial.
 */
export async function syncOlamCallCallback(userId:number,callId:number){
 const found=await pool.query(
  "SELECT id,number_e164,report_details FROM public.max_call_sessions WHERE id=$1 AND user_id=$2",
  [callId,userId]);
 const c=found.rows[0];if(!c)throw Object.assign(Error("Call not found"),{status:404});
 const stamp=c.report_details?.callbackAt;
 const date=stamp?new Date(stamp):null;
 if(!date||!Number.isFinite(date.getTime())||date.getTime()<=Date.now()){
  const old=await pool.query(
   "UPDATE public.gavhah_olam_desk_direct SET status='hidden',updated_at=now() "+
   "WHERE user_id=$1 AND source_entity='max_call_session' AND source_id=$2 AND kind='call_later' AND status='open'",
   [userId,callId]);
  return{reminderActive:false,hiddenPrevious:!!old.rowCount,automaticDial:false};
 }
 if(date.getTime()>Date.now()+366*86400000)
  throw Object.assign(Error("Callback must be within 366 days"),{status:400});
 const r=await pool.query(
  "INSERT INTO public.gavhah_olam_desk_direct"+
  "(user_id,kind,title,phone_e164,due_at,source_entity,source_id,status) "+
  "VALUES($1,'call_later',$2,$3,$4,'max_call_session',$5,'open') "+
  "ON CONFLICT(user_id,source_entity,source_id) "+
  "WHERE source_entity='max_call_session' AND kind='call_later' "+
  "DO UPDATE SET title=EXCLUDED.title,phone_e164=EXCLUDED.phone_e164,due_at=EXCLUDED.due_at,"+
  "status='open',updated_at=now() RETURNING id,due_at",
  [userId,"צוריקצורופן נאך קאל #"+callId,c.number_e164,date.toISOString(),callId]);
 return{reminderActive:true,reminderId:r.rows[0].id,
  tishlVisibleAt:new Date(date.getTime()-25*60000).toISOString(),automaticDial:false};
}
