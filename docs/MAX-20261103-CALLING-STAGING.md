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