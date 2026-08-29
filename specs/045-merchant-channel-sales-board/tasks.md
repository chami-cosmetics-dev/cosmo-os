# Tasks: Merchant Channel Sales Board

**Input**: Design documents from `/specs/045-merchant-channel-sales-board/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/merchant-dashboard-channel-sales.md

**Tests**: Vitest included for pure helpers per plan.md (channel split + target sync). No full E2E test suite.

**Organization**: Tasks grouped by user story. Extends GM view on `/dashboard/merchant` — does not replace pulse, alerts, or health scorecard.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to spec user stories US1–US7

## Path Conventions

- Web app at repository root: `lib/`, `app/`, `components/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes and migration per constitution I

- [X] T001 Add `isShopMerchant` to `EmployeeProfile` and `shopTargetAmount` / `onlineTargetAmount` to `MerchantMonthlyTarget` + `MerchantMonthlyTargetHistory` in `prisma/schema.prisma`
- [X] T002 Create migration with `npm run db:migrate:create` and verify SQL under `prisma/migrations/`
- [X] T003 Run `npm run db:generate` after migration to refresh Prisma client

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure helpers and validation that all user stories depend on

**⚠️ CRITICAL**: No user story work until T004–T007 complete

- [X] T004 [P] Implement `resolveCosmeticsLkLocationIds` and `splitMerchantChannelSales` in `lib/merchant-dashboard/channel-sales.ts`
- [X] T005 [P] Implement `resolveEffectiveTotalTarget` and channel percent helpers in `lib/merchant-dashboard/channel-sales.ts`
- [X] T006 [P] Add Vitest coverage in `lib/merchant-dashboard/channel-sales.test.ts` for shop/online split and target sync rules
- [X] T007 [P] Extend `merchantMonthlyTargetUpsertSchema` with optional `shopTargetAmount` / `onlineTargetAmount` in `lib/validation/merchant-dashboard.ts`

**Checkpoint**: Helpers tested; schema deployed locally — user story phases can begin

---

## Phase 3: User Story 1 — GM view channel scorecard (Priority: P1) 🎯 MVP

**Goal**: Admin sees shop/online sales per merchant in GM scorecard for Today, MTD, or custom range without breaking existing GM sections

**Independent Test**: Open GM view → pulse + alerts still show → scorecard has shop count/amount, online count/amount, total per merchant → row click opens Merchant view (quickstart scenario 1–2)

### Implementation for User Story 1

- [X] T008 [US1] Extend `MerchantDashboardOverviewRow` with `shop`, `online`, `isShopMerchant`, `outletName` fields in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T009 [US1] Load Cosmetics.lk location ids and apply `splitMerchantChannelSales` per merchant from active-period cohort in `buildGmOverview` in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T010 [US1] Batch-load `EmployeeProfile` (isShopMerchant, location name) for merchant ids in `buildGmOverview` in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T011 [US1] Wire active GM period cohort (`fromYmd`/`toYmd` aligned with `rangeFromYmd`/`chartRangeToYmd`) in `getMerchantDashboardPageData` in `lib/page-data/merchant-dashboard.ts`
- [X] T012 [US1] Add `gmChannelFooter` placeholder type to `MerchantDashboardPageData` in `lib/page-data/merchant-dashboard.ts`
- [X] T013 [US1] Extend GM scorecard table with Shop and Online count/amount columns in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [X] T014 [US1] Verify existing pulse, alerts, health columns, and row click → Merchant view unchanged in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Channel actuals visible per merchant; GM regression intact

---

## Phase 4: User Story 2 — Channel target vs actual % (Priority: P1)

**Goal**: Scorecard shows shop/online target, actual, and %; legacy `targetAmount`-only merchants unchanged

**Independent Test**: Merchant with only `targetAmount` shows same total % as before; merchant with shop+online targets shows independent channel % (quickstart scenario 4)

### Implementation for User Story 2

