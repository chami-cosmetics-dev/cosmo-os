# Tasks: Store Stock Count

**Input**: Design documents from `/specs/044-stores-stock-count/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan requires Vitest for `match-scan`, `difference`, `merge-items` (and company-key if non-trivial). Unit-test tasks included. Manual UAT in `quickstart.md`. No full HTTP contract test suite.

**Organization**: Tasks grouped by user story (US1–US5). US1 is MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no unfinished dependency)
- **[Story]**: US1–US5 from spec.md
- Exact file paths in every task

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `components/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm design docs and Constitution I (no schema for this feature)

- [x] T001 Confirm docs exist under `specs/044-stores-stock-count/` (plan.md, spec.md, research.md, data-model.md, contracts/store-stock-count.md, quickstart.md)
- [x] T002 [P] Record Constitution I for this feature: **no** Prisma model/migration; **never** `prisma db push` on vault/cosmo-dev/cosmo-prod — permission seed only via `lib/rbac.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Permission, types, ERP read helpers, APIs, page shell, Store nav — required before any story UI

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T003 [P] Add session/API types in `lib/store-stock-count/types.ts` per `specs/044-stores-stock-count/data-model.md`
- [x] T004 [P] Add `{ instanceId, erpCompany }` helpers (`toCompanyKey` / parse) in `lib/store-stock-count/company-key.ts`
- [x] T005 [P] Add `STORE_STOCK_COUNT_PERMISSION` + `requireStoreStockCountAccess` in `lib/store-stock-count/auth.ts` (mirror `lib/store-allocation/auth.ts`)
- [x] T006 Register `store.stock_count.read` in `DEFAULT_PERMISSIONS` and pin `stores-level-01` / `stores-level-02` in `PINNED_CUSTOM_ROLE_PERMISSIONS` in `lib/rbac.ts`
- [x] T007 [P] Add Zod `storeStockCountItemsBodySchema` (`instanceId` cuid, `erpCompany` trimmed 1–140) in `lib/validation/store-stock-count.ts`
- [x] T008 Implement server-only ERP fetchers in `lib/store-stock-count/erp.ts`: list Companies; paginate Items (`disabled=0`, `is_stock_item=1`); dump Item Barcode; list non-group Warehouses by company; paginate Bins and sum `actual_qty` — reuse `getAllOsfErpInstances` / `OsfErpCredentials` from `lib/osf/erp-stock.ts`; **do not** call `fetchBinActualQty`
- [x] T009 Add `GET` `app/api/admin/store-stock-count/companies/route.ts` per `specs/044-stores-stock-count/contracts/store-stock-count.md`
- [x] T010 Add `POST` `app/api/admin/store-stock-count/items/route.ts` (one company per call, `maxDuration = 60`, 502 body includes `instanceId` + `erpCompany`) per contract
- [x] T011 Add auth-gated page shell in `app/(dashboard)/dashboard/store/stock-count/page.tsx` (`PermissionDeniedCard` when missing permission; render panel placeholder)
- [x] T012 Show Store nav group if allocation **or** stock-count permission; add Stock count link to `/dashboard/store/stock-count` in `components/organisms/app-sidebar.tsx`

**Checkpoint**: APIs + permission + nav work; stories can start

---

## Phase 3: User Story 1 - Pick ERP companies and load items with live stock (Priority: P1) 🎯 MVP

**Goal**: Multi-select ERP companies, sequential load, one row per SKU with company-wise live stock (zeros included; fail → unavailable not 0)

**Independent Test**: One company → items + that stock. Two companies → one row per SKU, stock per company. Spot-check one SKU vs ERP. Denied user cannot open.

### Tests for User Story 1

- [x] T013 [P] [US1] Add Vitest for SKU union / stockByCompany merge (including keep-counts merge shape) in `lib/store-stock-count/merge-items.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Implement `mergeCompanyItems` (and related helpers) in `lib/store-stock-count/merge-items.ts`
- [x] T015 [US1] Build `components/organisms/store-stock-count-panel.tsx`: fetch/list companies, multi-select, confirm load, sequential `POST /items` with progress, merge into table columns SKU / name / description / barcodes / stock per company; empty count; wire panel from `app/(dashboard)/dashboard/store/stock-count/page.tsx`
- [x] T016 [US1] Handle per-company `502` in the panel without wiping other companies’ rows; mark failed company stock unavailable (`null`), not `0`

**Checkpoint**: US1 load+stock MVP independently testable (scan/count/diff still later)

---

## Phase 4: User Story 2 - Scan or type barcodes to count (Priority: P1)

**Goal**: Barcode field (scanner/typed + Enter) highlights matching row and +1 count; multi-item session; unknown/ambiguous safe

**Independent Test**: Scan A×3, B×1, type A → A=4 B=1; last match highlighted; unknown → toast, no increment; empty Enter → no-op

### Tests for User Story 2

- [x] T017 [P] [US2] Add Vitest for unique / none / ambiguous barcode match in `lib/store-stock-count/match-scan.test.ts`

### Implementation for User Story 2

- [x] T018 [US2] Implement `matchScan` in `lib/store-stock-count/match-scan.ts` (exact trim; optional digits-only fallback; do **not** use pick-list min-4-digit gate)
- [x] T019 [US2] Add autofocus barcode field, Enter confirm, clear+refocus (unless a count input is focused), highlight + `scrollIntoView`, unique +1, `notify` for unknown/ambiguous in `components/organisms/store-stock-count-panel.tsx`

**Checkpoint**: US1+US2 scan counting independently testable

---

## Phase 5: User Story 3 - Difference vs live stock (Priority: P1)

