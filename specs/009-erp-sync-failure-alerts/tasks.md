# Tasks: ERP Sync Failure Alerts

**Input**: Design documents from `/specs/009-erp-sync-failure-alerts/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan.md / quickstart call for Vitest on stale classification, shipping totals, email body/totals, recipient normalize, and cron dedupe/skip

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 maps to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/api/`, `components/`, `prisma/`, `vercel.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient implementers; confirm touchpoints

- [x] T001 Confirm feature docs in `specs/009-erp-sync-failure-alerts/plan.md`, `research.md`, `data-model.md`, and `contracts/erp-sync-failure-alerts.md`
- [x] T002 [P] Skim reuse targets: `lib/failed-erp-sync-auto-retry.ts`, `lib/erpnext-sync.ts`, `lib/order-webhook-process.ts`, `lib/maileroo.ts`, `lib/daily-sales-sms.ts`, `components/molecules/daily-sales-sms-settings-form.tsx`, `app/api/cron/failed-erp-syncs-auto-retry/route.ts`, `components/organisms/failed-erp-syncs-panel.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + migration all stories depend on

**CRITICAL**: Complete before US1–US4 work that assumes new Order field and email models exist

- [x] T003 Add `erpnextSyncStartedAt` on `Order`, plus `ErpSyncFailureEmailConfig` and `ErpSyncFailureEmailSendLog` models (and `Company` relations) in `prisma/schema.prisma` per `specs/009-erp-sync-failure-alerts/data-model.md`
- [x] T004 Create migration with `npm run db:migrate:create` for ERP sync failure alert schema (do not use `prisma migrate dev` / `db push` against shared DBs)
- [x] T005 Apply migration to active target with `npm run db:deploy:<target>`; plan `npm run db:deploy:all` before feature is considered complete (constitution I)
- [x] T006 Extend `ERP_SYNC_SUCCESS_CLEAR` in `lib/failed-erp-sync-auto-retry.ts` (or shared constant) to clear `erpnextSyncStartedAt` on successful sync

**Checkpoint**: Foundation ready — schema available; success path clears startedAt

---

## Phase 3: User Story 1 - Automatically recover stuck ERP order syncs (Priority: P1) 🎯 MVP

**Goal**: Stale `pending`-without-error orders are classified, recorded with a reason/time, and auto-retried; silent sync skips no longer leave zombies; failed panel shows clear copy

**Independent Test**: Fixture order stuck pending >5 minutes → cron/retry sweep marks interrupted + schedules/runs retry; success stores SI id; concurrent runs create no duplicate SI; panel shows stuck reason instead of `—`

### Tests for User Story 1

- [x] T007 [P] [US1] Add Vitest coverage for stale-pending detection and interrupted message in `lib/failed-erp-sync-auto-retry.test.ts` (or new colocated test)

### Implementation for User Story 1

- [x] T008 [US1] Set `erpnextSyncStartedAt` when claiming `pending` in `lib/order-webhook-process.ts` (and any other claim paths that set `erpnextInvoiceId: "pending"`)
- [x] T009 [US1] Convert silent early returns after a claimed sync (missing credentials, missing company/warehouse, empty line items) into thrown/actionable failures in `lib/erpnext-sync.ts` so `markOrderErpSyncFailed` runs
- [x] T010 [US1] Implement stale-pending classify (≥5 minutes, null error) → `markOrderErpSyncFailed` with interrupted message + schedule in `lib/failed-erp-sync-auto-retry.ts`; include in unscheduled sweep before `if (!errorText) continue`
- [x] T011 [US1] Ensure existing `GET /api/cron/failed-erp-syncs-auto-retry` in `app/api/cron/failed-erp-syncs-auto-retry/route.ts` picks up stale classification via shared lib (no schedule change required)
- [x] T012 [P] [US1] Update `components/organisms/failed-erp-syncs-panel.tsx` to show “Sync interrupted or stuck pending” (and started/failed time) instead of blank Error / Failed at for pending-without-error rows

**Checkpoint**: US1 MVP — zombies auto-recover or show clear failure; panel no longer blank

---

## Phase 4: User Story 2 - Alert company heads about unresolved end-of-day failures (Priority: P1)

**Goal**: After local business day, configured recipients get one consolidated failure email (or a clear skip when none); cron dedupes; email failures do not mutate order ERP state

**Independent Test**: Seed unresolved orders for a report date → cron with `CRON_SECRET` sends once → second run skips → disabled/empty/no-failures skip with log → Maileroo failure leaves order sync fields unchanged

### Tests for User Story 2

- [x] T013 [P] [US2] Add Vitest for cron skip/dedupe helpers (`already sent` / `disabled` / `no recipients` / `no failures`) in `lib/erp-sync-failure-email.test.ts`

### Implementation for User Story 2

- [x] T014 [US2] Implement report snapshot builder + send orchestration in `lib/erp-sync-failure-email.ts` (Colombo previous-day bounds, failed-ERP eligibility excluding voided/cancelled, subject/body per `contracts/erp-sync-failure-alerts.md`, write `ErpSyncFailureEmailSendLog`)
- [x] T015 [P] [US2] Add `sendErpSyncFailureAlertEmail` in `lib/maileroo.ts` (multi-recipient Maileroo send; return success/error without throwing into order sync)
- [x] T016 [US2] Add `GET /api/cron/erp-sync-failure-email/route.ts` with `CRON_SECRET` Bearer auth, default previous Colombo day, optional `?date=YYYY-MM-DD`, per-company loop, summary JSON
- [x] T017 [US2] Register cron in `vercel.json` as `35 18 * * *` (UTC ≈ 00:05 Asia/Colombo)
- [x] T018 [US2] Persist skip/sent/failed statuses per `data-model.md`; successful cron `sent` blocks duplicate automatic sends for `(companyId, reportDate)`

