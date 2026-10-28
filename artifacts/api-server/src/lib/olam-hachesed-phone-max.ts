import type {PoolClient} from "pg";

/**
 * MAX telephone parity with the website: ONE Neon store for contacts, call
 * reports, finance and follow-ups. Only the separately verified website
 * member in the phone call state is allowed to access these methods.
 * No caller-ID authentication or phone-originated financial verification.
 */
type ContactRow={
 id:number;name:string;do_not_call:boolean;preferred_timezone:string;
 preferred_hours:string;opt_out_reason:string
};
type Row={sum:string;verified:string;count:number};
const dateNow=()=>new Date().toISOString().slice(0,10);
const dollars=(value:unknown)=>Number(value||0).toFixed(2);

export async function currentMAXContact(client:PoolClient,userId:number,page:number):Promise<ContactRow|null>{
 const selected=await client.query<ContactRow>(
  "SELECT id,name,do_not_call,preferred_timezone,preferred_hours,opt_out_reason "+
  "FROM public.communication_contacts WHERE user_id=$1 "+
  "ORDER BY updated_at DESC,id DESC LIMIT 1 OFFSET $2",
  [userId,Math.max(0,Math.min(40,page))]
 );
 return selected.rows[0]||null;
}

/** Read-only, owner-scoped contact 360. Amounts are distinctly categorized. */
export async function telephoneMAXContact360(client:PoolClient,userId:number,page:number,caseId:number|null):Promise<string>{
 const c=await currentMAXContact(client,userId,page);
 if(!c)return "No more private contacts. Press 2 to restart or zero to return.";
 const calls=await client.query<{outcome:string;observed_mood:string;created_at:Date;count:number}>(
  "SELECT outcome,observed_mood,created_at,"+
  "(SELECT count(*)::int FROM public.fundraising_call_reports r "+
  "WHERE r.user_id=$1 AND r.contact_id=$2) AS count "+
  "FROM public.fundraising_call_reports WHERE user_id=$1 AND contact_id=$2 "+
  "ORDER BY created_at DESC,id DESC LIMIT 1",[userId,c.id]
 );
 const pledges=await client.query<Row>(
  "SELECT COALESCE(sum(amount),0)::text AS sum,0::text AS verified,count(*)::int AS count "+
  "FROM public.max_pledges WHERE user_id=$1 AND contact_id=$2",[userId,c.id]
 );
 const receipts=await client.query<Row>(
  "SELECT COALESCE(sum(amount-refunded_amount),0)::text AS sum,"+
  "COALESCE(sum(CASE WHEN verification='verified' THEN amount-refunded_amount ELSE 0 END),0)::text AS verified,"+
  "count(*)::int AS count FROM public.max_receipts WHERE user_id=$1 AND contact_id=$2",[userId,c.id]
 );
 const followups=await client.query<{count:number}>(
  "SELECT count(*)::int AS count FROM public.max_followup_contacts f "+
  "JOIN public.case_followups cf ON cf.id=f.followup_id "+
  "JOIN public.askanus_cases ac ON ac.id=cf.case_id "+
  "WHERE f.user_id=$1 AND f.contact_id=$2 AND ac.user_id=$1 AND cf.completed=false",[userId,c.id]
 );
 const last=calls.rows[0];
 const safeName=c.name.replace(/[<>&=\r\n]/g," ").slice(0,85);
 const policy=c.do_not_call
  ?"DO NOT CALL. "+(c.opt_out_reason?"Opt out is recorded. ":"")+
   "Do not initiate an outgoing call. "
  :"Not opted out in MAX. This is NOT authorization to call. Check local time, consent and restrictions on the website. ";
 let response="Private MAX contact "+(page+1)+". "+safeName+". "+policy+
  "Pledged "+dollars(pledges.rows[0]?.sum)+" dollars. "+
  "Reported net receipts "+dollars(receipts.rows[0]?.sum)+" dollars. "+
  "Verified net receipts "+dollars(receipts.rows[0]?.verified)+" dollars. "+
  (last?"Latest manually entered outcome "+last.outcome+
    ", observed mood "+last.observed_mood+". ":"No manual calls reported. ")+
  "Open follow ups "+(followups.rows[0]?.count||0)+". "+
  (caseId?"For selected case "+caseId+", ":"")+
  "Press 1 next, 8 previous, 2 restart, 0 return. ";
 if(caseId)response+="MANUAL report for case "+caseId+": press 3 no answer, 4 callback, 5 not interested, 6 do not call, or 7 spoke. Press twice to confirm.";
 else response+="To record a result, choose a case under My Cases, then press 3.";
 return response;
}

const choices:Record<string,string>={
 "3":"no_answer","4":"callback","5":"not_interested",
 "6":"do_not_call","7":"spoke"
};
export function maxOutcomeToken(contactId:number,choice:string):number|null{
 const d=Number(choice);
 if(!Number.isSafeInteger(contactId)||contactId<1||contactId>200000000||!choices[choice])return null;
 return contactId*10+d;
}

/**
 * Append one idempotent MANUAL report, never a claimed provider call.
 * Entire helper is run inside the parent phone transaction.
 */
