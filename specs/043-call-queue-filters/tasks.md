# Tasks: Merchant Call Queue Filters, Assign, Export & Sales Report

**Input**: Design documents from `/specs/043-call-queue-filters/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan/constitution require Vitest for push bands, hide windows, eligible-N. Unit-test tasks included (not full TDD-first contract suite). Manual checks in `quickstart.md`.

**Organization**: Tasks grouped by user story. All stories are P1; implement US1 first as MVP, then US5/US6 before heavy production assign (hide rules).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no unfinished dependency)
- **[Story]**: US1–US6 from spec.md
- Exact file paths in every task

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `prisma/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature docs and Constitution I before schema work

- [x] T001 Confirm docs exist under `specs/043-call-queue-filters/` (plan.md, spec.md, research.md, data-model.md, contracts/call-queue-assign.md, quickstart.md)
- [x] T002 [P] Follow Constitution I for this feature: schema via `npm run db:migrate:create` only; never `prisma db push` on vault/cosmo-dev/cosmo-prod

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Queue history + snapshot so later export/report/re-assign work

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T003 Drop `@@unique([companyId, contactId])` on `ContactInsightCallQueue`; add `lifetimeTotalAtAssign Decimal?` and `@@index([companyId, contactId, status])` in `prisma/schema.prisma` per `specs/043-call-queue-filters/data-model.md`
- [x] T004 Create Prisma migration with `npm run db:migrate:create` for T003; run `npm run db:generate` (deploy with `db:deploy:<target>` later — do not `db push` shared DBs)
- [x] T005 Change `assignCallQueue` in `lib/customer-insight/call-queue.ts` to **insert** a new pending row (skip if pending exists); do **not** upsert completed history; snapshot `lifetimeTotalAtAssign` via `lifetimeTotalsByContactId`
- [x] T006 Return skip counts from `assignCallQueue` (`assigned`, `skippedQueued`, `skippedHidden`, `skippedNotAllocated`) and map them in `app/api/admin/customer-insight/call-queue/assign/route.ts`

**Checkpoint**: History-capable queue + snapshot — stories can start

---

## Phase 3: User Story 1 - Filter then assign (Priority: P1) 🎯 MVP

**Goal**: Admin filters assign load by Push Gold/Platinum (no prices on labels), loyalty, last purchase, brand; AND with push chips OR each other; oldest/never contacted first

**Independent Test**: Merchant + each filter alone and mixed; 75k–100k and 200k–250k inclusive; labels have no money; assign only selected

### Tests for User Story 1

- [x] T007 [P] [US1] Add Vitest for inclusive call-queue push bands (75k/100k/200k/250k boundaries) in `lib/customer-insight/call-queue-push.test.ts` (or `lib/customer-insight/call-queue.test.ts`); do **not** change `isPushToGold` / `isPushToPlatinum` in `lib/customer-insight/loyalty-tier.ts`

### Implementation for User Story 1

