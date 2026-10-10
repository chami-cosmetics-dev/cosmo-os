# Data Model: Rider Cash Handover and Invoice Close

**Feature**: `064-rider-handover-invoice`  
**Date**: 2026-10-08

## New: RiderFinanceCashReceipt

Finance accepted a cash slip for one rider and one Colombo date range. Append-only. A confirmed second mark inserts another row. It does not update the first.

| Field | Type | Rules |
|-------|------|--------|
| `id` | `String` cuid | PK |
| `companyId` | `String` | OS company of the actor. Required. FK `Company` |
| `riderId` | `String` | Rider user. Required. FK `User` |
| `periodFrom` | `DateTime @db.Date` | Colombo start day, inclusive |
| `periodTo` | `DateTime @db.Date` | Colombo end day, inclusive. `periodTo >= periodFrom` |
| `receivedById` | `String` | Staff user who marked received. FK `User` |
| `receivedAt` | `DateTime` | Default `now()` |
| `companyTotals` | `Json` | Array of `{ "companyName": string, "cashAmount": string }` with 2 decimal places. Names match the summary grouping. May be empty when the full total is 0 |
| `fullTotal` | `Decimal(12,2)` | Sum of `companyTotals`. Server-computed. `>= 0` |
| `createdAt` | `DateTime` | Default `now()` |

Indexes:

- `@@index([companyId, riderId, periodFrom, periodTo])` — latest receipt lookup
- `@@index([receivedById])`

Relations:

- `company` → `Company` onDelete Restrict
- `rider` → `User` onDelete Restrict
- `receivedBy` → `User` onDelete Restrict

No link to `DeliveryPayment` or `RiderCashHandover`.

### Validation

- Recompute summary on the server. Reject client-supplied totals.
- Same `companyId + riderId + periodFrom + periodTo` already has a row → 409 with that latest row unless `confirmDuplicate` is true.
- Inverted range rejected before insert.
- Rider must be an `employeeProfile.isRider` user in the same OS company.

### State

No status enum. Each row is an acceptance event.

```text
(no row) --mark received--> row
row exists --mark again without confirm--> 409, no new row
row exists --mark again with confirm--> second row
```

Printing does not insert a row.

## Existing records used, not changed

### RiderDeliveryTask

Period membership: `status = completed`, `completedAt` in the Colombo range, `riderId` selected, `order.companyId` = actor company.

Incentive day: `completedAt`. Task status is not edited by this feature.

### Order

Invoice-closed when `invoiceCompleteAt != null` OR `fulfillmentStage = invoice_complete`.

This feature’s successful close sets both, via `markOrderInvoiceComplete` after the payment entry succeeds:

- `fulfillmentStage = invoice_complete`
- `invoiceCompleteAt`, `invoiceCompleteById`
- `financialStatus = paid` (existing function)
- `fulfillmentStatus = fulfilled` (existing function)

Failed payment entry: none of those fields change.

`companyLocationId` is required. Company name for the slip comes from `companyLocation.erpnextCompany`, else `companyLocation.name`.

### DeliveryPayment / DeliveryPaymentLine

Read only. Cash = `cashAmountFromDeliveryPayment` (COD). This feature does not set `cashHandoverId` and does not change `paymentMethod`.

### CompanyLocation / ErpnextInstance

Read `erpnextCompany` for grouping. Read the location’s instance mop fields (`cashMop`, `codMop`, `cardDeliveryMop`, `bankTransferMop`, `kokoMop`, `webxpayMop`, `mintpayMop`, `citypakMop`) for the per-order mode list.

### RiderCashHandover

Unchanged. Rider-app one-day submit stays on that model.

## View models (not stored)

### Handover summary

Built per request. Not persisted until a receipt copies the totals.

```text
riderId, riderName
periodFrom, periodTo
companies[]: { companyName, cashAmount }
fullTotal
```

No order ids in this view.

### Handover order line

Receive permission only.

```text
orderId, orderNumber
companyName
cashAmount
collectedAmount
paymentMethod          # delivery header, may be null
paymentGatewayPrimary
invoiceClosed          # boolean
fulfillmentStage
eligible               # boolean
blockReason            # string or null
modes[]                # { key, label, mopName } for this order's instance
selectedMop            # mapped mop if it is in modes, else null
```

### Incentive input row (extended)

`aggregateRiderIncentives` gains `invoiceClosed: boolean`.

- `completedCount` increments when `isIncentiveEligibleOrder` (not void / cancelled / refunded).
- `incentiveTotal` adds the rider charge only when `invoiceClosed` is true.
- Unmatched still increments when the label is unmatched and the order is not excluded from incentive, whether or not the invoice is closed.

## Migration

Create with `npm run db:migrate:create`. Deploy to vault, cosmo-dev, and cosmo-prod with `npm run db:deploy:all` only after the user confirms. Do not `db push` those databases.
