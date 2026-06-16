---
name: DB push interactive TTY
description: drizzle-kit push fails in non-TTY shells; use psql directly for migrations
---

## Rule
`pnpm --filter @workspace/db run push` fails with "Interactive prompts require a TTY terminal" when adding unique constraints to tables with existing rows. Piping `yes |` does not help.

**Why:** drizzle-kit prompts whether to truncate the table before adding the constraint. This requires a real TTY.

## How to apply
Apply schema changes directly via psql:
```bash
psql "$DATABASE_URL" -c "
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
-- etc.
"
```

This bypasses the interactive prompt entirely. The DATABASE_URL environment variable is always available in the Replit shell.
