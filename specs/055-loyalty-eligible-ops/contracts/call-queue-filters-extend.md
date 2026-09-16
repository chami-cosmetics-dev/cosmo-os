# Contract: Call queue filters extend + sales report export

**Feature**: `055-loyalty-eligible-ops`  
**Auth**: Same as 043 — Insight admin view. Else 403.

Extends `specs/043-call-queue-filters/contracts/call-queue-assign.md`.

## Shared filter query (candidates + eligible-ids)

| Param | Type | Notes |
|-------|------|--------|
| `assignedMerchant` | string | required (unchanged) |
| `pushToGold` / `pushToPlatinum` / `loyalty` / `lastPurchase*` / `allocated*` / `hideFilter` | | unchanged |
| `brand` | string \| string[] | **multi**; repeat query key or comma list; OR match |
| `assignedFrom` | `YYYY-MM-DD` | call-queue `assignedAt` start (Colombo) |
| `assignedTo` | `YYYY-MM-DD` | call-queue `assignedAt` end |
| `notContacted` | `true` \| omit | only assignments with no post-assign contact |

When `assignedFrom`, `assignedTo`, or `notContacted` present → **queue-history mode** (source = `ContactInsightCallQueue` for merchant). Otherwise → existing allocated-candidate mode.

## GET `/api/admin/customer-insight/call-queue/report`

Existing params plus:

| Param | Type | Notes |
|-------|------|--------|
| `notContacted` | `true` \| omit | rows with `firstContactAfterAssignAt` null |

Response unchanged shape; UI must surface `rows` including **`assignedAt`** (Assigned date column).

## GET `/api/admin/customer-insight/call-queue/report/export`

Same query as report.

**200** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
Filename like `call-queue-sales-report-YYYY-MM-DD.xlsx`

Columns (min): merchant, contact name, phone, assigned date, status, category, lifetime at assign, sales after assignment, sales after contact, first contact after assign.

## Merchant dashboard page-data (extend)

`GET /api/admin/merchant-dashboard/page-data` (or existing loyalty payload) includes:

```json
{
  "loyaltyEligibleCount": 0,
  "loyaltyOutreach": [ "…capped items…" ]
}
```

`loyaltyEligibleCount` = full pending total for viewed merchant; `loyaltyOutreach.length` may be ≤ count.
