# Tasks: Vault Sales SMS Logs & Delivery Visibility

**Input**: Design documents from `/specs/004-vault-sales-sms-logs/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Optional Vitest only for small pure helpers (status / next-run label) — no full TDD suite required by spec

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `vercel.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and existing Daily Sales SMS stack (no new schema)

- [x] T001 Confirm feature docs in `specs/004-vault-sales-sms-logs/plan.md`, `research.md`, `data-model.md`, and `contracts/vault-sales-sms-logs.md`
- [x] T002 [P] Skim reuse targets: `lib/daily-sales-sms.ts`, `app/api/admin/company/daily-sales-sms/resend/route.ts`, `app/(dashboard)/dashboard/ogf-logs/page.tsx`, `app/(dashboard)/dashboard/ogf-logs/daily-sales-sms-resend-button.tsx`, `components/organisms/app-sidebar.tsx`, `app/(dashboard)/layout.tsx` (`hasOgf`), `vercel.json` (cron `30 3 * * *`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared status helper + confirm cron schedule; no migration

**CRITICAL**: Complete before Vault page / nav wiring

- [x] T003 Verify `vercel.json` cron for `/api/cron/daily-sales-sms` is `30 3 * * *` (09:00 Asia/Colombo); document deploy-to-Vault note in `specs/004-vault-sales-sms-logs/quickstart.md` if missing
- [x] T004 [P] Add status summary helper in `lib/daily-sales-sms-status.ts` (enabled, recipientCount via `normalizeRecipientList`, lastAttempt from latest log, nextScheduledLabel `09:00 Asia/Colombo`)
- [x] T005 [P] Add Vitest coverage for status helper in `lib/daily-sales-sms-status.test.ts` (empty config, recipients count, last attempt mapping)

**Checkpoint**: Foundation ready — status DTO can be built without UI

---

## Phase 3: User Story 1 - Vault Sales SMS Logs page without OGF (Priority: P1) — MVP

**Goal**: Vault operators open **Sales SMS Logs** from nav (no OGF), see status summary + attempt history

**Independent Test**: On Vault (`!OGF_LOCATION_ID`), sidebar shows Sales SMS Logs → `/dashboard/sales-sms-logs` renders status + table (or empty SMS state); no OGF email section

### Implementation for User Story 1

- [x] T006 [US1] Add Vault nav item **Sales SMS Logs** → `/dashboard/sales-sms-logs` when `!hasOgf` in `components/organisms/app-sidebar.tsx` (keep Cosmo `hasOgf` → OGF & Sales Logs)
- [x] T007 [US1] Create server page `app/(dashboard)/dashboard/sales-sms-logs/page.tsx` with `requirePermission("settings.manage")`, load company `DailySalesSmsConfig` + `DailySalesSmsSendLog` (latest 100), pass into panel
- [x] T008 [US1] Implement status summary UI on Vault page using `lib/daily-sales-sms-status.ts` (enabled, recipient count, last attempt Colombo time, next run 09:00 Asia/Colombo)
- [x] T009 [US1] Implement Daily Sales SMS attempt table on Vault page (columns per `contracts/vault-sales-sms-logs.md`: Sent At Colombo, Report date, Recipients, Source, Status, Error) — extract shared panel to `components/organisms/daily-sales-sms-logs-panel.tsx` if reuse with Cosmo is easy
- [x] T010 [US1] Empty states: no attempts yet; never render OGF email section on this page

**Checkpoint**: US1 MVP — Vault can view SMS logs + status without OGF

---

## Phase 4: User Story 2 - Resend + Send for date (Priority: P1)

**Goal**: Operators Resend from a log row and Send for date when no row exists; both log `manual` attempts

**Independent Test**: Send for a past `reportDate` with no prior row → new log; Resend on a row → another manual log; empty recipients → clear 400

### Implementation for User Story 2

- [x] T011 [US2] Confirm `app/api/admin/company/daily-sales-sms/resend/route.ts` supports force manual send when no prior log (Send for date); adjust only if missing validation/errors per contract
- [x] T012 [US2] Reuse `app/(dashboard)/dashboard/ogf-logs/daily-sales-sms-resend-button.tsx` (or shared button) on Vault attempt rows in `app/(dashboard)/dashboard/sales-sms-logs/page.tsx` / panel
- [x] T013 [US2] Add **Send for date** control (date input + action) on Vault Sales SMS Logs calling resend API with `reportDate`; show success/error toast; refresh list
- [x] T014 [US2] Reject invalid/future dates in UI with clear message; surface API "no recipients" error clearly

**Checkpoint**: US2 — catch-up and row Resend work on Vault

---

## Phase 5: User Story 3 - Vault automated send diagnosable & working (Priority: P1)

**Goal**: Scheduled Daily Sales SMS runs for Vault when configured; operators see blockers via status/logs (not silent miss)

**Independent Test**: With Vault config enabled + recipients, cron/manual path for a test date produces `sent` or `failed` log visible on Vault page; disabled/empty shown in status

### Implementation for User Story 3

- [x] T015 [US3] Verify `app/api/cron/daily-sales-sms/route.ts` loops enabled configs on the deployment DB (no Cosmo/OGF gate); no code change unless a Vault-skipping bug exists
- [x] T016 [US3] Ensure skip/fail paths from `lib/daily-sales-sms.ts` still write logs for cron skips that should be visible (align with FR-006); adjust only if Vault-visible gaps found
- [x] T017 [US3] On Vault status summary, make disabled / zero recipients obvious (copy or badge) so SC-006 holds without engineering
- [x] T018 [US3] Document Vault Vercel cron verification steps in `specs/004-vault-sales-sms-logs/quickstart.md` (project must list `/api/cron/daily-sales-sms` at `30 3 * * *`)

**Checkpoint**: US3 — automation path + diagnosability ready for Vault UAT

---

## Phase 6: User Story 4 - Cosmo OGF & Sales Logs unchanged (Priority: P2)

**Goal**: Cosmo keeps OGF email + Daily Sales SMS logs + Resend; no Vault-only nav on Cosmo

**Independent Test**: Cosmo with OGF: OGF & Sales Logs still works for email + SMS sections

### Implementation for User Story 4

- [x] T019 [US4] Smoke-check `app/(dashboard)/dashboard/ogf-logs/page.tsx` — OGF section + SMS section still present after any shared-panel extract
- [x] T020 [US4] Confirm Cosmo sidebar still uses `hasOgf` for **OGF & Sales Logs** only in `components/organisms/app-sidebar.tsx` (no Sales SMS Logs link when `hasOgf`)
- [x] T021 [P] [US4] If shared panel extracted, wire Cosmo SMS section to `components/organisms/daily-sales-sms-logs-panel.tsx` without behavior change

**Checkpoint**: US4 — Cosmo regression green

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup

- [x] T022 [P] Run `npx vitest run lib/daily-sales-sms-status.test.ts` (and related) and fix failures
- [x] T023 Walk Vault scenarios in `specs/004-vault-sales-sms-logs/quickstart.md` (nav, status, send for date, resend)
- [x] T024 Walk Cosmo regression in quickstart section 6
- [x] T025 Ask user before deploying cron/nav to Vault (and Cosmo if shared) production (constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup — blocks US1–US3 UI/status work
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After US1 page exists (Resend/Send UI mounts on page)
- **US3 (Phase 5)**: Can overlap with US2 after Foundational; status copy depends on T008
- **US4 (Phase 6)**: After any shared extract (T009/T021); otherwise after US1 nav change
- **Polish (Phase 7)**: After desired stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no dependency on US2–US4
- **US2 (P1)**: Needs US1 page shell (T007+)
- **US3 (P1)**: Mostly independent; uses status UI from US1
- **US4 (P2)**: Independent Cosmo check; coordinates if shared panel extracted

### Parallel Opportunities

- T002 with T001; T004/T005 in parallel after T003
- T019/T020 can start once Cosmo files stable; T021 after extract decision
- T022 parallel with manual UAT prep

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1) — Vault nav + page + status + history
3. **STOP and VALIDATE** on Vault
4. Then US2 catch-up send, US3 cron/ops notes, US4 Cosmo smoke

### Incremental Delivery

1. Setup + Foundational
2. US1 → Vault can see logs (MVP)
3. US2 → Resend / Send for date
4. US3 → Confirm cron + status blockers
5. US4 → Cosmo regression
6. Polish + user-confirmed deploy

---

## Notes

- No Prisma migration for this feature (reuse `DailySalesSmsConfig` / `DailySalesSmsSendLog`)
- Resend API already force-sends; prefer reuse over a new endpoint
- Cron schedule change may already be in `vercel.json` — still verify Vault Vercel project
- Commit after each logical group; ask before prod deploy
