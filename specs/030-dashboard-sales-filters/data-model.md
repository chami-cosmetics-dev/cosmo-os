# Data Model: Dashboard Sales Filter Views

**Feature**: 030-dashboard-sales-filters  
**Date**: 2026-08-04

No new persisted entities. Logical model for filter evaluation over existing **Order**.

## Entity: Order (existing)

Relevant attributes (conceptual):

| Field | Role in filters |
|-------|-----------------|
| `companyId` | Tenant scope |
| `createdAt` | Place / “All orders” clock (Colombo day) |
| `deliveryCompleteAt` | Physical delivery clock |
| `invoiceCompleteAt` | Bill done clock |
| `fulfillmentStage` | e.g. `dispatched`, `delivery_complete`, `invoice_complete` |
| `financialStatus` | `paid` / `pending` eligible; `voided` excluded |
| `sourceName` | POS detection (`pos`, `erpnext-pos`) |
| `totalPrice` | Amount summed into totals |
| Location / merchant / gateway fields | Existing chart attribution |

## Logical: FilterView

| Attribute | Description |
|-----------|-------------|
| `key` | Canonical enum (see research.md) |
| `group` | `status` \| `event` \| `backlog` |
| `label` | Plain UI name |
| `total` | Sum of eligible `totalPrice` |
| `orderCount` | Count of eligible orders |
| `addsToAllOrders` | true only for Group A partition members |

## Logical: FilterSummaryBundle

Returned with dashboard refresh for a From–To (and always for backlog):

- `fromDate`, `toDate`
- `summaries: FilterView[]`
- `activeKey` (selected filter)
- Optional: `tallyCheck` = sum of Group A partition totals vs `all_orders` (dev/QA only; not required in UI)

## State / classification (per order, for Group A)

Mutually exclusive for paid/pending, non-voided, placed in range:

```text
if bill_done_early (invoiceCompleteAt && !deliveryCompleteAt)
  → bill_done_early
else if !delivered
  → not_delivered
else if delivered && !invoiceCompleteAt
  → bill_open
else if delivered && invoiceCompleteAt
  → done_after_delivery
```

POS: include in All orders / bill-done / done-after-delivery as today; **exclude** from delivery-focused and not_delivered pipeline views (research + FR-017).

## Validation rules

- Inclusive From–To YMD in Asia/Colombo.
- Reject From > To (existing invalid-range behavior).
- Backlog keys ignore place-date range for membership.
- Voided never eligible.

## Relationships

- FilterView aggregates many Orders.
- Dashboard charts for `activeKey` reuse existing location → merchant/gateway breakdown of the same eligible set.