- [x] T008 [P] [US1] Add inclusive helpers `isCallQueuePushToGold` / `isCallQueuePushToPlatinum` in `lib/customer-insight/call-queue-push.ts` (export from `lib/customer-insight/index.ts` if needed)
- [x] T009 [US1] Extend `customerInsightCallQueueCandidatesQuerySchema` in `lib/validation/customer-insight.ts` with `pushToGold`, `pushToPlatinum`, `loyalty`, `lastPurchaseFrom`, `lastPurchaseTo`, `brand` per `specs/043-call-queue-filters/contracts/call-queue-assign.md`
- [x] T010 [US1] Extend `listCallQueueCandidates` in `lib/customer-insight/call-queue.ts` — last-purchase SQL, brand intersect via `findContactsByPurchasedBrandRanked`, loyalty via `classifyLoyaltyTierKey` / `loyaltyAssignedTier`, push-band filter after chunked `lifetimeTotalsByContactId`; keep oldest-contacted sort + pageSize 50
- [x] T011 [US1] Pass new query params in `app/api/admin/customer-insight/call-queue/candidates/route.ts`; return `eligibleTotal` on pagination
- [x] T012 [US1] Add filter controls (Push to Gold / Push to Platinum with **no** amounts, loyalty, last purchase dates, searchable brand A–Z) on Assign merchant call queue in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`; do **not** put push chips on the main insight filter bar

**Checkpoint**: US1 filter+assign MVP independently testable (hide rules still later)

---

## Phase 4: User Story 2 - Count, page, or all selection (Priority: P1)

**Goal**: Type N → first N **eligible** across full matching set; page tick → current page; Select all → all eligible; assign in 200-chunks with remaining count

**Independent Test**: Multi-page list; type 10 skips queued; page vs all behave as spec

### Tests for User Story 2

- [x] T013 [P] [US2] Add Vitest for first-N eligible skip queued in `lib/customer-insight/call-queue-eligible.test.ts` (or extend `lib/customer-insight/call-queue.test.ts`)

### Implementation for User Story 2

- [x] T014 [US2] Add `listCallQueueEligibleIds` in `lib/customer-insight/call-queue.ts` (same filters as candidates; ranked; skip pending; `limit` optional; `truncated` if capped)
- [x] T015 [US2] Add Zod + `GET` `app/api/admin/customer-insight/call-queue/eligible-ids/route.ts` per `specs/043-call-queue-filters/contracts/call-queue-assign.md` (`hasInsightAdminView`)
- [x] T016 [US2] Wire Select count N, page, Select all, Clear in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`; N uses eligible-ids; assign batches of `CALL_QUEUE_ASSIGN_CAP` (200) with assigned vs remaining (no silent truncation)

**Checkpoint**: US1+US2 selection independently testable

---

## Phase 5: User Story 3 - Excel export (Priority: P1)

**Goal**: Download `.xlsx` of **all** assignment history + current status; optional one merchant

**Independent Test**: Two merchants, re-assign history, status change → Excel has every row + current category

- [x] T017 [P] [US3] Add export query Zod in `lib/validation/customer-insight.ts` (optional `assignedMerchant`)
- [x] T018 [US3] Implement history list + `xlsx` workbook in `lib/customer-insight/call-queue-export.ts` (columns per contract; `xlsx` like `app/api/admin/merchant-reviews/export/route.ts`)
- [x] T019 [US3] Add `GET` `app/api/admin/customer-insight/call-queue/export/route.ts` (`hasInsightAdminView`) and Export button on Assign panel in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: Full-history Excel independently testable

---

## Phase 6: User Story 4 - Sales-impact report (Priority: P1)

**Goal**: After-assignment and after-first-contact sales; merchant summary; live on refresh

**Independent Test**: Assign, later purchase, later contact → report numbers match; new purchase updates on refresh

- [x] T020 [P] [US4] Add report query Zod in `lib/validation/customer-insight.ts` (`assignedMerchant`, dates, status, push chips)
- [x] T021 [US4] Implement `salesAfterAssignment` / `salesAfterContact` (first non-allocation update after `assignedAt`) in `lib/customer-insight/call-queue-report.ts` using existing lifetime/purchase eligibility
- [x] T022 [US4] Add `GET` `app/api/admin/customer-insight/call-queue/report/route.ts` per contract
- [x] T023 [US4] Add report table + merchant summary on Customer Insight (admin assign area) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: Report independently testable

---

## Phase 7: User Story 5 - Hide recently allocated / worked (Priority: P1)

**Goal**: Omit from assign load: allocation &lt; 2 months; non–Not-Responding update &lt; 2 months; **Not Responding** &lt; 1 week; pending queued omitted; loyalty not_responded does **not** start 1-week clock

**Independent Test**: Allocate today → hidden; Interested/Not Interested today → hidden 2 months; Not Responding → back after 7 days

### Tests for User Story 5

- [x] T024 [P] [US5] Add Vitest for 2-month / 7-day calendar rules in `lib/customer-insight/call-queue-hide.test.ts`

### Implementation for User Story 5

