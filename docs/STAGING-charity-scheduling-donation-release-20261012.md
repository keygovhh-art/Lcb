# Gavhah Charity Center — STAGING ONLY

OWNER RELEASE HOLD: no GitHub main merge, no Render deploy, no production Neon writes, and no donor notification until owner explicitly approves release.

## Included
- Live, queued (date-free waiting line), scheduled (future calendar time), archived.
- Admin can create/edit, schedule/reschedule, go live immediately, move back to queue, feature in Today's Charity, and record verified offline donations.
- Public list, public detail, and Today's Charity exclude queued/archived/future scheduled campaigns. The server uses read-time checks against UTC instants, so Render Free sleeping does not prevent a scheduled campaign from becoming available on the next request. Frontend refetches every 60 seconds.
- Featured future campaigns do not displace the currently selected featured charity until their scheduled instant.
- Admin-configured separate phone and HTTPS payment link CTA with independent button labels and style/layout choices. Phone extension can be entered with #3333. Most dialers will open the number; auto-sending the DTMF extension is not universal, so UI shows a manual/copy fallback.
- The website does not handle payment credentials or claim external payment success; only staff can log offline donations.

## Safe production release sequence — only after owner approval
1. Take a new, verified Neon production backup branch; confirm the app connects to that project, not an older unrelated project.
2. Apply `lib/db/migrations/20261012_charity_release_queue_donations.sql` to the correct production database BEFORE deploying the new app. This is additive and idempotent, retains all existing campaigns and donation records. NEVER run the migration against Neon before approval.
3. Merge this staging branch to `main` only after TypeScript and both API/frontend builds and regression tests pass.
4. Trigger exactly one manual Render deploy (autoDeploy currently off).
5. Verify admin create queue + scheduled + live flows, public hidden status behavior, date boundary behavior, and safe phone/link buttons. Use nonproduction test data and an actual two-device Android check for extension dialing.

## Notes
- Queue items have no schedule and remain private.
- Scheduled entries become public when their UTC instant passes; status is derived at read time. If the server is asleep, no permanently running cron job is needed. Homepage UI refreshes about once per minute while open.
- Existing legacy campaigns stay live after migration with their existing isActive/isTodaysFeatured values.
- Admin should only set donation URLs to an approved organization's real HTTPS payment page. No identity documents, cards, or personal data are collected by Gavhah itself.
