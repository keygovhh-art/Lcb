# גבהה — ריכטיגער Cloudflare האטליין (Source of truth)

Updated: 2026-11-01. This is the project handoff for future ChatGPT conversations.

## Correct project / cloud account

- GitHub code repository: **keygovhh-art/Lcb**, default branch `main`.
- Correct Cloudflare account: **keygovhh@gmail.com**, account ID `b80a85f1f51f8dd32842e82afc089806`, link ID `link_6ae010d8fd908191badd9603d3800d60`. **Do not use the unrelated Cloudflare account linked to nmkg845@gmail.com.**
- Cloudflare Worker script name: **`gavhah-cloudflare-native`**.
- Deployed Worker URL: **https://gavhah-cloudflare-native.keygovhh.workers.dev**.
- Correct Yemot IVR callback: **https://gavhah-cloudflare-native.keygovhh.workers.dev/api/yemot/ivr**.
- Correct Yemot original phone number recorded by system: **6055621286**. This is Yemot, not SignalWire.
- SignalWire Olam Chesed Communication is **separate**. Its shared callback is `/api/signalwire/shared-ivr`; the known SignalWire number is **6056558080**. This should NOT be substituted for the Yemot phone line.
- Neon project ID **`falling-wildflower-17519958`** (existing project/database). Do not migrate/replace it.
- Render **is not the target**, and should remain untouched/mirror unless separately requested.

## Important clarification about the actual Yemot provider

The user says they manually and successfully changed `ivr2:/ext.ini` in the Yemot provider to the **Cloudflare** callback around 2026-10-30 and then used the actual phone line. Treat this as the user's confirmed configuration and DO NOT initiate another migration/cutover from Render. A stale Neon provider_summary `apiEndpoint=https://gavhah.onrender.com/api/yemot/ivr` remains in the DB; that is **not authoritative evidence** of the live provider setting. The old `/api/admin/yemot/cloudflare-switch` verifier expects the previous Render callback and can fail on a provider already switched manually. Read the live provider ext.ini, if possible; do not forcibly rewrite the actual provider. A fresh authenticated physical call test is still needed for end-to-end confirmation after each rollout.

2026-11-01 deployed Cloudflare Worker version **79**: `83bb8f50-dee6-4f32-9e98-6c03c57b3119`, 100% production traffic. Versions change on later deployment; always query currently deployed version before making changes.

## Required hotline product rules (user explicitly approved)

1. **`*` = BACK in every menu**, including submenus. Avoid assigning it to unrelated legacy news or provider management.
2. **`0` = meaningful available actions/options/help inside each section**; at the **Gavhah Yemot main menu**, **`0` = official sign-up to become a Gavhah member**. Not a generic back button; avoid wiring to Yemot provider /0 administration.
3. One **numeric 6–12-digit** Gavhah password for website, Yemot and SignalWire. No manual account pairing. An ordinary sign-in asks only the password; after matching its unique account, conditionally ask extra PIN and/or member ID if enabled. Sensitive settings require account identity plus member ID and password again. No 'website' word in phone password prompts.
4. New member sign-up on `0` creates membership first, checks duplicate password (neutral rejection) and notifies the existing owner discreetly. Duplicate attempt does not create an account.
5. **Olam Chesed Communication access is NOT automatically granted** by creating a Gavhah member: users must be an existing Gavhah member, submit the access application, and receive administration approval. Same password but distinct entitlement. SignalWire handles communication; Yemot handles Gavhah main hotline and Yeshiva. Campaign Center is a separate `4444` extension on Gavhah, not SignalWire.
6. Don't delete existing recordings or alter untouched extension routes; preserve independent hosting and the correct account.

## Where things stand / cautions

The Worker source has extensive historical API code and stale English menu copy. Validate *actual* call flows; source-code presence and 100% deployment alone are not a physical call test. The account's old Neon installation metadata still points at Render; do not conclude from that field that the phone line needs reconfiguration. Changes in Cloudflare Worker must also be ported to GitHub source for reproducible deploys; a GitHub source redeploy may otherwise overwrite Worker-only fixes.

Links:
- Cloudflare Worker: https://gavhah-cloudflare-native.keygovhh.workers.dev
- Official protected profile: https://gavhah-cloudflare-native.keygovhh.workers.dev/api/me/security-center
- Web PIN-only login: https://gavhah-cloudflare-native.keygovhh.workers.dev/api/auth/pin-login
- Olam application: https://gavhah-cloudflare-native.keygovhh.workers.dev/api/olam-chesed/apply
