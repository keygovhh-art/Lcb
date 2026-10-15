# Gavhah MAX ↔ Campaign Center — Connect Stage 1 + release gate
Date: 2026-10-15
**STAGING ONLY — no merge, no production Neon migration, no Render deploy, no auto deploy.**

## Architecture
- MAX personal records authoritative in main Gavhah project's Neon Postgres.
- Campaign Center manager/team records authoritative in separate Campaign Center Neon.
- The owner signs in with BOTH real accounts; a hashed single-use code from Campaign Center Neon Auth account (10m) may be redeemed ONLY while signed into personal MAX; no matching by email, phone, name or unverified claims.
- Only Gavhah API backend talks to Campaign Center API backend over HTTPS with secret \`GAVHAH_CONNECT_SHARED_SECRET\`; client never gets the secret. Required env \`GAVHAH_CONNECT_BASE_URL=https://gavhah-campaign-center.onrender.com\` on Gavhah Render. Shared secret must match CC Render. Secret length >=32. Do not expose credentials in GitHub.
- Server-to-server requests verify active membership and role against CC database.
- Member sees ONLY own campaign tasks and own opt-in shared transactions.
- Personal donor names/phones/notes and case texts NEVER copied by the bridge.
- Explicit checkbox required for each finance or followup-sharing action.
- A MAX pledged/receipt event can appear once in one campaign across all CC organizations; manual receipts are not processor verified.
- A corrected/reversed receipt can be shared as a separate immutable refund event, bounded by original receipt and exactly-once source ID, to update net manager totals. No real bank/card refund.
- Linked followup is only reference to same canonical MAX record ID. Full due/status synchronization and manager-visible authorized summary pending.
- Unlink immediately removes new cross-app read/write permission while preserving historical audit events. Private personal data stays with MAX.

## Implemented (only GitHub feature branch)
- API file \`artifacts/api-server/src/routes/communications-connect.ts\`: status, redeem, unlink, my scoped assignments, per-record financial sharing, per-record correction sharing, canonical followup linking.
- UI \`artifacts/gavhah/src/components/communications/gavhah-connect-panel.tsx\` in MAX mobile call desk.
- GitHub CI TypeScript/build check and existing isolated MAX multi-account HTTP/Postgres tests. NEW cross-service shared-secret and 2-DB E2E must be separately tested.
- CC side maintained as PR #4, base CC PR #3. MAX base PR #10 is not yet released; new integration PR #11 builds on PR #10 and likewise must remain unmerged.

## Production release blockers (do not bypass)
- User's separate express permission to publish.
- Fresh backups and reviewed DB migrations for MAX and Campaign Center.
- Full real staging tests between BOTH servers with secure credentials, real Neon Auth and actual session-cookies on Android.
- Change Render env vars only once with approval; even 'Save environment' may deploy and consume Render quotas. Render AutoDeploy remains OFF.
- Finance/call history correctness, duplicate prevention under retries, isolated tenant and squad permissions; expired/revoked links, two-account spoofing, mismatched secret, manual reversal tests.
- Receipt reconciliation with bank/payment processor still absent; no claim that transfer or card refund occurred.
- Sponsor-backed paid MAX entitlements not activated without paid billing + verified contract.
- Complete live-room audio/caller-ID/telephony, background push/email, transcription/voice storage, 360 full family merge and unrestricted AI are NOT implemented.
- Keep previously completed personal histories indefinitely where permitted; only a deliberate authorized delete removes source documents, not financial audit.

## 2026-10-15: Additional production merge gate
- GitHub reports base MAX PR #10 against main as `mergeable: false`. Main contains a newer one-commit group-management release not in the MAX feature base (the branches have diverged).
- The merge requires a careful, conflict-aware integration that preserves BOTH the already-published group controls and the unpublished MAX/My Askanus features. Do not force merge, overwrite main, or deploy a partial resolution.
- MAX Connect PR #11 targets MAX PR #10's branch. Resolve and test the MAX base integration before attempting a combined Connect release.
- This discovery does NOT authorize Render deployment or any production Neon schema writes.
