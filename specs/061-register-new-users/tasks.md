# Tasks: Register New Users

**Input**: Design documents from `/specs/061-register-new-users/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan expects Vitest for helpers (badge, outcome, dump-exclude, ERP allocate). Not TDD-first. Manual checks in `quickstart.md`.

**Organization**: Tasks grouped by user story (US1–US8 as in spec.md). Git branch: `feature/new-user-register`. Spec dir: `specs/061-register-new-users`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1, US2, US3, US4, US5, US6, US7, US8
- Exact file paths in every task description

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `prisma/`, `components/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm docs and Constitution I before schema work

- [X] T001 Confirm feature docs exist under `specs/061-register-new-users/` (plan.md, spec.md, research.md, data-model.md, contracts/register-new-users.md, quickstart.md)
- [X] T002 [P] Record implement note: schema only via `npm run db:migrate:create`; never `db push` on vault / cosmo-dev / cosmo-prod — in `specs/061-register-new-users/plan.md` (already stated; follow it)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, permission, shared helpers all stories need

**CRITICAL**: No user story work until this phase completes

- [X] T003 Extend `ContactMaster` (`osRegistrationCreated`, `osRegLocation`, `osRegBadgeStart`, `osRegBadgeEnd` + index) and add `OsRegistrationQr` + `OsRegistrationCapture` in `prisma/schema.prisma` per `specs/061-register-new-users/data-model.md`
- [X] T004 Create Prisma migration with `npm run db:migrate:create` for T003; run `npm run db:generate` (do not `db push` shared DBs; deploy only when user asks)
- [X] T005 [P] Add `contacts.register` to `DEFAULT_PERMISSIONS` in `lib/rbac.ts` (do not imply it from `contacts.master.manage` / `contacts.manage`; do not auto-grant merchants)
- [X] T006 [P] Add helpers `lib/register-users/badge.ts` (Colombo inclusive window), `lib/register-users/outcome.ts` (`created` | `already_registered` | `updated`), `lib/register-users/phone.ts` (wrap existing phone variants), `lib/register-users/dump-exclude.ts` (`osRegistrationCreated` + no purchase)
- [X] T007 Add Vitest for T006 in `lib/register-users/badge.test.ts`, `lib/register-users/outcome.test.ts`, `lib/register-users/dump-exclude.test.ts`

**Checkpoint**: Migration created, RBAC + helpers ready — stories can start

---

## Phase 3: User Story 1 - Workbook header, then add users (Priority: P1) 🎯 MVP

**Goal**: Permission-gated adding page. Header = location + one date range (today-only in the client). Save new phone → one unallocated Contact Master + capture `created`. Header change same day stamps only the next save.

**Independent Test**: User with `contacts.register` sets Kandy / today–2026-09-27, saves phone A; changes header to Galle / today–2026-09-30, saves phone B. A keeps Kandy. User without permission denied.

### Implementation for User Story 1

- [X] T008 [US1] Add Zod body for staff save (`name`, `phoneNumber`, `email?`, birthday parts, `location`, `badgeStart`, `badgeEnd`) in `lib/validation/register-users.ts`
- [X] T009 [US1] Implement create-or-stamp save (new phone only for this story) in `lib/register-users/save.ts` — set `osRegistrationCreated`, badge fields, empty `assignedMerchant`, write `OsRegistrationCapture` `outcome=created` `source=staff`
- [X] T010 [US1] Add `POST /api/admin/register-users` in `app/api/admin/register-users/route.ts` gated by `requirePermission("contacts.register")` + T008 Zod
- [X] T011 [US1] Add `GET` denial page + `requirePermission` in `app/(dashboard)/dashboard/register-users/page.tsx`
- [X] T012 [US1] Build header + per-user form (no discount range; header not persisted overnight — session key includes Colombo date) in `components/organisms/register-users-workbook.tsx`
- [X] T013 [US1] Add sidebar entry “Register new users” → `/dashboard/register-users` gated by `contacts.register` in `components/organisms/app-sidebar.tsx`

**Checkpoint**: New-user save MVP independently testable

---

## Phase 4: User Story 2 - Already-registered load, edit, save (Priority: P1)

**Goal**: Phone lookup alerts and loads name/email/birthday. Save updates same row, applies badge, never creates a second contact. Outcome `already_registered` or `updated`.

**Independent Test**: Existing Contact Master phone → alert + fields load. Save unchanged → already registered. Change email → updated. Still one row.

### Implementation for User Story 2

