# Tasks: Rider Cash Handover and Invoice Close

**Input**: Design documents from `/specs/064-rider-handover-invoice/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rider-handover.md, quickstart.md

**Tests**: Plan and quickstart require Vitest on company cash grouping, the duplicate-receipt rule, the invoice-close gate, and the incentive gate. Those unit tasks are included. Not a full TDD-first cycle.

**Organization**: Phases follow spec user stories US1–US4. Rider performance page stays. Two new permissions. One new Prisma model.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US4 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `lib/rider-handover.ts`, `lib/rbac.ts`, `prisma/schema.prisma`, `app/api/admin/riders/handover/`, `components/organisms/rider-handover-panel.tsx`, `lib/rider-incentive.ts`, `app/api/mobile/v1/me/performance/route.ts`

---

## Phase 1: Setup

**Purpose**: Confirm this feature extends Rider performance. No new app or package.

- [X] T001 Confirm `specs/064-rider-handover-invoice/` contains plan.md, spec.md, research.md, data-model.md, contracts/rider-handover.md, and quickstart.md, and that `.specify/feature.json` `feature_directory` is `specs/064-rider-handover-invoice`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Permissions, receipt table, and the shared delivery load every handover route uses. **Blocks all user stories.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add `riders.handover.summary` and `riders.handover.receive` to `DEFAULT_PERMISSIONS` in `lib/rbac.ts`. Descriptions: summary generates and prints the company cash slip; receive marks cash received, loads orders, sets the ERP mode, and marks invoices completed. Add both keys only to the `finance` role `permissionKeys` list. Do not add them to `manager` or `viewer`. Leave `super_admin` and `admin` on `ADMIN_PERMISSION_KEYS` so they receive the new keys through the existing union
- [X] T003 [P] Add model `RiderFinanceCashReceipt` in `prisma/schema.prisma` with the fields, indexes, and relations in `specs/064-rider-handover-invoice/data-model.md`. Add back-relations on `Company` and `User` (`rider` and `receivedBy` are both `User`). Do not change `RiderCashHandover`, `DeliveryPayment`, or `DeliveryPaymentLine`
- [X] T004 Create the migration with `npm run db:migrate:create` for `RiderFinanceCashReceipt` and run `npm run db:generate`. Never `prisma migrate dev` or `npm run db:push` against vault, cosmo-dev, or cosmo-prod. Do not run `npm run db:deploy:all` unless the user explicitly confirms
- [X] T005 Add `loadRiderHandoverDeliveries` in `lib/rider-handover.ts`. Input: OS `companyId`, `riderId`, Colombo `from`/`to` (`YYYY-MM-DD` via `parseAppCalendarDayStart` / `parseAppCalendarDayEnd` in `lib/format-datetime.ts`). Reject inverted ranges. Rider must be `employeeProfile.isRider` in that company, else a not-found result. Load `RiderDeliveryTask` rows with `status = completed`, `completedAt` in range, `order.companyId` match. Include order number, `paymentGatewayPrimary`, `fulfillmentStage`, `invoiceCompleteAt`, `companyLocation.erpnextCompany`, `companyLocation.name`, `companyLocation.erpnextInstance` mop fields, and `deliveryPayment` plus lines. Do not filter on `cashHandoverId`. Do not call ERP

**Checkpoint**: New permission keys exist. Receipt table migrates on a non-prod database. The loader returns that rider’s completed deliveries for a Colombo range, including zero-cash orders. Rider-app `POST /api/mobile/v1/handovers` is unchanged.

---

## Phase 3: User Story 1 — Print a company-wise cash handover slip (Priority: P1) 🎯 MVP

**Goal**: A user with `riders.handover.summary` picks one rider and the page date range and gets company cash totals plus a full total, then prints a slip with signature lines. No order list.

**Independent Test**: Summary-only user, one rider, one day, two ERP companies, mix of COD and card or bank. Company cash lines sum to the full total. Card and bank amounts are absent. Split COD+card counts only COD. Print shows rider name, dates, totals, **Handover by** with the rider name, and **Cash collected**, each with a signature line. A rider with no completions prints zeros. A user without the summary permission cannot generate or print.

### Tests for User Story 1

- [X] T006 [P] [US1] Add Vitest cases in `lib/rider-handover.test.ts` for `groupCashByErpCompany`: group by trimmed `erpnextCompany`, fall back to location name, drop companies whose cash is 0, sort by name, sum lines to `fullTotal`; COD counts, card and bank do not, a split payment counts only the COD part via `cashAmountFromDeliveryPayment` in `lib/mobile/payment-lines.ts`; missing delivery payment contributes 0

### Implementation for User Story 1

- [X] T007 [US1] Implement `groupCashByErpCompany` in `lib/rider-handover.ts` so the cases in `lib/rider-handover.test.ts` pass. Cash amount must call `cashAmountFromDeliveryPayment`. Do not use order `totalPrice`
- [X] T008 [US1] Add `GET` `app/api/admin/riders/handover/summary/route.ts` per `specs/064-rider-handover-invoice/contracts/rider-handover.md`. `requirePermission("riders.handover.summary")`. Zod query, `cuidSchema` for `riderId`. `export const dynamic = "force-dynamic"`. Use `loadRiderHandoverDeliveries` and `groupCashByErpCompany`. Response has `companies` and `fullTotal` and no `orders` array. Include `latestReceipt` (newest `RiderFinanceCashReceipt` for that company, rider, and exact dates, or `null`). 400 on bad dates, 404 on unknown rider
- [X] T009 [US1] In `app/(dashboard)/dashboard/riders/performance/page.tsx`, keep the `riders.performance.read` gate. Pass `canHandoverSummary` and `canHandoverReceive` from `hasPermission`, and when either is true pass `{ id, name, knownName }[]` from `fetchRiderRoster` in `lib/page-data/riders.ts` into `components/organisms/rider-performance-panel.tsx`. Render `components/organisms/rider-handover-panel.tsx` under the existing from/to inputs, sharing those dates. Summary permission shows one rider select, Generate, and Print. Generate calls the summary GET. Print uses `window.print()` and `@media print` so only the slip shows: rider name, from–to, company lines, full total, **Handover by** plus rider name and a signature line, **Cash collected** and a signature line. No order table. Hide the panel when both flags are false. Follow `action-loading-ux`: `busyKey`, `Loader2`, disable peers while busy, `notify` for errors

**Checkpoint**: Summary-only user can print the slip. They cannot load orders, mark cash received, or mark invoices completed.

---

## Phase 4: User Story 2 — Record that finance received the cash (Priority: P1)

**Goal**: A user with `riders.handover.receive` stores who accepted the slip, when, and the company totals. A second mark for the same rider and dates asks for confirm before inserting another row.

**Independent Test**: Mark received for rider R and a known range. The row stores receiver, time, and the server-computed totals. Marking again without confirm returns 409 and does not insert. Confirm inserts a second row. Summary-only user is denied. Printing does not insert a row.

### Tests for User Story 2

- [X] T010 [P] [US2] Add Vitest cases in `lib/rider-handover.test.ts` for `receiptDuplicateDecision`: no prior row → create; prior row and `confirmDuplicate` false → reject with that row; prior row and `confirmDuplicate` true → create another. Do not compare client totals

### Implementation for User Story 2

- [X] T011 [US2] Implement `receiptDuplicateDecision` in `lib/rider-handover.ts` so the cases in `lib/rider-handover.test.ts` pass
- [X] T012 [US2] Add `POST` `app/api/admin/riders/handover/receipts/route.ts` per `specs/064-rider-handover-invoice/contracts/rider-handover.md`. `requirePermission("riders.handover.receive")`. Zod body (`riderId`, `from`, `to`, optional `confirmDuplicate`). Recompute cash with `loadRiderHandoverDeliveries` and `groupCashByErpCompany`. Apply `receiptDuplicateDecision`. Insert `RiderFinanceCashReceipt` with server totals only. 201 on create, 409 with `latestReceipt` when rejected, 400 on bad dates, 404 on unknown rider
- [X] T013 [US2] In `components/organisms/rider-handover-panel.tsx`, when `canHandoverReceive` is true, show **Mark money received**. On 409, `notify` and ask for an explicit confirm, then resend with `confirmDuplicate: true`. Show `latestReceipt` receiver, time, and totals from the summary GET. Summary-only users do not see this button. Use the same `busyKey` / `notify` rules as T009

**Checkpoint**: Receive user can record cash for a rider and range. Summary print still has no order list. A cancelled confirm does not add a row.

---

## Phase 5: User Story 3 — Correct payment type, close invoices, and create payment entries (Priority: P1)

**Goal**: The receive user loads every delivery-complete order for that rider and range, picks an ERP mode per order, and **Mark invoices completed** closes eligible orders only after the payment entry succeeds.

**Independent Test**: Load a rider-day with a cash order, a cash order to switch to card or bank, and an already invoice-closed order. Modes match that order’s ERP instance. The switched order’s payment entry uses the selected mode. The already closed order is not submitted again. An order with no sales invoice stays not invoice complete, shows the reason, and does not roll back the orders that succeeded. More than 80 eligible orders returns 400 and stamps nothing. Summary-only user gets 403 on the orders and invoice-complete routes. Cash receipt is not required before close.

### Tests for User Story 3

- [X] T014 [P] [US3] Add Vitest cases in `lib/rider-handover.test.ts`: `isInvoiceClosed` is true when `invoiceCompleteAt` is set or `fulfillmentStage` is `invoice_complete`; `shouldCommitInvoiceComplete` is true only for payment-entry outcomes `created` and `already_paid`, and false for an error or skip

### Implementation for User Story 3

- [X] T015 [US3] Implement `isInvoiceClosed` and `shouldCommitInvoiceComplete` in `lib/rider-handover.ts` so the cases in `lib/rider-handover.test.ts` pass
- [X] T016 [P] [US3] Add `commitOnlyWhenPaymentEntrySucceeds` to `markOrderInvoiceComplete` in `lib/mark-order-invoice-complete.ts`. When true, run the existing payment-entry attempt before any stage update, and call the stage transaction only when `shouldCommitInvoiceComplete` is true. On failure return `{ success: false, ref, error }` and leave `fulfillmentStage` and `invoiceCompleteAt` unchanged. When the flag is omitted, keep today’s stamp-then-`erpPeError` behavior for current callers
- [X] T017 [P] [US3] Add `GET` `app/api/admin/riders/handover/orders/route.ts` per `specs/064-rider-handover-invoice/contracts/rider-handover.md`. `requirePermission("riders.handover.receive")` (summary permission alone is 403). Same query rules as the summary route. Return every loaded delivery, including invoice-closed and zero-cash rows. `modes` from `listErpPaymentModesFromInstance` in `lib/erp-payment-modes.ts` on that order’s instance only. `selectedMop` from `resolveOrderPaymentMop` in `lib/erpnext-sync.ts` when that name is in `modes`, else `null`. `eligible` false when invoice-closed, stage is not `delivery_complete`, `getFinancePaymentApprovalBlockReason` in `lib/approval-workflow.ts` returns a reason, or `modes` is empty. Put that reason in `blockReason`
- [X] T018 [US3] Add `POST` `app/api/admin/riders/handover/invoice-complete/route.ts` per `specs/064-rider-handover-invoice/contracts/rider-handover.md`. `requirePermission("riders.handover.receive")`. `export const maxDuration = 300`. Body: `riderId`, `from`, `to`, `modes: [{ orderId, modeOfPayment }]`. Server rebuilds the eligible set (do not trust an include-list). If that count is above 80, return 400 `{ "error": "Too many orders for one close. Shorten the date range." }` and stamp nothing. Otherwise call `markOrderInvoiceComplete` per eligible order with `commitOnlyWhenPaymentEntrySucceeds: true`, `bulk: true`, and `modeOfPayment` from `modes` when present and allowed by `isAllowedCompanyErpPaymentMode` for that order’s instance; else the pre-filled `selectedMop` when allowed; else a per-order failure. One failure does not undo earlier successes in the run. Omit already invoice-closed orders from `results`. Ignore mode entries whose `orderId` is outside the rider range
- [X] T019 [US3] In `components/organisms/rider-handover-panel.tsx`, when `canHandoverReceive` is true, add **Load orders**, a table (order number, company, cash, current payment, invoice-closed, block reason), a mode `<select>` per open order fed by that row’s `modes`, and **Mark invoices completed**. Send overrides in `modes`. Show each `results` row with `notify` (success count, and the error text for failures). Do not add checkboxes. Summary-only users never call this GET or POST. Keep `busyKey` / `notify` from T009

**Checkpoint**: Receive user can correct a mode and close the range. Failed payment entries stay delivery complete. Already closed orders gain no second payment entry.

---

## Phase 6: User Story 4 — Incentive only after delivery and invoice are both complete (Priority: P1)

**Goal**: Staff Rider performance and the rider app add a rider charge only when the delivery task is complete and the order is invoice-closed. The day stays `completedAt`. Delivery-complete counts still include invoices that are open.

**Independent Test**: A delivery-complete order that is not invoice-closed counts as a completion and adds 0 incentive on the staff page and on `GET /api/mobile/v1/me/performance`. After invoice close, that same delivery day includes the rider charge and both views match. A prepaid order already invoice-closed earns the charge when the rider completes delivery. Void, cancelled, refunded, and unmatched-label rules stay as they are.

### Tests for User Story 4

- [X] T020 [P] [US4] Add Vitest cases in `lib/rider-incentive.test.ts`: `aggregateRiderIncentives` increments `completedCount` and adds 0 incentive when `invoiceClosed` is false; adds the rider charge when `invoiceClosed` is true; still skips void, cancelled, and refunded; still increments `unmatchedCount` when `matched` is false and the order is not `excludedFromIncentive`, including when `invoiceClosed` is false

### Implementation for User Story 4

- [X] T021 [US4] Add `invoiceClosed` to `RiderIncentiveInputRow` and honor it in `aggregateRiderIncentives` in `lib/rider-incentive.ts` so the cases in `lib/rider-incentive.test.ts` pass. Do not change `isIncentiveEligibleOrder` or the rider-charge math in `lib/rider-incentive-resolve.ts`
- [X] T022 [P] [US4] In `app/api/admin/riders/performance/route.ts`, select `invoiceCompleteAt` and `fulfillmentStage`, set `invoiceClosed` with `isInvoiceClosed` from `lib/rider-handover.ts`, and pass it into `aggregateRiderIncentives`. Keep unmatched-order listing on delivery-complete tasks that are not invoice-closed. Do not change the date filter
- [X] T023 [P] [US4] In `app/api/mobile/v1/me/performance/route.ts`, select `invoiceCompleteAt` and `fulfillmentStage` and add the rider charge only when `isInvoiceClosed` is true (today and the pay period). Keep `completedCount` and `todayCompletedCount` as delivery completions. A line’s `incentiveAmount` is `0.00` until the invoice is closed, then the existing `incentiveForOrder` amount. Do not change the request query

**Checkpoint**: Incentive totals on the staff page and the rider app ignore delivery-complete orders whose invoices are still open. Completion counts still include those orders.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Prove the unit checks and that rider-app cash handover was not rewritten

- [X] T024 Run `npm test -- lib/rider-handover.test.ts lib/rider-incentive.test.ts` and confirm `app/api/mobile/v1/handovers/route.ts`, `lib/mobile/reconciliation.ts`, and `RiderCashHandover` in `prisma/schema.prisma` have no edits in the diff
- [X] T025 [P] Lint `lib/rider-handover.ts`, `lib/rider-handover.test.ts`, `lib/rider-incentive.ts`, `lib/rider-incentive.test.ts`, `lib/mark-order-invoice-complete.ts`, `lib/rbac.ts`, `app/api/admin/riders/handover/summary/route.ts`, `app/api/admin/riders/handover/orders/route.ts`, `app/api/admin/riders/handover/receipts/route.ts`, `app/api/admin/riders/handover/invoice-complete/route.ts`, `app/api/admin/riders/performance/route.ts`, `app/api/mobile/v1/me/performance/route.ts`, `components/organisms/rider-handover-panel.tsx`, and `components/organisms/rider-performance-panel.tsx`
- [ ] T026 Walk the manual scenarios in `specs/064-rider-handover-invoice/quickstart.md` (slip totals, print signature lines, permission denials, duplicate receipt confirm, mode change before payment entry, partial close failure, incentive 0 until invoice close). If `mobile/rider-app` performance types changed, run `npm run mobile:typecheck`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational
- **Polish (Phase 7)**: Depends on the stories you intend to ship

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational. No dependency on US2–US4. MVP
- **User Story 2 (P1)**: After US1. Uses the same summary totals and `components/organisms/rider-handover-panel.tsx`
- **User Story 3 (P1)**: After US2 so the receive permission and panel already exist. Invoice close does not require a receipt row
- **User Story 4 (P1)**: After Foundational (`isInvoiceClosed` is added in US3). If US4 starts before US3, implement `isInvoiceClosed` in `lib/rider-handover.ts` as part of T021 instead of importing it. Staff and rider-app files do not overlap US1–US3 except that shared helper

### Within Each User Story

- Test file may be written before the helper it names
- Helper before the route that calls it
- Route before the panel calls it
- Do not start the next story’s edit to `lib/rider-handover.ts` or `components/organisms/rider-handover-panel.tsx` until the current story’s checkpoint passes

### Parallel Opportunities

- T002 and T003 are different files and can run together. T005 can run with them (loader does not need the receipt model). T004 waits on T003
- T006, T010, T014, and T020 touch test files only. T006/T010/T014 share `lib/rider-handover.test.ts`, so do not run those three at once. T020 is a different file and can run beside US1–US3 work
- T016 and T017 are different files and can run together after T015
- T022 and T023 are different files and can run together after T021
- US4 can proceed beside US1 once Foundational is done, as long as `isInvoiceClosed` exists before T022

---

## Parallel Example: User Story 1

```text
# After T002–T005, write the failing cash-group cases (different file from the route):
T006 Vitest in lib/rider-handover.test.ts

