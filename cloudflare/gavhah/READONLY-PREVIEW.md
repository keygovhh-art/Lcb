# Gavhah Cloudflare guest-preview copy

Cloudflare account: **keygovhh@gmail.com**.
Worker: **gavhah-cloudflare-copy**.
Preview URL: **https://gavhah-cloudflare-copy.keygovhh.workers.dev**.
Original Render: **https://gavhah.onrender.com**; do not stop, suspend, or change it.
Existing Neon project remains exactly the same. No data migration, new database, or schema changes.
Existing SignalWire/Yemot phone numbers and provider callback routing remain unchanged.

## Preview limitations

The preview is a PUBLIC GUEST-ONLY, READ-ONLY mirror that fetches public GET/HEAD resources from the Render site. Cookies, Authorization headers and other visitor headers are never forwarded, and upstream Set-Cookie is stripped. Mutating requests are rejected with 405; admin and phone callback API routes are denied with 403. Login, admin, uploads, donations and other live actions do not work here; do not treat it as a verified full-function copy.

This Cloudflare preview still depends on Render being online. Although POST methods are refused, public GET requests to Render might increment view metrics; a shared database can reflect analytics side effects.

## Independent full copy

The already build-tested independent Worker entrypoint is at cloudflare/gavhah/worker.ts plus wrangler.jsonc. Full API deployment and independent Neon connection still need secure runtime secrets and endpoint/cookie/signature testing. Never claim 100% separate hosting without those checks.

No DNS or production provider changes were performed for this preview.
