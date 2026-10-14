# Full group images & mobile dialog scrolling — STAGING ONLY

Requested by owner: group cover image should display in full in listing, group detail and upload preview; group editing must scroll correctly on Android.

- Both public group card and detail now render the source image with `object-contain` and adaptive viewport-height limits, replacing forced 3:1 / 4:1 aspect ratios that previously cropped the content.
- No overlay sits on the card image: move the privacy pill below the picture.
- Shared uploaded image preview uses contain, not cover. No media files or database rows were altered.
- Edit Group dialog gets an independently scrollable, touch-enabled form whose header and Save footer remain accessible. Create Group dialog also gets this treatment. Use dynamic viewport height to respond to Android browser keyboard.
- Tests `tests/group-images-mobile-dialogs.test.mjs` and complete frontend/server builds.
- **DO NOT MERGE, DEPLOY, OR APPLY DATABASE MIGRATIONS** until separate explicit approval from owner. All this is staged in Draft PR #8.
