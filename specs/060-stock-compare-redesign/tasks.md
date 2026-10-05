# Tasks: Stock Compare Redesign

**Input**: Design documents from `/specs/060-stock-compare-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan and quickstart require Vitest on comparer grouping, brand rules, and Critical — unit test tasks included. Not a full TDD-first cycle.

**Organization**: Phases by user story (US1–US5) for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US5 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `lib/`, `app/api/admin/reports/stock-comparer/`, `components/organisms/`, `app/(dashboard)/dashboard/purchasing/stock-comparer/`

---

## Phase 1: Setup

**Purpose**: Confirm design artifacts. No greenfield app, no new packages, no Prisma migration.

- [X] T001 Confirm feature docs present under `specs/060-stock-compare-redesign/` (plan.md, spec.md, research.md, data-model.md, contracts/stock-comparer.md, quickstart.md) and that `.specify/feature.json` points at this directory

---

## Phase 2: Foundational (Blocking)

**Purpose**: Shared report shapes and online/shop grouping every story needs. **Blocks all user stories.**

- [X] T002 Replace Priority 1/2/3 types with `LocationStock` (`name`, `qty`, `kind: "online" | "shop"`, `warehouse`) and new summary headers in `lib/cosmetics-stock-comparer.ts` per `specs/060-stock-compare-redesign/data-model.md`
- [X] T003 Add warehouse classifier in `lib/cosmetics-stock-comparer.ts` that skips `all warehouses`, treats `main warehouse - cosmo` as Cosmetics main, uses `isShopWarehouseName` from `lib/item-trends/physical-shops.ts` for shops, and treats remaining configured warehouses as online
- [X] T004 Rewrite `buildCosmeticsStockReportDetails` / `buildCosmeticsStockReport` in `lib/cosmetics-stock-comparer.ts` to emit `online[]` then `shops[]` (shop-floor over shop-main; outlet aliases for shops only; qty ≤ 0 omitted; sort Critical-ready: elsewhere Yes then SKU until US2 adds Critical)
- [X] T005 Rewrite grouping/threshold/alias tests in `lib/cosmetics-stock-comparer.test.ts` so they assert online-then-shops (no Priority 1/2/3) and keep brand-violation cases
- [X] T006 Update `GET` JSON in `app/api/admin/reports/stock-comparer/route.ts` to return the new row shape from T004 per `specs/060-stock-compare-redesign/contracts/stock-comparer.md` (sales fields may be omitted or defaulted until US2)

**Checkpoint**: Helpers return online/shops; existing API still auth-gated; Vitest grouping/brand pass; no Prisma change

---

## Phase 3: User Story 1 — Find Cosmetics-main shortages and stock elsewhere (P1) 🎯 MVP

**Goal**: Authorized user runs the report on the main tab (default threshold 0) and sees Cosmetics-main shortages with **online warehouses first**, then shops, plus a clear no-stock-elsewhere state.

**Independent Test**: Main Cosmo 0 + online 8 + shop 3 → row lists online then shop. Main 5 at threshold 0 → absent. User without `reports.stock_comparer` denied.

### Implementation

- [X] T007 [US1] Add two-tab shell (main default, brand placeholder) using `components/ui/tabs` in `components/organisms/cosmetics-stock-comparer.tsx`
- [X] T008 [US1] Render the main-tab table from new headers (`Online Warehouse(s)`, `Online Qty`, `Shop Warehouse(s)`, `Shop Qty`, `Stock Available Elsewhere`) in `components/organisms/cosmetics-stock-comparer.tsx`; keep first-100 preview
- [X] T009 [P] [US1] Tighten page subtitle in `app/(dashboard)/dashboard/purchasing/stock-comparer/page.tsx` to Cosmetics main vs online then shops (keep `reports.stock_comparer` gate)
- [X] T010 [US1] Confirm Run report still `GET /api/admin/reports/stock-comparer?threshold=` from `components/organisms/cosmetics-stock-comparer.tsx` and shows empty-elsewhere as `No` / explicit state

**Checkpoint**: MVP — main tab usable for threshold-0 Cosmetics-main shortages vs other locations

---

## Phase 4: User Story 2 — 90-day sales and Critical badge (P1)

**Goal**: Each main-tab row shows last-90-day Cosmetics.lk / Shopify-facing units. Top 20% sellers (sold ≥1 unit) get **Critical** at any threshold. Sales failure does not invent ranks.

**Independent Test**: Threshold 3. Fast seller at main 2 = Critical. Slow seller at main 2 = listed, not Critical. Sales down → stock rows remain, no badges.

### Implementation

- [X] T011 [P] [US2] Add `markCriticalTopSellers` (top 20% of SKUs with sales ≥ 1; ties at cutoff all Critical; zero-sale never Critical) in `lib/cosmetics-stock-comparer.ts`
- [X] T012 [P] [US2] Add 90-day website-channel sales loader in `lib/cosmetics-stock-comparer-sales.ts` using `osfCompletedSalesOrderWhere` from `lib/osf/assist-sales.ts` and `resolveCosmeticsLkChannel === "website"` from `lib/cosmetics-lk-channel.ts` (Colombo trailing 90 days; prefer Cosmetics.lk location when present)
- [X] T013 [US2] Attach `salesWindow`, `salesStatus`, `criticalCutoffUnits`, `sales90d`, and `critical` on each row in `app/api/admin/reports/stock-comparer/route.ts`; on sales error set `salesStatus: "unavailable"` and force `critical: false`
- [X] T014 [US2] Show 90-day sales, Critical badge, and sales-unavailable note on the main tab in `components/organisms/cosmetics-stock-comparer.tsx`
- [X] T015 [P] [US2] Add Vitest for cutoff/ties/zero-sale/unavailable in `lib/cosmetics-stock-comparer.test.ts`

**Checkpoint**: Raised threshold still shows Critical on catalog top sellers only

---

## Phase 5: User Story 3 — Brand-on-wrong-company tab (P1)

**Goal**: Brand tab lists only violations from the same run (existing brand lists). Allowed-company stock hidden. Empty set has an explicit empty state.

**Independent Test**: Acnes on ERP2 listed. Revlon only on ERP2 not listed. Zero qty on wrong company not listed.

### Implementation

- [X] T016 [US3] Render brand-tab table from `brandViolations` in `components/organisms/cosmetics-stock-comparer.tsx` using `BRAND_WAREHOUSE_VIOLATION_HEADERS` from `lib/cosmetics-stock-comparer.ts`
- [X] T017 [US3] Add brand-tab empty state (not the main table) in `components/organisms/cosmetics-stock-comparer.tsx` when `brandViolations.length === 0` after a successful run
- [X] T018 [P] [US3] Confirm Company 1-only / Company 2-only brand lists in `lib/cosmetics-stock-comparer.ts` match spec (including Maybeline) and existing tests in `lib/cosmetics-stock-comparer.test.ts` still cover both directions

**Checkpoint**: Brand work is isolated on its tab; same run payload as main

---

## Phase 6: User Story 4 — Tab-specific exports (P1)

**Goal**: Export stock report from the main tab; export brand report from the brand tab. Disable each when that tab’s set is empty.

**Independent Test**: After a run with both sets, main export has online/shops/sales/Critical only; brand export has violation columns only.

### Implementation

- [X] T019 [US4] Rewrite `exportStockReport` in `components/organisms/cosmetics-stock-comparer.tsx` to use new headers (`online` then `shops`, `sales90d`, Critical) and keep the `Stock Compare` sheet name
- [X] T020 [US4] Move Export brand report onto the brand tab only in `components/organisms/cosmetics-stock-comparer.tsx` (reuse `exportBrandReport` / Brand Warehouse Check sheet)
- [X] T021 [US4] Disable stock export when `rows.length === 0` and brand export when `brandViolations.length === 0` in `components/organisms/cosmetics-stock-comparer.tsx`

**Checkpoint**: One action per tab produces that tab’s file

---

## Phase 7: User Story 5 — Keep one run across tabs (P2)

**Goal**: Tab switch does not refetch. Threshold edit without Run keeps last results, labeled with the **run** threshold. A new run refreshes both tabs together.

**Independent Test**: Run once, switch tabs, same rows. Change threshold, do not run, previous results remain with old threshold label. Run again, both tabs update.

### Implementation

- [X] T022 [US5] Keep a single `lastLoad` plus `reportRows` / `brandViolations` in `components/organisms/cosmetics-stock-comparer.tsx` so tab change does not call `GET /api/admin/reports/stock-comparer`
- [X] T023 [US5] Show the last **run** threshold (not the draft input) in `components/organisms/cosmetics-stock-comparer.tsx` until the next successful run; on run failure clear both tab sets per contract

**Checkpoint**: US5 behavior matches spec User Story 5

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: Gates, leftover cleanup, UAT

- [X] T024 [P] Grep `lib/cosmetics-stock-comparer.ts`, `lib/cosmetics-stock-comparer.test.ts`, `components/organisms/cosmetics-stock-comparer.tsx`, and `app/api/admin/reports/stock-comparer/route.ts` for leftover Priority 1/2/3 / `priority1` fields and remove them
- [X] T025 Run `npm test -- lib/cosmetics-stock-comparer`
- [X] T026 [P] Lint touched files (`lib/cosmetics-stock-comparer.ts`, `lib/cosmetics-stock-comparer-sales.ts`, `lib/cosmetics-stock-comparer.test.ts`, `app/api/admin/reports/stock-comparer/route.ts`, `components/organisms/cosmetics-stock-comparer.tsx`, `app/(dashboard)/dashboard/purchasing/stock-comparer/page.tsx`)
- [X] T027 Walk manual scenarios in `specs/060-stock-compare-redesign/quickstart.md` (permission, threshold 0, Critical, brand tab, both exports, tab reuse)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP
- **US2 (Phase 4)**: Depends on Foundational; UI badge depends on US1 table (T008)
- **US3 (Phase 5)**: Depends on Foundational + US1 tab shell (T007); API already returns `brandViolations`
- **US4 (Phase 6)**: Depends on US1 table + US3 brand table (exports need both column sets; sales columns if US2 done)
- **US5 (Phase 7)**: Depends on US1 fetch state; brand/export tabs should exist
- **Polish (Phase 8)**: After desired stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 only — MVP
- **US2 (P1)**: After Phase 2; T011/T012 parallel; T013 after T011+T012; T014 after T008+T013
- **US3 (P1)**: After T007; T018 parallel with T016
- **US4 (P1)**: After T008 + T016; T019 after T014 if Critical/sales columns required in the file
- **US5 (P2)**: After T010 (run/fetch exists)

### Within Each User Story

- Types/classifier before report builder
- Builder before API
- API before UI
- UI table before export for that tab

### Parallel Opportunities

- T009 (page copy) parallel with T007/T008
- T011 (Critical helper) and T012 (sales loader) parallel — different files
- T015 (Critical tests) parallel with T014 after T011
- T018 (brand list confirm) parallel with T016
- T024 and T026 parallel in polish

---

## Parallel Example: User Story 2

```text
Task: "Add markCriticalTopSellers in lib/cosmetics-stock-comparer.ts"
Task: "Add 90-day website-channel sales loader in lib/cosmetics-stock-comparer-sales.ts"
```

Then sequential: attach on `app/api/admin/reports/stock-comparer/route.ts`, then badge UI.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (grouping + API shape)
3. Phase 3 US1 (tabs + main table)
4. **STOP and VALIDATE**: threshold 0, online then shops, permission
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational
2. US1 → main-tab MVP
3. US2 → Critical / 90-day sales
4. US3 → brand tab
5. US4 → tab exports
6. US5 → no refetch / last-run label
7. Polish / quickstart

### Parallel Team Strategy

After Phase 2:

- Dev A: US1 UI (`cosmetics-stock-comparer.tsx` main tab)
- Dev B: US2 helpers (`cosmetics-stock-comparer.ts` Critical + `cosmetics-stock-comparer-sales.ts`) — merge before T013/T014
- Do not parallelize US3/US4/US5 on the same organism file

---

## Notes

- [P] only when different files and no incomplete dependency
- Do not add `lib/shopify-stock-showdown` or a new permission
- Do not create Prisma migrations
- Existing `reports.stock_comparer` stays the only gate
- Suggested MVP: Phase 1–3 (US1)
