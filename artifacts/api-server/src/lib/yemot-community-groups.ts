import type {PoolClient} from "pg";
// Phone Group Center: server-side records are the same records used on the web.
// A verified website pairing is mandatory for any private or mutating action.
// The shared public list slot is derived from UTC wall-clock time, NEVER the
// caller's session start. This is a synchronized selection, not a live audio
// multicast. Provider audio synchronization still needs physical acceptance.
export const isCommunityPhonePath=(path:string)=>path==="161"||path.startsWith("1611")||path.startsWith("1612")||
 path.startsWith("1613")||path.startsWith("1614");
export type GroupPhoneSession={
 path:string;page:number;focusId:number|null;verifiedUserId:number|null;feedback?:string;
};
const validId=(x:unknown)=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0&&n<=99999999?n:null;};
const say=(x:unknown,max=85)=>String(x||"").replace(/<[^>]+>/g," ").replace(/[&=,;#]/g," ")
 .replace(/[^\x20-\x7e]/g," ").replace(/\s+/g," ").trim().slice(0,max);
async function getGroup(client:PoolClient,id:number,userId:number|null){
 const q=await client.query<{id:number;name:string;privacy:string;owner_id:number;member_count:number;members_can_post:boolean;member:boolean;manager:boolean}>(
  "SELECT g.id,g.name,g.privacy,g.owner_id,g.member_count,g.members_can_post,"+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='approved') AS member,"+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='approved' AND m.role IN ('admin','moderator','owner')) AS manager "+
  "FROM public.groups g WHERE g.id=$1",[id,userId]);
 const row=q.rows[0];
 return row&& (row.privacy==="public"||!!userId&&(row.owner_id===userId||row.member))?row:null;
}
async function personalList(client:PoolClient,userId:number,page:number){
 return (await client.query<{id:number;name:string}>(
  "SELECT g.id,g.name FROM public.groups g WHERE g.owner_id=$1 OR "+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$1 AND m.status='approved') OR "+
  "(g.privacy='public' AND EXISTS(SELECT 1 FROM public.saved_items s WHERE s.user_id=$1 AND s.content_type='group' AND s.content_id=g.id)) "+
  "ORDER BY g.id ASC LIMIT 1 OFFSET $2",[userId,page])).rows[0]||null;
}
async function publicClockGroup(client:PoolClient){
 const r=await client.query<{total:string}>("SELECT count(*)::text AS total FROM public.groups WHERE privacy='public'");
 const total=Number(r.rows[0]?.total||0);
 if(!total)return null;
 const slot=Math.floor(Date.now()/8000);
 const offset=((slot%total)+total)%total;
 return (await client.query<{id:number;name:string}>(
  "SELECT id,name FROM public.groups WHERE privacy='public' ORDER BY id ASC LIMIT 1 OFFSET $1",[offset])).rows[0]||null;
}
async function memberStats(client:PoolClient,id:number,userId:number|null){
 const g=await getGroup(client,id,userId);if(!g)return "Group not available.";
 const p=(await client.query<{member_stats_public:boolean}>(
  "SELECT member_stats_public FROM public.group_phone_profiles WHERE group_id=$1",[id])).rows[0];
 if(!p?.member_stats_public&&g.owner_id!==userId&&!g.manager)return "The group owner has not enabled member statistics.";
 const s=await client.query<{members:string;saved:string}>(
  "SELECT (SELECT count(DISTINCT user_id)::text FROM public.group_members WHERE group_id=$1 AND status='approved') AS members,"+
  "(SELECT count(DISTINCT user_id)::text FROM public.saved_items WHERE content_type='group' AND content_id=$1) AS saved",[id]);
 return "Members signed up "+(s.rows[0]?.members||"0")+". Saved in personal lists "+(s.rows[0]?.saved||"0")+".";
}
export async function groupPhoneDigit(client:PoolClient,s:GroupPhoneSession,digit:string):Promise<GroupPhoneSession>{
 const next={...s,feedback:""};
 const back=()=>{next.path="161";next.focusId=null;next.page=0;};
 if(s.path==="161"){
  if(digit==="0"){next.path="16";return next;}
  if(digit==="1"){next.path="1611";next.page=0;return next;}
  if(digit==="2"){next.path="1612";return next;}
  if(digit==="3"){next.path="1613";next.page=0;return next;}
  const groupId=/^0[1-3]$/.test(digit)?validId(digit):(/^[1-9]\d{0,7}$/.test(digit)?validId(digit):null);
  if(groupId){
   if(!await getGroup(client,groupId,s.verifiedUserId)){next.feedback="This group is not public or you are not a member.";return next;}
   next.path="1614";next.focusId=groupId;next.page=0;
  }
  return next;
 }
 if(s.path==="1611"){
  if(digit==="0"){back();return next;}
  if(digit==="1"){next.path="16112";return next;}
  if(digit===""||digit==="None"){next.path="16111";return next;}
  return next;
 }
 if(s.path==="16111"){
  if(digit==="0"||digit==="9"){next.path="1611";return next;}
  if(digit==="1"&&s.focusId){
   if(await getGroup(client,s.focusId,s.verifiedUserId)){next.path="1614";next.page=0;}
  }
  return next;
 }
 if(s.path==="16112"){
  if(digit==="0"){next.path="1611";return next;}
  // Text-name keypad search requires a dedicated typed-keypad workflow. Do
  // not silently substitute an unsafe lookup of private group names.
  next.feedback="Name search on the phone is not enabled yet. You can enter a public group number or search names on the website.";
  return next;
 }
 if(s.path==="1612"){
  if(digit==="0")back();
  else next.feedback="Group creation by phone requires a recorded name and all group settings. Please create the group on the Gavhah website until the recording and confirmation steps are verified.";
  return next;
 }
 if(s.path==="1613"){
  if(digit==="0"){back();return next;}
  if(!s.verifiedUserId){next.feedback="Securely link your Gavhah website account under My Askanus option 5.";return next;}
  if(digit==="1"&&s.focusId&&await getGroup(client,s.focusId,s.verifiedUserId)){
   next.path="1614";next.page=0;return next;
  }
  if(digit==="2")next.page=Math.min(100000,s.page+1);
  if(digit==="8")next.page=Math.max(0,s.page-1);
  return next;
 }
 if(s.path==="1614"){
  if(digit==="9"||digit==="*"){back();return next;}
  if(!s.focusId){back();return next;}
  if(/^[0-7]$/.test(digit)){next.path="1614"+digit;next.page=0;}
  return next;
 }
 if(s.path==="16141"){
  if(digit==="0"){next.path="1614";return next;}
  if(digit==="1")next.page=Math.min(100000,s.page+1);
  if(digit==="8")next.page=Math.max(0,s.page-1);
  if(digit==="2")next.page=0;
  return next;
 }
 if(s.path==="16146"){
  if(digit==="0"){next.path="1614";return next;}
  if(!s.focusId||!s.verifiedUserId){next.feedback="Pair your website account before changing group settings.";return next;}
  const g=await getGroup(client,s.focusId,s.verifiedUserId);
  if(!g){back();return next;}
  if(digit==="1"){
   await client.query("INSERT INTO public.saved_items(user_id,content_type,content_id,content_title,content_url) "+
    "VALUES($1,'group',$2,$3,$4) ON CONFLICT(user_id,content_type,content_id) DO NOTHING",
    [s.verifiedUserId,g.id,g.name,"/groups/"+g.id]);
   next.feedback="Group saved without becoming a member.";
  }else if(digit==="2"){
   await client.query("DELETE FROM public.saved_items WHERE user_id=$1 AND content_type='group' AND content_id=$2",
    [s.verifiedUserId,g.id]);next.feedback="Removed from your explicitly saved list. Your membership is unchanged.";
  }else if(digit==="3"){
   // Joining is always subject to the current website's private/public rules.
   const existing=await client.query<{id:number;status:string}>(
    "SELECT id,status FROM public.group_members WHERE group_id=$1 AND user_id=$2",
    [g.id,s.verifiedUserId]);
   if(existing.rows[0]?.status==="suspended"||existing.rows[0]?.status==="removed"){
    next.feedback="Your group access is inactive. Contact the owner.";
   }else if(existing.rows[0]?.status==="approved"||g.owner_id===s.verifiedUserId){
    next.feedback="You are already a group member.";
   }else{
    const status=g.privacy==="public"?"approved":"pending";
    const user=await client.query<{name:string}>("SELECT name FROM public.users WHERE id=$1",[s.verifiedUserId]);
    if(existing.rows[0]){
     await client.query("UPDATE public.group_members SET status=$3 WHERE group_id=$1 AND user_id=$2",[g.id,s.verifiedUserId,status]);
    }else{
     await client.query("INSERT INTO public.group_members(group_id,user_id,user_name,role,status) VALUES($1,$2,$3,'member',$4)",
      [g.id,s.verifiedUserId,user.rows[0]?.name||"Gavhah member",status]);
    }
    if(status==="approved")await client.query("UPDATE public.groups SET member_count=member_count+1 WHERE id=$1",[g.id]);
    next.feedback=status==="approved"?"You joined this group and it is now in your personal member list.":"Your membership request was submitted.";
   }
  }
  return next;
 }
 if(s.path==="16147"){
  if(digit==="0")next.path="1614";
  return next;
 }
 if(s.path.startsWith("1614")){
  if(digit==="0")next.path="1614";
  return next;
 }
 return next;
}
export async function groupPhonePrompt(client:PoolClient,s:GroupPhoneSession):Promise<{text:string;focusId?:number|null;mode:"menu"|"article"|"news"}>{
 const path=s.path,id=s.focusId,uid=s.verifiedUserId;
 if(path==="161")return {mode:"article",text:"Group Center. Enter a group number and press pound. Press 1 for the list of all public groups. Press 2 to create a group. Press 3 for your saved and joined groups. Press zero to go back."};
 if(path==="1611")return {mode:"news",text:"For search by group name press 1. To hear public groups one after another, wait on the line."};
 if(path==="16111"){
  const g=await publicClockGroup(client);
  if(!g)return{mode:"news",text:"No public groups available. Press 9 to return."};
  return{mode:"news",focusId:g.id,text:(say(g.name)||"Group number "+g.id)+". For this group press 1. To return press 9."};
 }
 if(path==="16112")return{mode:"article",text:"Search by group name. This telephone search is still being verified. Enter a group number at the Group Center main menu or search by name on the website. Press zero to return."};
 if(path==="1612")return{mode:"menu",text:"To create a community group you need a name recording and group settings. Telephone creation is not yet enabled. You can already create and manage your group on the Gavhah website. Press zero to return."};
 if(path==="1613"){
  if(!uid)return{mode:"menu",text:"Your own groups require a verified account. Under My Askanus press 5 and enter the pairing code from the website. Press zero to return."};
  const g=await personalList(client,uid,s.page);
  return g?{mode:"menu",focusId:g.id,text:"Your saved or joined group: "+(say(g.name)||"Group number "+g.id)+". Press 1 to open it, 2 for next, 8 for previous, or zero to go back."}
   :{mode:"menu",focusId:null,text:"No more saved or member groups. Press 8 for previous or zero to return."};
 }
 if(!id)return{mode:"menu",text:"Group not selected. Press zero to return."};
 const g=await getGroup(client,id,uid);
 if(!g)return{mode:"menu",text:"Group not available. Press zero to return."};
 if(path==="1614")return{mode:"menu",text:"Community group "+(say(g.name)||"number "+id)+
  ". Press zero for group management. Press 1 for messages. Press 2 to record a message. Press 3 to contact group management. Press 4 for a private reply. Press 5 for hotline conference. Press 6 for group settings and saved lists. Press 7 for member statistics. Press 9 to return."};
 if(path==="16141"){
  const post=await client.query<{id:number;content:string;author_name:string}>(
   "SELECT id,content,author_name FROM public.group_posts WHERE group_id=$1 AND moderation_status='approved' "+
   "ORDER BY is_pinned DESC,created_at DESC,id DESC LIMIT 1 OFFSET $2",[id,s.page]);
  const p=post.rows[0];
  return{mode:"menu",text:p?"Group message "+p.id+". "+(say(p.content,160)||"This message requires an approved audio recording")+
    ". Press 1 for next, 8 for previous, 2 to restart, or zero to return."
    :"No more approved messages. Press 8 for previous or zero to return."};
 }
 if(path==="16146")return{mode:"menu",text:"Group settings. Press 1 to save without joining. Press 2 to remove from saved. Press 3 to join this group as a member. Press zero to return."};
 if(path==="16147")return{mode:"menu",text:await memberStats(client,id,uid)+" Press zero to return."};
 if(path==="16140")return{mode:"menu",text:uid&&(g.owner_id===uid||g.manager)
   ?"Group manager. Secure moderation and all advanced options are available in your Gavhah website group management page. Press zero to return."
   :"Only the owner or an authorized group manager can use group management. Press zero to return."};
 if(path==="16142")return{mode:"menu",text:"Message recording will become available after the provider recording and moderation connection is verified. Press zero to return."};
 if(path==="16143")return{mode:"menu",text:"To leave a message for the group management, please open the group on Gavhah website. Press zero to return."};
 if(path==="16144")return{mode:"menu",text:"Private voice replies to members will be enabled after the secure inbox recording integration is verified. Press zero to return."};
 if(path==="16145")return{mode:"menu",text:"Group telephone conferencing requires the separate conference provider integration. Not enabled yet. Press zero to return."};
 return{mode:"menu",text:"Press zero to go back."};
}
