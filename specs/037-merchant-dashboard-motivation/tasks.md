# Tasks: Merchant Dashboard Motivation & Sales Tracking

**Input**: Design documents from `/specs/037-merchant-dashboard-motivation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for pure peer-board and history helpers are included (plan Testing + constitution gate). Not a full TDD/contract-test suite.

**Organization**: Phases by user story so each increment is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1-US5 maps to spec user stories
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature branch docs and shared DTO/module stubs for motivation fields.

- [x] T001 Confirm feature docs exist under `specs/037-merchant-dashboard-motivation/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/merchant-dashboard-motivation.md`, `quickstart.md`) and note no Prisma migration is required for v1
- [x] T002 [P] Add shared motivation DTO types (`PeriodSales`, `PeerBoard`, `PeerBoardEntry`, `LocationShareRow`, `LocationShareBundle`, `DailySalesHistoryRow`, `MonthlySalesHistoryRow`) in `lib/merchant-dashboard/motivation-types.ts` aligned with `data-model.md` and `contracts/merchant-dashboard-motivation.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cohort aggregation + pure board/cheer helpers that ALL stories reuse. MUST complete before story UI/API wiring.

**CRITICAL**: No user story work begins until this phase is complete

- [x] T003 Implement merchant-cohort order scan helper in `lib/page-data/merchant-dashboard-peers.ts` (single order pass for a Colombo `fromYmd`/`toYmd`; attribute via same rules as `fetchMerchantUserSales` in `lib/page-data/merchant-dashboard-sales.ts`; accumulate per-merchant totals and per-(merchant, location) totals for `listMerchantRoleUsers` cohort)
- [x] T004 [P] Implement pure `buildPeerBoard` (top 10 + always include viewed merchant, true ranks, gap-to-leader, solo/empty handling) in `lib/merchant-dashboard/peer-board.ts`
- [x] T005 [P] Add peer motivational bands + non-punitive messages (`leader` / `chasing` / `mid` / `behind` / `no_sales` / `solo`) in `lib/merchant-dashboard/cheer.ts` (keep existing target cheer APIs intact)
- [x] T006 [P] Add Vitest unit tests for top-10+self, tie ordering, and solo cohort in `lib/merchant-dashboard/peer-board.test.ts`
- [x] T007 [P] Add Vitest unit tests for peer cheer band selection (non-punitive copy presence) in `lib/merchant-dashboard/cheer.test.ts` or extend existing cheer tests beside `lib/merchant-dashboard/cheer.ts`
- [x] T008 Extend `MerchantDashboardPageData` type placeholders in `lib/page-data/merchant-dashboard.ts` for `today`, `peerBoards`, `locationShare`, `salesHistory` (nullable/empty defaults OK until story wiring) per contract

**Checkpoint**: Foundation ready - cohort scan, peer-board builder, peer cheer, and page-data type slots exist

---

## Phase 3: User Story 3 - Daily sales tracking (Priority: P1) MVP

**Goal**: Merchants see **Today** sales total + order count (Asia/Colombo) clearly labeled beside MTD.

**Independent Test**: Open `/dashboard/merchant` as Merchant A; Today matches attributed sales for current Colombo day; zero today shows `0` not error; labels distinguish Today vs MTD.

### Implementation for User Story 3

- [x] T009 [US3] Compute viewed-merchant `today` (`ymd`, `total`, `orderCount`) in `getMerchantDashboardPageData` inside `lib/page-data/merchant-dashboard.ts` using cohort scan or `fetchMerchantUserSales` for today's Colombo `ymd`
- [x] T010 [US3] Ensure `GET` `app/api/admin/merchant-dashboard/page-data/route.ts` returns `today` in JSON (auth unchanged; no new query params)
- [x] T011 [US3] Add Today KPI card with clear "Today" vs "This month (MTD)" labels in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Today + MTD visible and labeled - smallest shippable motivation slice

---

## Phase 4: User Story 2 - Motivational peer comparison (Priority: P1)

**Goal**: Named peer boards for **Today** and **MTD** (top 10 + self), rank, gap-to-leader, motivational copy - without opening Overview.

