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


## Additional staged batch: mandatory account gates and optional postal addresses (2026-10-09)

**Still hold. Do NOT deploy to Render, merge into main, or run DB changes.**

- Guests cannot enter the Askanim Forum, including direct discussion URLs or its API, and global search no longer exposes forum snippets to guests.
- Volunteer enrollment, help-request submission, project/group participation, minyan/community functions and communications sign-in surfaces use separate welcome-gate sections.
- Each welcome page has independently editable **Yiddish and English** copy, two buttons, icon, optional HTTPS picture, theme and layout.
- Admin page designer has a private preview, draft save and a later explicit page-level publish operation. Do not use the publish operation as part of staging.
- Registration includes an **entirely optional** home address. On entering one, the member must explicitly answer **Yes or No** to USPS mailing. No means stored address flagged DO NOT SEND.
- Address and consent are never returned from public member endpoints, and are accessible only to the member and full admins through separate routes. Moderators cannot access home addresses.
- Member can view/update/delete the address and withdraw consent in My Profile.
- Advanced admin member manager provides filtered membership list, USPS Yes/No/no-address/on-hold labels, admin notes, administrative stop-mail hold and filtering.
- Administration cannot turn a member's USPS "No" into "Yes".
- No USPS service integration was added; these fields record member permission only.
- Privacy disclosure updated.

### DB migration REQUIRED before release (not executed)
Run and verify `lib/db/migrations/20261009_member_mailing.sql` in the **confirmed** app production PostgreSQL, after backup and connected service verification. Check that the SQL applies to the correct production database and that the address table remains inaccessible to public DB users. Do not assume the older Neon project and the active Render service point to the same DB.

### Additional pre-release tests
- [ ] Confirm staging code installs, typechecks and builds outside Render.
- [ ] Test guest/members on /forum, /forum/new, /forum/:id and /api/discussions and global search.
- [ ] Test all welcome-page variants, RTL Yiddish rendering, image preview, draft, private preview, and version-change behavior.
- [ ] Test guest volunteer/help membership gate, signing up, then returning to original department.
- [ ] Test signup with no address: account succeeds and mailing status is NO ADDRESS.
- [ ] Test incomplete optional address: clear error, not partial storage.
- [ ] Test full address + USPS NO: saved accurately, labeled DO NOT SEND.
- [ ] Test full address + USPS YES: explicit consent timestamp and YES label.
- [ ] Test profile permission withdrawal, address edit requiring renewed confirmation and address deletion.
- [ ] Test ordinary member / moderator denial of admin postal API, and full admin access.
- [ ] Test administrator HOLD / release HOLD does not override member NO.
- [ ] Test member-management search/filters and private data cache headers.
- [ ] Review migration rollback/backup and Render/GitHub branch deployment behavior.


## October 9 connection policy v2: two independent permissions, optional backup, no live telephone delivery

**Strict release hold continues. Nothing was pushed to main or Render.**

### Private contact information
- Every new volunteer enrollment, new help request and direct volunteer connection request collects a primary contact way: phone call, email or SMS text. An **optional** backup can be left completely blank.
- Both main and backup (if chosen) need a valid number or email. Methods are saved privately by user + purpose, never on the public directory card.
- Separate explicit Yes/No question: whether member is even willing to consider direct sharing after mutual approval. This is **not** case-specific consent. On each match both members must PERSONALLY approve again.
- Member can change primary/backup and preferences in My Profile; updating an open case invalidates prior approvals and prevents disclosure until new consent. Existing legacy approvals do not authorize disclosure.

