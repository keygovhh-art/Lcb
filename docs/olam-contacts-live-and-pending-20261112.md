# Olam MAX Contacts — deployed state (2026-11-12)

## Live production (Cloudflare)
- Account: keygovhh; Worker: `gavhah-cloudflare-native`.
- Live version **305**, version ID `441c1c50-4ed9-4dac-b0ac-98b36342de93`, 100% traffic, 16 inherited bindings verified.
- Native member-only mobile Contacts page: `/api/member/olam-contacts/page`, linked from Olam desk navigation.
- Native member-only JSON endpoints: `/api/member/olam-contacts/list`, `/:ref/history`, `/create`, `/:ref/update`, `/:ref/archive`, `/:ref/recontact`.
- Existing **signed** Yemot and SignalWire entry points, current membership/PIN gates and separate outbound authorization are retained. Contact keypad menu branch handles category browsing, search and historical call statistics; no provider is switched.
- **Do not deploy GitHub `main` over this worker**. GitHub main is older than the compiled production source. Only patch against the live Worker with exact source version guard and strict inheritance of 16 bindings, or first synchronize the complete live source to a new verified branch.
- Old Worker versions 296–304 remain rollback candidates. Only v305 currently active.

## Neon shared database (production)
- Project `falling-wildflower-17519958`, production branch `br-orange-water-b43bfcoj`.
- Test branch `br-patient-mode-b49ljoyr` (already existed; not identical to production, provision missing test tables only).
- Additive migrations applied: `20261112_olam_max_calling_approved.sql`, `20261112_olam_call_finance_link.sql`, `20261112_olam_contacts_approved.sql`, `20261112_olam_contacts_phone_sessions.sql`, `20261112_olam_contacts_inbound_calls.sql`.
- Production triggers enabled:
  `olam_max_contact_ref_insert`, `olam_max_call_auto_contact`, `olam_max_call_status_append`, `olam_max_call_cadence`, `olam_max_return_call_contact_created`.
- Additional canonical-number migration `20261112_olam_contacts_canonical_numbers.sql` applied and tested to prevent +1 and foreign country number collision. v305 Worker uses the canonical PG comparator when browsing missed calls, deduplicating new IVR contacts, and checking DNC.
- Contact creation preserves old records. Call status changes append historical events; **blank/unreported is never no_answer**. No false provider payment verification; case finance reconciliation is still staged and needs end-to-end verification before claiming financial parity.

## Verification run
- Staging SQL rollback scenarios tested: automatic nameless contact and incremental ID, current/previous statuses, report skip, 6-month scoped contact cadence, member isolation, DNC, missed incoming callback, and US vs UK same-last-ten-digits collision. No dummy test records retained.
- Production SQL comparator verified US variants equal, UK variants equal, UK-vs-US not equal; all 5 triggers remained active.
- GitHub PR #90 has passing staging build / Cloudflare build / parity audit / Worker smoke and live page JavaScript parse checks.
- Cloudflare deployment success alone is **not** authenticated phone-call end-to-end test.

## Remaining before claiming 100%
1. Real completed Yemot and SignalWire keypad tests with existing member auth and the correct root menus. Verify `*`, `#`, sorting, search, lists, all categories, and bound read-back.
2. Make optional spoken contact **name/address** entry functional on phone using verified recording/transcription while preserving original audio and consent rules. Current phone keypad can create an unnamed contact; website supports full text editing.
3. Link the approved repeat/inbound **postcall reason wizard** end-to-end on both provider flows and on the web. Do not infer last campaign/case for inbound and never classify skip as missed call. Draft route exists on staging `olam-postcall-approved.ts`, not live.
4. Complete approved calling submenu on live provider and website; finance reconciliation for reports and subsequent corrections must be audited with a single canonical money ledger.
5. Real authenticated browser workflow test and screen-size UI inspection. URL may require member session and explicit Olam access. Never treat anonymous 401 as broken authentication.
6. Confirm exact Hebrew date, parsha and Gedenk parity, including calendar edge cases and timezone changes; only dates are already provided in current Contacts lists.

Only claim **full release** once these are verified. Preserve existing Cloudflare routing, PIN, quotas, DONOR data, calls, backups, and rendered website.
