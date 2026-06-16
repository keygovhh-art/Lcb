---
name: No Zod parse on API output
description: Never use Zod .parse() on Express route outputs — use res.json(data) directly
---

## Rule
Do NOT call `schema.parse(data)` on anything returned from Drizzle queries in Express route handlers. Always use `res.json(data)` directly.

**Why:** Drizzle returns JavaScript `Date` objects for `timestamp` columns. The generated Zod schemas expect `string` for those fields. Calling `.parse()` will throw a Zod validation error at runtime even though the data is correct.

**How to apply:** JSON serialization via `res.json()` automatically converts Date objects to ISO-8601 strings, which is what the frontend expects. This is documented in `replit.md` under Architecture decisions.
