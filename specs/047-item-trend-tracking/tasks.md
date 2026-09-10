# Tasks: Item Trends Super Dashboard

**Input**: Design documents from `/specs/047-item-trend-tracking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan requires Vitest for `lib/item-trends/*` (aggregation, signals, ROP, transfers, districts).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label ([US1]…[US15])
- Descriptions include exact file paths

## Path Conventions

Cosmo OS web app root: `lib/item-trends/`, `lib/validation.ts`, `lib/rbac.ts`, `app/(dashboard)/dashboard/purchasing/item-trends/`, `app/api/admin/purchasing/item-trends/`, `components/organisms/`

---

## Phase 1: Setup

**Purpose**: Shared types, validation, permission, and module skeleton

- [x] T001 Create `lib/item-trends/types.ts`
- [x] T002 [P] Add item trends query schemas to `lib/validation.ts`
- [x] T003 [P] Add `purchasing.item_trends.read` to `lib/rbac.ts`
- [x] T004 [P] Create module stubs under `lib/item-trends/`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Core aggregation, signals, and access scoping — blocks all user stories

**⚠️ CRITICAL**: Complete before user-story UI/API wiring

- [x] T005 Implement comparison window helpers in `lib/item-trends/aggregate.ts`
- [x] T006 Implement SKU unit aggregation in `lib/item-trends/aggregate.ts`
- [x] T007 Implement rule-based signal classifiers in `lib/item-trends/signals.ts`
- [x] T008 Implement `resolveItemTrendsScope` in `lib/item-trends/scope.ts`
- [x] T009 [P] Add unit tests in `lib/item-trends/aggregate.test.ts`
- [x] T010 [P] Add unit tests in `lib/item-trends/signals.test.ts`

**Checkpoint**: Foundation ready — aggregation and signals usable by all API routes

---

## Phase 3: User Story 1 — Permission-gated super dashboard (P1) 🎯 MVP

**Goal**: Dedicated Item Trends page; denied without permission; admin bypass works.

**Independent Test**: User with `purchasing.item_trends.read` opens page → loads. User without → `PermissionDeniedCard`. API returns 403 without permission.

- [x] T011 [US1] Create server page in `app/(dashboard)/dashboard/purchasing/item-trends/page.tsx`
- [x] T012 [P] [US1] Add Item Trends nav link in `components/organisms/app-sidebar.tsx`
- [x] T013 [US1] Create `components/organisms/item-trends-panel.tsx`
- [x] T014 [US1] Create `app/api/admin/purchasing/item-trends/page-data/route.ts`

**Checkpoint**: Page routable; permission gate on page and primary API

---

## Phase 4: User Story 2 — Attractive visual analytics (P1)

**Goal**: KPI cards + chart layout (not table-only); date range drives refresh; empty states.

**Independent Test**: Open dashboard with data → ≥4 visual zones (KPI + charts). Change dates → all sections refresh. Empty range → informative empty state.

- [x] T015 [US2] Build KPI strip in `components/organisms/item-trends-panel.tsx`
- [x] T016 [P] [US2] Add date range controls in `components/organisms/item-trends-panel.tsx`
- [x] T017 [P] [US2] Add priority filter and tabbed layout in `components/organisms/item-trends-panel.tsx`
- [x] T018 [US2] Add priority breakdown chart in `components/organisms/item-trends/kpi-charts.tsx`
- [x] T019 [US2] Wire panel fetch to page-data API in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Super dashboard shell with visuals and filter UX

---

## Phase 5: User Story 3 — Fast movers by priority (P1)

**Goal**: Ranked movement leaderboard with Top Priority emphasis and period-over-period change.

**Independent Test**: Known hot Top Priority SKU appears top of movement list with speed vs prior period.

- [x] T020 [US3] Implement `fetchMovementLeaderboard` in `lib/item-trends/aggregate.ts`
- [x] T021 [US3] Enrich page-data route in `app/api/admin/purchasing/item-trends/page-data/route.ts`
- [x] T022 [US3] Build movement table in `components/organisms/item-trends/movement-table.tsx`
- [x] T023 [P] [US3] Mount movement table in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Fast mover list live and filterable by priority

---

## Phase 6: User Story 4 — Newly Added traction (P1)

**Goal**: New-items panel with accelerating vs stalling badges.

**Independent Test**: Newly Added SKU with rising sales shows accelerating badge; flat SKU shows stalling.

- [x] T024 [US4] Add `fetchNewItemRows` in `lib/item-trends/aggregate.ts`
- [x] T025 [US4] Extend page-data route with `newItems` in `app/api/admin/purchasing/item-trends/page-data/route.ts`
- [x] T026 [US4] Build new-items panel in `components/organisms/item-trends/new-items-panel.tsx`

**Checkpoint**: New-items zone independently testable

---

## Phase 7: User Story 9 — Outlet balance & transfer candidates (P1)

**Goal**: Same SKU slow+heavy at one outlet, fast at another → transfer candidate row.

**Independent Test**: SKU with high stock/low speed at Shop A and fast speed at Shop B → transfer candidate with both outlets named.

- [x] T027 [US9] Implement outlet movement + stock in `lib/item-trends/outlets.ts`
- [x] T028 [US9] Implement transfer candidate pairing in `lib/item-trends/outlets.ts`
- [x] T029 [P] [US9] Add unit tests in `lib/item-trends/outlets.test.ts`
- [x] T030 [US9] Create `app/api/admin/purchasing/item-trends/outlets/route.ts`
- [x] T031 [US9] Build outlets UI in `components/organisms/item-trends/outlets-panel.tsx`
- [x] T032 [US9] Wire Outlets tab in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Transfer candidates visible; no auto stock move

---

## Phase 8: User Story 10 — ROP suggestion panel (P1)

**Goal**: Suggested ROP = window sales × 2; 3m/2m/custom window; increase/decrease overlay; apply via OSF PATCH.

**Independent Test**: SKU with 40 units in 3-month window → suggested 80; save only after explicit OSF PATCH.

- [x] T033 [US10] Implement `computeRopSuggestions` in `lib/item-trends/rop-suggest.ts`
- [x] T034 [P] [US10] Add ROP formula tests in `lib/item-trends/rop-suggest.test.ts`
- [x] T035 [US10] Create `app/api/admin/purchasing/item-trends/rop/route.ts`
- [x] T036 [US10] Build ROP panel in `components/organisms/item-trends/rop-panel.tsx`
- [x] T037 [US10] Wire Apply to OSF PATCH in `components/organisms/item-trends/rop-panel.tsx`

**Checkpoint**: ROP suggestions match manual ×2 math; no silent overwrite

---

## Phase 9: User Story 11 — Purchasing & store shared view (P1)

**Goal**: Purchasing sees all zones; store user sees outlet-scoped data only.

**Independent Test**: Store user with `locationId` sees outlet balance for own shop; company-wide export/district expansion hidden.

- [x] T038 [US11] Apply `resolveItemTrendsScope` in item-trends API routes
- [x] T039 [US11] Filter outlets + movement by scoped location in API routes
- [x] T040 [US11] Districts tab disabled for v1 in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Store and purchasing roles see appropriate scope

---

## Phase 10: User Story 5 — District leaderboard (P1)

**Goal**: Rank all districts by demand with share and period change; Unmapped bucket.

**Independent Test**: Colombo/Gampaha top of list; Unmapped reconciles; all districts with data visible.

- [x] T041 [US5] Implement `fetchDistrictLeaderboard(companyId, range, compareRange)` using `resolveAddressDistrict` on order shipping addresses in `lib/item-trends/district.ts`
- [x] T042 [P] [US5] Add district aggregation unit tests including Unmapped bucket in `lib/item-trends/district.test.ts`
- [x] T043 [US5] Create `app/api/admin/purchasing/item-trends/districts/route.ts` per `specs/047-item-trend-tracking/contracts/item-trends-districts.md`
- [x] T044 [US5] Build district leaderboard chart/table in `components/organisms/item-trends/districts-panel.tsx`

**Checkpoint**: District ranking live with full list scroll

---

## Phase 11: User Story 6 — Item trends by district (P1)

**Goal**: Drill into district for local fast movers; item × district matrix.

**Independent Test**: SKU selling mostly in Kandy ranks high in Kandy drill-down only.

- [x] T045 [US6] Implement district-scoped SKU aggregation and item×district intensity matrix in `lib/item-trends/district.ts`
- [x] T046 [US6] Extend districts API with `district` query param returning scoped `items` list in `app/api/admin/purchasing/item-trends/districts/route.ts`
- [x] T047 [US6] Add district drill-down drawer and heatmap/matrix visual in `components/organisms/item-trends/districts-panel.tsx`
- [x] T048 [US6] Pass optional `district` filter through movement fetch in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Regional item trends independently testable

---

## Phase 12: User Story 7 — Expansion opportunities (P1)

**Goal**: Rank districts with high delivery demand and low shop coverage; plain-language reasons.

**Independent Test**: High-demand district with no nearby shop appears in expansion panel with evidence.

- [x] T049 [US7] Implement expansion scoring (delivery units × growth × coverage gap) in `lib/item-trends/district.ts`
- [x] T050 [US7] Return `expansion` array from districts API in `app/api/admin/purchasing/item-trends/districts/route.ts`
- [x] T051 [US7] Build expansion opportunity cards with reasons and top SKUs in `components/organisms/item-trends/expansion-panel.tsx`

**Checkpoint**: Site-selection candidates ranked with supporting metrics

---

## Phase 13: User Story 14 — Priority slowdown alerts (P2)

**Goal**: Top Priority slowdown zone with severity styling and investigation detail.

**Independent Test**: Top Priority SKU with ≥25% drop vs prior period appears in slowdown zone.

- [x] T052 [US14] Add `fetchSlowdownAlerts(companyId, range, compareRange)` for Top Priority in `lib/item-trends/signals.ts`
- [x] T053 [US14] Extend `page-data` route with `slowdowns` section and KPI count in `app/api/admin/purchasing/item-trends/page-data/route.ts`
- [x] T054 [US14] Build slowdown alert zone (red/amber severity) in `components/organisms/item-trends/slowdown-panel.tsx`
- [x] T055 [US14] Mount slowdown panel on dashboard home tab in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Slowdown watchlist actionable for purchasing

---

## Phase 14: User Story 8 — Area growth across every district (P2)

**Goal**: All districts show growing/stable/declining/emerging status with action hints.

**Independent Test**: Every district with volume has status; declining district links to slowdown items.

- [x] T056 [US8] Implement `fetchAreaGrowthStatus(companyId, range, compareRange)` in `lib/item-trends/district.ts`
- [x] T057 [US8] Include `growthStatus` on district rows and area-growth summary in districts API in `app/api/admin/purchasing/item-trends/districts/route.ts`
- [x] T058 [US8] Add area growth view (all districts list with status badges + hints) in `components/organisms/item-trends/districts-panel.tsx`

**Checkpoint**: Full geographic coverage map for sales growth

---

## Phase 15: User Story 13 — Day-of-week spike patterns (P2)

**Goal**: Recurring weekday spikes when range ≥28 days; separate one-off spikes.

**Independent Test**: Friday spike repeating ≥2 weeks flagged recurring; 28-day guard on empty state.

- [x] T059 [US13] Implement weekday pattern detection (dominant day, recurring flag) in `lib/item-trends/patterns.ts`
- [x] T060 [US13] Add optional `patterns` section to page-data when range ≥28 days in `app/api/admin/purchasing/item-trends/page-data/route.ts`
- [x] T061 [US13] Build pattern heatmap/bar chart zone in `components/organisms/item-trends/patterns-panel.tsx`

**Checkpoint**: Pattern zone surfaces repeatable spike days

---

## Phase 16: User Story 12 — Intelligent trend engine (P2)

**Goal**: Statistical emerging/slowdown signals labeled `intelligent_analysis`; graceful fallback.

**Independent Test**: Gradual climb flagged as emerging trend; engine failure shows rules-only banner.

- [x] T062 [US12] Implement statistical emerging trend + soft slowdown detection in `lib/item-trends/intelligent.ts`
- [x] T063 [P] [US12] Add intelligent engine unit tests in `lib/item-trends/intelligent.test.ts`
- [x] T064 [US12] Merge intelligent signals into page-data with `signalSource` and `meta.intelligentEngine` status in `app/api/admin/purchasing/item-trends/page-data/route.ts`
- [x] T065 [US12] Add emerging-trends section + degraded-mode banner in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Intelligent layer additive; rules still work alone

---

## Phase 17: User Story 15 — Focus lists & export (P3)

**Goal**: Pin items from any zone; period compare; CSV export with signal context.

**Independent Test**: Pin 3 items, compare two ranges, export CSV with SKU + signal + district/outlet context.

- [x] T066 [US15] Add client focus-list state (sessionStorage) and pin/unpin actions in `components/organisms/item-trends/focus-list.tsx`
- [x] T067 [US15] Implement period comparison side-by-side for focus items in `components/organisms/item-trends/focus-list.tsx`
- [x] T068 [US15] Implement CSV export helper for focus list in `lib/item-trends/export.ts`
- [x] T069 [US15] Mount focus list drawer and export button in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Weekly purchasing workflow exportable

---

## Phase 18: Polish & Cross-Cutting

**Purpose**: Performance, reconciliation, UAT

- [x] T070 [P] Enforce list `limit` max 100 and pagination on ROP route in `app/api/admin/purchasing/item-trends/rop/route.ts`
- [x] T071 [P] Add `Promise.all` parallel fetches for districts + outlets sections in `app/api/admin/purchasing/item-trends/page-data/route.ts` when `sections` includes multiple zones
- [x] T072 Run full Vitest suite: `npx vitest run lib/item-trends/`
- [x] T073 Run quickstart manual validation checklist in `specs/047-item-trend-tracking/quickstart.md`
- [x] T074 [P] Lint changed files and fix any issues in item-trends paths

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **User stories (Phases 3–17)** → **Polish (Phase 18)**
- **US1** blocks all UI/API integration
- **US2** depends on US1 page shell
- **US3, US4, US14** depend on Foundational aggregate/signals + US2 panel
- **US9, US10** depend on Foundational; can parallel after US2
- **US11** depends on US9/US10 routes existing (scope applied last or incrementally)
- **US5–US7, US8** depend on `district.ts` (US5 first, then US6/US7/US8)
- **US12, US13** depend on US3 movement data (Phase 2 signals)
- **US15** depends on all zones producing pin-able rows

### User Story Completion Order (recommended)

```text
Setup → Foundational → US1 → US2 → US3 → US4 → US9 → US10 → US11
  → US5 → US6 → US7 → US14 → US8 → US13 → US12 → US15 → Polish
```

### Parallel Opportunities

**After Phase 2 completes:**
- US3 movement table (T022) ∥ US4 new-items panel (T026) ∥ US9 outlets lib (T027–T028)
- US10 ROP lib (T033) ∥ US5 district lib (T041)

**After US2 panel exists:**
- All zone sub-panels (`movement-table`, `outlets-panel`, `rop-panel`, `districts-panel`) in parallel

**Polish:**
- T070 ∥ T071 ∥ T074

### Parallel Example: Core P1 slice

```bash
# After T019 (panel wired):
Task T022 [US3] movement-table.tsx
Task T026 [US4] new-items-panel.tsx
Task T031 [US9] outlets-panel.tsx
Task T036 [US10] rop-panel.tsx
```

---

## Implementation Strategy

### MVP First (Phases 1–8)

1. Setup + Foundational (T001–T010)
2. US1 permission + page (T011–T014)
3. US2 visual shell (T015–T019)
4. US3 movement (T020–T023)
5. US9 outlets/transfers (T027–T032)
6. US10 ROP suggestions (T033–T037)
7. **STOP and VALIDATE** per quickstart sections 1–4

Delivers: permission-gated super dashboard with movement, outlet transfers, and ROP assist — core purchasing + store value.

### Incremental Delivery

| Increment | Stories | Adds |
|-----------|---------|------|
| MVP | US1–3, US9–10 | Movement, transfers, ROP |
| +Store scope | US11 | Outlet-scoped users |
| +Geography | US4–7, US5–7 | New items, districts, expansion |
| +Alerts | US14, US8 | Slowdown + area growth |
| +Intelligence | US13, US12 | Patterns + statistical engine |
| +Workflow | US15 | Focus list + export |

### Task Count Summary

| Phase | Story | Tasks |
|-------|-------|-------|
| 1 Setup | — | 4 |
| 2 Foundational | — | 6 |
| 3 | US1 | 4 |
| 4 | US2 | 5 |
| 5 | US3 | 4 |
| 6 | US4 | 3 |
| 7 | US9 | 6 |
| 8 | US10 | 5 |
| 9 | US11 | 3 |
| 10 | US5 | 4 |
| 11 | US6 | 4 |
| 12 | US7 | 3 |
| 13 | US14 | 4 |
| 14 | US8 | 3 |
| 15 | US13 | 3 |
| 16 | US12 | 4 |
| 17 | US15 | 4 |
| 18 Polish | — | 5 |
| **Total** | **15 stories** | **74 tasks** |

---

## Notes

- No Prisma migration for v1 — permission only via `lib/rbac.ts`
- ROP writes never add new endpoints — reuse OSF profile PATCH
- Transfer candidates are read-only recommendations
- Intelligent engine (US12) ships after rule-based zones stable
- US2 visual requirements apply to every zone — reuse `ChartContainer` theme
