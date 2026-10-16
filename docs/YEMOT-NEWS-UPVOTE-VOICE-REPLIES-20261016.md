# News actions while listening — site/phone parity milestone

## Input map on the single server-side Yemot bridge
While listening to an article or sequential updates, **1** opens the action menu without advancing the news cursor. Within that menu:
- 1 = upvote (same `entity_likes` entity type `news` and `news.like_count` as website, idempotent)
- 2 = remove existing upvote, never downvote (same database)
- 3 = record an audio reply: valid and active linked member required. Provider `read=t-...=rr<unique step>,,record` returns file pointer. The pointer is validated and queued on our server as pending review for this **exact news id**.
- 4 = read current live upvote count.
- 9 = go back to the same article and chunk; 0 = return to root.
While listening, 2 = next article/chunk; 8 = prior article; 3 important; 4 all news; 0 main.
No provider-side child extensions or menu trees: only one API root.

## New website parity
Approved voice replies appear with audio controls on `/news/:id`. Administrators can play pending recordings and approve/reject them from the same news page; all pending are private. No fake text transcript. Provider DownloadFile streams original recording through a bounded audio proxy; caller cannot submit arbitrary URLs or learn provider token.

## Security
Caller-ID is not authentication. Phone code pairing is required for votes/replies; same user and user_id controls as website. Generated audio paths are validated to be provider-owned WAV paths and are fingerprinted to avoid duplicate comments on callback replay. New status rows default to pending, never immediately public. No destructive historical migrations.

## Remaining before claiming live
Yemot is disabled and has no configured root callback. Provider recording path format, prompt timing and physical playback have NOT been tested. These require end-to-end calls after a safe provider connection. Web news initially had replyMode=off, so this adds **moderated voice reply** in parallel with normal website upvotes. Full typed web text comment parity, news edit/delete by phone, reply-to-reply threads, search, share, report and save still require implementation; this is not all features or complete phone parity.
