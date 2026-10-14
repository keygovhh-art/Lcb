# Gavhah MAX + My Askanus + Campaign Center — Master Build Contract
Date: 2026-10-14 · Status: in-progress, STAGING ONLY · UI language: natural Yiddish (RTL)

## Product boundaries (locked product decisions)
1. **My Askanus / מיין עסקנות** — personal life-of-work overview: projects, goals, received funding, promises, aggregate personal credit, impact, tasks, all follow-ups, history. Preserve the existing React page instead of rebuilding.
2. **Olam Hachesed MAX / עולם החסד קאמוניקאציע** — the **action layer**: a private donor/contact book, planning/outbound dialing and outcomes, notes, pledges, received sums, many follow-ups, and call workflows. A manually logged outcome is NOT proof a provider call actually happened or that a payment processor cleared funds.
3. **Campaign Center / קאמפיין סענטער** — multi-campaign, multi-member operations: assignments, organization finances, team dashboards, group leader hierarchy, enterprise roles and approval, live charity-calling room; each member has their own personal MAX-grade task center.
4. **Gavhah Connect** — trusted two-way integration with explicit team membership, scoped permissions, sponsored entitlements. A member may work in multiple campaigns without leaking private contacts across campaigns.

## Immutable user expectations
- A $20 received donation entered after a call for Project P must update Project P's **My Askanus** received total, and if tied to an organization must update that campaign's total too: ONE money event, multiple authorized views.
- A $20 **pledge** is a promise, not money received. Payment later must settle that specific pledge without double-counting. Refund/correction must have traceability.
- Follow-ups are unlimited by artificial product caps, visible in **both** personal and communication workspaces when linked, with **the same database record ID**. Create/edit/complete/restore/delete changes must be immediately reflected both places.
- Personal notes and personal contacts are private by default. Team managers only see appropriately shared campaign data, via backend authorization (never mere hidden buttons).
- Never advertise simulated/manual call outcomes as automated verified calls. Provider telephony is currently disconnected.
- Do not publish without release checks, production migration strategy, and explicit production-release decision. Do not break the existing live My Askanus page.

## Implemented in this GitHub feature branch (stage 1, NOT yet deployed)
- Existing My Askanus **retained**; direct entry into Olam Hachesed MAX added.
- New private `communication_contacts` records, owner scoped.
- New `fundraising_call_reports`: owner, project/case, optional contact, manual outcome, received/pledged/none, amount, idempotency request ID, audit timestamp; `(user_id,request_id)` unique.
- New owner-authenticated API: `GET/POST/PATCH /api/askanus/contacts`, `GET /api/askanus/call-reports`, `POST /api/askanus/cases/:id/call-reports`.
- The call report endpoint atomically inserts a report, records history, updates the SAME personal case's received/pledged totals, and creates an optional follow-up. Retries with the same request ID cannot add the money twice.
- Communication tab **מיין MAX רופן־צענטער**: project selection, personal contacts, opens local dialer, manual outcomes, reported money, follow-up capture, project totals, call history.
- Reuse of the existing `CaseFollowups` component from My Askanus for shared open/completed history. A new owner-scoped PATCH endpoint + editing UI allow changing note and due date from either view.
- Staging Neon branch `br-patient-mode-b49ljoyr` with fresh tables has been migration-checked; production Neon has NOT been changed.

## Delivery phases
### P1: Production-ready personal MAX and linked My Askanus (this branch begins this)
- Typecheck, tests, staging behavioral validation, responsive Yiddish UI, proper navigation, error recovery.
- Full pagination and indexes for large contact/report/followup collections.
- Donor-level pledged vs paid reconciliation, partial settlement, refunds, audited corrections, immutable verified ledger to replace manually adjusted counters.
- Contact edit/search/dedup/import, permission-aware donor call history, privacy and do-not-call preferences.
- Follow-up edit/reschedule/repeat/reminders, general personal follow-ups not attached to a case, phone-friendly calendar, overdue semantics, server-side events.
- Source attribution so user personal raised totals and campaign-wide gross are never combined or counted twice.
### P2: Gavhah Connect API + organization membership
- Single trusted SSO/user identity; campaign and user workspace IDs separate; no trusting arbitrary client-supplied campaignId.
- Membership invite/accept/revoke and roles: owner, manager, squad leader, askan, finance and reviewer.
- Contract: scope-limited listing of assigned campaign leads/tasks; member submission of contact outcomes, associated follow-up and verified money; manager statistics and permissions.
- Idempotent shared events, versioning, synchronized updates, audit logs. No access to another personal user's contacts absent explicit consent.
- Organization-purchased sponsored MAX licenses bound to active membership, with revoke/grace and retention/export rules.
### P3: Team Campaign Center
- Real multi-campaign storage, atomic lead claiming, team focus + Kanban, assignments, oversight, verified finance ledger, dashboards per member and per campaign.
- Personal team member dashboard should be as powerful as MAX; team manager dashboard aggregates permitted data.
### P4: "כח הרבים לייוו" virtual fundraising hall
- Authenticated phone/website room, scheduled events, room and breakout hierarchies, leader announcements, real-time presence and assignments, moderator permissions.
- Private donor calls NEVER audible in hall; return to hall after call; no fake attendance/donation counters; mobile/dumb-phone experiences.
- Actual provider contract and load test before claims of 100-1000 concurrent participants; consent, caller ID authorization, opt-outs, call/recording laws.
### P5: AI guidance, escalations and automations
- Member-facing contextual to-do prioritization, pronunciation-safe Yiddish voice prompts, follow-up reminders, safe escalation to team manager, explainable financial summaries.

## Release and acceptance conditions
- Register with a member account; case A and case B are isolated, other member cannot read them.
- On Project A: manually report $20 **received** with requestId X; total A rises by $20; B is unchanged; My Askanus and MAX show same total; retry requestId X yields duplicate and does NOT increment.
- Report $20 **pledged**: only promised changes, not received. Existing pledges must later reconcile to a verified receipt before broad launch.
- Create 3+ follow-ups on Project A using MAX; they appear in My Askanus; edit in one, verify in other; complete, check history, undo and delete with confirmation.
- No automatic phone claims: `tel:` opens a local dialer only.
- No production database migration/deploy while stage 1 has not been typechecked and tested.
- Never expose secrets or card numbers in calls/notes/logs.
- Test two simultaneous inserts, network retry, duplicate request key, slow database, 2 accounts and overlapping cases.
