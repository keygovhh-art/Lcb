---
name: Session auth setup
description: How express-session is configured to work in Replit's reverse proxy environment.
---

Preserve the existing Replit session mode unless explicitly opting into persistent sessions. Vercel must use PostgreSQL sessions and secure cookies, with no fallback to memory.

**Why:** The user requested migration preparation without breaking the current Replit version or running risky database migrations. Switching storage cannot transfer existing in-memory logins; users must sign in again.

**How to apply:** Prepare only additive session-table setup for manual execution against the chosen database. Do not run automatic schema synchronization, transfer data, or publish as part of migration preparation.
