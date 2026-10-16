# Gavhah telephone parity — first two departments

## Baseline (do not misstate)
No complete department on the hotline is equivalent to every website action yet. The provider root has not been installed or physically call-tested; central connection status is currently disabled. A passing TypeScript CI is not a tested phone call.

## Department 1 — News and updates
**Actual shared database reads in API:** all public news, newest first, all the same site category values (emergency appeals, fundraising, announcements, volunteer calls, community alerts, organization updates, Bikur Cholim, community, medical/wedding), urgent/high/breaking, and featured. The news reader continues without a five-article cap, splits long *English* text into parts, exposes DTMF 0 main, 1 next, 2 restart, 3 important, 4 all, 8 back. Native provider timeout behavior and Yiddish voice remain **unverified / unfinished**. Unfinished: publishing/editing, image access via telephone, replies/moderation, typed search, likes, saved article IDs.

## Department 2 — My Askanus / MAX (personal section)
**Actual shared database functions:** website logged-in users can request an 8-digit time-limited pairing code from /my; valid single-use codes expire in 5 minutes and only allow this CALL's user session for 30 minutes. The code is HMAC-hashed server-side, never shown in provider settings. Phone API supports own Tasks (read; two-press confirm mark completed with DB update), own Cases (status/urgency/goal), own Notes, personal dashboard counts, and sign out. These use canonical `askanus_tasks`, `askanus_cases`, `askanus_notes`, `users` tables, with `user_id` filtering and suspended/banned access checked for every read/write. Call ID itself is never authentication. Unfinished: task creation/edit/delete, case progress/finance and attachments, notes create/update/delete, follow-up calendar, MAX calling/SMS/broadcast/conference operations, fully localized Yiddish media voice.

## Installation gate
This PR changes only the two Gavhah departments and a login endpoint. One `type=api` root extension would eventually direct to our central callback, with no provider submenu configuration. It does **not** change Yemot settings or activate the disconnected central connection.

## Acceptance checklist
- React and API TypeScript builds pass.
- /my login-code UI appears ONLY for authenticated website users and has CSRF/same-origin protection; tests include expiration, rate limiting, wrong code, replay and banned account.
- Simulate two separate calls: code issued for member A cannot disclose any member B record; no PIN input can mutate finance.
- Check All/Important/category/Featured results correspond to /news database queries.
- Confirm phone task completion flips the exact task on /my website and is idempotent; no accidental completion when replaying provider request.
- Read all English article chunks, and test 0 escape, 1 next, 8 previous, and provider timeout with an actual hotline call.
- Never claim 100% parity until every website action is available with a verified equivalent, and provider wiring is live.
