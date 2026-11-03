# Gavhah — Cloudflare native only: verified parity audit
**Checked:** 2026-11-03 (New York)  
**Required target:** account `keygovhh@gmail.com`, Worker `gavhah-cloudflare-native` (not `gavhah-cloudflare-copy`, Render, or Pages preview).

## Non-negotiable user rule
All FUTURE Gavhah changes must be implemented and VERIFIED LIVE on independent `gavhah-cloudflare-native`. GitHub is for code storage. Existing Neon stays unchanged. **Do not deploy anything to Render; leave its existing service intact, without deleting or altering it.** Do not confuse deploy on Render or a GitHub commit with an actual native Cloudflare deployment.

Yemot is for Gavhah, My Askanus, Yeshiva (separate Worker), and Campaign Center menu 4444. SignalWire only for Olam Chesed Communication. Never silently cross-connect these.

## Evidence from connected services
- `gavhah-cloudflare-native` version **117** / `6c7a0fd4-cfe3-4ce3-be6d-01f98cc0546d` is deployed to 100% of that Worker's traffic as of 2026-11-03T02:59Z. Cloudflare Worker lists the 11 existing bindings: `CF_PHONE_WEBHOOKS_ENABLED`, `CF_WORKER_RUNTIME`, `CF_YEMOT_WEBHOOKS_ENABLED`, `DATABASE_URL`, `GAVHAH_HYPERDRIVE`, `NODE_ENV`, `SESSION_COOKIE_SECURE`, `SESSION_SECRET`, `SESSION_STORE`, `SIGNALWIRE_SIGNING_KEY`, `YEMOT_ENCRYPTION_KEY`. Secret presence alone does not verify its value or active provider traffic.
- V117 code/annotation and previously checked docs cover Yemot menu/voice studio, SignalWire-only Olam Chesed editor, stronger voice changer with WSOLA/formants and A/B preview. Physical Yemot/SignalWire end-to-end acceptance is **not confirmed**.
- Current GitHub `keygovhh-art/Lcb` Founder Dashboard source now has a "האטליין־מפתח און עדיטער" tab with a keypad index and super-admin-only embedded `YemotVoiceStudio`. These edits were incorrectly deployed on Render in the preceding chat turn, **NOT confirmed deployed to native Cloudflare**.
- **Do not re-upload a freshly built GitHub Worker over v117 yet.** Earlier `yemot-api-driven-phone.ts` and related callback source do not yet fully match current deployed v117, per `docs/GAVHAH_HOTLINE_CLOUDFLARE_SOURCE_OF_TRUTH.md`. Need compare/reconcile every live native patch first; otherwise menus/voice features could regress.
- Existing Neon Govhh project `falling-wildflower-17519958` read-only inspection: `gavhah_yemot_global.enabled=true`; `gavhah_yemot_ivr_install.state=live`; `gavhah_hotline_migration.stage=draft`, `tested_calls=0`, `gavhah_hotline_migration_probes=0`. This does not prove physical call success or full editor parity.
- Cloudflare account currently lists Workers `gavhah-cloudflare-native`, `gavhah-cloudflare-copy`, `yeshiva-cloudflare-independent-native`, and `yeshiva-cloudflare-copy`; Pages lists only `gavhah-cloudflare-preview`. No separately named Campaign Center Cloudflare native Worker/Pages project is present.
- Campaign Center Neon project `still-haze-11727622`: there are database tables for campaigns, members, entitlements and Yemot; read-only counts at audit time: campaigns 0, `cc_yemot_connections` 0, `cc_platform_yemot_call_states` 0, `cc_plan_entitlements` 0. This does not prove the accepted 7-plan system is available on native Cloudflare.

## Priorities for completing actual Cloudflare parity
1. Preserve deployed v117 and reconcile GitHub source drift before any full bundle upload. Keep version ID for rollback.
2. Add and verify the Founder Dashboard navigation for hotline keypad index and editor ON `gavhah-cloudflare-native`, restricted to intended admin roles. Test on Android, including editor saves, not only tab visibility.
3. Verify web admin/login/sessions/Neon read-write against native routes, with authorization and CSRF protection.
4. Verify Yemot root/main/nested menus, TTS/mic recordings and notifications using an isolated real inbound test; preserve My Askanus and Campaign Center 4444. Confirm precise callbacks and provider acceptance with the owner before production rerouting.
5. Verify separate SignalWire Olam Chesed Communication calls/recording and do-not-call flows without changing any other provider route.
6. Audit MAX Donor 360, call result/mood, follow-up, financial ledger/audit, team assignments and campaign link; not all have live E2E proof.
7. Migrate and test independent Campaign Center 7-plan runtime to Cloudflare native, preserving its separate Neon project and avoiding any unsupported 100%-ready claim.

**Acceptance standard:** deployed native version + live route/functional request + DB/permission test + physical phone test where applicable. Neither a GitHub commit nor an API secret binding alone counts as finished.
