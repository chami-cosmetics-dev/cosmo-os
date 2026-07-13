# Tasks: Admin Daily Sales SMS

**Input**: Design documents from `/specs/003-admin-daily-sales-sms/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included â€” plan.md / quickstart call for Vitest on format, aggregate, recipient validation, and dedupe skip

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 maps to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/api/`, `components/`, `prisma/`, `vercel.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient implementers; confirm touchpoints

- [x] T001 Confirm feature docs in `specs/003-admin-daily-sales-sms/plan.md`, `research.md`, `data-model.md`, and `contracts/daily-sales-sms.md`
- [x] T002 [P] Skim reuse targets: `lib/page-data/dashboard-sales.ts` (Colombo day bounds + paid/pending eligibility), `lib/hutch-sms.ts` (`sendSms`), `app/api/cron/ogf-sale/route.ts` (cron auth + schedule pattern), `components/molecules/sms-portal-settings-form.tsx` (settings UI pattern)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + core aggregation/format module all stories depend on

**CRITICAL**: Complete before US1â€“US3 implementation that assumes models and report builder exist

- [x] T003 Add `DailySalesSmsConfig` and `DailySalesSmsSendLog` models (and Company relations) in `prisma/schema.prisma` per `specs/003-admin-daily-sales-sms/data-model.md`
- [x] T004 Create migration with `npm run db:migrate:create` for daily sales SMS models (do not use `prisma migrate dev` / `db push` against shared DBs)
- [ ] T005 Apply migration to active target with `npm run db:deploy:<target>`; plan `npm run db:deploy:all` before feature is considered complete (constitution I)
- [x] T006 Implement report builder in `lib/daily-sales-sms.ts`: previous/report Colombo day helpers, day + MTD aggregates reusing dashboard sales eligibility (`date_type: "order"` / paid+pending), location rows via `CompanyLocation.shortName` fallback to truncated `name`, omit zero-MTD locations
- [x] T007 [P] Implement SMS body formatter in `lib/daily-sales-sms.ts` matching `specs/003-admin-daily-sales-sms/contracts/daily-sales-sms.md` (Day/Value/Count/MTD/location lines + thousand separators)
- [x] T008 [P] Add Vitest coverage in `lib/daily-sales-sms.test.ts` for format, empty day, month-boundary MTD shape, and location line labeling

**Checkpoint**: Foundation ready â€” can compute and format a message body for any report date without sending SMS

---

## Phase 3: User Story 1 - Daily sales SMS body matches report format (Priority: P1) MVP

**Goal**: Operators can preview the leadership-format SMS for a chosen day with correct Value/Count/MTD/location lines

**Independent Test**: POST preview for a known day â†’ body matches contract; spot-check totals vs dashboard order-date sales for same range

### Tests for User Story 1

- [x] T009 [P] [US1] Extend `lib/daily-sales-sms.test.ts` with fixture-style assertions for sample layout (Value/Count/MTD headers and `CODE->:` lines)

### Implementation for User Story 1

- [x] T010 [US1] Add `POST /api/admin/company/daily-sales-sms/preview` in `app/api/admin/company/daily-sales-sms/preview/route.ts` (`requirePermission("settings.sms_portal")`, Zod `reportDate`, returns metrics + `messageBody` per contract; `sendTest` deferred/false for MVP if US2 not done)
- [x] T011 [US1] Wire a minimal preview UI (textarea/pre + date input) in `components/molecules/daily-sales-sms-settings-form.tsx` (or colocated settings section) calling the preview API
- [x] T012 [US1] Mount the settings section on the existing SMS settings page alongside portal/notifications (find page under `app/(dashboard)/dashboard/settings/` that hosts `sms-portal-settings-form`)

**Checkpoint**: US1 MVP â€” preview shows correct SMS text without requiring recipients

---

## Phase 4: User Story 2 - Configure admin recipient phone numbers (Priority: P1)

**Goal**: Editable recipient list (initial number **0766713205**); empty list skips live send; test send when configured

**Independent Test**: Save `0766713205`, reload persists; clear list; preview still works; test send with portal configured reaches phone or records clear failure

### Tests for User Story 2

- [x] T013 [P] [US2] Add Vitest for recipient normalize/dedupe/validate helpers in `lib/daily-sales-sms.test.ts` (or same module)

### Implementation for User Story 2

- [x] T014 [US2] Implement `GET`/`PUT /api/admin/company/daily-sales-sms` in `app/api/admin/company/daily-sales-sms/route.ts` with Zod recipients validation, upsert `DailySalesSmsConfig`, `writeAuditLog` module `settings`
- [x] T015 [US2] Extend preview route in `app/api/admin/company/daily-sales-sms/preview/route.ts` to support `sendTest: true` â†’ fan-out via `sendSms` from `lib/hutch-sms.ts` to configured recipients (skip clearly if empty)
- [x] T016 [US2] Complete settings form in `components/molecules/daily-sales-sms-settings-form.tsx`: enabled toggle, recipients list/textarea, save, load GET, show last send status if available
- [x] T017 [US2] Document in UI helper text that initial Cosmo recipient is `0766713205` (ops enters/saves; not hard-coded as sole storage)

**Checkpoint**: US2 â€” recipients configurable; test send works when SMS portal + numbers present

---

## Phase 5: User Story 3 - Automatic daily send (Priority: P2)

**Goal**: Cron sends previous Asia/Colombo day SMS once per company/day; no duplicate spam; manual/force path for ops

**Independent Test**: Cron with `CRON_SECRET` for a fixed `?date=` sends once; second run skips; empty/disabled config skips without error blast

### Tests for User Story 3

- [x] T018 [P] [US3] Add Vitest for dedupe/skip decision helpers in `lib/daily-sales-sms.test.ts` (already sent / empty recipients / disabled)

### Implementation for User Story 3

- [x] T019 [US3] Implement send orchestration in `lib/daily-sales-sms.ts` (load config, skip rules, aggregate, format, send each recipient, write `DailySalesSmsSendLog`)
- [x] T020 [US3] Add `GET /api/cron/daily-sales-sms/route.ts` with `CRON_SECRET` Bearer auth (mirror `app/api/cron/ogf-sale/route.ts`), default previous Colombo day, optional `?date=YYYY-MM-DD`, company loop, summary JSON
- [x] T021 [US3] Register cron in `vercel.json` (e.g. `30 18 * * *` UTC aligned with midnight Colombo, same family as `ogf-sale`)
- [x] T022 [US3] Ensure successful automatic send creates unique `(companyId, reportDate)` log so re-runs skip; failed/skipped statuses per `data-model.md`
- [x] T023 [P] [US3] Expose last send metadata on `GET /api/admin/company/daily-sales-sms` for settings UI

**Checkpoint**: US3 â€” scheduled path ready; Cosmo quiet until recipients + enabled

---

## Phase 6: User Story 4 - Failed SMS on OGF logs + manual resend (Priority: P1)

**Goal**: Daily sales SMS failures appear on `/dashboard/ogf-logs` next to OGF email logs; operators can Resend manually

**Independent Test**: Failed send â†’ visible on ogf-logs SMS section â†’ Resend succeeds or logs new failure with `manual` source; OGF email section unchanged

### Implementation for User Story 4

- [x] T024 [US4] Ensure failed (and sent) attempts always persist to `DailySalesSmsSendLog` from cron/test/resend paths in `lib/daily-sales-sms.ts` (status + `errorSummary` + source)
- [x] T025 [US4] Add manual resend API in `app/api/admin/company/daily-sales-sms/resend/route.ts` (auth like `app/api/admin/ogf-resend/route.ts` / `settings.manage`, `reportDate` param, rebuild + send + log `manual`)
- [x] T026 [US4] Extend `app/(dashboard)/dashboard/ogf-logs/page.tsx` with a Daily Sales SMS history card (report date, recipients, source, status, error, Colombo time) loading `DailySalesSmsSendLog`
- [x] T027 [P] [US4] Add `app/(dashboard)/dashboard/ogf-logs/daily-sales-sms-resend-button.tsx` client Resend control calling the resend API (mirror `ogf-resend-button.tsx`)
- [x] T028 [US4] Optionally clarify page subtitle/hero copy so it covers both OGF email and Daily Sales SMS without breaking OGF-only users

**Checkpoint**: US4 â€” operators recover failed SMS from the same screen as OGF email

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and go-live readiness

- [x] T029 [P] Run `npx vitest run lib/daily-sales-sms.test.ts` and fix failures
- [ ] T030 Walk `specs/003-admin-daily-sales-sms/quickstart.md` on Cosmo (preview, save `0766713205`, test send, cron dry-run, **ogf-logs resend**)
- [ ] T031 Confirm location `shortName` values (WEB/OGF/…) in Locations settings match leadership codes before go-live
- [ ] T032 Ask user before `db:deploy:all` / prod cron enable / merge to `main` (constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational â€” MVP preview
- **US2 (Phase 4)**: After Foundational; builds on US1 preview UI/API
- **US3 (Phase 5)**: After Foundational; needs US2 config for real sends (can stub empty-skip without UI)
- **US4 (Phase 6)**: After Foundational; needs send log writes from US2/US3 paths (can implement UI against failed fixture rows)
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 â€” no dependency on US2/US3/US4
- **US2 (P1)**: After Phase 2; integrates preview from US1
- **US3 (P2)**: After Phase 2; uses config from US2 for non-skip sends
- **US4 (P1)**: After Phase 2; strongest after US3 logging exists; can ship after US2 test-send logging

### Parallel Opportunities

- T001â€“T002 in parallel
- T007â€“T008 in parallel after T006 starts (formatter vs tests once API surface sketched)
- T009 parallel with T010â€“T011 after foundation
- T013 parallel with T014
- T018 parallel with T019â€“T020
- T026â€“T027 after T025
- T029â€“T031 polish items mostly parallel

---

## Parallel Example: User Story 1

```text
# After Phase 2:
Task: T009 Extend format layout assertions in lib/daily-sales-sms.test.ts
Task: T010 Implement preview API in app/api/admin/company/daily-sales-sms/preview/route.ts
# Then:
Task: T011â€“T012 Wire settings preview UI
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (schema + `lib/daily-sales-sms.ts`)
2. Phase 3 US1 preview API + UI
3. **STOP and VALIDATE** against a known day vs dashboard
4. Demo message body before wiring phones

### Incremental Delivery

1. Setup + Foundational â†’ report builder ready  
2. US1 â†’ preview MVP  
3. US2 â†’ save `0766713205` + test send  
4. US3 â†’ cron + dedupe  
5. US4 â†’ OGF logs failure list + Resend  
6. Polish + user-confirmed prod migrate/cron

### Suggested MVP scope

**US1 only** (format + preview) proves numbers before SMS spend / cron risk.  
**Ops-complete slice**: US1 + US2 + US4 (preview, phones, failure recovery) before enabling cron (US3).

---

## Notes

- [P] = different files, no wait on incomplete sibling tasks
- Do not hard-code `0766713205` as the only storage â€” settings list is source of truth
- Do not reuse `OgfEmailLog` for SMS â€” separate `DailySalesSmsSendLog`, same page
- Migrations: `db:migrate:create` then `db:deploy:all` before complete
- Commit after each logical group; ask before prod