**Goal**: Difference = count − sum of selected companies’ numeric stock; uncounted and unavailable stock show blank, not a fake shortage

**Independent Test**: Empty count → blank. Count 7 vs stock 10 → −3. Count 0 → −stock. Unavailable company stock → blank difference

### Tests for User Story 3

- [x] T020 [P] [US3] Add Vitest for difference (uncounted, zero count, normal, unavailable stockSum) in `lib/store-stock-count/difference.test.ts`

### Implementation for User Story 3

- [x] T021 [US3] Implement `difference(count, stockSum)` in `lib/store-stock-count/difference.ts`
- [x] T022 [US3] Show difference column (and stock-sum helper) on each row in `components/organisms/store-stock-count-panel.tsx` per FR-010 / research R8

**Checkpoint**: US1–US3 over/short visible while counting

---

## Phase 6: User Story 4 - Type count by hand (Priority: P2)

**Goal**: Set absolute whole non-negative count when barcode missing/damaged; scan still +1 after a typed value

**Independent Test**: Type 8 → count 8 and difference uses 8. Scan that barcode → 9. Reject negative/non-numeric; keep previous valid value. No-barcode item only via type.

- [x] T023 [US4] Add per-row count input (absolute set on blur/Enter; reject invalid; empty restores not-counted `null`) in `components/organisms/store-stock-count-panel.tsx`
- [x] T024 [US4] Ensure scan +1 still applies after a typed count for the same SKU in `components/organisms/store-stock-count-panel.tsx`

**Checkpoint**: Manual count path independently testable

---

## Phase 7: User Story 5 - Refresh stock / change companies / clear (Priority: P2)

**Goal**: Refresh live stock without losing counts; changing companies warns and clears on confirm; clear-all resets counts only

**Independent Test**: Count several → refresh → counts stay, stock/diff update. Change companies → cancel keeps; confirm clears. Clear-all → all not-counted.

- [x] T025 [US5] Add Refresh control: re-`POST /items` per selected company, merge stock via `merge-items`, preserve counts map in `components/organisms/store-stock-count-panel.tsx`
- [x] T026 [US5] On company-set change with any non-null count: confirm dialog; confirm → drop counts and reload; cancel → keep list/counts in `components/organisms/store-stock-count-panel.tsx`
- [x] T027 [US5] Add Clear all counts (confirm) leaving company selection and stock intact in `components/organisms/store-stock-count-panel.tsx`

**Checkpoint**: Mid-count refresh and safe company changes work

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Large-list UX, gates, quickstart

- [x] T028 Window the item table body (fixed row height, ~80 DOM rows, no new npm package unless UAT forces it) in `components/organisms/store-stock-count-panel.tsx` so multi-thousand SKU lists stay scannable
- [x] T029 [P] Run `npm test -- lib/store-stock-count` and fix failures
- [x] T030 [P] Lint touched files (`lib/store-stock-count/**`, `lib/validation/store-stock-count.ts`, `lib/rbac.ts`, APIs, page, panel, sidebar)
- [ ] T031 Walk `specs/044-stores-stock-count/quickstart.md` scenarios 1–8 on a real ERP; confirm no Stock Reconciliation / stock write from this page

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup — **blocks all stories**
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After US1 panel exists (needs loaded items)
- **US3 (Phase 5)**: After US1 (stock) + ideally US2/US4 counts; can stub counts for unit tests earlier
- **US4 (Phase 6)**: After US1 table; pairs with US2/US3
- **US5 (Phase 7)**: After US1 load + session counts (US2/US4)
- **Polish (Phase 8)**: After desired stories

### User Story Dependencies

- **US1 (P1)**: After Foundational only
- **US2 (P1)**: Needs US1 loaded list
- **US3 (P1)**: Needs US1 stock columns; counts from US2/US4
- **US4 (P2)**: Needs US1 table rows
- **US5 (P2)**: Needs US1 + some counts

### Within Each Story

- Tests (where listed) before or with the helper they cover
- Pure helpers before panel wiring
- Story checkpoint before next priority when solo

### Parallel Opportunities

- T003 / T004 / T005 / T007 in parallel after T001–T002
- T013 with T014 start; T017∥T018; T020∥T021
- T029 ∥ T030 after implementation settles

---

## Parallel Example: User Story 1

```bash
# After foundational:
Task: "Add Vitest merge in lib/store-stock-count/merge-items.test.ts"
Task: "Implement merge in lib/store-stock-count/merge-items.ts"
# Then panel load UI (T015) depends on merge + APIs
```

## Parallel Example: User Story 2

```bash
Task: "Add Vitest match-scan in lib/store-stock-count/match-scan.test.ts"
Task: "Implement matchScan in lib/store-stock-count/match-scan.ts"
# Then wire barcode field in panel (T019)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (companies + load + company-wise stock)  
4. **STOP** — validate quickstart scenarios 1–3  
5. Demo if ready  

### Incremental Delivery

1. Setup + Foundational  
2. US1 → load/stock MVP  
3. US2 → scan counting  
4. US3 → difference  
5. US4 → typed count  
6. US5 → refresh / change / clear  
7. Polish → windowing + quickstart  

### Parallel Team Strategy

1. Team finishes Foundational together  
2. Dev A: US1 panel load  
3. Dev B: pure helpers + tests (`merge` / `match-scan` / `difference`) in parallel once types exist  
4. Integrate helpers into panel for US2–US5  

---

## Notes

- [P] = different files, no unfinished dependency  
- No ERP Stock Reconciliation / Stock Entry from this feature (FR-015)  
- One company per `POST /items` — client loops  
- Counts are client session only  
- Commit after each task or logical group  
- Suggested MVP = Phase 1–3 (US1)