export async function logMAXPhoneOutcome(
 client:PoolClient,userId:number,caseId:number,contactId:number,
 choice:string,callHash:string
):Promise<string>{
 const outcome=choices[choice];
 if(!outcome)return "Invalid call outcome.";
 const cs=await client.query<{id:number}>(
  "SELECT id FROM public.askanus_cases WHERE id=$1 AND user_id=$2 FOR UPDATE",
  [caseId,userId]
 );
 if(!cs.rows.length)return "Case not available for this member.";
 const contact=await client.query<ContactRow>(
  "SELECT id,name,do_not_call,preferred_timezone,preferred_hours,opt_out_reason "+
  "FROM public.communication_contacts WHERE id=$1 AND user_id=$2 FOR UPDATE",
  [contactId,userId]
 );
 const c=contact.rows[0];
 if(!c)return "Contact no longer available.";
 if(c.do_not_call&&outcome!=="do_not_call")
  return "This contact is marked DO NOT CALL. Cannot log a new outgoing-call outcome; review their permission on the website.";
 const today=dateNow();
 const requestId="phone-max:"+callHash+":"+caseId+":"+contactId+":"+choice;
 const saved=await client.query<{id:number}>(
  "INSERT INTO public.fundraising_call_reports "+
  "(user_id,case_id,contact_id,contact_name,outcome,observed_mood,money_kind,amount,note,request_id) "+
  "VALUES ($1,$2,$3,$4,$5,'neutral','none',0,$6,$7) "+
  "ON CONFLICT(user_id,request_id) DO NOTHING RETURNING id",
  [userId,caseId,contactId,c.name,outcome,
   "Phone keypad manual report. No provider-connected call or payment verification is implied.",requestId]
 );
 if(!saved.rowCount)return "This exact phone report was already recorded. No duplicate was created.";
 await client.query(
  "INSERT INTO public.case_activity_log(case_id,date,type,note) "+
  "VALUES($1,$2,'contact',$3)",
  [caseId,today,"Manual phone keypad outcome for contact "+contactId+": "+outcome]
 );
 await client.query(
  "INSERT INTO public.max_history_events "+
  "(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'contact',$3,'manual_phone_outcome',$4,$5)",
  [userId,caseId,contactId,c.name,JSON.stringify({outcome,origin:"phone_keypad",reportId:saved.rows[0].id})]
 );
 if(outcome==="do_not_call"){
  await client.query(
   "UPDATE public.communication_contacts SET do_not_call=true,"+
   "opt_out_reason='Opt-out recorded by linked member via MAX phone menu',updated_at=now() "+
   "WHERE id=$1 AND user_id=$2",[contactId,userId]
  );
 }else if(outcome==="callback"){
  const followup=await client.query<{id:number}>(
   "INSERT INTO public.case_followups(case_id,date,note,due_date) "+
   "VALUES($1,$2,$3,NULL) RETURNING id",
   [caseId,today,"Callback requested for contact "+c.name+
    " via verified phone MAX; schedule date/time on the website."]
  );
  await client.query(
   "INSERT INTO public.max_followup_contacts(user_id,contact_id,followup_id) "+
   "VALUES($1,$2,$3)",[userId,contactId,followup.rows[0].id]
  );
 }
 return "Saved MANUAL result "+outcome+" for contact "+c.name+". "+
  (outcome==="do_not_call"?"Calling is now blocked. ":
   outcome==="callback"?"An unscheduled follow up was created; set its time on the website. ":"")+
  "The same records are available on the website.";
}

/** Read-only finance overview. Do not equate a manually reported receipt with a verified payment. */
export async function telephoneMAXFinanceSummary(client:PoolClient,userId:number):Promise<string>{
 const result=await client.query<{
  pledged:string;reported:string;verified:string;refunds:string;pledge_count:number;receipt_count:number
 }>(
  "SELECT "+
  "(SELECT COALESCE(sum(amount),0)::text FROM public.max_pledges WHERE user_id=$1) AS pledged,"+
  "(SELECT COALESCE(sum(amount-refunded_amount),0)::text FROM public.max_receipts WHERE user_id=$1) AS reported,"+
  "(SELECT COALESCE(sum(amount-refunded_amount),0)::text FROM public.max_receipts "+
  "WHERE user_id=$1 AND verification='verified') AS verified,"+
  "(SELECT COALESCE(sum(amount),0)::text FROM public.max_receipt_refunds WHERE user_id=$1) AS refunds,"+
  "(SELECT count(*)::int FROM public.max_pledges WHERE user_id=$1) AS pledge_count,"+
  "(SELECT count(*)::int FROM public.max_receipts WHERE user_id=$1) AS receipt_count",[userId]
 );
 const x=result.rows[0];
 return "Your private MAX finance overview. "+
  x.pledge_count+" pledges totaling "+dollars(x.pledged)+" dollars. "+
  x.receipt_count+" manually entered receipt records, net "+dollars(x.reported)+" dollars. "+
  "Separately verified receipts net "+dollars(x.verified)+" dollars. "+
  "Recorded refunds "+dollars(x.refunds)+" dollars. "+
  "Do not treat unverified reports as received money. "+
  "Outstanding balances require matching receipts to their exact pledges. "+
  "Press zero for main menu.";
}