- [x] T025 [US5] Implement `isHiddenFromCallQueueAssign` in `lib/customer-insight/call-queue-hide.ts` per `specs/043-call-queue-filters/research.md` R4 (allocation event, last non-allocation category/time, pending)
- [x] T026 [US5] Batch-load hide inputs and apply omit in `listCallQueueCandidates` / `listCallQueueEligibleIds` / `assignCallQueue` in `lib/customer-insight/call-queue.ts`; Not Interested uses 2-month window (not permanent)

**Checkpoint**: Hide windows independently testable with US1 filters

---

## Phase 8: User Story 6 - Never re-assign Black List / Wrong Number (Priority: P1)

**Goal**: Current category Black List or Wrong Number never on assign load / eligible-ids / assign; Excel+report keep history

**Independent Test**: Mark Black List / Wrong Number → absent from load after 1 week and 2 months; export still has old rows

- [x] T027 [P] [US6] Extend hide tests for Black List / Wrong Number permanence in `lib/customer-insight/call-queue-hide.test.ts`
- [x] T028 [US6] Treat **Black List** and **Wrong Number** as permanent omit in `lib/customer-insight/call-queue-hide.ts` using `CALL_CENTER_CATEGORY_VALUES` labels from `lib/contact-call-center-categories.ts`; current `ContactMaster.category` wins if later changed

**Checkpoint**: Permanent omit independently testable

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Gates and quickstart

- [x] T029 [P] Loading UX on Load / Assign / Export / Report buttons in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` per `.cursor/rules/action-loading-ux.mdc` (`busyKey`, spinner, disable siblings, `notify`)
- [x] T030 Run `npm test -- lib/customer-insight/call-queue` and fix failures; lint changed files
- [x] T031 Walk `specs/043-call-queue-filters/quickstart.md` (or closest substitute if no browser) and fix gaps
- [x] T032 [P] Confirm insight **list** filter bar still has no Push Gold/Platinum chips in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: start immediately
- **Foundational (Phase 2)**: after Setup — BLOCKS all stories
- **US1 (Phase 3)**: after Phase 2 — MVP
- **US2 (Phase 4)**: after US1 (same candidate filter pipeline)
- **US3 (Phase 5)**: after Phase 2 (history rows); can overlap US1 if schema done
- **US4 (Phase 6)**: after Phase 2; snapshot from assign (T005)
- **US5 (Phase 7)**: after US1 pipeline exists (`listCallQueueCandidates`)
- **US6 (Phase 8)**: after US5 hide helper
- **Polish**: after desired stories

### User Story Dependencies

- **US1**: after Phase 2
- **US2**: after US1
- **US3**: after Phase 2; independent of US1 UI
- **US4**: after T005 snapshot; independent of Excel
- **US5**: after US1 list function
- **US6**: after US5 helper file

### Parallel Opportunities

- T001/T002; T007/T008; T013 vs T017 vs T020 vs T024 vs T027 (different test/zod files once pipeline exists)
- US3 export vs US4 report after Phase 2 (different files)

---

## Parallel Example: After Phase 2

```text
Task: T017 Zod export in lib/validation/customer-insight.ts
Task: T020 Zod report in lib/validation/customer-insight.ts
```

(Wait until T009 if those schemas share the same object — then sequential.)

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1–2 (schema + insert-history assign)
2. Phase 3 US1 filters + panel
3. **STOP**: load merchant, push/loyalty/purchase/brand, assign subset
4. Land US5+US6 before large campaigns

### Incremental Delivery

1. Setup + Foundational
2. US1 → demo filters
3. US2 → count/page/all
4. US3 → Excel
5. US4 → report
6. US5 → hide windows
7. US6 → Black List / Wrong Number
8. Polish + quickstart

---

## Notes

- Do not change `isPushToGold` exclusivity in `lib/customer-insight/loyalty-tier.ts`
- Assign cap stays 200; UI batches remainder
- No new RBAC keys — `contacts.insight.read` + `hasInsightAdminView`
