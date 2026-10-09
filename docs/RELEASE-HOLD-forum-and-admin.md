# Gavhah release batch — HOLD / נישט פובלישירן

**Status: DEVELOPMENT ONLY. Do not merge to `main`, deploy to Render, enable preview environments, or run production DB mutations without the owner's explicit approval.** This branch intentionally stages multiple changes to save Render usage.

## Scope

1. Askanim Forum
   - Remove all predefined category controls from both listing and new-discussion form.
   - Free, optional, user-authored topic, including Yiddish text and empty value.
   - Keep old discussion records; hide historical forced preset labels, without deleting them.
   - Adjust API, OpenAPI, generated types and schemas.
2. Administration
   - Plain-language explanations of each action in the operations inbox.
   - Staff ownership, progress, deadlines and internal notes remain distinct from closure.
   - Generic support cases require documented follow-up to close.
   - History distinguishes actually successful outcomes from unsuccessful closures.
   - Missing engagement, pinned announcement and system error routers mounted.
3. Volunteer connection requests
   - Require a verified volunteer profile ID when submitted.
   - Keep private volunteer contacts hidden until explicit consent.
   - Offer in-app volunteer yes/no consent.
   - Permit verified personal phone/in-person consent recorded with staff ID, method, note, explicit checkbox, and notification to volunteer.
   - Reveal accepted contact only to the requester and the volunteer as appropriate.
   - Require the requester to confirm real contact before completion.
   - Failed attempts return to admin workflow for follow-up; unsuccessful cases have a separate outcome with explanation.
   - Historical unlinked requests need manual volunteer-ID validation before proceeding.
4. Other help cases
   - An approved public help request stays OPEN in operations until assistance is actually delivered and documented.
   - Staff closure saves audit notes; super-admin permissions supported.

## Pre-release QA — REQUIRED, not yet run on live Render

- [ ] Install and run `pnpm run typecheck` and `pnpm run build` outside Render.
- [ ] Verify no main-branch conflicts; regenerate OpenAPI types if needed.
- [ ] Test forum posting with no topic, Yiddish free-text topic, custom English topic and a historical legacy category; test edit/search/detail.
- [ ] Test member request and admin intake under signed-in member and admin accounts.
- [ ] Confirm a requester cannot see any volunteer contact before recorded consent.
- [ ] Test volunteer accept/decline and the admin's explicitly verified consent path.
- [ ] Confirm only the specified volunteer can respond and only the requester can confirm successful contact.
- [ ] Test reporting inability to connect, staff follow-up and requester retry.
- [ ] Check concurrent submit/confirm/close requests for races and duplicate notifications.
- [ ] Test closing unsuccessful cases separately from successful ones and inspect audit history.
- [ ] Test generic support close only after an action note, including the alternate Support tab.
- [ ] Test help request pending→public/open→fulfilled, including audit note and notifications.
- [ ] Review real Render service, connected DB, production environment values and backup plan before any deployment.
- [ ] Smoke-test every affected page on Android after owner approves a batch release.

### Pending / constraints

- Phone/SMS/email notifications are **not** connected; consent notices are in-app only.
- This branch has not been deployed or tested against a live production database.
- Production migration and live testing require separate approval.
- Only the owner may authorize publishing.
