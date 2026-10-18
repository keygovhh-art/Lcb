# STAGED ONLY — Gavhah hotline next batch, October 16, 2026

IMPORTANT: User explicitly says DO NOT PUBLISH yet. Do not merge, trigger Render, or call Yemot UpdateExtension for this batch until a separate instruction explicitly approves publication. Production hotline stays fully untouched.

## Male voice — upcoming approved release
The male voice update uses the official Yemot configuration voice=ymMale, tts_voice=ymMale, language=en. It is staged in lib/yemot-male-voice-next-release.ts and is invoked only on a later production startup following explicit approval to release. A single additive release marker prevents repeat settings writes. This update does NOT change type=api, callback secrets, recordings, child extensions or menu routes. Provider documentation warns of possible fallback to ymSimcha, requiring physical listening verification.

## News and updates — new real features
The Press 1 article action menu now announces this exact signed-in member's existing like and saved bookmark state from entity_likes / saved_items, as well as public approved phone audio-reply count from gavhah_news_voice_replies. No other member's personal bookmark state is exposed.

## My Askanus — new real features
Press 7 for unfinished tasks, press 8 for overdue tasks, press 9 for tasks due within the next seven days. These use the canonical askanus_tasks data and user_id filter; deadline text is ISO YYYY-MM-DD and comparisons use the New York local calendar day. Current task list now reads related case title and task notes when English voice-safe. Any personal task-list allows Press 5 twice to mark incomplete tasks complete, updating the actual site's task status. Completed tasks from the full list support Press 6 twice to reopen with completed_at cleared. Existing case reader now includes website category/contact/description and goal/promised/received amounts; private notes provide a longer English voice preview. All private actions require a valid website-linked 8-digit temporary phone session, not caller ID.

## Release gates
1. Keep PR draft, unmerged, with no Render deploy and no Yemot updates now.
2. CI TypeScript full website/API build and phone route audit green.
3. Review malformed deadlines, timezones, privacy isolation and idempotency before release.
4. After user explicitly approves deployment, inspect startup logs and male voice release state; physically call 605-562-1286 and verify voice, 1/2 branches, filters, member linking and website sync.
5. Do not claim 100 percent web parity: task/case/note creation/editing/deleting by phone, full note speech, and most Campaign Center functions remain incomplete.

The current working root API and 0 provider management option must remain unchanged.
## Independent member-account security — staged after initial batch

- Gavhah: own public.users primary credentials, accepts either secure mixed-character web passwords (minimum eight) or numeric-only ones (minimum twelve). Existing passwords are never overwritten when a permanent telephone PIN is chosen.
- Gavhah separate member hotline PIN: 12–16 digits, keyed HMAC lookup + random-salt scrypt verifier, website password re-confirmation to set/change. Administrator-allocated PIN needs the individual member's logged-in website confirmation to activate, preventing admin impersonation. PIN is never visible in later listing.
- Existing signed-in website members can activate assigned PIN in My Askanus. The founder management panel can assign/revoke with signed-in administrator password re-confirmation and single-use display when generated.
- Self-service PHONE registration in Gavhah is a PENDING verified-contact account application: member enters 10–15 digit contact and 12–16 digit numeric password. An administrator must independently verify phone ownership, choose verified member name, re-enter admin website password, and explicitly approve. Only then do the normal users and own Gavhah telephone PIN tables receive the account and numeric password hash. No mere caller ID confers membership.
- Other site's Campaign Center: entirely separate Neon-managed Auth (JWT subject), separate cc_phone_member_pins, CC_PHONE_PIN_PEPPER and cc_phone_sessions; CC accounts are not linked to Gavhah member IDs or passwords. The single Yemot bridge uses a pinned server-to-server URL and YEMOT_CENTRAL_SHARED_SECRET for Campaign Center login, session/snapshot and logout; the Campaign Center server itself checks active cc_memberships. CC administrator assignments require own-organization owner/manager role and owner confirmation in own Neon Auth session before use.
- Unauthorized private Gavhah/MAX and Campaign Center menu nodes route to the correct product's login, no private data; CC finance/manager menus have role requirements. This is only a navigation protection; *individual future API actions must also retain server-side tenant and record permissions*.
- Campaign Center site numeric-only website password signup is validated client-side at minimum twelve digits before invoking Neon-managed sign-up; Neon Auth provider's own password policy and verification remain authoritative.

### Separate CC staging dependencies
- PR: keygovhh-art/Govhh #17. SQL: campaign-center-neon/db/007_isolated_phone_member_pin.sql.
- Central CC route requires the same existing secure shared service secret configured independently at both services, and CC_PHONE_PIN_PEPPER only in Campaign Center secrets. Configuration changes and SQL migrations are release-gated.
- There is no CC-only direct telephone account creation in this batch because creating verified Neon Auth identities requires Neon-managed signup; account-opening menu directs to the CC website instead. Do not call this feature complete.

