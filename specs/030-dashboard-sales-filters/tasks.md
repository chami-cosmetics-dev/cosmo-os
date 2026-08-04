# Tasks: Dashboard Sales Filter Views

**Input**: Design documents from `/specs/030-dashboard-sales-filters/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan requires Vitest for eligibility, partition tally, and POS/delivery rules (`lib/page-data/dashboard-sales.test.ts`).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label ([US1]…[US5])
- Descriptions include exact file paths

## Path Conventions

Cosmo OS web app root: `lib/page-data/`, `lib/validation.ts`, `app/api/admin/dashboard/`, `components/organisms/`

---

## Phase 1: Setup

**Purpose**: Align shared types and docs with the new filter taxonomy (no new packages)

- [X] T001 Replace `DashboardSalesDateType` with canonical keys from research (`all_orders`, `not_delivered`, `bill_done_early`, `bill_open`, `done_after_delivery`, `bill_done_in_dates`, `delivered_in_dates`, `bill_done_old`, `delivered_old`, `still_bill_open`, `still_not_delivered`) plus plain labels, group metadata, and legacy alias map in `lib/page-data/dashboard-overview-shared.ts`
- [X] T002 [P] Update Zod `dashboardSalesDateTypeSchema` enum + legacy transforms and defaults to `all_orders` in `lib/validation.ts`
- [X] T003 [P] Add `FilterSummary` / `filterSummaries` types to overview initial state in `lib/page-data/dashboard-overview-shared.ts`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Shared filter math and summary aggregation every story needs

**⚠️ CRITICAL**: Complete before user-story UI/API wiring

- [X] T004 Implement `getPlacedStatusPartition` / rewrite `buildDashboardSalesDateFilter` + `isDashboardSalesOrderEligible` for all canonical keys (Bill done early = invoiceCompleteAt set && deliveryCompleteAt null; Not delivered excludes Bill done early; POS rules per FR-017) in `lib/page-data/dashboard-sales.ts`
- [X] T005 Implement `fetchDashboardFilterSummaries(companyId, fromYmd, toYmd)` returning Group A+B range summaries + Group C backlog summaries per `specs/030-dashboard-sales-filters/contracts/dashboard-sales-filters.md` in `lib/page-data/dashboard-sales.ts`
- [X] T006 Extend `fetchDashboardSalesByLocationMerchant` / gateway + `fetchDashboardBrandSales` to accept new `dateType` keys in `lib/page-data/dashboard-sales.ts` and `lib/page-data/dashboard-brand-sales.ts`
- [X] T007 Update unit tests for partition tally (`not_delivered + bill_done_early + bill_open + done_after_delivery === all_orders`), Bill done early vs Delivered, POS exclusion, and legacy alias normalization in `lib/page-data/dashboard-sales.test.ts`
- [X] T008 Wire `include_summaries` + new `date_type` values through `app/api/admin/dashboard/sales-by-location/route.ts` (and brand-sales `date_type` in `app/api/admin/dashboard/brand-sales/route.ts`)
- [X] T009 Update `getDefaultDashboardOverviewInitialState` to default `all_orders`, today range, and initial `filterSummaries` in `lib/page-data/dashboard-overview.ts`

**Checkpoint**: Foundation ready — filter keys, eligibility, summaries, and API accept new types

---

## Phase 3: User Story 1 — Today’s sales breakdown (P1) 🎯 MVP

**Goal**: Default today; Group A filters work for today; user can select All orders / Not delivered / Bill done early / Bill open / Done after delivery and see matching grand total/charts

**Independent Test**: Open dashboard with no date change → From/To today → select each Group A chip → charts/Grand Total match that filter for today

### Implementation for User Story 1

- [X] T010 [US1] Default context state to today + `all_orders` and refresh sales with summaries in `components/organisms/dashboard-overview-context.tsx`
- [X] T011 [US1] Render Group A filter controls (plain names) selecting `dateType` in `components/organisms/dashboard-filters-slot.tsx`
- [X] T012 [US1] Update chart helper copy for Group A keys in `components/organisms/dashboard-location-merchant-charts.tsx`
- [X] T013 [US1] Ensure Grand Total / main charts use active Group A filter from context in `components/organisms/dashboard-main-slot.tsx`
- [X] T014 [US1] Fix any remaining `placed_all` / old enum references in `lib/daily-sales-sms.ts` and other call sites to `all_orders` or mapped legacy

**Checkpoint**: Today + Group A selectable and chart-correct (MVP)

---

## Phase 4: User Story 5 — Show every filter’s total (P1)

**Goal**: Each filter chip shows its total amount; selection stays in sync with Grand Total

**Independent Test**: On load, every visible chip shows a number; clicking a chip makes Grand Total equal that chip’s total

### Implementation for User Story 5

- [X] T015 [US5] Store and refresh `filterSummaries` on range/filter change in `components/organisms/dashboard-overview-context.tsx`
- [X] T016 [US5] Display label + formatted total on each filter chip and Group A tally hint (“Not delivered + Bill done early + Bill open + Done after delivery ≈ All orders”) in `components/organisms/dashboard-filters-slot.tsx`
- [X] T017 [US5] Assert summary `all_orders.total` matches sum of partition chips within 0.01 in UI or keep covered by `lib/page-data/dashboard-sales.test.ts` (document if UI-only display)

**Checkpoint**: Totals visible without opening each filter blindly

---

## Phase 5: User Story 2 — Date-range status + dual-date place∩event (P1)

**Goal**: Custom From–To recalculates Group A and Group B place-in-range event filters (`bill_done_in_dates`, `delivered_in_dates`)

**Independent Test**: Pick a known week; each Group A/B range filter total matches hand sample; Bill done early never in Delivered in dates

### Implementation for User Story 2

- [X] T018 [US2] Confirm range-scoped eligibility for `bill_done_in_dates` and `delivered_in_dates` (place in range ∩ event in range; delivered_in_dates uses stage `delivery_complete`, non-POS) in `lib/page-data/dashboard-sales.ts`
- [X] T019 [P] [US2] Add/extend tests for range dual-date filters and Bill done early exclusion from delivered_in_dates in `lib/page-data/dashboard-sales.test.ts`
- [X] T020 [US2] Add Group B UI section (“Finished in these dates — separate”) with `bill_done_in_dates` / `delivered_in_dates` chips + totals in `components/organisms/dashboard-filters-slot.tsx`
- [X] T021 [US2] Refresh summaries when From/To changes so Group A/B totals update in `components/organisms/dashboard-overview-context.tsx`

**Checkpoint**: Custom ranges work for Group A + place∩event Group B filters

---

## Phase 6: User Story 3 — Earlier-placed events in range (P2)

**Goal**: Bill done (old orders) / Delivered (old orders) for place date before range, event in range

**Independent Test**: Order placed before From, invoice/delivery completed inside range appears only in old-order chips, not in All orders

### Implementation for User Story 3

- [X] T022 [US3] Implement `bill_done_old` and `delivered_old` filters (event in range, `createdAt` &lt; range start) in `lib/page-data/dashboard-sales.ts`
- [X] T023 [P] [US3] Unit tests for old-order inclusion/exclusion vs `all_orders` in `lib/page-data/dashboard-sales.test.ts`
- [X] T024 [US3] Add old-order chips under Group B in `components/organisms/dashboard-filters-slot.tsx`
- [X] T025 [US3] Include old-order keys in `fetchDashboardFilterSummaries` output in `lib/page-data/dashboard-sales.ts`

**Checkpoint**: Earlier-placed event scoreboard works independently

---

## Phase 7: User Story 4 — Any-day backlog (P2)

**Goal**: Still bill open / Still not delivered totals independent of From–To

**Independent Test**: Change date range; backlog chip totals unchanged; old open orders still listed when selected

### Implementation for User Story 4

- [X] T026 [US4] Implement `still_bill_open` and `still_not_delivered` eligibility (ignore place range; non-POS for delivery backlog) in `lib/page-data/dashboard-sales.ts`
- [X] T027 [P] [US4] Unit tests that backlog ignores From–To in `lib/page-data/dashboard-sales.test.ts`
- [X] T028 [US4] Add Group C UI section (“Still open — any day”) with chips + totals in `components/organisms/dashboard-filters-slot.tsx`
- [X] T029 [US4] Ensure backlog summaries always returned and charts load when backlog filter selected in `components/organisms/dashboard-overview-context.tsx` and `app/api/admin/dashboard/sales-by-location/route.ts`

**Checkpoint**: Backlog views work with any selected calendar range

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: Consistency, validation, cleanup

- [X] T030 [P] Update chart descriptions for all new keys in `components/organisms/dashboard-location-merchant-charts.tsx`
- [X] T031 [P] Remove or map obsolete UI strings (`Placed – all`, `Closed in period`, etc.) across dashboard organisms
- [X] T032 Run `npx vitest run lib/page-data/dashboard-sales.test.ts` and fix failures
- [X] T033 Manually walk `specs/030-dashboard-sales-filters/quickstart.md` today + range + backlog checks
- [X] T034 [P] Grep for leftover legacy date types in dashboard codepaths and fix call sites under `lib/` and `components/organisms/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** → no deps
- **Phase 2 Foundational** → after Setup; **blocks all stories**
- **US1 (Phase 3)** → after Foundational (MVP)
- **US5 (Phase 4)** → after US1 (or parallel once T010–T011 exist; needs summaries from T005/T008)
- **US2 (Phase 5)** → after Foundational; best after US5 chips exist
- **US3 (Phase 6)** / **US4 (Phase 7)** → after Foundational; can parallel after US5 UI shell
- **Polish** → after desired stories

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|--------|
| US1 | Foundational | MVP today + Group A |
| US5 | Foundational + US1 shell | Chip totals |
| US2 | Foundational + US5 | Range + dual-date |
| US3 | Foundational + US5 | Old-order events |
| US4 | Foundational + US5 | Backlog |

### Parallel Opportunities

- T001 / T002 / T003 in Setup
- T019 / T023 / T027 test files once eligibility APIs stable
- US3 and US4 after Group B/C UI shell exists
- T030 / T031 / T034 in Polish

### Parallel Example: After Foundational

```text
Dev A: T010–T014 (US1)
Dev B: T015–T017 (US5) once context exposes summaries
Then: T018–T021 (US2) | T022–T025 (US3) | T026–T029 (US4)
```

---

## Implementation Strategy

### MVP First (US1 + US5)

1. Phase 1–2 (types, eligibility, summaries, API)
2. Phase 3 US1 (today Group A)
3. Phase 4 US5 (totals on chips)
4. **Stop and validate** quickstart today path

### Incremental Delivery

1. MVP (today + totals)
2. US2 custom range + dual-date place∩event
3. US3 old-order events
4. US4 backlog
5. Polish + full quickstart

---

## Notes

- No Prisma migration tasks (constitution + plan)
- Checklist format validated: all tasks use `- [ ]`, `Tnnn`, optional `[P]`, story labels on US phases, and file paths
- Suggested MVP: **Phases 1–4 (US1 + US5)** ≈ today All orders breakdown with visible totals
