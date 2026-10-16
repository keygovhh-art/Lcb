# STAGED ONLY — Gavhah hotline next batch, October 16, 2026

IMPORTANT: User explicitly says DO NOT PUBLISH yet. Do not merge, trigger Render, or call Yemot UpdateExtension for this batch until a separate instruction explicitly approves publication. Production hotline stays fully untouched.

## Male voice — upcoming approved release
The male voice update uses the official Yemot configuration voice=ymMale, tts_voice=ymMale, language=en. It is staged in lib/yemot-male-voice-next-release.ts and is invoked only on a later production startup following explicit approval to release. A single additive release marker prevents repeat settings writes. This update does NOT change type=api, callback secrets, recordings, child extensions or menu routes. Provider documentation warns of possible fallback to ymSimcha, requiring physical listening verification.

## News and updates — new real features
The Press 1 article action menu now announces this exact signed-in member's existing like and saved bookmark state from entity_likes / saved_items, as well as public approved phone audio-reply count from gavhah_news_voice_replies. No other member's personal bookmark state is exposed.

## My Askanus — new real features
Press 7 for unfinished tasks, press 8 for overdue tasks, press 9 for tasks due within the next seven days. These use the canonical askanus_tasks data and user_id filter; deadline text is ISO YYYY-MM-DD and comparisons use the New York local calendar day. Current task list now reads related case title and task notes when English voice-safe. Any personal task-list allows Press 5 twice to mark incomplete tasks complete, updating the actual site's task status. Completed tasks from the full list support Press 6 twice to reopen with completed_at cleared. Existing case reader now includes website category/contact/description and goal/promised/received amounts; private notes provide a longer English voice preview. All private actions require a valid website-linked 8-digit temporary phone session, not caller ID.

## Release gates
1. Keep PR draft, unmerged, with no Render deploy and no Yemot updates now.
2. CI TypeScript full website/API build and phone route audit green.
3. Review malformed deadlines, timezones, privacy isolation and idempotency before release.
4. After user explicitly approves deployment, inspect startup logs and male voice release state; physically call 605-562-1286 and verify voice, 1/2 branches, filters, member linking and website sync.
5. Do not claim 100 percent web parity: task/case/note creation/editing/deleting by phone, full note speech, and most Campaign Center functions remain incomplete.

The current working root API and 0 provider management option must remain unchanged.
## Independent member-account security — staged after initial batch

- Gavhah: own public.users primary credentials, accepts either secure mixed-character web passwords (minimum eight) or numeric-only ones (minimum twelve). Existing passwords are never overwritten when a permanent telephone PIN is chosen.
- Gavhah separate member hotline PIN: 12–16 digits, keyed HMAC lookup + random-salt scrypt verifier, website password re-confirmation to set/change. Administrator-allocated PIN needs the individual member's logged-in website confirmation to activate, preventing admin impersonation. PIN is never visible in later listing.
- Existing signed-in website members can activate assigned PIN in My Askanus. The founder management panel can assign/revoke with signed-in administrator password re-confirmation and single-use display when generated.
- Self-service PHONE registration in Gavhah is a PENDING verified-contact account application: member enters 10–15 digit contact and 12–16 digit numeric password. An administrator must independently verify phone ownership, choose verified member name, re-enter admin website password, and explicitly approve. Only then do the normal users and own Gavhah telephone PIN tables receive the account and numeric password hash. No mere caller ID confers membership.
- Other site's Campaign Center: entirely separate Neon-managed Auth (JWT subject), separate cc_phone_member_pins, CC_PHONE_PIN_PEPPER and cc_phone_sessions; CC accounts are not linked to Gavhah member IDs or passwords. The single Yemot bridge uses a pinned server-to-server URL and YEMOT_CENTRAL_SHARED_SECRET for Campaign Center login, session/snapshot and logout; the Campaign Center server itself checks active cc_memberships. CC administrator assignments require own-organization owner/manager role and owner confirmation in own Neon Auth session before use.
- Unauthorized private Gavhah/MAX and Campaign Center menu nodes route to the correct product's login, no private data; CC finance/manager menus have role requirements. This is only a navigation protection; *individual future API actions must also retain server-side tenant and record permissions*.
- Campaign Center site numeric-only website password signup is validated client-side at minimum twelve digits before invoking Neon-managed sign-up; Neon Auth provider's own password policy and verification remain authoritative.

### Separate CC staging dependencies
- PR: keygovhh-art/Govhh #17. SQL: campaign-center-neon/db/007_isolated_phone_member_pin.sql.
- Central CC route requires the same existing secure shared service secret configured independently at both services, and CC_PHONE_PIN_PEPPER only in Campaign Center secrets. Configuration changes and SQL migrations are release-gated.
- There is no CC-only direct telephone account creation in this batch because creating verified Neon Auth identities requires Neon-managed signup; account-opening menu directs to the CC website instead. Do not call this feature complete.

### Do NOT deploy / integrity gates
- Keep both PRs DRAFT; do not change Neon production schema or Render service environment now.
- Before approved release: apply SQL migrations after backup in staging, validate no existing account is granted unauthorized PIN, two phone calls with different Gavhah identities, two CC organization subjects in separate tenants, malicious/unknown PIN, 5-failure throttles, banned/suspended member, admin-issued unactivated PIN, repeated web registration, failed provider shared secret.
- The original working root welcome, Press 0 provider management, audio files, and existing voice must remain unchanged until explicit deployment approval. The requested male voice remains staged.