# Then stay sequential on the shared helper, route, and panel:
T007 groupCashByErpCompany in lib/rider-handover.ts
T008 GET app/api/admin/riders/handover/summary/route.ts
T009 Slip UI in components/organisms/rider-handover-panel.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Finish Phase 1 and Phase 2
2. Finish Phase 3 (printable company cash slip)
3. Stop and check the independent test (company lines, full total, no order list, signature lines, summary permission)
4. Demo that slice before cash receipt, invoice close, or the incentive gate

### Incremental Delivery

1. Setup + Foundational → permissions, receipt table, delivery loader
2. US1 → print slip (MVP)
3. US2 → mark money received with confirm
4. US3 → load orders, change ERP mode, mark invoices completed only after the payment entry succeeds
5. US4 → incentive waits for invoice close; completion counts stay
6. Polish → `npm test` and `specs/064-rider-handover-invoice/quickstart.md`

### Parallel Team Strategy

One implementer for US1–US3 (`lib/rider-handover.ts` and `components/organisms/rider-handover-panel.tsx` overlap). A second person can take US4 after Foundational if `isInvoiceClosed` is in place.

---

## Notes

- Checkbox, ID, optional `[P]`, story label on story phases only, file path on every task
- Do not rewrite `app/api/mobile/v1/handovers/route.ts` or location-based `RiderCashHandoverItem`
- Do not stamp invoice complete when the new flag is set and the payment entry fails
- Do not add a checkbox picker, signature image upload, or Vault OS work
- Cap one invoice-close request at 80 eligible orders
- Commit after each phase checkpoint
- Schema deploy to vault, cosmo-dev, and cosmo-prod only with an explicit user confirm (`npm run db:deploy:all`)