- [X] T014 [US2] Add `GET /api/admin/register-users/lookup` in `app/api/admin/register-users/lookup/route.ts` (`contacts.register`, phone variants; `{ match: null }` or profile; 409/list if multiple)
- [X] T015 [US2] Extend `lib/register-users/save.ts` for existing phone: update name/email/birthday from form, refresh badge, **do not** set `osRegistrationCreated` true, capture `already_registered` or `updated`
- [X] T016 [US2] Wire lookup-on-phone + alert + load/edit in `components/organisms/register-users-workbook.tsx`

**Checkpoint**: Already-registered path independently testable

---

## Phase 5: User Story 3 - Workbook list, history, and “updated” (Priority: P1)

**Goal**: Today’s sheet lists all today’s captures (new + already-registered + updated). History by day. Allocation does not hide rows. Next Colombo day header empty.

**Independent Test**: Today shows A created, B already registered, C already registered + updated. Next day header empty; yesterday still in history.

### Implementation for User Story 3

- [X] T017 [US3] Add `GET /api/admin/register-users/page-data` in `app/api/admin/register-users/page-data/route.ts` — `today`, `rows`, `historyDays` per `specs/061-register-new-users/contracts/register-new-users.md`
- [X] T018 [US3] Render today sheet + history + outcome labels (`created` / `already registered` / `updated`) and empty state in `components/organisms/register-users-workbook.tsx`
- [X] T019 [US3] Refresh page-data after save in `components/organisms/register-users-workbook.tsx`; confirm session header key resets when Colombo date changes

**Checkpoint**: Workbook history independently testable

---

## Phase 6: User Story 4 - Temporary location badge on Customer Insight (Priority: P1)

**Goal**: Insight search shows location badge while Colombo today is inside that contact’s stamp. Hidden after end / before start. Shown even to non-allocated merchants on exact-phone search.

**Independent Test**: A and already-registered C both show Kandy badge in range; after end date both badges gone.

### Implementation for User Story 4

