import type {PoolClient} from "pg";

const gvDirectExtraMenu2026={
 "97190":{label:"Gavhah Search",options:{"1":{label:"Find news by number",to:"115"},"2":{label:"Find a discussion by number",to:"166"},"3":{label:"Find a charity by number",to:"155"},"4":{label:"Find a group by number",to:"167"},"5":{label:"Find a minyan by number",to:"173"}}},
 "97193":{label:"My Connections",options:{"1":{label:"My connection cases",to:"971931"},"2":{label:"Connections awaiting my approval",to:"971932"},"3":{label:"My followed organizations and updates",to:"164"}}}
};
async function gvMyConnectionCases2026(client:PoolClient,userId:number,onlyPending:boolean,page:number){
 const r=await client.query(
  "SELECT id,subject,message::jsonb->>'stage' AS stage,message::jsonb->'approvals' AS approvals,message::jsonb->>'requesterUserId' AS requester_id,message::jsonb->>'volunteerUserId' AS volunteer_id FROM public.support_messages "+
  "WHERE type='__member_connection_meta__' AND (message::jsonb->>'requesterUserId'=$1 OR message::jsonb->>'volunteerUserId'=$1) "+
  "ORDER BY id DESC LIMIT 150",[String(userId)]);
 const seen=new Set<number>(),items:Array<{status:string;approved:boolean}>=[];
 for(const x of r.rows){
  const caseNo=Number(String(x.subject||'').match(/^support:(\d+)$/)?.[1]);
  if(!Number.isSafeInteger(caseNo)||caseNo<=0)continue;
  const k=x.requester_id===String(userId)?"requester":"volunteer";
  if(seen.has(caseNo))continue;seen.add(caseNo);
  const status=String(x.stage||"pending").replace(/_/g," ");
  const approved=Boolean(x.approvals?.[k]);
  if(onlyPending&&!(["invited","needs_reapproval"].includes(x.stage)&&!approved))continue;
  items.push({status,approved});
 }
 const current=items[Math.max(0,Math.min(40,page))];
 return (onlyPending?"Your connections awaiting your permission. ":"Your Gavhah connections. ")+items.length+" cases. "+
  (current?"Case "+(Math.max(0,Math.min(40,page))+1)+". Status: "+current.status+". "+(current.approved?"You already provided your decision. ":"Personal permission has not been given. "):
  "No connection in this list. ")+
  "For next press 1. Previous press 8. Press star to go back. Decisions and private contact sharing require separate personal consent and final Gavhah authorization.";
}
