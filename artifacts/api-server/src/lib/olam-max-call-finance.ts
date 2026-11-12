import {pool} from "@workspace/db";

/**
 * Use the existing My Askanus totals, fundraising_call_reports and case activity.
 * Never mint a second "money source" for the same Olam call session.
 *
 * A money correction is an atomic delta to the OLD and NEW case. Report ID stays
 * constant, so authorized My Askanus / MAX views of that report are consistent.
 *
 * This function is invoked AFTER a phone/web call report is saved; on error the
 * report remains available to retry. Never report payment processor verification.
 */
export async function reconcileOlamCallFinance(userId:number,callId:number){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const q=await client.query(
   "SELECT id,user_id,case_id,contact_id,number_e164,outcome,mood,note,report_details "+
   "FROM public.max_call_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",[callId,userId]);
  const call=q.rows[0];if(!call)throw Object.assign(Error("Call not found"),{status:404});
  const raw=call.report_details||{};
  const moneyKind=raw.moneyKind==="donation"?"received":raw.moneyKind==="pledge"?"pledged":"none";
  const amount=Number(raw.amount??0);
  if(!Number.isFinite(amount)||amount<0||amount>100000000||Math.round(amount*100)!==amount*100)
   throw Object.assign(Error("Invalid financial amount"),{status:400});
  const existing=(await client.query(
   "SELECT session_id,report_id,case_id,money_kind,amount FROM public.max_call_financial_links "+
   "WHERE session_id=$1 AND user_id=$2 FOR UPDATE",[callId,userId])).rows[0];
  if(moneyKind!=="none"&&amount>0&&!call.case_id){
   await client.query("COMMIT");
   return {financialRecorded:false,requiresPurpose:true,previousRecordPreserved:!!existing};
  }
  // Reversing a report requires explicit editing of its amount/kind, never
  // hiding its call-history row. For zero or none, preserve an audit trail.
  const oldAmount=existing?Number(existing.amount):0;
  const oldKind=existing?.money_kind||"none",oldCase=Number(existing?.case_id||0);
  const newAmount=moneyKind==="none"?0:amount;
  const newKind=newAmount>0?moneyKind:"none",newCase=Number(call.case_id||0);
  const deltas=new Map<number,{received:number;pledged:number}>();
  const put=(id:number,kind:string,delta:number)=>{
   if(id<=0||!delta||!["received","pledged"].includes(kind))return;
   const slot=deltas.get(id)||{received:0,pledged:0};
   slot[kind as "received"|"pledged"]+=delta;
   deltas.set(id,slot);
  };
  if(existing)put(oldCase,oldKind,-oldAmount);
  if(newKind!=="none")put(newCase,newKind,newAmount);
  // Always lock/update cases in ascending order, avoiding transfer deadlocks.
  for(const id of [...deltas.keys()].sort((a,b)=>a-b)){
   const v=deltas.get(id)!;
   const updated=await client.query(
    "UPDATE public.askanus_cases SET "+
    "funds_received=funds_received+$1::numeric,funds_promised=funds_promised+$2::numeric,last_updated=now() "+
    "WHERE id=$3 AND user_id=$4 AND funds_received+$1::numeric>=0 AND funds_promised+$2::numeric>=0 RETURNING id",
    [v.received.toFixed(2),v.pledged.toFixed(2),id,userId]);
   if(!updated.rowCount)throw Object.assign(Error("Case totals changed; reconcile before retry"),{status:409});
  }
  const contact=call.contact_id?(await client.query(
    "SELECT name FROM public.communication_contacts WHERE id=$1 AND user_id=$2",[call.contact_id,userId])).rows[0]:null;
  const contactName=String(contact?.name||("Call "+String(call.number_e164).slice(-4))).slice(0,240);
  const details=JSON.stringify({
   callSessionId:callId,source:"olam_max_calling",
   previousMoneyKind:oldKind,previousAmount:oldAmount,kind:newKind,amount:newAmount
  });
  if(newKind==="none"){
   if(existing){
    await client.query(
     "UPDATE public.fundraising_call_reports SET money_kind='none',amount=0, "+
     "outcome=$1,observed_mood=$2,note=$3 WHERE id=$4 AND user_id=$5",
     [String(call.outcome||""),String(call.mood||"neutral")||"neutral",String(call.note||""),existing.report_id,userId]);
    await client.query(
     "DELETE FROM public.max_call_financial_links WHERE session_id=$1 AND user_id=$2",[callId,userId]);
    await client.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
     "VALUES($1,$2,'call_report',$3,'finance_corrected',$4,$5)",
     [userId,oldCase,existing.report_id,"Correction from call #"+callId,details]);
    await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note,amount) "+
      "VALUES($1,to_char((now() AT TIME ZONE 'America/New_York')::date,'YYYY-MM-DD'),'update',$2,$3)",
      [oldCase,"Cancelled previously reported "+oldKind+" from call #"+callId,-oldAmount]);
   }
   await client.query("COMMIT");
   return {financialRecorded:false,reversed:!!existing,officialCaseUpdated:!!existing};
  }
  let reportId:number;
  if(existing){
   reportId=Number(existing.report_id);
   await client.query(
    "UPDATE public.fundraising_call_reports SET case_id=$1,contact_id=$2,contact_name=$3,"+
    "outcome=$4,money_kind=$5,amount=$6,note=$7,observed_mood=$8 WHERE id=$9 AND user_id=$10",
    [newCase,call.contact_id,contactName,String(call.outcome||"other"),newKind,newAmount,
     String(call.note||""),String(call.mood||"neutral")||"neutral",reportId,userId]);
   await client.query(
    "UPDATE public.max_call_financial_links SET case_id=$1,money_kind=$2,amount=$3,updated_at=now() "+
    "WHERE session_id=$4 AND user_id=$5",[newCase,newKind,newAmount,callId,userId]);
  }else{
   const inserted=await client.query(
    "INSERT INTO public.fundraising_call_reports "+
    "(user_id,case_id,contact_id,contact_name,outcome,money_kind,amount,note,request_id,observed_mood) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) "+
    "ON CONFLICT(user_id,request_id) DO UPDATE SET id=fundraising_call_reports.id RETURNING id",
    [userId,newCase,call.contact_id,contactName,String(call.outcome||"other"),
     newKind,newAmount,String(call.note||""),"olam-call-session-"+callId,String(call.mood||"neutral")||"neutral"]);
   reportId=Number(inserted.rows[0].id);
   await client.query(
    "INSERT INTO public.max_call_financial_links(session_id,report_id,user_id,case_id,money_kind,amount) "+
    "VALUES($1,$2,$3,$4,$5,$6)",[callId,reportId,userId,newCase,newKind,newAmount]);
  }
  if(!existing||oldKind!==newKind||oldAmount!==newAmount||oldCase!==newCase){
   await client.query(
    "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
    "VALUES($1,$2,'call_report',$3,$4,$5,$6)",[userId,newCase,reportId,
     existing?"finance_corrected":"finance_entered","Olam call #"+callId,details]);
   await client.query(
    "INSERT INTO public.case_activity_log(case_id,date,type,note,amount) "+
    "VALUES($1,to_char((now() AT TIME ZONE 'America/New_York')::date,'YYYY-MM-DD'),$2,$3,$4)",
    [newCase,newKind==="received"?"funds_received":"funds_promised",
     (existing?"Corrected":"Reported")+" call #"+callId+" "+newKind,newAmount-oldAmount]);
  }
  await client.query("COMMIT");
  return {financialRecorded:true,reportId,officialCaseUpdated:true,
    pledgeNotPayment:newKind==="pledged",providerPaymentVerified:false};
 }catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();}
}
