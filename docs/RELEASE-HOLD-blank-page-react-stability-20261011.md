# RELEASE HOLD — Gavhah blank-page incidents and report noise

**Strict user instruction: NO RELEASE. Do NOT merge this branch into main, deploy Render, trigger a preview, or alter production database records. Collect additional fixes into a larger batch.**

## Evidence (read-only incident audit, 2026-10-11)
- 12 open automatic `system_error` reports: one `react_crash` with a DOM `insertBefore` NotFoundError on /community-projects on Android/Chrome; ten cancelled fetches ("signal is aborted without reason") mainly during /founder and /notifications navigation; one genuine `Failed to fetch` on /news/16.
- A NotFoundError during React DOM reconciliation can arise when browser translators/extensions or other DOM writers alter React-owned nodes. The report **does not prove a single exact mutator**; both browser translation and existing live-text mutation utilities merit further investigation.
- The previous global error reporter also intercepted **all** submit events where the submitter lacked an explicit type attribute, and called preventDefault/stopPropagation globally. That could break intended forms, independently of the React crash.

## Root-oriented fixes staged, not released
1. Set `translate="no"` on HTML/root plus Google `notranslate` metadata to deter automatic browser translation from replacing nodes owned by React. Keep Gavhah's own bilingual Yiddish mode.
2. Remove global form-submit interception entirely. The shared Button component already defaults to `type="button"`, and individual actual forms must own explicit submit behavior.
3. Skip expected AbortError and cancelled navigation requests before client reporting, including unhandled-promise events; reject the same noise on the server for older cached Android clients. Genuine network failures and React crashes still get reported to staff.
4. Isolate page-specific UI faults behind a route-keyed React error boundary. This is **only an extra safeguard**, not the promised underlying fix.

## Limitations / must validate before any eventual launch
- TypeScript and static build checks are **not** real browser end-to-end tests. Do NOT promise the DOM mismatch is eliminated until a targeted Android test re-creates the original steps, including /community-projects, /founder, /yi/community-projects, language switching, tab selection, back navigation, and repeat visits, plus the website's live copy/translation editor. Include an actual submit-form test.
- Existing `YiddishMirror` and `SiteCopyLayer` still write text nodes imperatively. If React crashes recur after opt-out from external automatic translation, migrate these live text transformations toward render-owned data/components rather than adding retries or catching the same crash forever.
- Old historical reports must be retained for diagnosis. Do not delete reports or reactivate suspended members.
- Do not consider a Retry/Reload button a finished remediation. Avoid silently reloading user input or losing forms.
- Before a future grouped release: compare main vs branch, review unrelated changes, run full CI and browser smoke tests, and get the user's separate explicit publish permission.
