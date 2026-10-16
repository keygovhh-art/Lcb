# Real-time public phone actions — English first
This change adds two actual, DB-backed read-only features to the Gavhah IVR backend. A usable call still requires a provider installed and externally confirmed root/extension, which is separate from the API account test.

## Real server-backed actions
- Root 1 Gavhah > 1 News > 1 Latest news: read the newest 5 public news titles and accept a 1–5 DTMF choice to read title/summary. It queries the same `newsTable` used by the website. Privacy: no author ID or private fields are selected.
- Root 1 Gavhah > 5 Kindness > 1 Charity and campaigns: newest 5 *currently publicly visible* campaigns with 1–5 DTMF choice, description and website-reported goal/raised figures. It matches the website's public campaign filter and never charges cards or falsely asserts bank verification.

Until the user supplies custom Yiddish text, the phone test TTS uses only English. Non-English/Yiddish/Hebrew contents are NOT machine-translated and are not sent to the English speech engine: the caller hears an English fallback that the untranslated original is on the Gavhah website. This is genuine real-time database reading, but is only TWO public read-only actions of the much larger all-feature roadmap.

## Release/acceptance checks
1. GitHub TypeScript/API build passes.
2. Existing IVR API callback secret and role restrictions stay unchanged.
3. Physical caller presses 1→1→1 and 1→5→1 on approved provider extension, selects a number, hears an English result from *current website records*.
4. Modify the public web news/campaign record and verify phone follows on next call.
5. Ensure hidden / queued campaigns never appear, and personal donor details never appear.
6. English voice pronunciation and provider read retries confirmed on a real call.
7. App/website UI parity requires individually tested authorized actions on both systems, not a menu directory.

**Not implemented in this PR:** phone account authentication, private tasks, transfers, telephone media bridge, donations, real campaign member and financial updates. Do not claim 100% ready, do not install or overwrite provider IVR settings through this PR.
