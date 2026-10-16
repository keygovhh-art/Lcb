# Owner-approved root IVR API for 605-562-1286

The hotline owner explicitly authorized configuring the **main menu** to use our Gavhah server: 1 Gavhah and 2 Campaign Center. The owner has stated that the line is available to operate, and existing Yemot default folders/recordings must NOT stop installation.

## Exact one-time production operation

Upon the next production deployment, **only if the exact hotline, root path, and state=queued match**, the backend decrypts the central provider token in memory and calls `UpdateExtension` with ONLY these changed keys on the ROOT `ivr2:`:
- `type=api`
- `title=Gavhah and Campaign Center`
- `api_link=https://gavhah.onrender.com/api/yemot/ivr`
- `api_url_post=yes`
- `api_add_0=entryKey=<random 64-hex character callback key>`
- `language=en`
- `api_hangup_send=no`

The backend stores only a SHA-256 of the callback key. The provider holds the plaintext key. No root directory content checks are used to block setup; preexisting directories and messages are ignored. `GetIVR2Dir` is attempted only to collect original counts for audit.

**No delete, rename, move, upload, UploadTextFile, or replacing an entire ext.ini is used.** `UpdateExtension` updates only the supplied entries in ext.ini, preserving all other settings and all recorded files in place. The previous root *navigation behavior* changes to API, which is what the owner authorized. Any previously existing subfolders and audio remain accessible to the owner in Yemot, but are not necessarily part of the new menu until deliberately linked by the application.

## Server-driven root menu
Welcome: Press 1 for Gavhah, Press 2 for Campaign Center. Every child menu and news/member interaction is evaluated in our Gavhah Neon-backed API. No provider-side numbered subfolders are created.

## Verification

Provider `responseStatus=OK` is NOT a successful physical call test. After deploy, check the hotline installation row and log for accepted/error status, and ask owner to call the line to verify spoken English greeting and digit 1 / 2. If provider returned ambiguity or timeout, do NOT automatically rerun until verifying the provider settings.

Current phone parity is partial. Do not claim all website features are operative by phone merely because root IVR gateway works.
