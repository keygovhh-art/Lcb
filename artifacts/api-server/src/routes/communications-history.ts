import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

/**
 * A unified, paginated private activity timeline.
 *
 * Includes EXISTING records even from before the new event log was installed.
 * Paid pledges, finished tasks, closed cases and completed follow-ups are never
 * excluded just because they aren't active any more.
 *
 * Important: the underlying source records stay stored. This endpoint never
 * deletes, archives away or truncates historical work.
 */
const router=Router();
const sections=new Set(["all","events","activities","followups","pledges",
  "payments","tasks","cases","calls","contacts"]);
type Item={id:number;kind:string;action:string;caseId:number|null;entityId:number;
 title:string;details:string;happenedAt:Date|string};

router.get("/askanus/max/history",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const kind=typeof req.query.kind==="string"?req.query.kind:"all";
  const rawCase=req.query.caseId;
  const caseId=rawCase===undefined?null:Number(rawCase);
  const limit=Number(req.query.limit??40);
  const offset=Number(req.query.offset??0);
  const search=typeof req.query.q==="string"?req.query.q.trim():"";
  if(!sections.has(kind)||!Number.isSafeInteger(limit)||limit<1||limit>100||
    !Number.isSafeInteger(offset)||offset<0||offset>200000||
    (caseId!==null&&(!Number.isSafeInteger(caseId)||caseId<=0))||search.length>120){
    res.status(400).json({error:"Invalid private history filter"});return;
  }
  // Every UNION branch checks *server-side* session owner, including children
  // that have no user_id field. No public campaign/cross-account access.
  const result=await db.execute(sql`
    WITH all_history AS (
      SELECT h.id::bigint AS id,'events'::text AS kind,h.action,
        h.case_id AS case_id,h.entity_id AS entity_id,h.title,h.details,
        h.happened_at AS happened_at
      FROM max_history_events h WHERE h.user_id=${userId}
      UNION ALL
      SELECT a.id::bigint,'activities',a.type::text,a.case_id,a.id,
        c.title,
        concat_ws(' — ',a.note,CASE WHEN a.amount IS NOT NULL
          THEN '$' || a.amount::text END),a.created_at AT TIME ZONE 'UTC'
      FROM case_activity_log a
      JOIN askanus_cases c ON c.id=a.case_id AND c.user_id=${userId}
      UNION ALL
      SELECT f.id::bigint,'followups',
        CASE WHEN f.completed THEN 'completed' ELSE 'open' END,f.case_id,f.id,
        c.title,
        f.note || CASE WHEN f.due_date IS NOT NULL
          THEN ' · ' || f.due_date ELSE '' END ||
          CASE WHEN f.due_time IS NOT NULL THEN ' '||f.due_time ELSE '' END,
        CASE WHEN f.completed THEN coalesce(f.completed_at,f.created_at AT TIME ZONE 'UTC')
          ELSE f.created_at AT TIME ZONE 'UTC' END
      FROM case_followups f
      JOIN askanus_cases c ON c.id=f.case_id AND c.user_id=${userId}
      UNION ALL
      SELECT p.id::bigint,'pledges',p.status,p.case_id,p.id,
        c.title, '$'||p.amount::text||' pledged; $'||p.paid_amount::text||
          ' reported paid; balance $'||(p.amount-p.paid_amount)::text,
        CASE WHEN p.status='paid' THEN p.updated_at AT TIME ZONE 'UTC'
          ELSE p.created_at AT TIME ZONE 'UTC' END
      FROM max_pledges p
      JOIN askanus_cases c ON c.id=p.case_id AND c.user_id=${userId}
      WHERE p.user_id=${userId}
      UNION ALL
      SELECT r.id::bigint,'payments',r.verification,r.case_id,r.id,
        c.title, '$'||r.amount::text||' manually entered; $'||
          r.refunded_amount::text||' reversed; method: '||r.method,
        r.created_at AT TIME ZONE 'UTC'
      FROM max_receipts r
      JOIN askanus_cases c ON c.id=r.case_id AND c.user_id=${userId}
      WHERE r.user_id=${userId}
      UNION ALL
      SELECT t.id::bigint,'tasks',CASE WHEN t.completed THEN 'completed' ELSE 'open' END,
        NULL::integer,t.id,t.title,coalesce(t.notes,''),
        CASE WHEN t.completed THEN coalesce(t.completed_at,t.created_at AT TIME ZONE 'UTC')
          ELSE t.created_at AT TIME ZONE 'UTC' END
      FROM askanus_tasks t WHERE t.user_id=${userId}
      UNION ALL
      SELECT c.id::bigint,'cases',c.status::text,c.id,c.id,c.title,
        coalesce(c.description,''),
        CASE WHEN c.status='closed' THEN coalesce(c.closed_at,c.created_at AT TIME ZONE 'UTC')
          ELSE c.created_at AT TIME ZONE 'UTC' END
      FROM askanus_cases c WHERE c.user_id=${userId}
      UNION ALL
      SELECT cr.id::bigint,'calls',cr.outcome,cr.case_id,cr.id,
        cr.contact_name,coalesce(cr.note,''),
        cr.created_at AT TIME ZONE 'UTC'
      FROM fundraising_call_reports cr WHERE cr.user_id=${userId}
      UNION ALL
      SELECT co.id::bigint,'contacts',
        CASE WHEN co.do_not_call THEN 'do_not_call' ELSE 'active' END,
        NULL::integer,co.id,co.name,
        concat_ws(' · ',nullif(co.organization,''),nullif(co.city,''),nullif(co.tags,'')),
        co.created_at AT TIME ZONE 'UTC'
      FROM communication_contacts co WHERE co.user_id=${userId}
    )
    SELECT id,kind,action,case_id AS "caseId",entity_id AS "entityId",
      title,details,happened_at AS "happenedAt"
    FROM all_history
    WHERE (${kind}='all' OR kind=${kind})
      AND (${caseId}::integer IS NULL OR case_id=${caseId}::integer)
      AND (${search}='' OR (title ILIKE '%'||${search}||'%'
        OR details ILIKE '%'||${search}||'%'))
    ORDER BY happened_at DESC,kind ASC,id DESC
    LIMIT ${limit+1} OFFSET ${offset}
  `);
  const rows=(result.rows||[]) as unknown as Item[];
  res.setHeader("Cache-Control","private, no-store");
  res.json({items:rows.slice(0,limit).map(r=>({
    ...r,id:Number(r.id),entityId:Number(r.entityId),
    happenedAt:new Date(r.happenedAt).toISOString(),
  })),hasMore:rows.length>limit,nextOffset:offset+Math.min(rows.length,limit),
  note:"Finished work, fully paid pledges and closed projects remain in permanent source records. Historical events are additional append-only snapshots. Financial details are manually reported unless externally verified."});
});
export default router;
