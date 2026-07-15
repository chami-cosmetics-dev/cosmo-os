# Tasks: ERP Return SI Link

**Input**: Design documents from `/specs/005-erp-return-si-link/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Optional Vitest for merge/search helpers (plan recommends) â€” no full TDD suite required by spec

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1â€“US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and existing credit-note sync

- [x] T001 Confirm feature docs in `specs/005-erp-return-si-link/plan.md`, `research.md`, `data-model.md`, and `contracts/erp-return-si-link.md`
- [x] T002 [P] Skim reuse targets: `lib/erp-credit-note-order-sync.ts`, `lib/find-erp-return-si-mismatches.ts`, `lib/page-data/orders.ts`, `app/api/webhooks/erpnext/sales-invoice/route.ts`, `app/api/admin/orders/[id]/route.ts`, `components/organisms/orders-panel.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: First-class Return SI storage + shared helpers; blocks all user stories

**CRITICAL**: No user story work until migration + helpers land

- [x] T003 Add `erpReturnSalesInvoiceIds String[] @default([])` on `Order` in `prisma/schema.prisma` (per `data-model.md`)
- [x] T004 Create migration with `npm run db:migrate:create` for `erpReturnSalesInvoiceIds`; do **not** run `db:push` against shared DBs
- [x] T005 [P] Add pure helpers in `lib/erp-return-si.ts`: normalize/dedupe Return SI id list; read legacy `rawPayload.erpReturnSalesInvoiceNames` for backfill
- [x] T006 [P] Add Vitest for helpers in `lib/erp-return-si.test.ts` (trim, dedupe, legacy rawPayload read, ignore blanks)
- [x] T007 Add one-time backfill path (script under `scripts/` or data step in migration docs) copying `rawPayload.erpReturnSalesInvoiceNames` → `Order.erpReturnSalesInvoiceIds` where present
- [x] T008 Document deploy gate: after user confirmation `npm run db:deploy:all` in `specs/005-erp-return-si-link/quickstart.md`

**Checkpoint**: Column + helpers ready; writers/search/detail can consume the field

---

## Phase 3: User Story 1 - Find original order by Return SI number (Priority: P1) ðŸŽ¯ MVP

**Goal**: Orders search by Return SI (full or suffix) returns the **original** order

**Independent Test**: Seed/set `erpReturnSalesInvoiceIds` on a voided original order â†’ search that Return SI (and suffix) in Orders â†’ original row appears

### Implementation for User Story 1

- [x] T009 [US1] Extend search `OR` in `lib/page-data/orders.ts` to match `erpReturnSalesInvoiceIds` with endsWith / insensitive semantics consistent with `erpnextInvoiceId` (raw SQL `unnest`/`EXISTS` if Prisma cannot express array endsWith)
- [x] T010 [US1] Include `erpReturnSalesInvoiceIds` on list DTO mapping in `lib/page-data/orders.ts` (select field from Prisma query)
- [x] T011 [US1] Confirm `/api/admin/orders/page-data` surfaces the new field via `fetchOrdersPageData` with no extra client fetch (contract §1)
- [x] T012 [P] [US1] Add/adjust unit coverage for search filter helper (extract pure clause builder if needed) in `lib/page-data/orders.test.ts` or `lib/erp-return-si.test.ts`

**Checkpoint**: US1 â€” searching a known Return SI finds the original order

---

## Phase 4: User Story 2 - Persist Return SI when credit note arrives (Priority: P1)

**Goal**: Credit-note / Return SI webhook appends Return SI id(s) on the original order without clearing original SI / Shopify ids

**Independent Test**: Process return SI webhook (`return_against` â†’ original) â†’ original gets voided/returned (or skip-void protected) **and** `erpReturnSalesInvoiceIds` contains `data.name`

### Implementation for User Story 2

- [x] T013 [US2] Update `mergeErpReturnInvoiceNames` / `applyErpCreditNoteToOriginalOrder` in `lib/erp-credit-note-order-sync.ts` to append to `erpReturnSalesInvoiceIds` (deduped); keep legacy rawPayload merge optional or drop after backfill
- [x] T014 [US2] On finance-reverted / rearrange skip-void early returns in `lib/erp-credit-note-order-sync.ts`, still persist Return SI id when `returnInvoiceName` is known (do not force void)
- [x] T015 [US2] Update `reconcileOrderErpCreditNote` in `lib/erp-credit-note-order-sync.ts` to write discovered Return SI names into `erpReturnSalesInvoiceIds`
- [x] T016 [US2] Verify `handleErpSalesInvoiceCreditNoteEvent` + `app/api/webhooks/erpnext/sales-invoice/route.ts` still pass `returnInvoiceName: data.name` and never overwrite `erpnextInvoiceId` with Return SI
- [x] T017 [P] [US2] Extend Vitest in `lib/erp-credit-note-order-sync.test.ts` for append/dedupe and skip-void-still-records behavior (mock Prisma as existing tests do)

**Checkpoint**: US2 â€” live CN path assigns Return SI on original order

