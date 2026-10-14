# Gavhah — My Askanus Follow-up history & delete (STAGING ONLY)

**USER RELEASE HOLD:** The user explicitly said "פובליש נאכנישט ווארט". Keep this branch separate, PR DRAFT, no merge to main, no Render deploy, no Neon changes, and no subscriber notifications/emails.

## User-reported bug
When checking a follow-up complete on the My Askanus page, it disappeared from the visible open list. Completed records were already stored in `case_followups.completed` but buried in an optional collapsed case Log section.

## Changes
- Replace the truncated pending preview with a clear, full open Follow-ups list.
- Add a prominently labeled **Follow-up היסטאריע — וואס מ'האט שוין אויפגעטון** under each case. History is visible by default, can be collapsed, and retains the full note and original entry date. This is not a completion timestamp.
- Checking off a pending follow-up moves it to history, **not to deletion**. History offers "צוריק צו אפן" to reverse the completion.
- Both open/history entries offer **דעליט**. The browser explicitly asks for confirmation and invokes `DELETE /api/askanus/followups/:id`. The server authorizes by the signed-in user ID against the parent case, and actually removes that one `case_followups` record. A failed request must NOT remove it from the UI.
- The parent case, unrelated follow-ups, donations, and activity log are retained. No database migration is needed; existing completed items remain available to show in history.
- Tests: `node --experimental-strip-types --test tests/case-followup-history.test.mjs` plus staging TypeScript and production-equivalent builds.

## Before future publishing (explicit new user request required)
Confirm CI is green; if desired, manually test with two member accounts on an isolated staging deployment. Ensure each sees only their own case; check off, history, undo, and delete-confirmation/cancel, then verify after a reload. **Do NOT publish merely because CI passes.**