- [X] T015 [US2] Load `shopTargetAmount` / `onlineTargetAmount` in `buildGmOverview` from `MerchantMonthlyTarget` in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T016 [US2] Compute `shopPercent`, `onlinePercent`, `effectiveTotalTarget` per row using `resolveEffectiveTotalTarget` in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T017 [US2] Add shop/online target and % columns to GM scorecard in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [X] T018 [US2] Add helper label when custom date range ≠ full month (monthly targets vs period actuals) in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Channel target pacing visible; legacy targets still work

---

## Phase 5: User Story 3 — Footer shop/online totals (Priority: P1)

**Goal**: Company shop/online/grand totals footer reconciles with row sums and `gmPulse`

**Independent Test**: Sum merchant shop amounts = footer shop; grand total = `gmPulse.companyMtdSales` for MTD (quickstart scenario 2)

### Implementation for User Story 3

- [X] T019 [US3] Build `gmChannelFooter` aggregation (shop, online, grandTotal, periodLabel) in `buildGmOverview` in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T020 [US3] Extend `GmPulseInput` with optional `shopAmount`, `onlineAmount`, `shopOrderCount`, `onlineOrderCount` in `lib/merchant-dashboard/gm-score.ts`
- [X] T021 [US3] Populate extended `gmPulse` channel fields in `buildGmOverview` in `lib/page-data/merchant-dashboard-gm-overview.ts`
- [X] T022 [US3] Render **Channel totals** footer card below scorecard in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [X] T023 [P] [US3] Optionally add shop/online chips to pulse row when layout fits in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Footer answers shop vs online company total in one scroll

---

## Phase 6: User Story 4 — Shop merchant on staff page (Priority: P2)

**Goal**: Staff can be marked shop merchant with required outlet; GM scorecard shows badge + outlet name

**Independent Test**: Enable shop merchant without outlet → blocked; with DTD outlet → GM row shows badge (quickstart scenario 6)

### Implementation for User Story 4

- [X] T024 [P] [US4] Add `isShopMerchant` validation (requires `locationId` when true) to staff update schema in `lib/validation/staff.ts`
- [X] T025 [US4] Persist `isShopMerchant` in `PATCH` handler in `app/api/admin/staff/[userId]/route.ts`
- [X] T026 [US4] Include `isShopMerchant` in staff page-data loader in `lib/page-data/staff.ts`
- [X] T027 [US4] Add **Shop merchant** checkbox and client-side location-required validation in `components/molecules/staff-edit-form.tsx`
- [X] T028 [US4] Show shop-merchant badge and outlet name on scorecard rows in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Staff flag flows to GM scorecard display

---

## Phase 7: User Story 5 — Extend target assignment (Priority: P2)

**Goal**: Single target form saves combined + shop + online targets; history audit extended

**Independent Test**: Save shop 400k + online 600k → scorecard shows both %; history row includes channel amounts (quickstart scenario 5)

### Implementation for User Story 5

- [X] T029 [US5] Extend `upsertMerchantMonthlyTarget` to persist channel fields and auto-sync `targetAmount` in `lib/page-data/merchant-dashboard.ts`
- [X] T030 [US5] Append channel amounts to `MerchantMonthlyTargetHistory` on upsert in `lib/page-data/merchant-dashboard.ts`
- [X] T031 [US5] Accept and return channel target fields in `app/api/admin/merchant-dashboard/targets/route.ts`
- [X] T032 [US5] Extend target history table columns for shop/online amounts in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [X] T033 [US5] Add Shop target and Online target inputs to **Assign monthly target** card in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [X] T034 [US5] Extend personal dashboard `target` DTO to derive combined progress when only channel targets set in `lib/page-data/merchant-dashboard.ts`

**Checkpoint**: One form assigns all target types; audit trail complete

---

## Phase 8: User Story 6 — Sort channel scorecard (Priority: P3)

**Goal**: GM can sort by shop, online, total, or channel %

**Independent Test**: Click shop amount header → rows reorder desc/asc

### Implementation for User Story 6

- [X] T035 [US6] Add sort state and clickable headers for shop, online, total, shop %, online % on scorecard in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Sort works alongside existing overview sort

