# Research: Rider Cash Handover and Invoice Close

**Feature**: `064-rider-handover-invoice`  
**Date**: 2026-10-08

## 1. What “company” means on the slip

**Decision**: Group cash by `CompanyLocation.erpnextCompany` (trimmed). If that field is blank, use the location name. One line per distinct name. Full total is the sum of those lines.

**Rationale**: Cosmo orders already sit on a location, and finance reports (POS orders, order reports) treat `erpnextCompany` as the books the cash belongs to. Several locations can share one ERP company. The spec asks for company totals, not a line per shop.

**Alternatives considered**:

- OS `Company` — one tenant per deployment. Every order would collapse to a single line. Rejected.
- `companyLocation` — this is what rider-app `RiderCashHandoverItem` uses. That is a shop/location split, not the company split the spec asks for. Rejected for this slip. Do not change the rider-app handover.

## 2. Which amount is cash to hand over

**Decision**: Reuse `cashAmountFromDeliveryPayment`. COD lines count. Card, bank transfer, and already-paid lines do not. A split payment contributes only its COD amount. No delivery payment, or a non-COD header with no lines, contributes 0.

**Rationale**: The helper already defines cash for rider reconciliation. The slip is physical cash. Changing the ERP mode later for the payment entry does not rewrite collected COD.

**Alternatives considered**:

- Order `totalPrice` when the gateway says cash — invents cash the rider may not hold. Rejected.
- Exclude payments already linked to `RiderCashHandover` — a reprint after the rider submitted in the app would show zero. The slip is a period report, so include every delivery-complete order in the range.

## 3. Which orders are in the period

**Decision**: `RiderDeliveryTask.status = completed` and `completedAt` inside the Asia/Colombo from–to range, `order.companyId` = the signed-in user’s company, one `riderId`. Same day bounds as `GET /api/admin/riders/performance` (`parseAppCalendarDayStart` / `parseAppCalendarDayEnd`). A single day is from = to.

**Rationale**: Performance already attributes the delivery day from the task, including app and link completion. `DeliveryPayment.collectedAt` can differ and misses deliveries with no payment row.

**Alternatives considered**:

- `Order.deliveryCompleteAt` — not set on every rider completion path the performance page already trusts. Rejected.
- `fulfillmentStage = delivery_complete` alone — invoice close moves the stage to `invoice_complete`, so a later reprint would drop those orders. The task stays completed. Use the task.

## 4. Where to store “money received”

**Decision**: New model `RiderFinanceCashReceipt`. One row per accepted mark. Fields: OS `companyId`, `riderId`, Colombo `periodFrom` / `periodTo` (`@db.Date`), `receivedById`, `receivedAt`, `companyTotals` JSON, `fullTotal`. No unique constraint. A second mark for the same rider and same dates returns 409 with the latest receipt unless `confirmDuplicate` is true.

Server recomputes the cash summary at receive time. The client does not send totals.

**Rationale**: `RiderCashHandover` is the rider’s own one-day submit. It links `DeliveryPayment.cashHandoverId`, stores location items, and uses status `submitted | received`. A date range and an ERP-company snapshot do not fit that row. Linking the staff receipt onto those payments would hide them from the rider app’s “not yet handed over” list.

**Alternatives considered**:

- Extend `RiderCashHandover` with a range and company JSON — couples finance reprint/confirm to the rider submit flow. Rejected.
- Audit log only — possible, but the confirm dialog needs a stable latest receipt. A small table is the direct store.

## 5. Payment types “from ERP”

**Decision**: For each order, choices are `listErpPaymentModesFromInstance` on that order’s `companyLocation.erpnextInstance`. The value stored for the payment entry is `mopName` (the ERP Mode of Payment name already configured on the instance: cash, COD, card on delivery, bank transfer, and the other mapped names). Validate with `isAllowedCompanyErpPaymentMode` against that instance’s list only. Pre-fill the select with `resolveOrderPaymentMop` when that name is in the list. The user can change it before the button. Do not write the ERP name back onto `DeliveryPayment.paymentMethod` (that enum is only `cod | bank_transfer | card | already_paid`).

**Rationale**: Payment entry creation already requires those configured names and rejects a mode with no account mapping. A live list of every Mode of Payment document would include modes this OS cannot post.

**Alternatives considered**:

- Live `Mode of Payment` fetch from ERPNext — matches the words “from ERP” more literally, and fails later when the mode has no account. Rejected.
- One company-wide union (`listCompanyErpPaymentModes`) — can offer an ERP1 mode on an ERP2 order. Spec says that order’s company accounts. Rejected.

## 6. Invoice complete and payment entry order