### Connection state machine
1. New request: the requester has chosen a private way to contact them. Staff reviews the match.
2. Staff approval calls `/admin/member-connections/:id/invite`: in-app notices are sent to BOTH matched users. No contact information is disclosed.
3. Each user enters My Connections and explicitly checks two statements: (a) consent for THIS specific contact detail and match; (b) no redistribution without Gavhah AND member permission. The user then personally accepts or declines.
4. Only after both users approve does the app expose each participant's frozen, selected contact point to the other participant. Staff cannot press an old "record consent" button: the endpoint is permanently disabled (410).
5. An SMS/email/phone limitation can be reported by one tap ("I can't receive texts" / "I don't have email" / "I can't use the phone"). This returns the case to staff, stops exposing contact, records the issue.
6. Staff must record what was done and may select the **optional** backup for either participant (if present), then request fresh approval from BOTH people. There is no automatic backup handoff.
7. Requester confirms real successful contact; failed or unsuccessful cases remain separate from successful completion. Either user may withdraw permission on an open connection.
8. Contact details must not be forwarded to other people without Gavhah approval AND permission of the person whose information it is. The system shows this rule with the released information.

### Phone/website notifications
- Existing web-bell notifications are staged on staff proposal and again on two-person consent.
- Phone notices are placed in a **non-sent, awaiting-provider/opt-in outbox** (`__connection_phone_notice__` internal records). This MUST NOT be described as an SMS or call actually delivered.
- There is **no currently functioning TelTech / SMS / voice delivery implementation**. Provider selection, operational opt-in, message delivery, retries, and confirmation of delivery are pending integration. Do not activate until configured and tested.

### Migration REQUIRED BEFORE RELEASE
`lib/db/migrations/20261009_member_contact_methods.sql` must be applied in addition to the earlier optional home-mailing migration. Apply only after correct Render production database is identified and backed up; no Neon/Render mutation performed during staging.

### Mandatory QA before release
- [ ] Build and typecheck staged branch with a local or GitHub CI build (do not deploy).
- [ ] Test new volunteer & help forms for phone, email and SMS, incomplete values, optional empty backup, and explicit sharing Yes/No.
- [ ] Test direct "contact volunteer" dialog with an existing and new requester's contact preference.
- [ ] Test an existing pre-update volunteer with no private contact preference; they must add one through My Profile before approving.
- [ ] Test both approval orders, attempted unilateral consent, staff impersonation endpoint (must be 410), invalid member IDs, duplicate requests.
- [ ] Confirm no other contact detail appears in API responses, notifications or forum/search before both users consent.
- [ ] Test freeze of primary/backup, changes to user's preferences, withdrawal, ban/suspension, and case recovery requiring new consent.
- [ ] Test one-tap no-SMS/no-email/no-phone with support workflow, optional backup missing/present and fresh approval.
- [ ] Test staff status display requester vs volunteer, no phone delivery claims, and permission/no-redistribution warning.
- [ ] Verify website-bell notifications and unsent outbox; do not treat queued telephone records as actual delivery.
- [ ] Verify new private DB schema, migrations, rollback plan and permission restrictions.


## Final Gavhah release authorization after bilateral personal consent (2026-10-09)

**DO NOT DEPLOY. Do not merge to main and do not touch Render/production DB.**

- The first person consenting does not release any contact. Staff receive an in-app case update.
- After the second person consents, the case enters `awaiting_staff_release`, not `accepted`. Both participants are notified that the selected contact details remain private.
- A full administrator (role `admin` or `super_admin`, not moderator) must review the case again, explicitly confirm final authorization and enter a written decision (10–1000 characters) using `POST /admin/member-connections/:id/final-release`.
- Final release rechecks both member accounts are active, both personal approvals exist, each member's direct-sharing preference is YES, and the exact frozen proposed contact points still match the members' private selections.
- Only after a successful compare-and-swap of this additional admin decision do the two sides receive their contact information through `/member-connections/mine`. The durable workflow tracks `staffReleasedAt`, `staffReleasedBy`, and `staffReleaseReason`.
- Historical accepted/connected records that lack this new distinct staff authorization are NOT granted contact access retroactively.
- Consent revocation, invalid/changed contact method and a reported incompatibility remove contact access and require fresh two-person agreement AND a new final Gavhah authorization.
- Website-bell notices are sent following final release. Telephone delivery remains **NOT CONNECTED** and is never reported as successfully sent.