**Independent Test**: As Merchant A with >=3 cohort peers, see Today and MTD boards with names/amounts, own rank, gap; #1 gets celebratory copy; behind leader gets nudge; solo cohort shows solo-leader state.

### Implementation for User Story 2

- [x] T012 [US2] Build `peerBoards.today` and `peerBoards.mtd` in `lib/page-data/merchant-dashboard.ts` using cohort scan (`merchant-dashboard-peers.ts`) + `buildPeerBoard` + peer cheer from `cheer.ts`
- [x] T013 [US2] Refactor admin `overview` MTD rows in `lib/page-data/merchant-dashboard.ts` to reuse MTD cohort scan when practical (avoid N x `fetchMerchantUserSales` for overview + peers)
- [x] T014 [US2] Render Today + MTD peer comparison UI (rank, gap, cheer, named top-10+self list) in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [x] T015 [US2] Verify non-admin merchants receive peer boards (same access as page-data); admin switcher updates boards for selected merchant in `merchant-dashboard-panel.tsx` refetch path

**Checkpoint**: Merchants can answer "where do I rank today/MTD?" on personal dashboard

---

## Phase 5: User Story 1 - Personal mirror / location share (Priority: P1)

**Goal**: Per-location self amount/% plus compact named peer breakdown for **Today** and **MTD** (toggle or tabs).

**Independent Test**: Merchant A with multi-location sales sees location share with self % and peer amounts; Today/MTD toggle works; admin switch to B updates location share; not a full Overview wall.

### Implementation for User Story 1

- [x] T016 [US1] Implement `buildLocationShareBundle` (self + compact peers, exclude self from peers list, only locations with selfAmount > 0) in `lib/page-data/merchant-dashboard-peers.ts`
- [x] T017 [US1] Populate `locationShare.today` and `locationShare.mtd` in `getMerchantDashboardPageData` in `lib/page-data/merchant-dashboard.ts` from cohort location aggregates
- [x] T018 [US1] Add location-share UI (Today | MTD toggle/tabs, self %/amount, compact peer list) in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`; keep existing personal location pie as complementary or fold into this section without dumping Overview widgets
- [x] T019 [P] [US1] Add Vitest coverage for share % and peer compact ordering in `lib/page-data/merchant-dashboard-peers.test.ts` (pure helpers / fixtures)

**Checkpoint**: Personal location mix + share-of-location stories work without Overview

---

## Phase 6: User Story 4 - Sales history tracking (Priority: P2)

**Goal**: Daily history for current Colombo month + monthly history for last 3 months (with target join when present).

**Independent Test**: Prior day this month appears in daily history; prior months within last 3 appear in monthly with totals/target status; empty ranges show empty/zero not error.

### Implementation for User Story 4

- [x] T020 [US4] Implement daily + monthly history builders in `lib/page-data/merchant-dashboard-history.ts` (daily: month start to today; monthly: last 3 calendar months; join `MerchantMonthlyTarget`; Colombo bounds)
- [x] T021 [P] [US4] Add Vitest for history window bounds and day bucketing in `lib/page-data/merchant-dashboard-history.test.ts`
- [x] T022 [US4] Wire `salesHistory` into `getMerchantDashboardPageData` in `lib/page-data/merchant-dashboard.ts` (history anchors to **today** per contract; `yearMonth` query still drives MTD/target card only)
- [x] T023 [US4] Add sales history UI (daily list/chart + monthly table with target status/empty states) in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Merchants can review day/month history on personal dashboard

---

## Phase 7: User Story 5 - Attractive motivational presentation (Priority: P3)

**Goal**: First viewport hierarchy Today -> MTD -> target -> peer rank; consistent motivational tone; phone-friendly.

**Independent Test**: On phone-width viewport, answer "How am I doing today?", "On target?", "Where do I rank?" without hunting admin-only tools; cheer tone never punitive.

### Implementation for User Story 5

- [x] T024 [US5] Reorder/restyle first viewport in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx` so Today, MTD, target progress, and peer rank are above-the-fold; push admin-only assign/overview tools below
- [x] T025 [US5] Align peer + target cheer presentation (shared voice, no shaming) across target card and peer boards in `merchant-dashboard-panel.tsx` using `lib/merchant-dashboard/cheer.ts`
- [x] T026 [US5] Mobile layout pass: no horizontal overflow / missing labels for KPI + peer rank strip in `merchant-dashboard-panel.tsx`

