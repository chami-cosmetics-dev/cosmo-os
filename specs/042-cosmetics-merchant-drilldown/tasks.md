# Tasks: Cosmetics.lk Merchant Drill-down

**Input**: Design documents from `/specs/042-cosmetics-merchant-drilldown/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Optional â€” plan expects Vitest for the channel classifier and aggregate invariants. Unit tests live in Polish (not TDD-first). Manual validation via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label (US1â€“US6)
- Exact file paths in every task description

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `components/`). No `prisma/` changes in this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm design docs and target seams before coding

- [x] T001 Confirm feature docs present under `specs/042-cosmetics-merchant-drilldown/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
- [x] T002 [P] Confirm touch points from plan: `lib/validation.ts`, `lib/cosmetics-lk-channel.ts` (new), `lib/page-data/dashboard-cosmetics-lk-drilldown.ts` (new), `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts` (new), `components/organisms/dashboard-main-slot.tsx`, `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx` (new); confirm **no** Prisma migration is needed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cosmetics.lk-scoped query, auth, and the shared classifier every story needs

**âš ï¸ CRITICAL**: No user story work until this phase completes

- [x] T003 [P] Add `cosmeticsLkDrilldownQuerySchema` (`from`, `to`, `date_type` only â€” no `analysis_type`) to `lib/validation.ts`, reusing `ymdQuerySchema` and `dashboardSalesDateTypeSchema` per `specs/042-cosmetics-merchant-drilldown/contracts/admin-dashboard-cosmetics-lk-drilldown.md`
- [x] T004 [P] Create `lib/cosmetics-lk-channel.ts` mapping `Order.sourceName` â†’ `website` | `erp1` | `manual` per research decision 2 (`erpnext`/`erpnext-pos`/`pos` â†’ ERP1; `manual` â†’ Manual; everything else incl. blank/`web`/`shopify` â†’ Website), exporting channel keys and staff labels
- [x] T005 Export the VAT category constant (`VAT_TOP_PRIORITY_BRAND`) and reuse `isCosmeticsLkLocationName` from `lib/page-data/merchant-dashboard-cosmetics-lk.ts` so the new drill-down shares one VAT/location definition (no duplicate literals)
- [x] T006 Create `lib/page-data/dashboard-cosmetics-lk-drilldown.ts` core fetcher: resolve the Cosmetics.lk `CompanyLocation` (name or shortName), load orders scoped to `companyId` + that `companyLocationId` using `buildDashboardSalesDateFilter` and `isDashboardSalesOrderEligible` from `lib/page-data/dashboard-sales.ts`, and return `{ locationId, locationName, from, to, dateType, total, orderCount }` (return null/not-found signal when no Cosmetics.lk location)
- [x] T007 Create `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts` GET: `requirePermission("dashboard.view")`, `getDashboardDateTypePermission(dateType)` check, company scope, Zod parse from T003, `400` on invalid/from>to, `404` on missing company or missing Cosmetics.lk location, `200` location summary; wrap with `createPerfLogger` + `Server-Timing` like `app/api/admin/dashboard/sales-by-location/route.ts`
- [x] T008 Verify `GET /api/admin/dashboard/sales-by-location` response and `lib/page-data/dashboard-sales.ts` are unchanged by this feature (card headline math and payload must not move)

**Checkpoint**: Cosmetics.lk-scoped, permission-gated endpoint returns the location total â€” user stories can start

---

## Phase 3: User Story 1 - Open Cosmetics.lk detail from the main dashboard card (Priority: P1) ðŸŽ¯ MVP

**Goal**: Cosmetics.lk card is clickable and opens a drill-down bound to the dashboard's current Fromâ€“To and sales filter, closable without losing filters

**Independent Test**: Click the Cosmetics.lk card â†’ panel opens with matching location, period, and total; other location cards do nothing; close returns to dashboard with filters unchanged

### Implementation for User Story 1

- [x] T009 [US1] In `components/organisms/dashboard-main-slot.tsx`, carry `locationId` and an `isCosmeticsLk` flag (via `isCosmeticsLkLocationName`) through `donutGridStats` into `DashboardDonutGrid`/card props so only the Cosmetics.lk card can open the drill-down
- [x] T010 [US1] Make the Cosmetics.lk card an accessible click target in `components/organisms/dashboard-main-slot.tsx` (button/role semantics + keyboard activation + hover affordance); other cards stay inert
- [x] T011 [US1] Create `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx` using `components/ui/sheet.tsx`: open/close state, header with location name and the dashboard `filterInfo`, fetch `/api/admin/dashboard/cosmetics-lk-drilldown` on open with `fromDate`/`toDate`/`dateType` from `useDashboardOverview()`, show loading and error states per `.cursor/rules/action-loading-ux.mdc`, and render the location total
- [x] T012 [US1] Refetch (or invalidate a `from|to|dateType` keyed cache) in `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx` when dashboard filters change while the sheet is open; closing must not mutate `DashboardOverviewProvider` state

**Checkpoint**: Click â†’ Cosmetics.lk panel with matching period and total â€” MVP demoable

