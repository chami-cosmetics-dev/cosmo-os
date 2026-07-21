# Tasks: OSF Purchasing Suite

**Input**: Design documents from `/specs/012-osf-purchasing-suite/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for signed order qty, positive-only TOTAL, threshold helpers, margin/price-change % — included as helper tests (not full TDD)

**Organization**: Tasks grouped by user story (US1–US6) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US6 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/012-osf-purchasing-suite/plan.md`, `research.md`, `data-model.md`, `contracts/purchasing-suite.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `components/organisms/app-sidebar.tsx`, `lib/rbac.ts`, `lib/reminder-permissions.ts`, `lib/task-reminders.ts`, `lib/osf/formulas.ts`, `lib/osf/build-workbook.ts`, `app/api/admin/osf/generate/route.ts`, `components/organisms/osf-product-editor.tsx`, `components/organisms/osf-generate-panel.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RBAC, shared OSF helpers — blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Add `reorderThresholdPercent Int?` on `ProductOsfProfile` in `prisma/schema.prisma` per `specs/012-osf-purchasing-suite/data-model.md`
- [X] T004 Create migration with `npm run db:migrate:create` for reorder threshold; do **not** run `db:push` against shared DBs
- [X] T005 [P] Add permissions `purchasing.tools.read` and `purchasing.tools.manage` in `lib/rbac.ts` (DEFAULT_PERMISSIONS + admin role keys as appropriate per research R1)
- [X] T006 [P] Add `reminders.purchasing_rop_threshold` to `lib/reminder-permissions.ts` and ensure it seeds via `lib/rbac.ts` REMINDER_BUBBLE_PERMISSIONS mapping
- [X] T007 [P] Extend Zod in `lib/validation/osf.ts` for `reorderThresholdPercent` (1–100 or null) and generate body `belowThresholdOnly` boolean per `contracts/purchasing-suite.md`
- [X] T008 [P] Implement `lib/osf/threshold.ts` — `effectiveReorderThresholdPercent`, `isBelowReorderThreshold(totalStock, totalRop, thresholdPercent)` (null threshold ⇒ 70; unevaluable when totalRop ≤ 0)
- [X] T009 [P] Update `lib/osf/formulas.ts` — signed `orderQty` (ROP − stock, no floor-at-zero); add `sumPositiveOrderQtys(values)` helper
- [X] T010 [P] Add Vitest in `lib/osf/threshold.test.ts` and update `lib/osf/formulas.test.ts` for signed order qty + positive-only sum + threshold edge cases
- [X] T011 Document deploy gate: after user confirmation `npm run db:deploy:all` in `specs/012-osf-purchasing-suite/quickstart.md` (already noted — confirm still accurate)

**Checkpoint**: Schema + permissions + helpers ready; stories can consume them

---

## Phase 3: User Story 1 - Purchasing sidebar group (Priority: P1) 🎯 MVP

**Goal**: Dedicated Purchasing sidebar group with OSF + tool entry points gated correctly

**Independent Test**: `osf.read` only → OSF link, no Calculator; `tools.read` → Calculator; neither → no purchasing tools

### Implementation for User Story 1

- [X] T012 [US1] Refactor `components/organisms/app-sidebar.tsx` — move Order Support File out of Product Management into new **Purchasing** `SidebarGroup`
- [X] T013 [US1] Add Purchasing nav links for Calculator (`/dashboard/purchasing/calculator`) visible when `purchasing.tools.read` or `purchasing.tools.manage`; keep OSF visible for `purchasing.osf.read` / `.manage`
- [X] T014 [US1] Show Purchasing group if user has any of osf.read, osf.manage, tools.read, tools.manage (group empty-state avoided)

**Checkpoint**: US1 — sidebar grouping and permission-gated links work

---

## Phase 4: User Story 2 - SKU margin calculator (Priority: P1)

**Goal**: Search SKU, show purchase cost, prefill sell price, show margin %

**Independent Test**: Known cost + catalog sell → margin matches (sell − cost) / sell; missing cost → blank margin

