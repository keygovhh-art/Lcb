# Whole-platform Yemot IVR (English testing) — phased, privacy-safe

Goal: one approved hotline DID, with root **1 Gavhah** and **2 Campaign Center**, including ALL sections inside each product. This branch stages **a read-only English menu router** only. It does not claim to complete phone transactions.

## Current live facts
- Platform-global API credentials in Gavhah, stored AES-256-GCM; only Gavhah superadmin controls it.
- Provider account GetTemplates test passed. This proves a credential, **not** IVR routing.
- Central connection must be enabled before webhook responds.
- Existing root directory and IVR content have **not** been inspected, so DO NOT overwrite `/`, `/1` or `/2`.
- No live PIN/session mapping. CallerID, ApiPhone, and ApiEnterID alone are NOT trusted as the website account.

## Navigation map (English)
The entire section catalogue is in `artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts` and deliberately includes both completed and planned modules, with clear spoken warnings for actions which are not yet callable. `0` is the previous menu. All read responses use one-digit DTMF.

Gavhah: news, My Askanus/MAX, donors and contacts, calling center, charity/help, community/folks, minyans/appointments, account, system reports/admin.
Campaign Center: campaigns, tasks/followups, contacts/calls, finance, teams, virtual fundraising hall, Hitkabtzu, manager/audit, six plans/MAX Connect/Yemot.

## Provider deployment steps (NOT AUTOMATIC)
1. Confirm the caller's management hotline account is the same as the one behind the tested token. Read-only `GetIVR2Dir` on `/` and the **chosen test extension**. Record ext.ini + child inventory without logging tokens.
2. Only use a demonstrably empty reserved extension (e.g. `/98`) and obtain explicit owner approval before `UpdateExtension` or `UploadTextFile`. If existing data appears, abort. Never write to /1 or /2 until the owner reviews existing files.
3. Set `type=api`, `api_link=https://gavhah.onrender.com/api/yemot/ivr`, `api_add_0=entryKey=<new random callback key>`, `language=en`, `tts_voice` only after English voice is confirmed on a real call. Treat entryKey as a low-privilege callback secret, NEVER use the Yemot admin token.
4. The app host has server-only `YEMOT_IVR_CALLBACK_KEY` matching that separate callback secret (>=32 random characters), and current global connection enabled.
5. Call the actual number, dial the reserved extension, verify root 1/2, nested menus, back 0, English pronunciation, duplicate/timeout handling, invalid presses, and hang-up behavior on at least two devices.
6. Only with additional explicit approval, copy original IVR configuration backups and add root 1/2 routing without deleting other extensions. Any conflicting root keys require owner sign-off.

## End-to-end write roadmap (not yet built)
- Level A: public/menu-only information, guest access.
- Level B: user-specific read-only data after **OTP/PIN binding**; per-user permission checks against both products' own identity systems, with Neon Auth sessions never assumed from callerID.
- Level C: create/edit tasks, call results, leads, followups; confirmation prompt + idempotency keys + audit; Do Not Call and team scoping.
- Level D: monetary events, pledges, approvals; stronger auth and double-entry protections; bank/provider verification not implied by manual records.
- Level E: live rooms/audio, recordings, transfers and real-time channel presence; provider feature and capacity proof, consent policies and load testing.
- Dual-app MAX Connect must never automatically disclose private contacts or re-use permissions across workspaces.
- English voice + menus for testing; custom Yiddish scripts later. English phone system prompts may require `language=en` as well as a tested TTS voice; do not promise all provider prompts until a real English call is confirmed.

## Tests/acceptance
- Unit: every menu choice resolves to the correct node, no personal data exposed.
- Integration: no secret => HTTP 403; not enabled => 503; approved callback sees provider formatted output.
- Every part passes staging, CI and manually verified external provider test.
- Neither a successful GitHub build nor a passing GetTemplates request is a live phone acceptance test.