---

## Phase 5: User Story 3 - See Return SI on the original order (Priority: P2)

**Goal**: Order detail shows Return SI(s) distinctly from original ERP SI and Shopify reference

**Independent Test**: Open a credit-noted order with stored Return SI(s) â†’ detail shows labeled Return SI list; order with empty array shows no blank Return SI chrome

### Implementation for User Story 3

- [x] T018 [US3] Add `erpReturnSalesInvoiceIds` to select + JSON response in `app/api/admin/orders/[id]/route.ts`
- [x] T019 [US3] Extend `Order` / `OrderDetail` types and detail UI in `components/organisms/orders-panel.tsx` (and/or `components/organisms/order-invoice-view-modal.tsx`) to show **Return SI** label(s) distinct from original SI
- [x] T020 [US3] Omit empty Return SI section when array length is 0; support multiple ids without duplicate noise

**Checkpoint**: US3 â€” staff see Return SI on original order detail without ERP

---

## Phase 6: User Story 4 - Recover missing Return SI links (Priority: P3)

**Goal**: Bounded recovery attaches ERP Return SI names onto already voided/returned orders missing ids

**Independent Test**: Dry-run then apply recovery for a known voided order with ERP return docs â†’ column updated â†’ search finds order; active orders not invented-voided by recovery alone

### Implementation for User Story 4

- [x] T021 [US4] Implement recovery helper (reuse `fetchErpCreditNotesAgainst` / `lib/find-erp-return-si-mismatches.ts` patterns) in `lib/erp-return-si-recover.ts` or extend `lib/erp-credit-note-order-sync.ts` to backfill ids for voided/returned orders only
- [x] T022 [US4] Add admin route `app/api/admin/erp-migrations/recover-return-si/route.ts` per `contracts/erp-return-si-link.md` (`dryRun`, `orderId` / `limit`, auth aligned with other `erp-migrations` routes)
- [x] T023 [US4] Ensure recovery does **not** void active orders solely from discovering a Return SI; only append ids (and optionally call existing reconcile separately if already designed)
- [x] T024 [P] [US4] Optional CLI wrapper in `scripts/recover-erp-return-si.ts` calling the same helper for ops batches

**Checkpoint**: US4 â€” historical gaps recoverable without mis-linking

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and shared quality

- [x] T025 [P] Run `npx vitest` for `lib/erp-return-si.test.ts` and `lib/erp-credit-note-order-sync.test.ts`; fix failures
- [x] T026 Walk `specs/005-erp-return-si-link/quickstart.md` scenarios 2–5 (webhook assign, search, detail, multi Return SI)
- [x] T027 Confirm `erpnextInvoiceId` / Shopify ids never cleared in credit-note writers (`lib/erp-credit-note-order-sync.ts`)
- [x] T028 Mark checklist readiness notes in `specs/005-erp-return-si-link/checklists/requirements.md` if any planning deltas

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational (column + helpers)
- **US2 (Phase 4)**: Depends on Foundational; complements US1 (live data for search)
- **US3 (Phase 5)**: Depends on Foundational; best after US2 so detail has real data
- **US4 (Phase 6)**: Depends on Foundational + US2 writer helpers preferred
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 â€” search works on any seeded/backfilled ids
- **US2 (P1)**: After Phase 2 â€” independent of UI; recommended before relying on live search UAT
- **US3 (P2)**: After Phase 2; can proceed in parallel with US1 once detail API field exists
- **US4 (P3)**: After Phase 2; shares ERP lookup with US2 reconcile

### Parallel Opportunities

- T005/T006 in parallel after T003
- T012 parallel with T009â€“T011 once search clause shape is clear
- T017 parallel with T013â€“T016 once behavior agreed
- T018 and T019 sequential (API then UI); T020 with T019
- T024 parallel with T022 after T021

### Parallel Example: After Foundation

```text
Developer A: US1 search (T009â€“T012)
Developer B: US2 writers (T013â€“T017)
Developer C: US3 detail (T018â€“T020) after T003 deployed locally
```

---

## Implementation Strategy

### MVP First (US1 + Foundation + US2 writers)

1. Phase 1â€“2: schema + helpers + backfill
2. Phase 4 US2: persist on credit note (so new events populate ids)
3. Phase 3 US1: search by Return SI
4. **STOP and VALIDATE** quickstart search + webhook assign
5. Then US3 display â†’ US4 recovery

Suggested MVP = **T001â€“T017** (setup, foundation, search, persist).

### Incremental Delivery

1. Foundation deployed (`db:deploy:all` with confirmation)
2. Writers + search â†’ ops can find new credit notes by Return SI
3. Detail labels â†’ reconciliation without ERP UI
4. Recovery â†’ historical cleanup

---

## Notes

- [P] = different files, no incomplete blockers
- Never overwrite `erpnextInvoiceId` with Return SI
- Skip-void protections remain; Return SI still recorded
- No separate Return-SI-only Order row required when original exists
- Constitution: `db:migrate:create` + `db:deploy:all`; ask before prod
