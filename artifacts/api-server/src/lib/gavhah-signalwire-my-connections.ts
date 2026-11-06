import type {PoolClient} from "pg";
import {CONNECTION_META_TYPE,parseConnectionState,hasReleaseAuthorization,type ConnectionState} from "./member-connections";

// Connected only to the owner-verified SignalWire Gavhah handset, never to
// the Yemot conference-only provider or Olam Chesed's separate phone line.
export type PhoneConnectionsState={
 path:string;page:number;focusId:number|null;feedback:string;
};
type ConnectionItem={id:number;state:ConnectionState;partnerId:number};
const stageWords:Record<string,string>={
 new:"Gavhah staff review is pending",
 invited:"Both members must approve personally",
 needs_reapproval:"Fresh member consent is required",
 awaiting_staff_release:"Waiting for final Gavhah staff authorization",
 accepted:"Both members approved, final staff permission granted",
 connected:"Connection confirmed",
 contact_problem:"A contact problem was sent to Gavhah",
 consent_revoked:"Permission has been withdrawn",
 declined:"The proposal was declined",
 closed_unfulfilled:"The case was closed without a connection"
};
function voiceSafe(raw:unknown){
 const text=String(raw||"").replace(/[^\x20-\x7e]/g,"").replace(/[<>&=,;]/g," ").trim().slice(0,100);
 return text||"Gavhah member";
}
async function list(client:PoolClient,uid:number):Promise<ConnectionItem[]>{
 const r=await client.query<{id:number;subject:string;message:string}>(
  "SELECT id,subject,message FROM public.support_messages WHERE type=$1 ORDER BY id DESC LIMIT 2000",
  [CONNECTION_META_TYPE]);
 const seen=new Set<string>(),result:ConnectionItem[]=[];
 for(const meta of r.rows){
  if(seen.has(meta.subject))continue;
  seen.add(meta.subject);
  const caseId=Number(meta.subject.match(/^support:(\d+)$/)?.[1]);
  if(!Number.isSafeInteger(caseId)||caseId<=0)continue;
  const state=parseConnectionState(meta.message);
  if(!state||state.requesterUserId!==uid&&state.volunteerUserId!==uid)continue;
  result.push({id:caseId,state,partnerId:state.requesterUserId===uid?state.volunteerUserId:state.requesterUserId});
 }
 return result;
}
export function isSignalWireConnectionsPath(path:string){
 return path==="9703"||/^97039(?:[0-9])?$/.test(path);
}
export async function nextSignalWireConnections(client:PoolClient,
 current:PhoneConnectionsState,digit:string,verifiedUserId:number|null
):Promise<PhoneConnectionsState>{
 const next={...current,feedback:""};
 if(!verifiedUserId){
  next.path="9703";next.focusId=null;next.page=0;
  next.feedback="Sign in securely using your Gavhah member pairing code first. ";
  return next;
 }
 if(next.path==="9703"){
  if(digit==="1"){next.path="970391";next.page=0;next.focusId=null;}
  else if(digit==="2"){next.path="970393";next.focusId=null;}
  else if(digit==="3"){next.path="970394";next.focusId=null;}
  else if(digit==="4"){next.path="97031";next.page=0;next.focusId=null;}
 }else if(next.path==="970391"){
  const items=await list(client,verifiedUserId),n=Number(digit);
  if(digit==="9"){if((next.page+1)*8<items.length)next.page++;else next.feedback="No more connections. ";}
  else if(Number.isInteger(n)&&n>=1&&n<=8){
   const item=items[next.page*8+n-1];
   if(item){next.path="970392";next.focusId=item.id;}
   else next.feedback="That connection number is not on this page. ";
  }
 }else if(next.path==="970392"){
  if(digit==="1")next.path="970395";
 }else if(next.path==="970395"){
  if(digit==="1")next.path="970392";
 }
 return next;
}
export async function speakSignalWireConnections(client:PoolClient,
 state:PhoneConnectionsState,verifiedUserId:number|null
):Promise<string>{
 const intro=state.feedback||"";
 if(!verifiedUserId)return intro+"Be'ezras Hashem. My Connections is private. Securely pair your Gavhah member account first under My Askanus, then return. Press zero to go back.";
 if(state.path==="9703")return intro+
  "Be'ezras Hashem. My Connections. To hear your connections list press 1. "+
  "To register privately as a volunteer ready to help, press 2. "+
  "To request help from approved Askanim, press 3. "+
  "For the existing community projects directory press 4. Press zero to go back.";
 if(state.path==="970391"){
  const items=await list(client,verifiedUserId);
  if(!items.length)return intro+"You have no connection proposals yet. Press zero to return.";
  const page=items.slice(state.page*8,(state.page+1)*8);
  const line=page.map((x,i)=>{
   const n=i+1,stage=stageWords[x.state.stage]||"Review pending";
   return "For connection "+n+", "+stage+", press "+n+". ";
  }).join("");
  return intro+"Your private connections, page "+(state.page+1)+". "+line+
   (items.length>(state.page+1)*8?"For the next page press 9. ":"")+"Press zero to return.";
 }
 if(state.path==="970393")return intro+
  "Private volunteer registration, matching the Gavhah signup questions. "+
  "After the beep, record your areas of help, which days or date range you are available, "+
  "your daily start and end hours, your time zone and any important notes. "+
  "Your signed-in Gavhah account identifies you; contact preferences require staff review. "+
  "Press pound when finished. Only Gavhah staff can access this application.";
 if(state.path==="970394")return intro+
  "Private request for Askanim help. After the beep, record the case title, "+
  "the kind of help needed, a description of the situation, and its urgency. "+
  "Your signed-in Gavhah account identifies you. Press pound when finished. "+
  "The case remains private and needs staff review.";
 if(state.path==="970392"||state.path==="970395"){
  const item=(await list(client,verifiedUserId)).find(x=>x.id===state.focusId);
  if(!item)return intro+"The connection is no longer in your account. Press zero to return.";
  const partner=await client.query<{nickname:string|null;name:string|null;status:string}>(
   "SELECT nickname,name,status FROM public.users WHERE id=$1",[item.partnerId]);
  const name=voiceSafe(partner.rows[0]?.nickname||partner.rows[0]?.name);
  const participant=item.state.requesterUserId===verifiedUserId?"person offering help":"person requesting help";
  const stage=stageWords[item.state.stage]||"Review pending";
  if(state.path==="970392")return intro+"Connection with "+name+
   ", "+participant+". Press 1 to hear details. Press zero to go back.";
  const role=item.state.requesterUserId===verifiedUserId?"requester":"volunteer";
  const other=role==="requester"?"volunteer":"requester";
  const mine=!!item.state.approvals[role],theirs=!!item.state.approvals[other];
  const canRelease=["accepted","connected"].includes(item.state.stage)&&
   hasReleaseAuthorization(item.state)&&partner.rows[0]?.status==="active";
  const point=canRelease?item.state.agreedContacts?.[other]:null;
  return intro+"Connection "+state.focusId+". "+stage+". "+
   (mine?"You approved. ":"You have not yet personally approved. ")+
   (theirs?"The other member approved. ":"The other member has not approved. ")+
   (point?"Gavhah has authorized the selected contact method. "+point.method+
      ", "+voiceSafe(point.value)+". ":"Contact details remain confidential until both members consent and Gavhah gives final authorization. ")+
   "Press zero to go back.";
 }
 return intro+"Press zero to return.";
}
