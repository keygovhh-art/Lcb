# Gavhah Charity Center — STAGING ONLY

OWNER RELEASE HOLD: no GitHub main merge, no Render deploy, no production Neon writes, and no donor notification until owner explicitly approves release.

## Included
- Live, queued (date-free waiting line), scheduled (future calendar time), archived.
- Admin can create/edit, schedule/reschedule, go live immediately, move back to queue, feature in Today's Charity, and record verified offline donations.
- Public list, public detail, and Today's Charity exclude queued/archived/future scheduled campaigns. The server uses read-time checks against UTC instants, so Render Free sleeping does not prevent a scheduled campaign from becoming available on the next request. Frontend refetches every 60 seconds.
- Featured future campaigns do not displace the currently selected featured charity until their scheduled instant.
- Admin-configured separate phone and HTTPS payment link CTA with independent button labels and style/layout choices. Phone extension can be entered with #3333. Most dialers will open the number; auto-sending the DTMF extension is not universal, so UI shows a manual/copy fallback.
- The website does not handle payment credentials or claim external payment success; only staff can log offline donations.


## Reserved optional native donation system (NOT READY)
- Per campaign: `nativeDonationEnabled` (default OFF), custom button label and style. Editor shows a **disabled preview only**, not an active checkout link.
- Global admin-only settings at `/api/admin/charity/native-settings`: master enable flag (default OFF), default button label, minimum/maximum USD amounts, up to 8 suggested amounts, custom amount, future recurring gifts, anonymous donations, optional receipts. All optional defaults.
- `NATIVE_CHECKOUT_INTEGRATED = false` is a server hard gate: **even a stored checkbox cannot initiate a transaction**. Turning on master enable while the processor is unimplemented is rejected by the API. No user-facing native Donate action is created.
- No card details, bank data, API secrets or webhook credentials are stored. No payment gateway, payout, refunds, settlement, verified receipts, recurring charge execution, or provider webhooks are implemented.
- Before the owner may activate native donations in future: implement PCI-safe hosted/tokenized checkout with verified provider account, authenticated charity mapping, signed webhooks, deduplicated donations, proper refunds/reconciliation, fraud controls, and end-to-end tests. Activation requires separately authorized work.

## Additional staged feature — official join → member-private case
- A signed-in member joining the active featured cause gets an automatically created, unique, owner-private My Askanus case. Repeated joins do not increase supporter totals, create duplicate workspaces or inflate financial figures.
- Organizers and joined Community Projects also get unique linked private cases; existing memberships are imported by the idempotent SQL migration below.
- The United page changes the button to **איך בין אקטיוו אי״ה** when that account has joined, and displays **עפען קאמפיין אין מיין פריוואטער סיסטעם** under Share. Clicking brings the member to the case in `/my?case=<id>`.
- Community Projects have joined-state buttons and links to their respective personal case.
- Personal cases support tasks, follow-ups, notes, real progress, activity history, status, and returning to the public source. Official linked records cannot be deleted, but they may be closed to retain history.
- Own-account status comes from `GET /api/me/official-joins` protected by `requireAuth`, NOT from names in the public supporter list. Switching accounts rechecks their respective memberships.
- SQL to apply ONLY AFTER owner approval, BEFORE deploying this code: `lib/db/migrations/20261013_official_joins_to_my_askanus.sql`. It adds source columns, a unique index and safely backfills previous joins without copying public donations/pledges as personal funds.
- Neither this SQL nor the prior charity migration was applied to production. No emails/push notifications were sent by staging work.

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