---

## Phase 4: User Story 2 - See every merchant who placed Cosmetics.lk orders (Priority: P1)

**Goal**: Panel lists every attributed sales merchant with Cosmetics.lk order count and amount, including the DM-General bucket, summing to the card total

**Independent Test**: On a day with several merchants plus unassigned orders, every merchant appears with correct count/amount and the sum matches the card headline

### Implementation for User Story 2

- [x] T013 [US2] Extend `lib/page-data/dashboard-cosmetics-lk-drilldown.ts` with merchant attribution identical to `fetchDashboardSalesByLocationMerchant` (`getMerchantCouponCode` join-all â†’ `buildCouponToMerchantMap`/`matchMerchantFromCouponMap` â†’ `resolveAssignedMerchantDashboardFallback` â†’ `normalizeDashboardMerchantLabel`), returning `merchants[]` with `merchantId`, `merchantName`, `total`, `orderCount`, omitting zero-order merchants and sorting by total desc then name
- [x] T014 [US2] Return `merchants[]` from `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts` per `contracts/admin-dashboard-cosmetics-lk-drilldown.md`
- [x] T015 [US2] Render the merchant table in `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx` (name, order count, amount, scrollable for dozens of merchants) plus the empty state for zero eligible orders per spec FR-018

**Checkpoint**: All Cosmetics.lk merchants visible and reconciling with the card total

---

## Phase 5: User Story 3 - Split Cosmetics.lk orders by website vs ERP1 (Priority: P1)

**Goal**: Location and each merchant show Website vs ERP1 (plus Manual when present) order counts and amounts

**Independent Test**: With website, ERP1, and manual orders present, location and merchant channel figures split correctly and each merchant's shown channels sum to that merchant's total

### Implementation for User Story 3

- [x] T016 [US3] Add `byChannel` buckets (location-level and per merchant) in `lib/page-data/dashboard-cosmetics-lk-drilldown.ts` using `lib/cosmetics-lk-channel.ts`, attributing full `totalPrice` to exactly one channel and omitting `manual` when its `orderCount` is 0
- [x] T017 [US3] Return location and merchant `byChannel` from `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts` per the contract
- [x] T018 [US3] Display Website / ERP1 / Manual figures in `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx` at location level and per merchant row, labeled so location totals are distinguishable from a single merchant's figures (spec FR-019)

**Checkpoint**: Channel mix answerable without export

---

## Phase 6: User Story 4 - Payment type breakdown (Priority: P2)

**Goal**: Cosmetics.lk sales by payment type at location level and per merchant, summing to the card total

**Independent Test**: On a mixed-payment period, each used type shows count and amount; location payment amounts sum to the card total; Unspecified appears only when such orders exist

### Implementation for User Story 4

- [x] T019 [US4] Add `byPaymentType` buckets (location + per merchant) in `lib/page-data/dashboard-cosmetics-lk-drilldown.ts` using `getPaymentMethodInfo({ paymentGatewayPrimary, financialStatus })` from `lib/payment-method-label.ts`, attributing full `totalPrice` to one label and falling back to `Unspecified`; return them from `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts`
- [x] T020 [US4] Render payment-type breakdown (label, order count, amount) at location level and per merchant in `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx`

**Checkpoint**: Payment mix visible and reconciling with the card total

---

## Phase 7: User Story 5 - VAT items vs other items (Priority: P2)

**Goal**: VAT-tagged line spend vs other line spend at location level and per merchant

**Independent Test**: With VAT and non-VAT lines present, both amounts appear at location and merchant level; a mixed-cart order contributes to both order counts

### Implementation for User Story 5

- [x] T021 [US5] Add `byVatItem` buckets in `lib/page-data/dashboard-cosmetics-lk-drilldown.ts`: select `lineItems { quantity, price, productItem { itemStatusCategory } }`, compute `price * quantity`, classify VAT via the shared constant from T005, aggregate location + per merchant (an order may count in both `vat` and `other` order counts), and return them from `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts`
- [x] T022 [US5] Render VAT items vs other items in `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx`, with copy making clear this is line-item spend (so it need not equal the order total)

**Checkpoint**: VAT mix readable at both levels

---

## Phase 8: User Story 6 - Discount visibility (Priority: P2)

**Goal**: Location discount total plus per-merchant discount amount and the promotional codes used

**Independent Test**: With discounted and non-discounted orders, location `discountTotal` matches the eligible set's `totalDiscounts` sum and merchant rows list promotional codes with per-code order counts; MER tracking codes are excluded

### Implementation for User Story 6

- [x] T023 [US6] Add `discountTotal` (sum of `Order.totalDiscounts`) at location and merchant level in `lib/page-data/dashboard-cosmetics-lk-drilldown.ts`
- [x] T024 [US6] Add promotional `discountCodes` (`{ code, orderCount }`) per merchant plus optional location `byDiscountCode` using `getOrderDiscountCouponCode` from `lib/order-discount-coupon.ts` (must exclude MER/DM tracking codes), and return discount fields from `app/api/admin/dashboard/cosmetics-lk-drilldown/route.ts`
- [x] T025 [US6] Render discount total and per-merchant codes with order counts in `components/organisms/dashboard-cosmetics-lk-drilldown-sheet.tsx`; orders without discounts must show no invented code

