# Gavhah platform group permissions and threaded replies (Oct 14 2026)

**STAGING ONLY — DO NOT MERGE, DEPLOY, OR APPLY DATABASE MIGRATION** before separate explicit user approval.

Features:
- Group public content appears above group administration controls (no massive scroll to posts).
- Reply-to-reply threads with no fixed nesting limit. UI indents first five levels only for mobile readability, then continues logical nesting. A deleted parent is a placeholder; descendant replies remain saved.
- Gavhah super-admin can inspect all groups and every post including private groups; private access is audit-logged. Ordinary staff needs per-group permission granted by super-admin. A new constrained `group_staff` role supports the limited `/group-team` workspace.
- Protected platform-pinned group members cannot be removed, suspended, or rejected by group-admins. Multiple protected members per group.
- Every group has independent `platform_feature_overrides`; each capability can be forced OFF, or use group setting, while public toggles may also be forced ON. Server must enforce restrictions.
- Platform team includes `/founder` → Group Controls and scoped `/group-team` workspace.
- Super-admin-only staff role assignment to member / group_staff / moderator / admin. Super-admin role not reassignable, reserved super-admin ID protected. **Legacy global moderator and admin roles already have broad permissions outside the new group system**; assign only to trusted staff.
- Audit log records role changes, protected users, grants and sensitive private group inspection.
- Migration additive: columns `groups.platform_feature_overrides`, `group_members.protected_by_platform`, `group_post_replies.parent_reply_id/deleted_at`; tables `group_staff_access`, `group_access_audit`.
- Automated tests are static contract checks plus TypeScript/build. Real authenticated staging multi-user role checks still required before release.