### Implementation for User Story 2

- [X] T015 [US2] Implement `GET /api/admin/purchasing/sku-pricing` in `app/api/admin/purchasing/sku-pricing/route.ts` (`requirePermission` tools.read) returning identity, discountedPrice/mrp, latestCost/supplier per `contracts/purchasing-suite.md` (reuse OSF ERP cost + allowlisted last purchase)
- [X] T016 [P] [US2] Add client margin helper tests or pure helper `lib/osf/pricing-math.ts` for margin % (optional thin wrapper around existing `cosmeticsMargin`-style math)
- [X] T017 [US2] Build `components/organisms/purchasing-sku-calculator.tsx` — SKU search, cost display, sell input prefilled from `discountedPrice`, live margin %
- [X] T018 [US2] Add page `app/(dashboard)/dashboard/purchasing/calculator/page.tsx` gated by `purchasing.tools.read` / `.manage` with PermissionDeniedCard pattern

**Checkpoint**: US2 — margin calculator usable end-to-end

---

## Phase 5: User Story 3 - Supplier price-change comparison (Priority: P1)

**Goal**: Enter new supplier price vs last purchase; show % change; session-only

**Independent Test**: Last 100, new 120 → +20%; navigate away → new price not restored

### Implementation for User Story 3

- [X] T019 [P] [US3] Add price-change % helper in `lib/osf/pricing-math.ts` (or formulas) + Vitest in `lib/osf/pricing-math.test.ts`
- [X] T020 [US3] Extend `components/organisms/purchasing-sku-calculator.tsx` with compare panel (new price input, absolute delta, % change); do not persist new price
- [X] T021 [US3] Ensure leaving/reloading calculator clears typed new price (component state only; no localStorage)

**Checkpoint**: US3 — session-only price compare on calculator page

---

## Phase 6: User Story 4 - Signed OSF warehouse order qty (Priority: P1)

**Goal**: Per-warehouse ORDER QTY = ROP − stock (can be negative); TOTAL buy = positives only

**Independent Test**: Stocks 0/5/30, ROPs 10/8/15 → +10/+3/−15 and TOTAL ORDER QTY = 13

### Implementation for User Story 4

- [X] T022 [US4] Update `lib/osf/build-workbook.ts` to write signed per-warehouse order qty and set `TOTAL ORDER QTY` via `sumPositiveOrderQtys`; update Common SKU Reorder to positive-only buy aggregate per research R2
- [X] T023 [P] [US4] Update `lib/osf/build-workbook.test.ts` with fixture +10/+3/−15 → TOTAL 13
- [X] T024 [US4] Smoke full generate via existing `app/api/admin/osf/generate/route.ts` (no API shape change required beyond workbook math)

**Checkpoint**: US4 — surplus visible; buy total not reduced by surplus

---

## Phase 7: User Story 5 - Reorder threshold % + filtered OSF (Priority: P1)

**Goal**: Per-SKU threshold %; download OSF with only below-threshold SKUs

**Independent Test**: SKU A below 70%, B above → filtered workbook has A only; empty set → notice/toast not full catalog

### Implementation for User Story 5

- [X] T025 [US5] Extend `PATCH` in `app/api/admin/osf/profiles/[sku]/route.ts` to accept `reorderThresholdPercent`; allow `purchasing.tools.manage` (and existing osf.manage) per contract
- [X] T026 [US5] Extend `GET` profiles/`components/organisms/osf-product-editor.tsx` to show and save reorder threshold % (default display 70 when null)
- [X] T027 [US5] Extend `POST` `app/api/admin/osf/generate/route.ts` with `belowThresholdOnly`; require `purchasing.tools.read` when true; filter catalog rows with `isBelowReorderThreshold` after stock/ROP maps built
- [X] T028 [US5] Extend `components/organisms/osf-generate-panel.tsx` with “Download reorder-only OSF” control + empty-state toast when no SKUs
- [X] T029 [P] [US5] Extend `lib/validation/osf.ts` / generate panel body types if any remaining gaps for `belowThresholdOnly`

