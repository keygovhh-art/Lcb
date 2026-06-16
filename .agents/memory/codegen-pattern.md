---
name: Codegen after every spec change
description: OpenAPI spec changes must be followed by codegen before any TypeScript work
---

## Rule
Any change to `lib/api-spec/openapi.yaml` must be followed immediately by:
```bash
pnpm --filter @workspace/api-spec run codegen
```

**Why:** The generated types in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` are stale until codegen runs. TypeScript errors like "property X does not exist in type YInput" almost always mean the OpenAPI schema is missing that property — add it to the spec, then re-run codegen.

## How to apply
- Missing field on a mutation input (e.g. `userName` on `VolunteerInput`) → add to `components/schemas/VolunteerInput` in openapi.yaml → codegen
- Making a required field optional → change `required: [...]` array in the schema → codegen
- The three key input schemas that needed extension: `VolunteerInput` (add userName, bio), `HelpRequestInput` (add location), `NewsArticleInput` (add authorName)
