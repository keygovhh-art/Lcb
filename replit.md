# Gavhah — Global Jewish Community Kindness Platform

A full-stack platform connecting Orthodox, Chassidic, and Yeshivish communities worldwide through acts of chesed (loving-kindness).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/gavhah run dev` — run the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`, serves at `/api`)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui (`artifacts/gavhah`, serves at `/`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/index.ts` — DB schema (source of truth for all tables)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react/src/generated/` — generated React Query hooks (run codegen after spec changes)
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/gavhah/src/pages/` — React page components
- `artifacts/gavhah/src/components/layout/layout.tsx` — shared layout with nav/footer

## Architecture decisions

- **No Zod `.parse()` on API output** — Drizzle returns JS `Date` objects; Zod schemas expect strings. Routes call `res.json(data)` directly; JSON serialization handles Date→ISO-string conversion automatically.
- **Mock auth (user ID=1)** — MVP uses a hardcoded user ID=1 for all write operations. Real auth is a planned next step.
- **Warm amber/navy/burgundy theme** — Deep golden accents, Playfair Display serif font, modest family-friendly design appropriate for Orthodox/Chassidic communities.
- **Contract-first API** — OpenAPI spec drives both Zod validation and React Query hooks via Orval codegen.
- **Path-based routing** — Frontend at `/`, API at `/api` via shared reverse proxy.

## Product

9 departments across the platform:
1. **Home** — Hero, community stats, entry points
2. **Global Chesed News** — Articles about community kindness acts worldwide
3. **Askanim Forum** — Discussion boards for community activists
4. **Activists Directory** — Volunteer profiles + help request matching
5. **Today's Charity** — Daily featured charity with donation tracking
6. **Minyan Center** — Worldwide searchable minyan times directory
7. **Group Center** — Community groups with posts and membership
8. **Community Dashboard** — Platform-wide stats and activity
9. **Administration Center** — Reports, user management, announcements

User roles: `admin`, `moderator`, `group_owner`, `member`

## User preferences

- No emojis in UI — modest, dignified design appropriate for religious community
- Hebrew/Yiddish community terminology (Chesed, Bikur Cholim, Hachnosas Kallah, etc.)
- Warm, unhurried aesthetic — tradition-grounded, not flashy

## Gotchas

- Do NOT use Zod `.parse()` for API route outputs — use `res.json(data)` directly to avoid Date/string type conflicts
- Run `pnpm --filter @workspace/db run push` after any schema change before testing
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before building

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