### Do NOT deploy / integrity gates
- Keep both PRs DRAFT; do not change Neon production schema or Render service environment now.
- Before approved release: apply SQL migrations after backup in staging, validate no existing account is granted unauthorized PIN, two phone calls with different Gavhah identities, two CC organization subjects in separate tenants, malicious/unknown PIN, 5-failure throttles, banned/suspended member, admin-issued unactivated PIN, repeated web registration, failed provider shared secret.
- The original working root welcome, Press 0 provider management, audio files, and existing voice must remain unchanged until explicit deployment approval. The requested male voice remains staged.


## Iteration 2 — My Askanus keypad CRUD (STAGED ONLY, NOT LIVE)
All operations use Gavhah verified member_id, canonical askanus tables, transactional MAX history, same single Yemot API entry. No caller-ID identity.

### Tasks
- Press 3 on any own task list: enter a 10–15 digit number to create one website callback task, title Call [number], standard medium priority, and associated notes. This is structured numeric task creation, not arbitrary dictation/TTS transcription.
- Press 4 on selected task: priority 1 low, 2 medium, 3 high. Press 5 twice complete, 6 twice reopen, 7 and eight digits YYYYMMDD to set deadline (eight zeros clears), 9 twice to delete current task; 1 next, 2 restart, 8 previous, 0 main.
- Task changes are owner-scoped by user_id and selected immutable task id, with website max_history_events inserted in same transaction. Limit to fifteen new callback tasks per member per hour.
- Full arbitrary-text task title/notes editing is not yet implemented by phone.

### Cases
- Private case option 3 changes case status: 1 open, 2 in progress, 3 closed; option 4 changes urgency: 1 low, 2 medium, 3 high, 4 critical.
- Case rows are user_id-scoped, progress amounts are NEVER written by these controls, max_history_events logs changed fields and old/new values.
- Case creation, finance/ledger modifications and full arbitrary notes remain pending.

### Private notes
- Read own note; press 9 twice to permanently delete selected personal note; zero cancels. A private audit record is retained, never a copy of the deleted note content.
- Recording/transcribing new notes is not yet implemented.

### Release gates
- Additive phone session task_action / task_action_target / case_action / case_action_target / note_delete_target in the STAGED SQL file artifacts/api-server/sql/20261016_gavhah_phone_members.sql.
- No production Neon migration, main merge, Render deployment or Yemot change. Test staging migration, two-user ownership isolation, date validation, callback duplicate handling, confirm/cancel safety, MAX history, phone hearing and keypad on an authorized future deployment.

## Iteration 3 — Member Followups (STAGED, not live)
- Existing main phone menu Gavhah > People and Contacts > Follow ups (1-3-4) now maps to authenticated My Askanus case followups from case_followups joined to cases belonging to the exact Gavhah user_id.
- Reads deadline, time, note (English-safe or fallback), recurrence, completion and navigates with 1/2/8/0.
- Nonrecurring followups: press 5 twice to mark complete, press 6 twice to reopen. Changes are tenant/owner scoped, row-locked, and audited in MAX history in the same transaction.
- Recurring followups are READ ONLY on the phone: the normal website creates the next dated instance and transfers linked donor/contact references, therefore phone completion deliberately blocks until that recurrence process is implemented end-to-end.
- This is partial phone functionality. Arbitrary note creation and full recurring rule editing, notification scheduling and contact editing remain pending.
- No files or production data were changed. Test future release against actual website recur dates, timezone, idempotent duplicate callbacks, and two-user isolation.

## Case management — staged incremental batch
- My Askanus > My personal cases, phone keys 1-2-2.
- Press 3 to change current member-owned case status open/in_progress/closed. Press 4 to change urgency low/medium/high/critical. Both use canonical askanus_cases and max_history_events with ownership check.
- Press 5 to create an internal callback case: enter 10-15 digit contact number. Creates General case without financial changes, writes the site's case_activity_log and personal history, capped to ten per hour. Contact phone never authenticates any account.
- Press 6 to create nonrecurring, date-only followup on selected case: enter YYYYMMDD. Writes canonical case_followups with America/New_York time zone, unspecified time, repeat_rule=none, and max_history_events history. No money transactions or appointments generated.
- These phone actions require an active Gavhah login and the selected case must belong to that member.
- Do not claim full parity: case financial ledger mutations, advanced recurrence, arbitrary text editing and linked case deletion remain unimplemented on phone.
- Do not deploy or run production database migration without explicit user approval.


## Private voice notes: Gavhah member-only, STAGING
- My Askanus > Notes (phone 1-2-3): while reading a note, press 3 to begin a private recording. Recording path must pass provider-owned WAV validation; a new canonical private askanus_notes item is created in the same DB transaction as member call-state update.
- Additive DB table gavhah_phone_private_note_audio maps existing site note ID to verified member user ID and provider WAV pointer; recording fingerprint is unique to prevent callback duplicates. No public website route and no Campaign Center record.
- Authenticated website API GET /api/askanus/phone-voice-notes and /api/askanus/phone-voice-notes/:noteId/audio require the CURRENT site session, active status, site note ownership and same original user_id, before bytes are proxied. Audio is bounded to six megabytes and marked private/no-store.
- My Askanus > Notes renders audio controls in the same Notes tab, with an explicit refresh button. Deleted parent notes automatically delete metadata via FK cascade.
- Release gate: Yemot actual recording response and provider WAV pointer shape have NOT been tested. Provider recording availability/retention are unverified. Must test with physical call on approved staging/release after both consent and isolated member identities. Never claim full audio playback is already live.
- Current limitation: voice note editing/transcription, audio deletion from provider itself and arbitrary Yiddish TTS are NOT implemented.
- Never publish draft or production migrate without explicit user approval.


