# Gavhah — group moderation and per-minyan weekday recurrence (STAGING ONLY)

**User explicitly requested:** prepare more changes; **DO NOT PUBLISH YET**. Do not merge into main, deploy Render, run Neon migrations, or send notifications/emails before separate new instructions.

## Minyan entry
- Each individually entered minyan (Shacharis, Mincha, Maariv) has six day toggles, Sunday–Friday. No selectable seventh day in the times interface. Weekday ID 0–5.
- Quick "Every weekday" action, individual day choices, add/remove separate entries, at least one prayer entry required.
- JSONB `weekday_schedules` retains explicit {time,days} per minyan; original text columns retained for compatibility. Existing rows with NULL schedule fall back to all six weekdays. Submitted details remain pending admin review.
- One additive schema migration: `lib/db/migrations/20261013_minyan_weekday_schedules.sql`. **NOT APPLIED**.

## Groups
- Group founder is always the protected owner. Only Gavhah **system admin/super_admin** may transfer the owner role to a different approved member. Ordinary group admins cannot delete the group, remove/demote the owner, or promote/demote other admins. Founder may delegate/revoke admins. Existing legacy group moderators retain permissions.
- Member review, suspend/reactivate/remove, prevent suspended or removed members rejoining on their own, adjust active counters.
- Per-group toggles for members posting/replying, post/reply admin review, replies enabled, public viewer counts, downvotes enabled. No public downvote count.
- Signed-in distinct post views recorded with unique user/post row on actual post intersection; not individual page refreshes. Anonymous page loads are not counted.
- Replies support public/held status and moderation. Only approved content publicly visible; post pinning and reply locking via admin controls.
- Reports can route to group, Gavhah team, or both. Recipients have **independent** review states. Group admin report endpoint explicitly exposes only {id,postId,reason,groupStatus-as-status,createdAt}; it NEVER returns staff routing, staff review state, or staff-only reports. Separate global Gavhah system report inbox under staff authentication.
- No billing/payment or user-message notifications triggered merely by staging.
- One additive migration: `lib/db/migrations/20261013_groups_advanced_moderation.sql`. **NOT APPLIED**.
- End-to-end testing with real member accounts remains necessary after creating a disposable staging environment and before a later approved release.

## Testing
- Existing GitHub Action staging TypeScript and frontend/API builds.
- Runtime weekday recurrence tests: `tests/minyan-weekdays.test.mjs`.
- Group API/controller contract regression tests: `tests/groups-advanced.test.mjs`; these are static security assertions, not a replacement for authenticated cross-account integration tests.

## Required later release sequence
1. User authorizes the release.
2. Snapshot or branch the **correct** Neon Govhh production DB, verify backup state.
3. Apply both additive migrations to the correct DB, validate table/column/status counts.
4. Merge reviewed staging branch and trigger one manual Render deploy.
5. Check public and admin flows with at least two different member accounts and a platform-admin account.

## Team report retention after deletion
- Historic group reports intentionally do NOT cascade-delete on source post/group removal.
- A 4,000-character snapshot of the reported post is stored when submitted. Staff can investigate a report even after that post was deleted by its author or a moderator.
- Reports addressed to group admins only remain grouped as before; staff-directed routes/status flags never appear to group admins.
