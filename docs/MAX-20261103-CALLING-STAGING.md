# עולם החסד MAX — staged non-recorded call desk (2026-11-03)

The code in this branch is staged, **NOT LIVE**. The Cloudflare production Worker is not fully source-mirrored; do NOT redeploy the old repository bundle over the live Worker. Live Gavhah/Yemot and the Phone Yeshiva must remain unchanged.

## Added
- Per-owner last selected project is remembered in the database, not just this browser.
- A new call may be skipped without a project, then linked later; project, notes, mood and result remain editable.
- USA/Canada +1 number entry with NANP syntax checks; do-not-call contacts are rejected.
- Call metadata has direction, provider status, start/answer/end times, seconds and a hard database cap of 3 participants, with no recording storage.
- The UI carefully labels PREPARED calls as **not dialed**. True duration and direction require verified provider events; a phone-browser tel: link cannot furnish call metadata.
- The caller's own hold announcement can be saved (Gavhah default or private text). Custom audio is reserved for a verified, admin-uploaded media reference; it is not playing on a call yet.
- Yiddish call entry and keypad guidance: before-call 1=choose project, 2=skip, 3=options. During-call 1=answer waiting, 2=toggle hold, 3=louder, 4=quieter, 5=submenu (1=hang up, 2=dial another), 6=3-way up to 3, 0=help. These are **guidance only**, not active DTMF controls.

## Explicit blockers
1. Apply SQL migration to a verified staging Neon branch only. Production data must not be touched until backup, tests and approval.
2. Reconcile the Cloudflare production Worker (many live hotfixes not in GitHub) before deploying any new bundle.
3. Establish and test actual SignalWire credentials scoped to Olam Chesed Communication, outbound caller ID, signed voice callbacks, inbound waiting, live call leg controls, real audio-on-hold and **recording disabled**.
4. Confirm US/Canada geography with an authoritative carrier lookup, not just +1 (NANP also covers other territories).
5. Register trusted provider webhooks for authoritative timestamps/status/duration. Never let a browser or unsigned callback write those metrics.
6. Test on Android and physical telephone devices. Hardware volume may not be remotely controllable from PSTN digits; use actual device volume, or a supported media gain interface after verification.
7. Enforce max 3 participants in the provider conference as well as in database. Test transfer, hold, merge, hangup, and disconnected/waiting calls.

The existing SignalWire hotline number and existing Yemot provider are not changed. No provider writes or billable calls are performed by this branch.


## Additional guarded implementation (2026-11-03)
- Campaign Center canonical database is the source for active memberships, individual assignment, 20-minute claims and call outcomes; Govhh PR #61 has separate disposable-Postgres passing tests.
- MAX frontend shows the joined campaign's call queue and picks the next contact with one tap; after verified authorization it invokes /dial automatically.
- POST /api/askanus/max/calling/sessions/:id/dial uses a separate dedicated Olam SignalWire Compatibility API project to call the member's **owner-verified callback phone first**; after the member answers, a signed webhook initiates the donor leg. The original audio is **not** recorded, and provider webhooks supply duration (no synthesized duration).
- POST /control {action:"hangup"} uses the provider Call SID and requires provider confirmation. HOLD/3-way/incoming call waiting/handset volume are not yet implemented or represented as live.
- Before each Campaign Center dial, the MAX backend revalidates the member's exclusive call claim against the Campaign Center server via /call-queue/:id/authorize-dial; rejects unknown countries and DNC contacts. DB partial unique index blocks concurrent billable sessions.
- **Connection correction (2026-11-03): SignalWire has ALREADY been connected and verified.** The canonical encrypted connection is in `gavhah_signalwire_credentials`; verified at 2026-10-27 02:12 UTC, with a verified route for +16056558080. Olam MAX now reuses this connection and the existing worker signing key. The new code no longer requires separate `OLAM_SIGNALWIRE_SPACE`, `OLAM_SIGNALWIRE_PROJECT_ID`, `OLAM_SIGNALWIRE_API_TOKEN`, `OLAM_SIGNALWIRE_SIGNING_KEY`, `OLAM_SIGNALWIRE_FROM` or `OLAM_SIGNALWIRE_CALLBACK_BASE` secrets. Existing account linkage MUST NOT be repeated. `OLAM_SIGNALWIRE_CALLING_ENABLED=true` is an **outbound-billing activation switch only**, not a new connection credential. This remains off until call-flow testing, database migration, agent callbacks and production deployment are completed.
- Admin must separately approve Olam access and verify each agent's callback phone via PUT /api/admin/olam/max/agent-phone/:uid, with explicit VERIFY attestation. No member-controlled phone setting can enable billable calls.
- Olam SignalWire shared IVR cXML is exactly two 4-second Gather prompts, then Hangup with NO final/goodbye announcement. Optional owner-uploaded signed WAV on extension "retry" is supported; fallback is short English TTS until Yiddish WAV is published. This is **not** the unchanged Yemot IVR. No live provider routing was changed.
- **NOT DEPLOYED**. As inspected, Gavhah production Neon lacks max_call_sessions and Campaign Center production Neon lacks cc_contacts.assigned_member_subject. New staging Neon branches cannot currently be created due to account branch limits. Production Cloudflare Worker contains live revisions absent from the GitHub bundle. Do not merge, migrate or deploy until backup/reconciliation, provider credential verification and physical number tests.