---

## Phase 9: User Story 7 — Personal dashboard channel chips (Priority: P3)

**Goal**: Merchant view shows optional Shop MTD / Online MTD chips without changing peers or target cards

**Independent Test**: Merchant with both channels sees chips; shop-only merchant does not show online chip (quickstart scenario 7)

### Implementation for User Story 7

- [X] T036 [US7] Expose viewed-merchant `shopMtd` / `onlineMtd` buckets on `MerchantDashboardPageData` in `lib/page-data/merchant-dashboard.ts`
- [X] T037 [US7] Render Shop MTD / Online MTD chips near Today/MTD cards on Merchant view only in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`

**Checkpoint**: Personal channel hint live; peer board unchanged

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Verification, deployment, regression

- [ ] T038 Run GM regression + channel scenarios in `specs/045-merchant-channel-sales-board/quickstart.md`
- [X] T039 Run `npm test` on `lib/merchant-dashboard/channel-sales.test.ts` and `lib/merchant-dashboard/gm-score.test.ts`
- [X] T040 Run lint and typecheck on all touched files
- [ ] T041 Deploy migration to all databases with `npm run db:deploy:all` before merge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on T001–T003 — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — **MVP**
- **US2 (Phase 4)**: Depends on US1 loader + scorecard shell
- **US3 (Phase 5)**: Depends on US1 aggregation path; can parallel US2 after T009
- **US4 (Phase 6)**: Depends on T001 only — can parallel US1 after migration
- **US5 (Phase 7)**: Depends on T007, T001; UI depends on US2 display columns
- **US6 (Phase 8)**: Depends on US1 scorecard
- **US7 (Phase 9)**: Depends on T004 channel helper; independent of GM footer
- **Polish (Phase 10)**: After desired stories complete

### User Story Dependencies

| Story | Depends on | Can parallel with |
|-------|------------|-------------------|
| US1 | Phase 2 | — |
| US2 | US1 | US3 (after T009) |
| US3 | US1 | US2 |
| US4 | T001 | US1 (after migration) |
| US5 | T007, T001, US2 display | US4 |
| US6 | US1 | US7 |
| US7 | Phase 2 | US6 |

### Parallel Opportunities

```bash
# Phase 2 (after T001–T003):
T004 channel-sales.ts ∥ T006 channel-sales.test.ts ∥ T007 validation

# After migration:
US4 staff (T024–T027) ∥ US1 loader (T008–T011)

# After US1 scorecard exists:
US2 target % (T015–T018) ∥ US3 footer (T019–T022)
```

---

## Parallel Example: User Story 1

```bash
# Loader work (sequential within buildGmOverview):
T008 → T009 → T010

# Parallel after T009:
T011 merchant-dashboard.ts wiring ∥ T013 panel columns (mock data first)
```

---

## Implementation Strategy

### MVP First (User Stories 1–3)

1. Complete Phase 1–2 (schema + helpers)
2. Complete Phase 3 (US1) — channel actuals in scorecard
3. Complete Phase 4 (US2) — channel target %
4. Complete Phase 5 (US3) — footer totals
5. **STOP and VALIDATE** quickstart scenarios 1–2
6. Deploy/demo GM channel view

### Incremental Delivery

1. Setup + Foundational → helpers ready
2. US1 + US2 + US3 → **P1 complete** (GM can monitor shop vs online)
3. US4 → staff shop merchant identity
4. US5 → assign channel targets
5. US6 + US7 → polish sort + personal chips

### Suggested MVP Scope

**Minimum shippable**: Phases 1–5 (T001–T023) = US1 + US2 + US3

Delivers channel scorecard, target %, footer — core GM ask without staff flag or target assignment UI.

---

## Notes

- Do **not** remove or relocate GM pulse, alerts, health scorecard, MTD chart, or target history
- Reuse `fetchMerchantCohortSales` — no second order pass
- Extend existing APIs only (`page-data`, `targets`, `staff/[userId]`)
- Commit after each phase checkpoint
