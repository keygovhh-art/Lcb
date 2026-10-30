# תיקון — מיין עסקנות אויף ימות המשיח, נישט SignalWire
2026-10-30

## Definitive provider separation
**My Askanus private advanced keypad runs ONLY in the Yemot API code. Never in the SignalWire shared IVR.**
The mistaken SignalWire addon (root keypad 88) was rolled back to pre-addon Cloudflare Worker version `2a0a43b6-d02f-4d43-bf77-c3fc70e07ed9` at 100%, rollback deployment `9bd0f320-a1bb-4037-aff3-03c9c16ebce2`. The previously existing Olam Hachesed MAX menus, old 55555 route, SignalWire number, and other functions were left unchanged. The obsolete `max-askanus-phone.ts` SignalWire My Askanus bridge has been removed from this GitHub branch.

## New Yemot-only Cloudflare backend
Cloudflare script `gavhah-cloudflare-native`, active Worker **version `85897d9c-698d-46c7-a519-7845c062a7eb`**, **deployment `15b351aa-e8e1-424d-b8d1-e1b3bbd41238`**, confirmed at 100% of Worker traffic. It was constructed from the original Olam MAX v44 Worker source and **added only** the isolated Yemot private keypad. All 10 original bindings were preserved. The SignalWire handler does NOT call the My Askanus keypad.

The native Yemot API endpoint is:
`https://gavhah-cloudflare-native.keygovhh.workers.dev/api/yemot/ivr`

Telephone entry from Yemot main menu `88#` or My Askanus menu `2 -> 7` (depending on existing menu and actual provider setup).
The private caller must first link the website My Askanus account through the original short-lived 8-digit pairing code, through the existing menu option 5. No caller-ID identification.

The keypad uses native Yemot `read=t-...=iv...` responses and the same Neon website tables for cases, tasks, notes, contacts, followups, pledges, read-only summaries, confirmed status changes and manual accounting entries; it does not initiate any actual card payment/refund.

## Provider callback has NOT yet switched — do not call it phone-LIVE
Neon provider config verified:
- Yemot line **6055621286** enabled.
- Installed root state `live`, but `provider_summary.apiEndpoint` is still **`https://gavhah.onrender.com/api/yemot/ivr`**.
- New Yemot keypad compiled, tested and deployed to Cloudflare but is NOT routed from the actual incoming Yemot hotline until the provider callback is switched.
- Physical real-world Yemot call test has NOT occurred; Yiddish TTS/transcription not confirmed.

There is an existing superadmin-only, preflight-verified cutover page for this exact isolated Yemot switch:
`https://gavhah.onrender.com/api/admin/yemot/cloudflare-switch`
Superadmin must open, click Verify and approve the cutover. The implementation changes only the root `api_link` and performs read-only baseline/fingerprint checks before the provider write. No SignalWire modifications. If this page cannot verify the provider config, do NOT force a cutover.

### Pending
1. Perform superadmin verification and callback cutover using the above existing page.
2. Check the provider's root api_link now equals the Cloudflare Yemot endpoint.
3. Physical call test on **6055621286**: link existing website member and exercise keypad 88 with a harmless status/task.
4. Verify those records on website and logs, followed by negative tests for unsigned/unpaired callbacks.
5. More complete website parity, Yiddish prompts and speech, richer editing, actual file/audio integration remain future work, not production claims.

The code branch and Cloudflare live Worker have divergent baselines. This PR is deliberately DRAFT/unmerged; do not redeploy branch wholesale over the newer production Worker.
