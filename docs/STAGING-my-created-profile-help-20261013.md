# My Creations and independent private help roles — STAGING ONLY (Oct 13, 2026)

USER HOLD: **DO NOT DEPLOY, MERGE MAIN, APPLY NEON MIGRATIONS OR SEND NOTIFICATIONS** before separate explicit release approval.

## Member profile
- First tab "וואס איך האב געעפנט" lists items owned by the authenticated user ID, not display name: community campaigns/projects, submitted official causes, personal charity campaigns (new records only), group ownership, askanus cases, minyan submissions, forum/group posts, volunteer registration, and private help requests.
- Independent filters and account-specific query key. GET `/api/me/created-content` uses `requireAuth` and session ID only; Cache-Control private, no-store. Returns only deliberately selected fields; never contact information. Private records shown only to their authenticated owner.
- Separate "Following" tab is people/groups/projects a member follows, unrelated to "Follow-up" task history in My Askanus. Labels and empty state now explain the difference.
- Separate "Saved" tab remains untouched.
- Both help paths are already independent at the API level; profile now shows two independent status cards with separate links to the help section and current self-registration state. Both records remain confidential to staff + submitting member.
- Charity creation now records immutable `created_by_user_id` in a new nullable column; **past charities cannot reliably be attributed by mutable names** and stay NULL. Public charity endpoints strip this internal field.
- Owned items link to the existing public/member section, with groups and forum posts linking to the specific item; not every type currently has a dedicated detail route.
- The existing system-admin charity management remains admin-only. Owned campaigns shown in private profile do not grant publishing rights.

## Schema
- `lib/db/migrations/20261013_charity_creator_identity.sql` additive, NULL for past records; **NOT RUN**.

## Tests
- `node --test tests/my-profile-created-content.test.mjs`
- Full TypeScript, backend/frontend build and other security/regression jobs.
- Authenticated cross-account browser test required before later release, including account switching and confidentiality of help requests.