**Checkpoint**: US2 — cutoff email path works once config/recipients exist (settings UI may still be stubbed via DB for staging)

---

## Phase 5: User Story 3 - Reconcile totals with and without shipping (Priority: P1)

**Goal**: Email/preview rows and summaries expose amount including shipping, shipping, and excluding shipping, grouped by currency, with consistent arithmetic

**Independent Test**: Orders with known shipping (incl. free/discounted/zero) → row and currency totals match within 0.01; unlike currencies not summed together

### Tests for User Story 3

- [x] T019 [P] [US3] Add Vitest for incl/shipping/excl arithmetic and multi-currency grouping in `lib/erp-sync-failure-email.test.ts`

### Implementation for User Story 3

- [x] T020 [US3] Resolve per-order amounts in `lib/erp-sync-failure-email.ts` using `lib/order-shipping-display.ts` (and ERP shipping rules as needed): including, shipping, excluding = including − shipping (clamped)
- [x] T021 [US3] Ensure HTML/text email body and preview payload include row amounts + `totalsByCurrency` per `contracts/erp-sync-failure-alerts.md`
- [x] T022 [P] [US3] Store `summaryJson` (orderCount, totalsByCurrency, orderIds) on `ErpSyncFailureEmailSendLog` for immutable cutoff snapshot metadata

**Checkpoint**: US3 — leadership can tally daily sales deltas from the email alone

---

## Phase 6: User Story 4 - Configure failure emails for both operating systems (Priority: P2)

**Goal**: Cosmo and Vault admins independently enable alerts, edit emails (Vault initial `buddhima.cosmetics@outlook.com`), preview, test-send, and resend via Daily Sales SMS–style UI

**Independent Test**: Save recipients on Vault vs Cosmo → each cron uses only its list; preview without send; test email uses `[TEST]` and does not block cron dedupe; invalid emails rejected; empty/disabled skips

### Tests for User Story 4

- [x] T023 [P] [US4] Add Vitest for email recipient normalize/dedupe/validate helpers in `lib/erp-sync-failure-email.test.ts`

### Implementation for User Story 4

- [x] T024 [US4] Implement `GET`/`PUT /api/admin/company/erp-sync-failure-email/route.ts` with `requirePermission("settings.email_templates")`, Zod `emailSchema` recipients, upsert config, `writeAuditLog` module `settings`, last-send metadata
- [x] T025 [US4] Implement `POST /api/admin/company/erp-sync-failure-email/preview/route.ts` (`reportDate`, `sendTest`) returning snapshot per contract; test send logs `source: preview_test`
- [x] T026 [US4] Implement `POST /api/admin/company/erp-sync-failure-email/resend/route.ts` for manual resend by `reportDate` (`source: manual`)
- [x] T027 [US4] Build `components/molecules/erp-sync-failure-email-settings-form.tsx` mirroring daily sales SMS: enabled, one-email-per-line, last send, report date, Preview, Send test email, Save (action loading UX)
- [x] T028 [US4] Mount settings form on `app/(dashboard)/dashboard/settings/email-templates/page.tsx` (or agreed email settings sibling) with `canEdit` from `settings.email_templates`
- [x] T029 [P] [US4] Document in UI helper text that Supplement Vault initial recipient is `buddhima.cosmetics@outlook.com` (ops saves; not hard-coded as sole storage)

**Checkpoint**: US4 — both OS tenants configurable without code changes

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hardening across stories

- [x] T030 [P] Confirm failed-panel + email reason strings stay consistent for interrupted/stuck pending across `components/organisms/failed-erp-syncs-panel.tsx` and `lib/erp-sync-failure-email.ts`
- [x] T031 Run Vitest suites `lib/erp-sync-failure-email.test.ts` and `lib/failed-erp-sync-auto-retry.test.ts`; fix regressions
- [ ] T032 Walk `specs/009-erp-sync-failure-alerts/quickstart.md` validation scenarios on active target (preview, test send, cron dedupe, cross-tenant isolation)
- [ ] T033 Before go-live: `npm run db:deploy:all`, enable cron on Cosmo + Vault Vercel projects only after explicit user confirmation (constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP; no dependency on email stories
- **US2 (Phase 4)**: After Foundational — needs email models; independent of US1 for send path (benefits from US1 cleaner failure set)
- **US3 (Phase 5)**: After US2 report/email scaffolding (extends `lib/erp-sync-failure-email.ts`)
- **US4 (Phase 6)**: After Foundational; practical after US2/US3 so preview shows real totals (API can land in parallel with US2 if stubbed)
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP auto-recovery
- **US2 (P1)**: Foundational + email models; optional benefit from US1
- **US3 (P1)**: Builds on US2 snapshot/email body
- **US4 (P2)**: Foundational; best after US2/US3 for end-to-end preview

### Parallel Opportunities

- T001 / T002 in Setup
- T007 Vitest can be sketched while T008–T010 land
- T013 / T015 parallel with T014 scaffolding
- T019 / T022 / T023 parallel within later phases
- US1 can proceed in parallel with early US2 API stubs once Foundational is done

---

## Notes

- [P] = different files, no incomplete-task dependencies
- Do not hard-code Vault email as the only storage — UI save is source of truth
- Email delivery failures must never clear or alter `erpnextInvoiceId` / sync error fields
- Ask before `db:deploy:all` to prod and before enabling Vercel cron in production
- **T004 note**: `db:migrate:create` failed on Windows URL quoting; migration SQL was authored to match schema (`20260718110000_add_erp_sync_failure_alerts`) and applied to cosmo-dev via `db:deploy:cosmo-dev`
- **T032/T033**: Left open for ops UAT and explicit prod deploy confirmation