**Checkpoint**: US5 — threshold editable; filtered OSF works

---

## Phase 8: User Story 6 - Purchasing ROP-threshold reminder + permission (Priority: P2)

**Goal**: Reminder bubble lists below-threshold SKUs for `reminders.purchasing_rop_threshold` only

**Independent Test**: Below-threshold SKU exists → permitted user sees bubble; without permission → no bubble; link is actionable

### Implementation for User Story 6

- [X] T030 [US6] Implement below-threshold evaluation helper in `lib/osf/below-threshold-skus.ts` (reuse column resolve + ERP bins + profiles/ROPs + threshold) suitable for reminder + generate filter
- [X] T031 [US6] Wire new reminder category in `lib/task-reminders.ts` (and access helpers in `lib/task-reminder-access.ts` if needed) gated by `reminders.purchasing_rop_threshold`
- [X] T032 [US6] Set reminder href to `/dashboard/purchasing/osf` (or calculator/reorder) with clear label; cap list per existing REMINDER_LIMIT pattern
- [X] T033 [P] [US6] Add/adjust unit coverage for reminder access key in `lib/task-reminder-access.test.ts` if pattern exists for other reminder keys

**Checkpoint**: US6 — reminder bubble live and permission-isolated

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup across stories

- [X] T034 [P] Run `npm test` for all new/updated `lib/osf/*.test.ts` and reminder access tests
- [ ] T035 [P] Walk `specs/012-osf-purchasing-suite/quickstart.md` scenarios 1–6 manually on Cosmo
- [X] T036 Confirm Roles UI shows new `purchasing.tools.*` and `reminders.purchasing_rop_threshold` for assignment
- [ ] T037 After explicit user confirmation only: `npm run db:deploy:all` for threshold migration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1–US6 (Phases 3–8)**: All depend on Foundational
  - US2 → US3 (same calculator page; US3 extends US2 UI)
  - US4 independent of US2/US3 after foundation
  - US5 depends on T008 threshold helper + workbook/generate (benefits from US4 signed math already landed)
  - US6 depends on threshold evaluation (can share helper with US5; prefer T030 after or with T027)
- **Polish (Phase 9)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — sidebar only
- **US2 (P1)**: After Foundational — calculator API + UI
- **US3 (P1)**: After US2 calculator shell
- **US4 (P1)**: After Foundational formulas — workbook only
- **US5 (P1)**: After Foundational threshold + generate; ideally after US4
- **US6 (P2)**: After threshold evaluation path (US5 helper ideal)

### Parallel Opportunities

- T005 / T006 / T007 / T008 / T009 in Foundational (after T003–T004 for schema if tests need types)
- US1 sidebar || US4 workbook math (different files) after Foundational
- US2 API || US1 sidebar
- T019 price-change tests || US4 tests

### Parallel Example: After Foundational

```bash
# Parallel track A — navigation MVP
Task: T012–T014 app-sidebar Purchasing group

# Parallel track B — OSF signed qty
Task: T022–T023 build-workbook signed + tests

# Parallel track C — calculator (then US3)
Task: T015 sku-pricing API → T017–T018 UI
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 sidebar
4. **STOP and VALIDATE** nav gating

Practical early demo: also land **US4** (signed order qty) in the same sprint — high buyer value, small surface.

### Incremental Delivery

1. Setup + Foundational
2. US1 sidebar → demo nav
3. US4 signed OSF → demo surplus/−TOTAL rule
4. US2 + US3 calculator → demo pricing tools
5. US5 filtered OSF + threshold editor
6. US6 reminder bubble
7. Polish / quickstart

### Suggested MVP scope

- **Minimum**: US1 (sidebar)
- **Recommended first shippable slice**: US1 + US4 (+ Foundational)

---

## Notes

- [P] = different files, no incomplete-task dependency
- [Story] labels US1–US6 match spec.md
- Do not invent stock/cost; respect supplier allowlist on purchase price
- Session-only new price: no DB/localStorage
- Classic OSF perms unchanged; tools + reminder keys independent
- Commit after each task or logical group