**Decision**: Add `commitOnlyWhenPaymentEntrySucceeds?: boolean` to `markOrderInvoiceComplete`. When true, run the existing payment-entry attempt first and update the order to `invoice_complete` only when the outcome is `created` or `already_paid`. On ERP error, missing invoice, missing location, or an unexpected skip, return `{ success: false, error }` and leave `fulfillmentStage` and `invoiceCompleteAt` unchanged. When the flag is omitted, today’s behavior stays: stamp first, then record `erpPeError` for retry.

This button passes the flag and the selected `modeOfPayment`. Skip orders that are already invoice-closed before the call. One failed order does not undo orders already closed in that run.

**Rationale**: Spec FR-012 forbids stamping invoice complete when the payment entry does not land. The current function stamps first and still returns `success: true` with `erpPeError`. Fulfillment and finance-approval callers depend on that. A flag keeps them stable.

**Alternatives considered**:

- Change the global function for every caller — breaks the existing “stamp, then show PE failure and retry” path. Rejected.
- Call `syncOrderDeliveryPaymentEntriesToErp` from the route and duplicate the stamp — two copies of the stage update. Rejected in favor of one flag inside the existing function.

## 7. Eligible orders for the button

**Decision**: Same rider and task range as the summary. Eligible when all of these hold:

- not invoice-closed (`invoiceCompleteAt == null` and `fulfillmentStage !== "invoice_complete"`)
- `fulfillmentStage === "delivery_complete"` (current function already requires this)
- a selected mode of payment that belongs to that order’s instance
- not blocked by `getFinancePaymentApprovalBlockReason`

The server builds this set. The client does not send an arbitrary id list. Body is `riderId`, `from`, `to`, and `modes: [{ orderId, modeOfPayment }]` for overrides. Orders in the set with no mode in `modes` use the pre-filled mapped mode when it is allowed; otherwise that order fails with a visible reason and the others continue.

Cap: if eligible count is above 80, return 400 and do not start. `maxDuration = 300`.

**Rationale**: Spec processes the whole loaded set and forbids a checkbox picker. The cap keeps a long range from dying mid-batch on the serverless limit. A day or a normal week for one rider fits under 80.

## 8. Incentive gate

**Decision**: An order earns incentive only when the rider task is completed and the order is invoice-closed (`invoiceCompleteAt != null` or `fulfillmentStage === "invoice_complete"`). Amount rules stay in `incentiveForOrder` / manual amount. The day stays `completedAt` (Colombo), including when finance closes the invoice on a later day. `aggregateRiderIncentives` keeps incrementing `completedCount` for every non-void completed task. It adds `incentiveAmount` only when `invoiceClosed` is true. Unmatched marking stays on delivery-complete tasks so staff can still fix a district before finance closes the invoice. Apply the same gate in `GET /api/admin/riders/performance` and `GET /api/mobile/v1/me/performance`. Rider-app completed counts stay delivery counts. A line can show `0.00` until the invoice is closed.

**Rationale**: `fulfillmentStage` cannot be `delivery_complete` and `invoice_complete` at once. `markOrderInvoiceComplete` replaces the stage and sets `invoiceCompleteAt`. Prepaid orders set `invoiceCompleteAt` before delivery and can later sit on `delivery_complete`. The stamp (or the invoice-complete stage) is the close signal. The task is the delivery signal.

**Alternatives considered**:

- Also drop `completedCount` until invoice close — spec keeps operational delivery counts. Rejected.
- Move the incentive day to `invoiceCompleteAt` — spec keeps the delivery day. Rejected.

## 9. Permissions

**Decision**:

- `riders.handover.summary` — generate and print the slip
- `riders.handover.receive` — mark money received, load orders, set mode, mark invoices completed

Add both to `DEFAULT_PERMISSIONS`. `super_admin` and `admin` receive them through the existing all-keys list. Add both to the `finance` role key list. Do not add them to `manager` or `viewer`. The performance page stays behind `riders.performance.read`. Hide each control unless the matching new permission is present.

**Rationale**: Spec wants two permissions on top of today’s performance access. Finance is the role that receives cash and closes invoices. Admin union is how every new default permission already lands on admin.

## 10. Print

**Decision**: A slip region in the handover panel. `window.print()` with a print stylesheet that shows only the slip: rider name, from–to, company cash lines, full total, “Handover by” plus the rider name and a signature line, “Cash collected” and a signature line. No order table in that region. No signature image upload.

**Rationale**: The repo already prints with `window.print()` (stickers, pick lists, rider ops). The spec asks for pen signature places.

## 11. Agent context script

**Decision**: Skip. This repo has no `.specify/scripts/powershell/update-agent-context.ps1` (same as features 041–063).

## 12. Clarifications left

None. Spec markers were already resolved by assumptions in `spec.md`. Research above locks the implementation defaults.
