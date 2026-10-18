import type {PoolClient} from "pg";

/**
 * Owner-scoped website financial history readback.
 * Never transacts money, confirms bank delivery or modifies pledges/receipts.
 */
export async function readMyPledge(client:PoolClient,userId:number,page:number){
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(page)||page<0||page>100000)return null;
 const r=await client.query<{
  id:number;amount:string;paid_amount:string;status:string;due_date:string|null;
  note:string|null;contact_id:number|null;case_id:number|null;
 }>(
  "SELECT id,amount::text,COALESCE(paid_amount,0)::text AS paid_amount,"+
  "status,due_date,note,contact_id,case_id "+
  "FROM public.max_pledges WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",
  [userId,page]);
 return r.rows[0]||null;
}
export async function readMyReceipt(client:PoolClient,userId:number,page:number){
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(page)||page<0||page>100000)return null;
 const r=await client.query<{
  id:number;amount:string;refunded_amount:string;method:string|null;
  verification:string|null;contact_id:number|null;case_id:number|null;pledge_id:number|null;
 }>(
  "SELECT id,amount::text,COALESCE(refunded_amount,0)::text AS refunded_amount,"+
  "method,verification,contact_id,case_id,pledge_id "+
  "FROM public.max_receipts WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",
  [userId,page]);
 return r.rows[0]||null;
}
export function safeMoney(amount:unknown):string{
 const value=Number(amount);
 if(!Number.isFinite(value)||value<0||value>1000000000000)return "amount unavailable";
 return value.toFixed(2)+" dollars";
}