**Checkpoint**: Discount activity explainable per merchant

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Tests, reconciliation guarantees, performance, UAT

- [x] T026 [P] Add Vitest coverage in `lib/cosmetics-lk-channel.test.ts` for channel mapping (`web`, `shopify`, blank/unknown â†’ Website; `erpnext`, `erpnext-pos`, `pos` â†’ ERP1; `manual` â†’ Manual; case/whitespace tolerance)
- [x] T027 [P] Add Vitest coverage in `lib/page-data/dashboard-cosmetics-lk-drilldown.test.ts` for aggregate invariants against a fixture order set: merchant totals sum to location total, channel amounts sum to total, payment-type amounts sum to total, `manual` omitted at zero, VAT/other line split, discount total and promo-code counts, and DM-General bucketing for unattributed orders
- [ ] T028 Verify the drill-down applies the same eligibility as the card for delivery-focused filters (POS handling unchanged) by comparing location total against the Cosmetics.lk card total across `all_orders` and at least one delivery-focused `date_type`
- [x] T029 Confirm the drill-down query loads only Cosmetics.lk orders and runs on click (not on dashboard first paint), and that line-item selection did not leak into `lib/page-data/dashboard-sales.ts`
- [x] T030 Run `npm test`, `npm run lint`, and typecheck on touched files; fix regressions
- [ ] T031 Manual Cosmo UAT against `specs/042-cosmetics-merchant-drilldown/quickstart.md` (click/filter parity, all merchants, channels, payment, VAT, discounts, empty state, missing-location case)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational â€” MVP
- **US2 (Phase 4)**: Depends on Foundational; needs the US1 panel to display merchants in UI
- **US3â€“US6 (Phases 5â€“8)**: Depend on Foundational; each extends the same fetcher/route/sheet incrementally (per-merchant views build on US2)
- **Polish (Phase 9)**: Depends on the stories intended for release (US1+US2+US3 minimum)

### User Story Dependencies

- **US1 (P1)**: After Foundational only
- **US2 (P1)**: After Foundational; renders inside the US1 panel
- **US3 (P1)**: After Foundational; location-level channels standalone, per-merchant channels need US2 rows
- **US4 (P2)**, **US5 (P2)**, **US6 (P2)**: After Foundational; location-level sections are independent of each other, per-merchant sections need US2 rows

### Within Each User Story

- Aggregation helper â†’ route field â†’ sheet UI
- Location-level figures before per-merchant figures
- Story complete and reconciled against the card total before moving on

### Parallel Opportunities

- T001â€“T002 parallel in Setup
- T003, T004 parallel in Foundational (T005â€“T007 follow)
- After US2 lands, the location-level halves of US4 (T019), US5 (T021), and US6 (T023) can be developed in parallel by different people, but they touch the same three files â€” merge sequentially to avoid conflicts
- T026 and T027 parallel in Polish

---

## Parallel Example: Foundational

```bash
# Independent files, safe to run together:
Task: "Add cosmeticsLkDrilldownQuerySchema to lib/validation.ts"
Task: "Create lib/cosmetics-lk-channel.ts source-to-channel classifier"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL â€” blocks all stories)
3. Complete Phase 3 (US1) then Phase 4 (US2)
4. **STOP and VALIDATE**: click Cosmetics.lk card, confirm all merchants and that totals match the card
5. Demo â€” this already answers "show all merchants who placed Cosmetics.lk orders"

### Incremental Delivery

1. Setup + Foundational â†’ endpoint ready
2. US1 â†’ panel opens with matching filter â†’ demo
3. US2 â†’ all merchants â†’ demo (MVP)
4. US3 â†’ website vs ERP1 â†’ demo
5. US4 / US5 / US6 â†’ payment, VAT, discounts â†’ demo each

---

## Notes

- No Prisma migration; constitution I/IV migration and prod-deploy steps do not apply to this feature
- Reuse existing definitions rather than re-deriving: eligibility (`dashboard-sales.ts`), merchant attribution (`merchant-groups.ts` + `merchant-dm-sales.ts`), payment labels (`payment-method-label.ts`), VAT category and location match (`merchant-dashboard-cosmetics-lk.ts`)
- Do **not** reuse `buildSourceBreakdown` in `dashboard-main-slot.tsx` for channels â€” it folds `erpnext` into Web
- `[P]` tasks = different files, no dependencies
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
- **T028 / T031 still open**: both need a running Cosmo instance with real Cosmetics.lk data (card-vs-panel reconciliation and quickstart UAT)
- `isCosmeticsLkLocationName` moved to `lib/cosmetics-lk-location.ts` so the client card can import it without pulling Prisma into the bundle; `lib/page-data/merchant-dashboard-cosmetics-lk.ts` re-exports it
