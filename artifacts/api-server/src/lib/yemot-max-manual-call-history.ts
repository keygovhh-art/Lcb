import type {PoolClient} from "pg";

/** Existing manually-entered MAX call reports, not carrier CDR records. */
export async function readMyManualCallReport(client:PoolClient,userId:number,page:number){
 if(!Number.isSafeInteger(userId)||userId<=0||
    !Number.isSafeInteger(page)||page<0||page>100000)return null;
 const result=await client.query<{
  id:number;case_id:number;contact_id:number|null;
  contact_name:string;outcome:string;money_kind:string;
  amount:string;note:string;observed_mood:string;created_at:string;
 }>(
  "SELECT id,case_id,contact_id,contact_name,outcome,money_kind,amount::text,note,observed_mood,created_at::text "+
  "FROM public.fundraising_call_reports "+
  "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
 return result.rows[0]||null;
}
