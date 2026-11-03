import type {PoolClient} from "pg";
import {phonePromptOverride} from "../routes/yemot-voice-studio";

const stripWebsiteWords=(value:string)=>value.replace(/\b(?:website|web[- ]?site)\b/gi,"account").replace(/\s+/g," ").trim();
// Read/write the SAME public.notifications rows used by Gavhah /api/notifications.
// Never use caller ID as membership; caller must pass memberAllowed first.
const gvNotificationSubmenus2026:Record<string,string> = {
 "97181":"Notifications center. Press 1 for unread notifications. Press 2 for all notifications. Press 3 to mark every notification as read. Press 4 to browse categories. Press 5 for your profile. Press 9 for the previous notifications reader. Press star to go back.",
 "971813":"Mark all notifications as read. To confirm, press 1 twice. Press star to cancel.",
 "971814":"Notification categories. Press 1 for comments and replies. Press 2 for charity and causes. Press 3 for groups and volunteers. Press 4 for announcements. Press 5 for help replies. Press star to return."
};
const gvNotificationFilters2026:Record<string,string[]>={
 "9718141":["comment","reply"],
 "9718142":["cause_support","charity_update"],
 "9718143":["group_activity","project_join","volunteer_match"],
 "9718144":["announcement"],
 "9718145":["help_response"]
};
function gvNotificationIsList2026(path:string){return path==="971811"||path==="971812"||Object.hasOwn(gvNotificationFilters2026,path)}
function gvNotificationFilter2026(path:string){
 if(path==="971811")return " AND is_read=false";
 const groups=gvNotificationFilters2026[path];
 return groups?" AND type IN ("+groups.map((_,i)=>"'"+groups[i]+"'").join(",")+")":"";
}
function gvNotificationHelp2026(path:string){
 if(gvNotificationSubmenus2026[path])return gvNotificationSubmenus2026[path];
 if(gvNotificationIsList2026(path))return "Press 1 for the next notification. Press 2 for the previous. Press 3 to hear the related Gavhah item. Press 5 twice to mark the current notification read. Press 9 for the notifications center. Press star to go back.";
 return "Press star to return.";
}
async function gvNotificationMenuCustom2026(path:string){
 const custom=await phonePromptOverride(path);
 return custom.ttsMuted?"":(custom.ttsText||gvNotificationHelp2026(path));
}
async function gvNotificationRead2026(client:PoolClient,path:string,userId:number,page:number,confirmId:number|null){
 if(path==="97181"){
  const r=await client.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE NOT is_read)::int AS unread FROM public.notifications WHERE user_id=$1",[userId]);
  const {total=0,unread=0}=r.rows[0]||{};
  return "Your Gavhah notifications. "+unread+" unread and "+total+" total. "+await gvNotificationMenuCustom2026(path);
 }
 if(path==="971813"){
  const r=await client.query("SELECT count(*)::int AS unread FROM public.notifications WHERE user_id=$1 AND is_read=false",[userId]);
  return (r.rows[0]?.unread||0)+" unread notifications. "+(confirmId===-99?"Confirmation pending. Press 1 again to mark all as read. ":"")+await gvNotificationMenuCustom2026(path);
 }
 if(path==="971814")return await gvNotificationMenuCustom2026(path);
 if(!gvNotificationIsList2026(path))return "Choose an available notifications option. Press star to go back.";
 const filter=gvNotificationFilter2026(path);
 const pageNo=Math.max(0,Math.min(99,Number(page)||0));
 const sql="SELECT id,message,type,is_read,created_at,link_url FROM public.notifications WHERE user_id=$1"+filter+" ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2";
 const result=await client.query(sql,[userId,pageNo]);
 const row=result.rows[0];
 if(!row)return "There are no more notifications in this list. Press 2 for previous. Press 9 for notifications center.";
 const readable=stripWebsiteWords(String(row.message||"").replace(/<[^>]*>/g," ").replace(/https?:\/\/\S+/g," ").slice(0,320));
 const date=row.created_at?new Date(row.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}):"";
 const safeReadable=/[\u0590-\u05ff]/u.test(readable)?"A notification with Yiddish text is available in Gavhah.":readable;
 const prompt="Notification "+(pageNo+1)+". "+(row.is_read?"Already read. ":"Unread. ")+(date?"Date "+date+". ":"")+(safeReadable||"An activity notice is available.")+". ";
 const linked= typeof row.link_url==="string" && row.link_url.startsWith("/") ? " This notice has a related Gavhah item. " : "";
 return prompt+linked+(confirmId===row.id?"Press 5 once more to confirm marking this notification read. ":"")+await gvNotificationMenuCustom2026(path);
}
