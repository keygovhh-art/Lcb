---
name: OpenAPI path prefix convention
description: How orval and the Express app use path prefixes so they don't double up
---

The Express app mounts all routes at `/api` (in app.ts: `app.use("/api", router)`).
The orval config sets `baseUrl: "/api"`.

**Rule:** OpenAPI spec paths must NOT include the `/api` prefix.
- Correct: `/notifications`, `/reports`, `/admin/stats`, `/follows`, `/saved`
- Wrong: `/api/notifications`, `/api/admin/stats` (causes generated hooks to call `/api/api/...`)

**Why:** orval's baseUrl prepends `/api` to every generated URL. If the path in the spec already has `/api`, the result is doubled: `/api/api/admin/stats` → 404.

**How to apply:** Any new endpoint added to openapi.yaml must use the path without `/api` prefix. The Express route handlers also must NOT include `/api` (they are mounted under `/api` by the app).
