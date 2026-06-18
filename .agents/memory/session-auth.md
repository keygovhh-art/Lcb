---
name: Session auth setup
description: How express-session is configured to work in Replit's reverse proxy environment.
---

express-session configuration that works in Replit:

- app.set("trust proxy", 1) — required for proxy-aware secure cookies
- cookie.secure = false — works for both HTTP and HTTPS through the proxy
- cookie.sameSite = "lax" — required for same-origin cookie sending
- SESSION_SECRET env var — already exists in this project's secrets

Admin user (id=1): email moshe@gavhah.org, password seeded with Admin1234! via crypto.scrypt hash.

**Why:** Replit serves over HTTPS via its reverse proxy, but the express process sees HTTP. trust proxy:1 tells express to trust the X-Forwarded-Proto header. secure:false means the cookie is sent regardless of protocol, which is simpler than dealing with proxy trust levels.

**How to apply:** Any new API server that needs sessions should use this same configuration. Run codegen after any OpenAPI spec changes.
