# Gavhah: provider separation, cutover & voice — 2026-10-30

## Confirmed provider ownership
- **Yemot only:** Gavhah main, My Askanus, Campaign Center (4444), other Gavhah modules. The Yeshiva system is a separate project and is not moved by this single callback edit.
- **SignalWire only:** Olam Hachesed Communications / MAX. Its signed shared cXML callback and old protected 55555 remain on SignalWire.
- Cloudflare hosts the backend for both providers with isolated adapters; the telecom carriers continue to own the phone numbers and handle incoming media.

## Actual Cloudflare production
Script `gavhah-cloudflare-native`, version **`6f325a65-db9f-4138-b04b-5f890c02f6b6`**, deployment **`79808552-0e08-49d3-88f7-2de09ecc644c`**, 100% Worker traffic (verified with readback). Previous rollback version: `b9081a5e-f325-4e15-8e62-c7bf1e4136ba`.
All ten original environment bindings preserved. Signed SignalWire webhook still requires signature, expected dialed number, old route fingerprint. No new My Askanus SignalWire function.

## New SignalWire Olam professional voice
- 12 seeded extension profile rows in `public.gavhah_olam_signalwire_voice_profiles`.
- Each row controls male English TTS rate (90–115%), comma pause (60–350 ms), sentence pause (150–750 ms), and enable/disable.
- Native SignalWire cXML `<Say voice="man"><prosody rate="...">...<break time="..."/></prosody></Say>`, XML escaped and validated.
- Existing keypad actions, external 55555 routing, call recording and MAX back-end unaffected. No premium Polly/Neural voice.
- Superadmin mobile voice editor: `https://gavhah-cloudflare-native.keygovhh.workers.dev/api/admin/max/ivr-editor/voice-studio`.
- Editing requires same-origin authenticated `super_admin` session, validates all numeric ranges, and updates only the voice profile table. No provider account mutations.
- **Physical call TTS results have not been verified.** Roll back if the selected voice engine fails to interpret SSML.

## Yemot migration is NOT yet complete
Existing Yemot number: **6055621286**. `gavhah_yemot_global.enabled=true`, `gavhah_yemot_ivr_install.state=live`, target path `/`, Campaign Center 4444 state `live`.
Its persisted provider callback remains **`https://gavhah.onrender.com/api/yemot/ivr`**.

The existing superadmin-only cutover page is:
`https://gavhah.onrender.com/api/admin/yemot/cloudflare-switch`.
It requires site admin session, read-only actual Yemot root `ext.ini` check, HMAC fingerprint match, exact existing callback, CSRF / same-origin confirmation, then it updates **only the root `api_link`** to
`https://gavhah-cloudflare-native.keygovhh.workers.dev/api/yemot/ivr`.
The number, provider account, all recordings, root media and extensions must remain untouched. Provider read-back and best-effort rollback are built into this protected owner action.

No available connected tool can impersonate the owner's website session or directly authorize the provider write, so **the provider callback was not changed in this release**. Do NOT claim the physical Yemot line is served by Cloudflare yet.

Once the owner performs the cutover: query `public.gavhah_yemot_ivr_install.provider_summary->>'apiEndpoint'`; physically call 6055621286 and verify the welcome menu, account pairing, My Askanus keypad, Campaign Center 4444, menu recording playback, and failure/fallback behavior. Verify timestamps/phone outcomes without recording secrets.
