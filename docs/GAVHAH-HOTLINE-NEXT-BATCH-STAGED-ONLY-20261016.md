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