**Checkpoint**: Motivational home presentation matches SC-006

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Consistency, performance, validation against quickstart.

- [x] T027 Confirm company Overview merchant-mix charts/APIs untouched (no edits to `lib/page-data/dashboard-overview.ts` / brand-sales unless accidental) per FR-011
- [x] T028 [P] Run `npm test` for merchant-dashboard / peer-board / history / cheer tests and fix failures
- [x] T029 [P] Run lint/typecheck on touched files (`lib/page-data/merchant-dashboard*.ts`, `lib/merchant-dashboard/*`, `merchant-dashboard-panel.tsx`, page-data route)
- [x] T030 Execute manual checks in `specs/037-merchant-dashboard-motivation/quickstart.md` (Today/MTD, peers, location share, history, first viewport, Overview isolation)
- [x] T031 Rename existing target-assignment `history` vs new `salesHistory` carefully in `merchant-dashboard-panel.tsx` / types so UI labels never confuse target audit with sales history (FR-012)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup - **BLOCKS** all user stories
- **US3 (Phase 3)**: After Foundational - MVP (Today KPI)
- **US2 (Phase 4)**: After Foundational; benefits from US3 `today` window already in loader
- **US1 (Phase 5)**: After Foundational; benefits from same cohort scans as US2
- **US4 (Phase 6)**: After Foundational; independent of peers/location UI
- **US5 (Phase 7)**: After US3+US2 (+ preferably US1) so layout has content to prioritize
- **Polish (Phase 8)**: After desired stories complete

### User Story Dependencies

- **US3**: No dependency on other stories (MVP)
- **US2**: Uses foundational cohort scan; Today board pairs with US3 data
- **US1**: Uses foundational cohort location aggregates; Today/MTD toggle pairs with US2/US3 periods
- **US4**: Independent data path (`merchant-dashboard-history.ts`)
- **US5**: Presentation layer over US3/US2/(US1) widgets

### Parallel Opportunities

- T002 with doc confirmation after T001
- T004, T005, T006, T007 in parallel after T003 starts (T006/T007 need T004/T005)
- T019 parallel with T018 once T016 done
- T021 parallel with T020
- T028 / T029 in polish parallel

---

## Parallel Example: Foundational

```bash
# After T003 cohort scan exists / in progress:
Task: "Implement buildPeerBoard in lib/merchant-dashboard/peer-board.ts"
Task: "Add peer motivational bands in lib/merchant-dashboard/cheer.ts"
# Then tests:
Task: "Vitest peer-board.test.ts"
Task: "Vitest cheer peer bands"
```

## Parallel Example: User Story 4

```bash
Task: "Implement merchant-dashboard-history.ts"
Task: "Vitest merchant-dashboard-history.test.ts"
# Then wire + UI sequentially:
Task: "Wire salesHistory in merchant-dashboard.ts"
Task: "History UI in merchant-dashboard-panel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 3 Only)

1. Complete Phase 1-2 (Setup + Foundational)
2. Complete Phase 3 (Today KPI)
3. **STOP and VALIDATE** quickstart section 1
4. Demo Today + MTD labels

### Incremental Delivery

1. Setup + Foundational -> helpers ready
2. US3 Today -> MVP
3. US2 Peer boards -> replace Overview-for-comparison habit
4. US1 Location share -> personal Overview mirror
5. US4 History -> accountability
6. US5 Layout polish -> SC-006
7. Polish / quickstart full pass

### Suggested MVP scope

**US3 (Today KPI) + Foundational** is the smallest demo. Recommended first release slice for product value: **US3 + US2** (Today + peer boards).

---

## Notes

- No new Prisma migrations or permission keys in v1
- Do not rewrite company Overview
- Attribution must stay identical to existing merchant MTD
- All calendars Asia/Colombo
- Commit after each task or logical group
- Avoid confusing `history` (target audit) with `salesHistory`
