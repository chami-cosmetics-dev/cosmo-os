# Tasks: Returned Orders Dual ID + Waybill Single ID

**Input**: Design documents from `/specs/001-returned-orders-dual-ids/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Unit tests included (plan + constitution require Vitest coverage for reference helpers)

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Web app at repository root: `lib/`, `components/`, `app/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature docs and touch points before coding

- [x] T001 Review `specs/001-returned-orders-dual-ids/spec.md`, `plan.md`, and `contracts/returned-orders-reference.md` for final rules (returns dual: Shopify top / ERP below; waybill single source-primary)
- [x] T002 [P] Inventory current dual-ID call sites in `lib/fulfillment-order-reference.ts` and `components/molecules/fulfillment-order-reference.tsx` (do not change yet)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared source-primary resolver + tests that both stories depend on

**⚠️ CRITICAL**: No user story UI work should begin until this phase is complete

- [x] T003 Add `resolveSourcePrimaryOrderRef` in `lib/fulfillment-order-reference.ts` (ERP origin → SI; Shopify origin → Shopify order number; never `"A / B"`)
- [x] T004 [P] Add Vitest coverage in `lib/fulfillment-order-reference.test.ts` for source-primary cases (Shopify-with-SI, ERP-with-both, placeholder SI ignored, no dual join string)
- [x] T005 Confirm `formatInvoiceOrderReference` in `lib/fulfillment-order-reference.ts` still exposes `shopifyRef`, `erpRef`, `showBoth` for returned-orders dual UI (keep dual helpers available; do not remove)

**Checkpoint**: Foundation ready — US1 (returns dual) and US2 (waybill single) can proceed

---

## Phase 3: User Story 1 - Dual IDs in returned orders list (Priority: P1) 🎯 MVP

**Goal**: Returned orders list shows Shopify on top and ERP below (smaller) when both exist; single line otherwise

**Independent Test**: Open returned orders; dual-ref order shows Shopify above ERP; single-ref order shows one line only

### Implementation for User Story 1

- [x] T006 [US1] Extend `ReturnTrackingItem` in `lib/page-data/order-returns.ts` to expose `orderName`, `orderNumber`, and `sourceName` (keep existing `shopifyOrderId` / `erpnextInvoiceId`)
- [x] T007 [US1] Map those fields from the order select in `fetchReturnsTrackingData` in `lib/page-data/order-returns.ts` (select already includes needed order fields)
- [x] T008 [US1] Add a small `ReturnInvoiceRefs` (or equivalent) helper/component in `components/organisms/returned-orders-panel.tsx` using `formatInvoiceOrderReference` with Shopify on top and ERP below when `showBoth`
- [x] T009 [US1] Replace list invoice cell `{item.invoiceNo}` with dual stacked display in `components/organisms/returned-orders-panel.tsx`

**Checkpoint**: US1 independently testable in the returned orders table

---

## Phase 4: User Story 2 - Single order ID on waybills (Priority: P1)

**Goal**: Waybill / shared fulfillment order-reference display shows one source-primary ID only (no dual stack or `"A / B"`)

**Independent Test**: Waybill lookup/print for Shopify-origin order with both IDs shows Shopify only; ERP-origin shows SI only

### Implementation for User Story 2

- [x] T010 [US2] Change `formatFulfillmentOrderReferenceText` in `lib/fulfillment-order-reference.ts` to return `resolveSourcePrimaryOrderRef` (single ID)
- [x] T011 [US2] Update `components/molecules/fulfillment-order-reference.tsx` so `stack`, `labeled`, and `inline` variants render the source-primary single ID (no Shopify+ERP dual stack/labels for waybill surfaces)
- [x] T012 [P] [US2] Verify waybill consumer `components/organisms/fulfillment-pages/waybill-lookup.tsx` shows single ID via `FulfillmentOrderReference` (adjust props only if needed)
- [x] T013 [P] [US2] Spot-check print/dispatch panels that use `FulfillmentOrderReference` / `formatFulfillmentOrderReferenceText` still compile: `components/organisms/fulfillment-print-panel.tsx`, `components/organisms/fulfillment-pages/print.tsx` (if present)
- [x] T014 [US2] Extend `lib/fulfillment-order-reference.test.ts` asserting `formatFulfillmentOrderReferenceText` never returns a dual joined string

