# Tasks: ROP Warehouse Compare

**Input**: Design documents from `/specs/063-rop-warehouse-compare/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/stock-comparer-rop.md, quickstart.md

**Tests**: Plan and quickstart require Vitest on the percent rule, watch selection, shops working set, identity filters, and focus compare. Those unit tasks are included. Not a full TDD-first cycle. Do not add tests for `lib/osf/below-threshold-skus.ts`.

**Organization**: Phases follow spec user stories US1–US4. Same page and route as Stock Comparer. No Prisma migration. No new permission.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US4 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `lib/cosmetics-stock-comparer.ts`, `lib/cosmetics-stock-comparer.test.ts`, `app/api/admin/reports/stock-comparer/route.ts`, `components/organisms/cosmetics-stock-comparer.tsx`

---

## Phase 1: Setup

**Purpose**: Confirm this feature extends the existing comparer. No new app, package, page, or migration.

- [X] T001 Confirm `specs/063-rop-warehouse-compare/` contains plan.md, spec.md, research.md, data-model.md, contracts/stock-comparer-rop.md, and quickstart.md, and that `.specify/feature.json` `feature_directory` is `specs/063-rop-warehouse-compare`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Shared response types and percent query validation every story uses. **Blocks all user stories.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add `WarehouseOption`, `RopWatchHit`, `RopWatchRow`, `ShopCompareRow`, and `FocusCompareRow` in `lib/cosmetics-stock-comparer.ts` matching `specs/063-rop-warehouse-compare/data-model.md` (do not change existing `CosmeticsStockReportDetail` or brand types)
- [X] T003 Validate optional `ropPercent` in `app/api/admin/reports/stock-comparer/route.ts` per `specs/063-rop-warehouse-compare/contracts/stock-comparer-rop.md`: omit → `ropPercent: null` and empty `ropWatch`, `shopCompare`, `focusCompare`; out of range or non-numeric → `400` with error `Reorder percent must be a number from 0 through 100`. Leave `threshold`, `rows`, and `brandViolations` behavior unchanged. Do not import `lib/osf/below-threshold-skus.ts` or `isBelowReorderThreshold`

**Checkpoint**: Bad percent is rejected. Omitted percent still returns today’s threshold report. No new tables.

---

## Phase 3: User Story 1 — Percent-of-reorder watch (Priority: P1) 🎯 MVP

**Goal**: User enters a percent (example 30) and sees items at or below that share of reorder point on Cosmetics main and on each non-shop ERP2 warehouse. Main qty `<= 0` is marked out of stock for cosmetics.lk. Missing or zero reorder point is not a hit.

**Independent Test**: Reorder point 100, percent 30, qty 30 → listed. Qty 31 → not listed. ERP2 non-shop warehouse can hit on its own reorder point. Shop-named ERP2 column is not in the watch. Main qty 0 on a listed row states cosmetics.lk is out of stock. User without `reports.stock_comparer` is denied.

### Tests for User Story 1

- [X] T004 [P] [US1] Add Vitest cases in `lib/cosmetics-stock-comparer.test.ts` for inclusive percent (`qty * 100 <= rop * percent`: 30 hit, 31 miss at reorder point 100), missing or zero reorder point not a hit, negative qty is a hit, shop-named ERP2 column excluded from the watch, and main qty 0 sets `websiteOutOfStock`

### Implementation for User Story 1

- [X] T005 [US1] Implement `isAtOrBelowRopPercent`, watched-warehouse selection (Cosmetics main bin `main warehouse - cosmo` plus non-shop ERP2 columns via `isShopOsfColumn` in `lib/store-allocation/osf-columns.ts` and `isShopWarehouseName` in `lib/item-trends/shop-warehouse-name.ts`), and `buildRopWatch` in `lib/cosmetics-stock-comparer.ts` per research R3 and R4 in `specs/063-rop-warehouse-compare/research.md`
- [X] T006 [US1] Load `ProductOsfRop` for the company and fill `ropWatch`, `watchedWarehouseCount`, and `warehouses` from `buildRopWatch` in `app/api/admin/reports/stock-comparer/route.ts`, attaching `commonSku` via `baseSku` from `lib/osf/base-sku.ts`, `erp1ProductPriority`, `erp2ProductPriority`, and `vatStatus` via `vatStatusLabel` from `lib/osf/vat-membership.ts` (catalog already comes from `buildCatalogRows`)
- [X] T007 [US1] Add the reorder-percent input, ROP-watch table (hits, missing reorder point, cosmetics.lk out-of-stock label), and a filtered-later export of watch rows in `components/organisms/cosmetics-stock-comparer.tsx`. Blank or invalid percent shows a toast and does not call the API. Keep the existing threshold Run path for the main and brand tabs

**Checkpoint**: Percent 30 watch is usable on Stock Comparer without the shops tab, identity filters, or focus compare

---

## Phase 4: User Story 2 — Main vs shop warehouses (Priority: P1)

**Goal**: Shops tab shows Cosmetics main qty beside each shop with stock for SKUs that are on the threshold list or are a Cosmetics-main percent hit. One row per physical shop (shop floor over back room). Company warehouses are not labeled as shops.

**Independent Test**: Main qty 0 and Shop A qty 12 → shops tab shows both. A non-shop ERP2 warehouse does not appear as a shop. A shop with floor and back room appears once.

### Tests for User Story 2

- [X] T008 [P] [US2] Add Vitest cases in `lib/cosmetics-stock-comparer.test.ts` that `buildShopCompare` includes threshold SKUs and Cosmetics-main percent hits, lists positive shop qty only, and drops non-shop warehouses

### Implementation for User Story 2

- [X] T009 [US2] Implement `buildShopCompare` in `lib/cosmetics-stock-comparer.ts` using the existing shop-floor pick (`classifyWarehouseKind` / shop over back room) and the working set in research R5 of `specs/063-rop-warehouse-compare/research.md`
- [X] T010 [US2] Return `shopCompare` from `app/api/admin/reports/stock-comparer/route.ts` on the same GET that already returns `rows` and `ropWatch`
- [X] T011 [US2] Add a Shops tab (main qty, website out-of-stock flag, shop names and qty) and a shops export of the current rows in `components/organisms/cosmetics-stock-comparer.tsx`. Main tab stays the default

**Checkpoint**: Shops tab works from one Run. Main threshold list and brand tab still match pre-feature behavior

---

## Phase 5: User Story 3 — Identity filters (Priority: P2)

**Goal**: User can narrow the ROP watch and the shops tab by common SKU, variant SKU, priority status, and VAT status. Set filters AND together. Clearing them restores the full set without another ERP request.

**Independent Test**: Common SKU `CAN07` shows `CAN07_1` and `CAN07_2`. Variant `CAN07_1` shows only that SKU. A chosen priority matches either company. Priority plus VAT both must match. Clear filters restores the tab.

### Tests for User Story 3

- [X] T012 [P] [US3] Add Vitest cases in `lib/cosmetics-stock-comparer.test.ts` for `matchesIdentityFilters`: common SKU substring on `baseSku`, variant SKU substring on `SKU`, priority equals either `erp1ProductPriority` or `erp2ProductPriority` (trimmed, case-insensitive), VAT equals `vatStatus`, blank priority or VAT does not match a selected value, and combined filters are AND

### Implementation for User Story 3

- [X] T013 [US3] Implement `matchesIdentityFilters` in `lib/cosmetics-stock-comparer.ts` (client-safe: no server-only imports). Reuse the `baseSku` rule from `lib/osf/base-sku.ts` only if that module stays free of server imports; otherwise duplicate the same `/[_-]\d+$/` strip inside this helper
- [X] T014 [US3] Add common SKU, variant SKU, priority, and VAT controls in `components/organisms/cosmetics-stock-comparer.tsx` and apply `matchesIdentityFilters` to the ROP-watch and shops tables. Priority options come from `ERP_PRODUCT_PRIORITY_OPTIONS` in `lib/product-items/erp-priority-options.ts` plus distinct payload values. VAT options are distinct `vatStatus` values. Exports use the filtered rows. Do not refetch on filter changes

**Checkpoint**: Filters narrow watch and shops only. Stock and reorder figures on the row do not change

---

## Phase 6: User Story 4 — Compare any warehouse (Priority: P2)

**Goal**: User picks one configured warehouse, runs with the same percent, and sees items low at that warehouse with other positive quantities beside them. The focus warehouse is not listed again as elsewhere.

**Independent Test**: Focus warehouse qty 4, reorder point 100, percent 30 → listed, and a second warehouse at qty 20 appears under elsewhere. Focus name is absent from elsewhere. Unknown warehouse name → `400`. Changing focus and running again follows the new warehouse.

### Tests for User Story 4

- [X] T015 [P] [US4] Add Vitest cases in `lib/cosmetics-stock-comparer.test.ts` that `buildFocusCompare` hits only the focus warehouse’s reorder point, omits the focus name from `elsewhere`, omits qty `<= 0` and `all warehouses` totals, and skips a missing reorder point

### Implementation for User Story 4

- [X] T016 [US4] Implement `buildFocusCompare` in `lib/cosmetics-stock-comparer.ts` per research R6 in `specs/063-rop-warehouse-compare/research.md`
- [X] T017 [US4] Accept `focusWarehouse` in `app/api/admin/reports/stock-comparer/route.ts`: unknown name → `400` `{ "error": "Unknown warehouse" }`; omitted → `focusCompare: []`; when `ropPercent` is set, fill `focusCompare` from `buildFocusCompare`
- [X] T018 [US4] Add a Compare tab in `components/organisms/cosmetics-stock-comparer.tsx` with a warehouse select fed by `warehouses`, Run sending `focusWarehouse`, the same `matchesIdentityFilters` controls, and an export of the filtered focus rows

**Checkpoint**: Compare tab is a separate run mode. It does not remove the percent watch, shops tab, or brand tab

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Prove old behavior and the quickstart still hold

- [X] T019 Run `npm test -- lib/cosmetics-stock-comparer.test.ts` and confirm `lib/osf/below-threshold-skus.ts` and `lib/osf/threshold.ts` have no edits in the diff
- [X] T020 [P] Lint `lib/cosmetics-stock-comparer.ts`, `lib/cosmetics-stock-comparer.test.ts`, `app/api/admin/reports/stock-comparer/route.ts`, and `components/organisms/cosmetics-stock-comparer.tsx`
- [ ] T021 Walk the manual scenarios in `specs/063-rop-warehouse-compare/quickstart.md` (percent 30 vs 31, website out of stock, shops tab, four filters, focus warehouse, threshold and brand tab unchanged, no transfer created)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational. Ship in order US1 → US2 → US3 → US4 because they share the same three source files
- **Polish (Phase 7)**: Depends on the stories you intend to ship

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational. No dependency on US2–US4. MVP
- **User Story 2 (P1)**: After US1 so the shops working set can union threshold rows with Cosmetics-main percent hits
- **User Story 3 (P2)**: After US2 so filters apply to both watch and shops tables. Filter helper itself does not change stock math
- **User Story 4 (P2)**: After US1 (percent + `ProductOsfRop` load) and US3 (`matchesIdentityFilters` reused on the Compare tab)

### Within Each User Story

- Test task touches `lib/cosmetics-stock-comparer.test.ts` and may be written before the helper it names
- Helper in `lib/cosmetics-stock-comparer.ts` before the route wires it
- Route before the organism renders the new payload
- Do not start the next story’s edit to the same file until the current story’s checkpoint passes

### Parallel Opportunities

- T004, T008, T012, and T015 are the only `[P]` implementation-phase tasks. Each is a different story’s cases in the **same** test file, so do not run those four at once
- T020 can run beside T019 (lint vs test)
- US2, US3, and US4 are not safe in parallel: `lib/cosmetics-stock-comparer.ts`, `app/api/admin/reports/stock-comparer/route.ts`, and `components/organisms/cosmetics-stock-comparer.tsx` are shared

---

## Parallel Example: User Story 1

```text
# After T002 and T003, write the failing percent cases (different file from the route stub):
T004 Vitest in lib/cosmetics-stock-comparer.test.ts

# Then stay sequential on the shared files:
T005 buildRopWatch in lib/cosmetics-stock-comparer.ts
T006 ropWatch JSON in app/api/admin/reports/stock-comparer/route.ts
T007 percent UI in components/organisms/cosmetics-stock-comparer.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Finish Phase 1 and Phase 2
2. Finish Phase 3 (percent watch)
3. Stop and check the independent test (30 included, 31 excluded, website out of stock, no invented reorder point)
4. Demo that slice before shops, filters, or focus compare

### Incremental Delivery

1. Setup + Foundational → old threshold report still loads
2. US1 → percent watch (MVP)
3. US2 → shops tab
4. US3 → identity filters on watch and shops
5. US4 → any-warehouse compare
6. Polish → `npm test` and `specs/063-rop-warehouse-compare/quickstart.md`

### Parallel Team Strategy

One implementer. The three source files overlap across stories, so parallel story work will conflict.

---

## Notes

- Checkbox, ID, optional `[P]`, story label on story phases only, file path on every task
- Do not call `listBelowThresholdSkus` or `isBelowReorderThreshold` (company total, strict `<`, default 70)
- Do not add a page, permission, Prisma model, or stock transfer
- Commit after each phase checkpoint
