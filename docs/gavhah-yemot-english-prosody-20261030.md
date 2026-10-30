# Yemot English announcer — release notes, 30 October 2026

## What was changed
- Polished English **Yemot API** speech with small natural comma pauses and distinct sentence boundaries through Yemot's supported native `t-... .t-...` multi-part prompt syntax. The formatter strips dangerous provider command delimiters, URLs, HTML/SSML, and limits phrase length.
- Numeric keypad prompts, confirmation codes, navigation, and extension routing preserved. No synthesized breath sound or SSML tags.
- Source path `artifacts/api-server/src/lib/yemot-english-prosody.ts`, integrated into `yemot-api-driven-phone.ts` for Yemot only.
- Existing SignalWire MAX cXML is explicitly excluded using `fromShared`; no changes to provider number, route, original 55555 or Olam Communications. Existing published recordings are preserved.
- English male `ymMale` voice retained. A modest brisk `rate=2` / `tts_rate=2` is configured in `yemot-root-voice-repair.ts`; **these root rate settings still require a provider UpdateExtension application** and have NOT been confirmed live.
- Added regression tests for punctuation, .t- command safety, intact keypad input and route isolation.

## Cloudflare backend deployment
- Cloudflare Worker: `gavhah-cloudflare-native`
- Deployed Worker version: `b9081a5e-f325-4e15-8e62-c7bf1e4136ba`
- Deployment: `99cd3047-31be-4959-8942-0dbb4a53769d`, 100% traffic, verified by read-back.
- Previous version for rollback: `85897d9c-698d-46c7-a519-7845c062a7eb`
- All 10 existing Cloudflare bindings preserved, SignalWire handler unchanged.
- Github Actions for the newest branch are currently QUEUED, not confirmed passing; Cloudflare accepted the Worker compilation.

## Important provider limitation
The actual Yemot telephone line **6055621286** currently has the provider API callback configured for `https://gavhah.onrender.com/api/yemot/ivr`, **not** the Cloudflare Yemot endpoint. Therefore the improved Cloudflare backend is deployed but does **not** yet change what a physical caller hears until the authenticated owner safely switches the provider callback or the equivalent changes are deployed to the currently used Render backend. No physical call/audio test was completed.

The existing protected superadmin callback cutover interface is:
`https://gavhah.onrender.com/api/admin/yemot/cloudflare-switch`
Use its verification step, with the actual provider root checked before changing any callback. Do not update SignalWire or its account.
