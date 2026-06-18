---
name: OpenAPI User type fields
description: The generated User type from the OpenAPI spec is missing nickname and phone fields.
---

The generated `User` interface (lib/api-client-react/src/generated/api.schemas.ts) only includes:
id, name, email, role, status, location, bio, avatarUrl, createdAt.

It does NOT include `nickname` or `phone`, even though the DB schema (lib/db/src/schema/users.ts) has both.

**Why:** The OpenAPI spec (lib/api-spec/openapi.yaml) was written before nickname/phone were fully wired up.

**How to apply:** If frontend code needs nickname or phone, either update the OpenAPI spec and run codegen, or use a separate AuthUser interface (as in auth-context.tsx) that mirrors the DB fields instead of importing from generated types. Never access u.nickname or u.phone on the generated User type.
