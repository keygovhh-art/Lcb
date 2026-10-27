# Gavhah Cloudflare hosting-only migration

**OWNER REQUIREMENT:** Neon remains exactly the SAME existing Neon project and database. No Neon copy, export, schema change, migration, or table overwrite.

## Account and release gate
- Cloudflare account: keygovhh@gmail.com only.
- Account ID: b80a85f1f51f8dd32842e82afc089806.
- Cloudflare Worker staging name: gavhah-cloudflare-staging.
- Existing Render service remains live until new Cloudflare **full website + API** pass end-to-end tests.
- Existing provider IVR numbers and callbacks remain unchanged until owner-approved telephone tests.
- Keep all GitHub/Cloudflare automatic production deployments disabled.

## Architecture
- Cloudflare Static Assets serves EXACT existing Vite React files and SPA routes.
- Cloudflare Worker uses original Express API with nodejs_compat and Cloudflare node HTTP server adapter.
- Existing Neon PostgreSQL remains the database of record, unchanged.
- Sensitive secrets (DATABASE_URL, SESSION_SECRET, YEMOT_ENCRYPTION_KEY, SignalWire signing key or encrypted storage key, existing admin/bootstrap credentials) must be manually installed as Cloudflare Worker SECRETS, never in Git.
- No Render URLs or reverse proxies in the permanent architecture.
- No D1 migration and no new database.

## Manual build-only / safe test
```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @workspace/gavhah run build
pnpm dlx wrangler deploy --config cloudflare/gavhah/wrangler.jsonc --dry-run
```

## Hard release gates
1. Worker bundling builds and starts with the Cloudflare Node compatibility layer; static SPA CSS/JS load.
2. Connect to the EXISTING Neon DB using read-only tests without changing tables.
3. Owner login, session cookies, super-admin, members, MAX, moderation, support and all API endpoints match Render.
4. SignalWire /api/signalwire/shared-ivr HMAC signature and original 55555 transfer verified on safe test calls without touching the old provider number.
5. Yemot/campaign /4444 routing remains healthy.
6. Secure secrets and production headers verified, no exposure of credentials, no logging donor/member private data.
7. Production domain, provider number/webhook changes and stopping Render only after explicit approval and monitored rollback plan.

**Current status:** STAGING SOURCE ONLY. Creating Cloudflare project is not proof of a successful hosting migration.
