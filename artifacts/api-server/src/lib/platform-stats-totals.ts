import type {PoolClient} from "pg";

// Single source for public website and phone totals. Only global aggregate
// numbers leave the database; never expose members, donors, notes, receipts,
// personal records or individual financial histories.
export type PlatformTotals={
 totalMembers:number;totalDiscussions:number;activeGroups:number;
 totalNewsArticles:number;donationsRaised:number;memberRecordedDonations:number;
};
export async function readPlatformTotals(client:PoolClient):Promise<PlatformTotals>{
 const result=await client.query<{
  totalMembers:number;totalDiscussions:number;activeGroups:number;
  totalNewsArticles:number;donationsRaised:string;memberRecordedDonations:string;
 }>(
  'SELECT '+
  '(SELECT COUNT(*) FROM public.users WHERE status=\'active\')::int AS "totalMembers",'+
  '(SELECT COUNT(*) FROM public.discussions)::int AS "totalDiscussions",'+
  '(SELECT COUNT(*) FROM public.groups)::int AS "activeGroups",'+
  '(SELECT COUNT(*) FROM public.news)::int AS "totalNewsArticles",'+
  '(SELECT COALESCE(SUM(amount),0) FROM public.donations)::text AS "donationsRaised",'+
  '(SELECT COALESCE(SUM(GREATEST(amount-COALESCE(refunded_amount,0),0)),0) '+
  'FROM public.max_receipts WHERE user_id IS NOT NULL)::text AS "memberRecordedDonations"'
 );
 const v=result.rows[0];
 return{
  totalMembers:Number(v?.totalMembers||0),
  totalDiscussions:Number(v?.totalDiscussions||0),
  activeGroups:Number(v?.activeGroups||0),
  totalNewsArticles:Number(v?.totalNewsArticles||0),
  donationsRaised:Number(v?.donationsRaised||0),
  memberRecordedDonations:Number(v?.memberRecordedDonations||0),
 };
}