**Checkpoint**: US2 independently testable on waybill UI; returned-orders dual UI (US1) must remain unchanged

---

## Phase 5: User Story 3 - Search returned orders by either reference (Priority: P2)

**Goal**: Searching by Shopify or ERP ID finds the returned order row

**Independent Test**: Search returned orders by the non-primary/secondary ID; row still appears

### Implementation for User Story 3

- [x] T015 [US3] Extend client `filtered` search array in `components/organisms/returned-orders-panel.tsx` to include `orderName`, `orderNumber`, `shopifyOrderId`, `erpnextInvoiceId` (plus existing fields)
- [x] T016 [P] [US3] Extend export search filter in `app/api/admin/returns/export/route.ts` to include the same reference fields

**Checkpoint**: US3 independently testable via list search and export `?search=`

---

## Phase 6: User Story 4 - Dual ID in selected return summary (Priority: P3)

**Goal**: Return Action card description uses the same Shopify-over-ERP stacked display as the list

**Independent Test**: Select a dual-ref return; summary matches list stacking

### Implementation for User Story 4

- [x] T017 [US4] Update Return Action `CardDescription` in `components/organisms/returned-orders-panel.tsx` to reuse the same dual-ID display helper as the list (Shopify top, ERP below)

**Checkpoint**: US4 matches US1 display rules in the detail panel

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and safety checks across stories

- [x] T018 Run `npm test` and fix any failures related to `lib/fulfillment-order-reference.test.ts`
- [x] T019 [P] Manually walk `specs/001-returned-orders-dual-ids/quickstart.md` UAT checklist (returns dual + waybill single) — **user UAT remaining in browser**
- [x] T020 Confirm no Prisma schema/migration changes were introduced for this feature
- [x] T021 Confirm returned-orders dual UI still stacks Shopify above ERP after waybill single-ID changes (no regression) — dual path uses `formatInvoiceOrderReference` / `ReturnInvoiceRefs`; waybill uses `resolveSourcePrimaryOrderRef`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both P1; can proceed after Foundational (prefer US1 first as MVP, then US2)
- **US3 (Phase 5)**: Depends on US1 data fields (T006/T007) being present
- **US4 (Phase 6)**: Depends on US1 dual display helper (T008)
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2
- **US2 (P1)**: After Foundational — must not break US1 dual UI
- **US3 (P2)**: Needs US1 page-data field exposure
- **US4 (P3)**: Needs US1 dual display helper

### Parallel Opportunities

- T001 / T002 in Setup
- T004 parallel with review of T005 after T003 exists
- After Foundational: US1 (T006–T009) and US2 (T010–T014) can be split across people if careful about shared `fulfillment-order-reference.ts`
- T012 / T013 after T011
- T015 / T016 in US3

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1–2 (Setup + Foundational)
2. Complete Phase 3 (US1 dual IDs on returned orders list)
3. **STOP and VALIDATE** on returned orders page
4. Then US2 waybill single ID

### Incremental Delivery

1. Setup + Foundational → helpers ready
2. US1 → dual IDs on returns list (MVP)
3. US2 → waybill single ID
4. US3 → search by either ID
5. US4 → selected summary dual display
6. Polish / quickstart UAT

### Suggested MVP scope

**US1 only** (T001–T009): returned orders dual stacked IDs. Waybill single ID (US2) is also P1 — deliver next in the same release if possible.

---

## Notes

- Do **not** create PRs or push unless the user asks (manual git/PR)
- Do **not** change Prisma schema
- Returned orders = dual (Shopify top, ERP below); waybill = single source-primary
- Bulk-return picker remains out of scope
- Commit locally only when the user requests