## Additional case timeline action — Draft only
- On the authenticated member's currently selected case, phone key 7 opens a contact-attempt confirmation. Press 9 again to record the attempt or 0 to cancel. The case ID and user ID are verified again in the canonical database under row lock.
- This writes an actual website case_activity_log entry of type contact, updates last_updated, and writes max_history_events for the same member. It NEVER places an outbound call and NEVER claims a recipient answered. The confirmation describes an attempt as the member's own log, not a verified external event.
- No financial ledger, donor balances, member identity or provider configuration is changed.
- Physical DTMF testing remains a future release gate; no Render deployment, production migration, or provider API changes were made for this batch.

## Exact case lookup — member isolation
- In Gavhah My Askanus > Cases, key 9 asks for an existing site case number (up to eight digits), then jumps to its actual place in the user-owned list. Ownership is checked using the same user_id as on the website. Neither presence nor content of another member's case is exposed.
- This key does not grant any account login, mutate data, or call anyone; it just sets the listening cursor within the current verified member's own cases.
- Physical keypad and voice playback still require testing after approved release. No current Render or provider changes.

## Follow-ups — latest staged parity milestone (October 18, 2026)
- The existing personal followup listing at phone tree path 1 > 3 > 4 continues to read ONLY the signed-in member's followups by joining case_followups to their own askanus_cases; unlinked callers are denied.
- Existing: 5 twice to complete nonrecurring; 6 twice to reopen nonrecurring, with historical events; recurring followup completion remains WEBSITE-ONLY because it generates the next series occurrence.
- NEW: 3 sets due date using eight-digit YYYYMMDD, with full calendar validation. Enter 00000000 to cancel without editing. Preserves repeat cadence and existing reminder time/timezone and writes MAX history event.
- NEW: 4 starts phone create-followup wizard, enter an OWNED Gavhah case ID up to eight digits and a date YYYYMMDD. It reuses createCaseFollowupFromPad (nonrecurring, date only, rate-limited) and writes case_followups and max_history_events within the same Neon DB transaction. Enter 0 to cancel case selection or 00000000 to cancel date entry.
- NEW: 9 selects current followup for deletion. The second 9 confirms. No update occurs if the member does not own the parent case; records a permanent followup_explicitly_deleted history event.
- The state fields followup_action/followup_action_target exist only as additive SQL IN THIS DRAFT; do not apply this migration to the live database before release approval.
- Live Render, phone provider API root, personal identity system, active TTS voice, and active calls MUST NOT be changed by this draft.
- REQUIRED: TypeScript builds and phone route audit, simulation of replayed callbacks, cross-member isolation, recurring followup nonmutation, invalid dates (Feb 30, zeroes), and verifying source case activity both in website and API after a future owner-authorized release. Do NOT call this complete/physically tested yet.

## NEXT DEPARTMENT — People and Contacts / Donor 360 (STAGED, NOT LIVE)
All actions are under Gavhah option 1 > People and Contacts (option 3):
- 1 — Donor 360 **read-only** financial/contact snapshot for the selected own contact. Same canonical `communication_contacts`, `max_pledges`, `max_receipts`, `fundraising_call_reports`, and `max_followup_contacts` website tables. Includes non-cancelled pledge amounts, remaining balances, net received after refunds, count of manual reports and linked followups. No charge, payment, outbound call, settlement or reimbursement.
- 2 — Browse own contacts with 1 next / 8 previous / 2 restart; read owner-scoped contact name, phone, org, city, role, preferred hours and Do Not Call.
- 3 — Create a new *callback contact* from a numerical telephone number. Website stores it as `Phone contact NUMBER` with explicit notation that number and permission to call are **unverified**; website `max_history_events` is audited. Never initiate a call. Duplicate phone search is owner-only.
- 4 — Find an existing contact by number (normalized digits) inside own contact list.
- 7 — Find by exact website contact ID, always filtered by current authenticated `user_id`.
- 5 then 9 — Mark selected contact Do Not Call with explicit confirmation and normal website history. NEVER remove Do Not Call through the phone; website has its own audited permission workflow.
- 0 — return to root / cancel.

Technical staging files: `lib/yemot-askanus-contacts-actions.ts`, phone bridge `lib/yemot-api-driven-phone.ts`, `sql/20261016_gavhah_phone_members.sql` for additive `contact_action` + `contact_action_target` call-state columns. Every read checks active Gavhah website-linked member login, including on continuing submenus.

Known remaining Donor 360 parity gaps: individual pledges/receipts drill-down; case-specific linking, export, pledge settlements and refunds, follow-up editing, legally valid donor consent/overrides, and actual provider calls/SMS. Do NOT claim this is a complete Donor 360 phone feature.
