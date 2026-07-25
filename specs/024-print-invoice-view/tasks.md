# Tasks: Print Invoice Without Marking Printed

**Input**: Design documents from `/specs/024-print-invoice-view/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Plan calls for Vitest on the print-mode query helper only; no full TDD suite requested in spec.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js app at repository root (`app/`, `components/`, `lib/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm scope and touch points before coding

- [x] T001 Review [contracts/invoice-print-modes.md](./contracts/invoice-print-modes.md) and list call sites of `/invoice?print=1` in `components/organisms/order-invoice-view-modal.tsx`, `components/organisms/order-fulfillment-detail.tsx`, `components/organisms/fulfillment-print-panel.tsx`, and `app/api/admin/orders/bulk-print/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared view-only vs formal print mode parsing used by the invoice API

**⚠️ CRITICAL**: User story UI work can start after T002–T004; modal must use the same query contract.

- [x] T002 Create pure print-mode helper `resolveInvoicePrintMode(searchParams)` in `lib/invoice-print-mode.ts` returning `{ mode: "view" | "preview" | "formal"; shouldIncrementPrint: boolean; autoPrint: boolean }` per [contracts/invoice-print-modes.md](./contracts/invoice-print-modes.md) (`preview=1` / `print=preview` → preview; `print=1`/`true` → formal; else view)
- [x] T003 [P] Add Vitest coverage for preview/formal/view parsing in `lib/invoice-print-mode.test.ts`
- [x] T004 Wire helper into `app/api/admin/orders/[id]/invoice/route.ts`: use `shouldIncrementPrint` for mutate + `fulfillment.order_print.print` auth; use `autoPrint` for template `print.autoPrint`; keep formal `?print=1` behavior unchanged

**Checkpoint**: `GET .../invoice?preview=1` auto-prints HTML without mutating `printCount` / stage; `?print=1` still mutates

---

## Phase 3: User Story 1 - Print invoice without advancing workflow (Priority: P1) 🎯 MVP

**Goal**: From the order details / invoice timeline modal, Print Invoice opens a printable invoice and never marks the order printed (unprinted, already-printed, and cancelled).

**Independent Test**: On an unprinted order, use Print Invoice, then confirm Print timeline step still incomplete and `printCount` unchanged (quickstart scenarios 1–3).

### Implementation for User Story 1

- [x] T005 [US1] Add `canViewInvoicePrint` (or reuse `fulfillment.order_print.read`) to `FulfillmentPermissions` in `lib/fulfillment-permissions.ts` and default in `components/contexts/fulfillment-permissions-context.tsx`
- [x] T006 [US1] Pass the new read flag into `OrderInvoiceViewModal` from `components/organisms/orders-panel.tsx` (and any other modal callers that currently pass only `canPrint`)
- [x] T007 [US1] In `components/organisms/order-invoice-view-modal.tsx`, change `handlePrint` to open `/api/admin/orders/{id}/invoice?preview=1` (not `print=1`) and remove the post-print `onRefresh` timeout that existed only to reload mutated print fields
- [x] T008 [US1] In `components/organisms/order-invoice-view-modal.tsx`, show **Print Invoice** when `canViewInvoicePrint` (or equivalent) is true — remove the `printCount > 0` gate so unprinted and cancelled orders can print
- [x] T009 [US1] Audit `components/organisms/order-fulfillment-detail.tsx`: if its print control is view-only details (not formal queue print), switch it to `?preview=1`; leave `components/organisms/fulfillment-print-panel.tsx` and `app/api/admin/orders/bulk-print/route.ts` on `?print=1`

**Checkpoint**: US1 independently testable — view-only Print Invoice does not advance Print workflow; formal print path still marks printed

---

## Phase 4: User Story 2 - Find Print Invoice from order details (Priority: P2)

**Goal**: Staff can discover Print Invoice on the order details view without confusing it with the formal Print timeline step.

**Independent Test**: Open any order details modal, locate Print Invoice in the actions area near View JSON without navigating away; label does not imply completing the Print timeline step.

### Implementation for User Story 2

- [x] T010 [US2] Keep **Print Invoice** in the primary actions row of `components/organisms/order-invoice-view-modal.tsx` (near View JSON); ensure label stays “Print Invoice” and is distinct from timeline step “Print” / “Printed”
- [x] T011 [P] [US2] If needed for SC-004 clarity, add brief non-blocking helper text or `title`/`aria-label` on the button in `components/organisms/order-invoice-view-modal.tsx` stating it does not mark the order printed (no toast claiming “printed”)

**Checkpoint**: US1 + US2 — action is obvious and clearly non-mutating

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify formal path, permissions, and quickstart

- [x] T012 Confirm fulfillment Print queue formal flow still uses `?print=1` in `components/organisms/fulfillment-print-panel.tsx` and `components/organisms/fulfillment-pages/print.tsx` (FR-008)
- [x] T013 [P] Run `npm test` for `lib/invoice-print-mode.test.ts` (and related) and fix failures
- [ ] T014 Execute manual checks in [quickstart.md](./quickstart.md) scenarios 1–6; note any 409 finance-block cases without changing order status

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 — **blocks** correct modal URL wiring
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T004 especially)
- **User Story 2 (Phase 4)**: Can follow US1 in the same modal file; depends on T007–T008 for a working button
- **Polish (Phase 5)**: After US1 (MVP) at minimum; ideally after US2

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2
- **User Story 2 (P2)**: Builds on US1 button in the same modal (placement/label polish); independently testable for discoverability once button exists

### Within Each User Story

- Helper + API before modal URL change
- Permission flag before changing button visibility gate
- Formal-path audit after view-only wiring

### Parallel Opportunities

- T003 can run in parallel with drafting T002 once the contract table is agreed
- T005 can be prepared while T004 is in progress (different files)
- T011 is parallelizable polish once the button exists
- T013 can run while manual UAT (T014) is prepared

---

## Parallel Example: User Story 1

```bash
# After foundational helper exists:
Task: "Add canViewInvoicePrint in lib/fulfillment-permissions.ts + context default"
Task: "Wire preview URL + remove printCount gate in order-invoice-view-modal.tsx"
# Then sequentially:
Task: "Pass flag from orders-panel.tsx"
Task: "Audit order-fulfillment-detail.tsx vs formal print panels"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1–2 (helper + invoice route)
2. Complete Phase 3 (modal opens `?preview=1`, visible for unprinted orders)
3. **STOP and VALIDATE** quickstart scenarios 1–3 and 5
4. Demo / ship MVP if needed

### Incremental Delivery

1. Setup + Foundational → preview mode works via URL alone
2. US1 → order details Print Invoice is safe and available
3. US2 → discoverability / label clarity
4. Polish → formal path + automated + manual checks

### Parallel Team Strategy

- Dev A: T002–T004 (API/helper)
- Dev B: T005–T006 (permissions plumbing) after contract agreed
- Then one owner finishes T007–T009 in the modal to avoid merge conflicts

---

## Notes

- [P] = different files, no incomplete-task dependencies
- No migrations (data-model.md)
- Do not change formal `?print=1` semantics for fulfillment queue / bulk print
- Spec did not request broad E2E tests; only helper Vitest (T003/T013)
- Suggested MVP: Phase 1–3 (through T009)

---

## Task Summary

| Story | Tasks | Count |
|-------|-------|-------|
| Setup | T001 | 1 |
| Foundational | T002–T004 | 3 |
| US1 (P1) | T005–T009 | 5 |
| US2 (P2) | T010–T011 | 2 |
| Polish | T012–T014 | 3 |
| **Total** | T001–T014 | **14** |