- [X] T020 [P] [US4] Add `osRegBadge: { location: string } | null` on insight DTO in `lib/customer-insight/types.ts` and compute via `lib/register-users/badge.ts` in `lib/customer-insight/serialize.ts` (and `load.ts` if serialize input needs stamp fields)
- [X] T021 [US4] Show location badge on customer search/profile in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` (limited + full view)

**Checkpoint**: Badge independently testable on Insight search

---

## Phase 7: User Story 5 - Admin location filter and export (Priority: P1)

**Goal**: Admin tools list registration locations. Filter + export = `osRegistrationCreated` only. Already-registered omitted.

**Independent Test**: Filter Kandy → new A only, not already-registered B. Export matches. Non-admin has no control.

### Implementation for User Story 5

- [X] T022 [US5] Add `osRegLocation` to filter input + query in `lib/customer-insight/filters.ts` and `lib/validation/customer-insight.ts`
- [X] T023 [P] [US5] Add `osRegLocations` options in `lib/customer-insight/filter-options.ts` and `app/api/admin/customer-insight/filter-options/route.ts`
- [X] T024 [US5] Wire `osRegLocation` on `app/api/admin/customer-insight/filter/route.ts` and `app/api/admin/customer-insight/filter/export/route.ts`
- [X] T025 [US5] Add admin-only location filter control in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: Admin location list independently testable

---

## Phase 8: User Story 8 - QR portal (Priority: P1)

**Goal**: Staff create immutable QR. Public portal: name, email, phone. Same save rules, stamp from QR. Rows appear on workbook.

**Independent Test**: QR → new phone on today sheet as created. Existing phone updates in place; already registered / updated labels. Staff can still add on OS form.

### Implementation for User Story 8

- [X] T026 [US8] Add `qrcode` dependency in `package.json` (staff data URL only)
- [X] T027 [US8] Add `POST /api/admin/register-users/qr` in `app/api/admin/register-users/qr/route.ts` (`contacts.register`, persist `OsRegistrationQr`, return `token`, `url`, `qrDataUrl`)
- [X] T028 [US8] Add public `GET`/`POST` in `app/api/register/[token]/route.ts` — Zod name/email/phone; reuse `lib/register-users/save.ts` with `source=portal` and QR stamp
- [X] T029 [US8] Add public page `app/register/[token]/page.tsx` (no Cosmo login; confirm save)
- [X] T030 [US8] Add “Create QR” on header in `components/organisms/register-users-workbook.tsx` (blocked until location + dates set)

**Checkpoint**: Portal + staff add both work

---

## Phase 9: User Story 7 - Keep new OS numbers out of dumps (Priority: P1)

**Goal**: Contact dumps omit `osRegistrationCreated` with no purchase. After purchase, include. Already dump-eligible contacts stay in dumps.

**Independent Test**: New no-purchase phone absent from dump; after purchase present.

### Implementation for User Story 7

- [X] T031 [US7] Apply `lib/register-users/dump-exclude.ts` in `lib/reports/contact-dump.ts` (all parts + full dump)
- [X] T032 [P] [US7] Add/extend Vitest in `lib/reports/contact-dump.test.ts` (or `lib/register-users/dump-exclude.test.ts`) for omit/include cases

**Checkpoint**: Dump rule independently testable

---

## Phase 10: User Story 6 - ERP match, email, allocate (Priority: P1)

**Goal**: ERP customer webhook reuses OS phone row. Merchant mailbox never writes OS email. Allocate if still unallocated even when sync is `enriched`/`unchanged`.

**Independent Test**: OS-first unallocated + ERP create with merchant mail → one row, OS email kept, merchant allocated. Already allocated not stolen.

### Implementation for User Story 6

- [X] T033 [US6] Allow `created` | `enriched` | `unchanged` in `shouldAutoAllocateErpCustomer` in `lib/erp-customer-auto-allocation.ts` (other gates unchanged; `updateMany` still requires empty `assignedMerchant`)
- [X] T034 [P] [US6] Update tests in `lib/erp-customer-auto-allocation.test.ts` for enriched/unchanged allocate and still-blocked cases
- [X] T035 [US6] Confirm `app/api/webhooks/erpnext/customer/route.ts` still uses the helper and `isSharedMerchantEmail` / `emailSafeForContact` so merchant mailbox does not fill or overwrite OS email (adjust only if a gap remains)

**Checkpoint**: ERP path independently testable with fixtures/tests

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Quality gate across stories

- [X] T036 [P] Lint touched files (`lib/register-users/`, register APIs, insight filter, dump, rbac, sidebar, workbook)
- [X] T037 Run `npm test` for register-users + ERP allocate + dump tests
- [X] T038 Walk `specs/061-register-new-users/quickstart.md` scenarios 1–8 on Cosmo OS (no prod deploy)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup — **BLOCKS** all stories
- **US1 (Phase 3)**: After Phase 2 — MVP
- **US2**: After US1 save path (`lib/register-users/save.ts`)
- **US3**: After US1 page + US2 outcomes
- **US4**: After Phase 2 stamps exist (can start after US1 saves)
- **US5**: After US1 creates (`osRegistrationCreated`)
- **US8**: After US1/US2 save + US3 page-data
- **US7**: After Phase 2 dump-exclude helper; needs real creates from US1
- **US6**: After Phase 2; independent of UI
- **Polish**: After desired stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no other story
- **US2 (P1)**: After US1 save API
- **US3 (P1)**: After US1 + US2 captures
- **US4 (P1)**: After US1 (and US2 for already-registered badge)
- **US5 (P1)**: After US1 creates
- **US8 (P1)**: After US1–US3
- **US7 (P1)**: After US1 creates
- **US6 (P1)**: After Phase 2 — parallel with UI stories

### Parallel Opportunities

- T002, T005, T006 in parallel after T001/T003 sequencing (T006 after T003 types exist)
- T020 || T023 once stamps exist
- T032 || T034 in Polish/story tails
- US6 can run beside US4/US5/US8 after Phase 2

### Parallel Example: After Phase 2

```text
Developer A: US1 → US2 → US3
Developer B: US6 (ERP helper + tests)
Developer C: US4 badge serialize (after first saves exist)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 US1
3. **STOP**: permission page, header, new-phone save, unallocated + stamp
4. Then US2 + US3 before demo to ops

### Incremental Delivery

1. Setup + Foundational
2. US1 add new users
3. US2 already-registered
4. US3 workbook history
5. US4 Insight badge
6. US5 admin filter/export
7. US8 QR portal
8. US7 dumps
9. US6 ERP allocate
10. Polish + quickstart

---

## Notes

- [P] = different files, no wait on incomplete sibling
- Do not grant Contact Master directory via `contacts.register`
- Do not `db:deploy:all` or push `main` unless user asks in the moment
- Header lives in the browser for the Colombo day only — do not persist “open workbook” on the server
- Issued QR is immutable; new header → new QR
