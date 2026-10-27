# Gavhah — functional Cloudflare website copy

Account: keygovhh@gmail.com.
Worker: gavhah-cloudflare-copy.
URL: https://gavhah-cloudflare-copy.keygovhh.workers.dev
Original full live site: https://gavhah.onrender.com

This copy proxies website requests (including authenticated GET, login and form POST, member editing and administration) to the **existing Render Express backend**. Neon remains the SAME existing database. Changes on either website appear in the other because they share live database and business logic. The copy is functional but **not independently hosted** at Cloudflare while the Render API stays upstream. A separate build-tested native Cloudflare worker exists at cloudflare/gavhah/worker.ts awaiting runtime secrets and live API compatibility tests.

Security:
- Fixed Cloudflare preview origin and fixed Render upstream. No user-supplied destination.
- Same-origin browser Origin required for every mutating request, checked BEFORE translating to existing Render CSRF/host controls.
- Session cookies and browser auth credentials transit only to trusted Render upstream. Response Set-Cookie is preserved for the Cloudflare preview's own host-only session.
- Provider callbacks (/api/signalwire and Yemot phone callback paths) are denied on the Cloudflare proxy; existing voice webhooks remain directly on Render.
- Mutations to /api/admin/hotline-migration are blocked from the copy to prevent accidental changes to the live phone route.
- Cache-Control private/no-store on proxied responses, including private member data. Other Render configuration stays unchanged.

TELEPHONE:
+1 (605) 655-8080 remains on its prior, currently working provider webhook. The Gavhah root menu and 55555 transfer are staged and NOT yet the active phone route. Existing Yemot /0 and Campaign Center /4444 remain on Render. The Cloudflare website can access the same hotline backend status, but a separate fully independent Cloudflare voice line will require a test number or specially validated shared routing. SignalWire requires webhook signing and real voice verification. No production call routing is changed.

There is no Neon database cloning or migration, no domain or DNS change, and no Render shutdown.
