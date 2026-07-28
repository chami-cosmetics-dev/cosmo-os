# Tasks: Order Number, Search, Rider Performance & Cash Tender

**Input**: Design documents from `/specs/025-order-search-rider-incentives/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Vitest for tender/change math, incentive aggregation, order display helper; `npm run mobile:typecheck`.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js app at repository root (`app/`, `components/`, `lib/`) + `mobile/rider-app/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and confirm touch points

- [x] T001 Create/switch git branch `025-order-search-rider-incentives` from current working base
- [x] T002 [P] Confirm `.gitignore` covers `.env*` / `node_modules/` (no new ignore files needed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers + schema for tender fields used by later stories

**⚠️ CRITICAL**: US3 needs migration before payment API work; US1/US2 can start after helpers.

- [x] T003 Add order display helper `formatBusinessOrderNumber` / prefer-`orderNumber` in `lib/order-display-label.ts` (wrap or replace usages of `orderDisplayLabel` pattern)
- [x] T004 [P] Add Vitest for display helper in `lib/order-display-label.test.ts`
- [x] T005 Add tender helpers `cashDueFromPayment`, `computeChangeAmount` in `lib/mobile/payment-tender.ts`
- [x] T006 [P] Add Vitest for tender helpers in `lib/mobile/payment-tender.test.ts`
- [x] T007 Add `customerGaveAmount` and `changeAmount` to `DeliveryPayment` in `prisma/schema.prisma` and create migration via `npm run db:migrate:create` (name: `add_delivery_payment_tender_fields`)
- [x] T008 Add rider incentive aggregation helper in `lib/rider-incentive.ts` (sum `totalShipping` for completed tasks in range, exclude voided)
- [x] T009 [P] Add Vitest for incentive helper in `lib/rider-incentive.test.ts`

**Checkpoint**: Helpers + schema ready

---

## Phase 3: User Story 1 - Order number visible everywhere (Priority: P1) 🎯 MVP

**Goal**: Show business order number on primary web and mobile order surfaces.

**Independent Test**: Orders list, fulfillment row, rider ops, mobile cards show order number / fallback.

### Implementation for User Story 1

- [x] T010 [US1] Use display helper in `components/organisms/orders-panel.tsx` primary label
- [x] T011 [P] [US1] Ensure `lib/page-data/riders.ts` / `rider-operations-panel.tsx` show `orderNumber` prominently
- [x] T012 [P] [US1] Expose and render `orderNumber` on mobile: `lib/mobile/dto.ts`, `mobile/rider-app/src/types/delivery.ts`, `delivery-card.tsx`, delivery detail, cash list rows
- [x] T013 [US1] Spot-check fulfillment reference helpers (`lib/fulfillment-order-reference.ts` / bulk panels) so order number is not dropped when present

**Checkpoint**: US1 independently testable

---

## Phase 4: User Story 2 - Search on main page (Priority: P1)

**Goal**: Dashboard home quick-search by order number, phone, customer name.

**Independent Test**: From `/dashboard`, search known order → open correct detail.

### Implementation for User Story 2

- [x] T014 [US2] Implement `GET /api/admin/orders/quick-search/route.ts` per `contracts/admin-orders-quick-search.md` (`orders.read`, min q length, limit)
- [x] T015 [US2] Extend search matching (reuse `lib/page-data/orders.ts` patterns + customer name) in shared helper if needed
- [x] T016 [US2] Add search UI on `app/(dashboard)/dashboard/page.tsx` (or shell component) with results list linking to order detail

**Checkpoint**: US2 independently testable

---

## Phase 5: User Story 3 - Cash tender and balance (Priority: P1)

**Goal**: Rider enters customer gave; show change; persist and show on Cosmo OS order.

**Independent Test**: COD 3500 / gave 5000 → balance 1500 on mobile and web.

### Implementation for User Story 3

- [x] T017 [US3] Extend `riderPaymentSchema` in `lib/mobile/validation.ts` for `customerGaveAmount` / `changeAmount`
- [x] T018 [US3] Persist tender fields in `app/api/mobile/v1/deliveries/[id]/payment/route.ts`; include in DTO/`cash-summary` as needed
- [x] T019 [US3] Mobile payment UI: customer-gave input + live balance in `mobile/rider-app/src/components/payment-form.tsx` + hooks/actions
- [x] T020 [US3] Show tender/change on web `components/organisms/order-fulfillment-detail.tsx` and admin order API payment payload

**Checkpoint**: US3 independently testable

---

## Phase 6: User Story 4 - Rider performance dashboard (Priority: P2)

**Goal**: Ops dashboard of completed counts + shipping incentives per rider/date range.

**Independent Test**: Complete delivery with shipping 400 → rider incentive +400 for today.

### Implementation for User Story 4

- [x] T021 [US4] Implement `GET /api/admin/riders/performance/route.ts` per `contracts/admin-riders-performance.md` (`staff.read`)
- [x] T022 [US4] Add page `app/(dashboard)/dashboard/riders/performance/page.tsx` + `components/organisms/rider-performance-panel.tsx`
- [x] T023 [US4] Link from riders page / sidebar to performance view

**Checkpoint**: US4 independently testable

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T024 Run `npm test` for new unit tests and `npm run mobile:typecheck`
- [x] T025 Mark quickstart scenarios reviewed in `specs/025-order-search-rider-incentives/quickstart.md` notes (manual)

---

## Dependencies

- Phase 2 before US3 schema usage; US1/US2 can proceed after T003–T004
- US4 depends on T008 incentive helper
- Recommended MVP order: US1 → US2 → US3 → US4

## Parallel opportunities

- T004/T006/T009 tests in parallel after helpers
- T010–T012 UI surfaces in parallel after display helper
- T021–T022 after T008

## Implementation strategy

1. Ship US1 (order number) as first visible win
2. US2 dashboard search
3. US3 tender (migration required)
4. US4 performance dashboard
