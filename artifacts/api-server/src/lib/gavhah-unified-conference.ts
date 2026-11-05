import type {PoolClient} from "pg";

export type ConferenceState={
 enabled:boolean;provider_confirmed:boolean;listener_extension:string|null;
 moderator_extension:string|null;mode:string;waiting_room:boolean;
 entry_mode:"members"|"whitelist";scheduled_start_at:string|null;
 scheduled_end_at:string|null;override_state:"schedule"|"force_open"|"force_closed";
 override_until:string|null;
};
const ext=(v:unknown):string|null=>
 typeof v==="string"&&/^\/[0-9]+(?:\/[0-9]+)*$/.test(v)?v:null;
export function validConferenceExtension(v:unknown){return ext(v)}
export function conferenceOpen(s:ConferenceState,now=Date.now()){
 if(!s.enabled||!s.provider_confirmed||!ext(s.listener_extension))return false;
 const overridden=s.override_state!=="schedule"&&(!s.override_until||
  Date.parse(s.override_until)>now);
 if(overridden)return s.override_state==="force_open";
 if(!s.scheduled_start_at||!s.scheduled_end_at)return false;
 const start=Date.parse(s.scheduled_start_at),end=Date.parse(s.scheduled_end_at);
 return Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&end>now;
}
export type Gate={allowed:boolean;reason:string;providerPath:string|null;role:string};
export async function conferenceGate(c:PoolClient,userId:number|null,
 administrator=false):Promise<Gate>{
 const s=(await c.query<ConferenceState>(
  "SELECT enabled,provider_confirmed,listener_extension,moderator_extension,mode,"+
  "waiting_room,entry_mode,scheduled_start_at,scheduled_end_at,override_state,override_until "+
  "FROM public.gavhah_unified_conference WHERE id=1")).rows[0];
 if(!s)return {allowed:false,reason:"The conference has not been configured.",providerPath:null,role:"none"};
 if(!userId)return {allowed:false,reason:"Please securely link your Gavhah member account first.",providerPath:null,role:"none"};
 const list=await c.query<{access:string}>(
  "SELECT access FROM public.gavhah_unified_conference_access WHERE member_id=$1",[userId]);
 const memberships=new Set(list.rows.map(x=>x.access));
 const isMod=administrator||memberships.has("moderator");
 // Blacklist always defeats an access code, whitelist, and moderator grant.
 if(memberships.has("blacklist"))return {allowed:false,reason:"Conference access has been restricted by the Gavhah team.",providerPath:null,role:"blocked"};
 const role=isMod?"moderator":memberships.has("speaker")?"speaker":"listener";
 if(!conferenceOpen(s))return {allowed:false,reason:"The conference is not open. Follow the schedule or team announcement.",providerPath:null,role};
 if(s.entry_mode==="whitelist"&&!isMod&&!memberships.has("whitelist"))
  return {allowed:false,reason:"This room is limited to the approved member list.",providerPath:null,role};
 if(s.waiting_room&&!isMod&&!memberships.has("whitelist"))
  return {allowed:false,reason:"The waiting room is active. The team must grant access before entering.",providerPath:null,role};
 const path=isMod?ext(s.moderator_extension):ext(s.listener_extension);
 if(!path)return {allowed:false,reason:"The matching Yemot room extension is not verified.",providerPath:null,role};
 return {allowed:true,reason:"Approved. Entering the single shared Gavhah conference room.",providerPath:path,role};
}