### Pre-release verification for this rule
- [ ] First participant consent alone shows no other person's contact.
- [ ] BOTH consents without staff final authorization still show no other person's contact.
- [ ] A moderator or unauthorized member cannot use final-release endpoint.
- [ ] Full admin must record reason and explicitly confirm final release.
- [ ] Final authorization before both consents is rejected.
- [ ] Final authorization after either person withdraws or edits contact details is rejected.
- [ ] On final authorization, both participants are notified through website bell and see ONLY the selected contact point.
- [ ] The old staff-only consent endpoint returns 410 and cannot bypass either person's permission.
- [ ] Release action remains in the staff inbox, marked high priority, until completed or closed.
- [ ] Verify API and client builds and private-mode route tests off Render before considering any release.


## Strict private assistance and volunteer applications (2026-10-09)

**HOLD: no Render deploy, no changes to main, no production DB migration.**

Owner's decision: the "I need help" and "I want to help" registries are COMPLETELY private. A logged-in member may submit an application but cannot browse other members' help or volunteer records. Only authorized Gavhah staff can inspect these records inside administration.

### Backend privacy enforcement
- `GET /volunteers`, `/featured/volunteers`, `/help-requests`, and `/featured/requests` now require staff authorization (not just login).
- `GET /volunteers/:id` and `GET /help-requests/:id` are owner-or-staff only, regardless of review/featured status.
- Global search no longer queries volunteer applications.
- Existing historic volunteer/help public activity entries are suppressed in the public activity endpoint; new submissions no longer create them.
- Public stats endpoints do not reveal volunteer/help applicant counts. True internal counts stay in admin-only endpoints.
- Arbitrary member-initiated `volunteer_contact` requests via `/member-requests` are rejected: members submit a private HELP form and staff choose the helper.
- Volunteer social follow/save types are disabled and historic private volunteer follow/save rows are filtered from member lists.
- No status transition, including staff "approve", publishes a help request. `pending -> open` means **internal case accepted**, not public listing.

### Staff matching workflow
- New admin-only `GET /admin/private-assistance` provides private help applications and volunteer registry data including location, skills, availability, and staff-only private contact preferences.
- Suggests matching volunteers by help category/skill keywords and location overlap, with availability as a bonus. Scores are assistive, not an autonomous final decision or guarantee.
- New `POST /admin/private-assistance/:helpId/match` creates a PRIVATE support connection and metadata in a transaction, uses a request-scoped advisory lock and blocks another active match for the same help request.
- The staff dashboard has a new Private Assistance Matching tab. Staff may choose a suggested volunteer or search the complete private list and record why the match is appropriate.
- After a match, staff use Operations Inbox to invite both people, await their separate consent, and grant the **additional** final Gavhah authorization before releasing any selected contact details. A requester later confirms actual contact.

### Member experience
- /directory is now confidential intake ONLY: I Need Help and I Want To Help forms requiring member sign-in. It does not render or fetch applicant listings or names.
- Unrelated community projects remain under /community-projects; project search results link to that independent page, not to applicant lists.
- Public homepage/menu/metrics no longer promise an open volunteer database.

### Must-pass pre-release tests
- [ ] Unauthenticated and logged-in ordinary members: GET public/list/featured help and volunteers return forbidden, details for others cannot be read.
- [ ] Admin can list/manage private volunteers and help requests; ordinary members can only manage their own application.
- [ ] Private pending/open/resolved/rejected help requests never appear in public search, stats, activity, public directory, or profile follows/saved lists.
- [ ] A logged-in member submits each form; only staff receive applicant notifications and records remain private after approval.
- [ ] Admin searches skills/location, selects candidate, creates case; attempt second active match for same request is rejected.
- [ ] Applicant cannot guess volunteerId through the old member-requests endpoint to bypass staff.
- [ ] Both personal approvals and separate final Gavhah administrator release are enforced before any contact detail is shared.
- [ ] Full TypeScript typecheck, frontend build, API integration tests, mobile view, and database permissions reviewed WITHOUT deploying to Render.
