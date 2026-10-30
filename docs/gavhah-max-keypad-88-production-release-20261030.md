# Gavhah MAX phone keypad 88 — Cloudflare production release
Release date: 2026-10-30 UTC

## Current production state
- Worker: `gavhah-cloudflare-native`, account: configured `Kg` Cloudflare connection.
- Active Worker deployment: `d42c5bfb-b6a3-4cb7-a012-30104af499fc`.
- Active version: `af993733-e69b-48bd-9842-1636eb751e98`, 100% traffic.
- Previous live version for immediate rollback: `2a0a43b6-d02f-4d43-bf77-c3fc70e07ed9`.
- Deployment composed of the ACTUAL previously live Olam Hachesed MAX v44 compiled Worker plus compiled code from this feature branch for the isolated advanced keypad. No existing default menu implementation was overwritten.
- All original 10 Cloudflare runtime bindings, including encrypted secrets, were inherited and verified intact.
- Existing legacy 55555 and other live Olam Hachesed MAX routing are preserved.
- Entry is 88 then # from the actual shared SignalWire root menu; no interference with already used 127 My Tishl.
- Root menu copy now announces 88.

## Phone account and features
- Each call is validated by existing SignalWire webhook signature checks.
- Private My Askanus records require the original 8-digit website/phone account link; caller ID does not grant access.
- The add-on uses the same existing Neon tables as My Askanus and Communications MAX: tasks, cases, notes, followups, contacts, pledges, receipts, histories, and manual call reports.
- Keypad-only creation from predefined task/case templates. Existing item selection, status, priority, due date, goal and DNC editing. Amount entry via cents and explicit two-step monetary confirmation, with idempotency protection and stored audit history. Optional English speech input for custom notes/tasks/cases with readback.
- Real payment charging/refunding is intentionally not offered by telephone, only MANUALLY REPORTED financial records. No automatic dialer/provider change.
- Most records are page-scoped in phone menus; the full rich-text and file UI of the website is NOT 100% mirrored. Do not claim full feature parity.
- No actual end-to-end provider call or Yiddish speech recognition was confirmed from the connector tools.

## Checks and rollback
- GitHub Actions: 4 groups succeeded for commit `af7efae5fe177c1becceca481954fce9bc9c4d59`.
- Cloudflare compiled and accepted the combined existing Worker + additive keypad as a new version with all 10 previous bindings.
- Cloudflare reported deployment 100% for new version.
- The reversible rollback is a new Cloudflare deployment referencing the previous live version above at 100%. Do NOT modify the provider phone number, DNS, or legacy 55555.
- Physical QA needed: sign into website, obtain 8-digit phone pairing code, call 605-655-8080, press 5 then 5 and enter code, return to main menu, press 88#, verify personal dashboard lists and reversible test changes on website.
