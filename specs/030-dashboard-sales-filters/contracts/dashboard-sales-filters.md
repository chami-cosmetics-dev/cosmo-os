# Contracts: Dashboard Sales Filter Views

**Feature**: 030-dashboard-sales-filters  
**Date**: 2026-08-04

## 1. Query — sales by location (extended)

**Endpoint**: `GET /api/admin/dashboard/sales-by-location`  
**Auth**: Existing dashboard permission.

### Query params

| Param | Type | Notes |
|-------|------|--------|
| `from` | `YYYY-MM-DD` | Required |
| `to` | `YYYY-MM-DD` | Required |
| `date_type` | string | New canonical keys (below) + legacy aliases |
| `analysis_type` | `merchant` \| `gateway` | Unchanged |
| `include_summaries` | `true` \| `false` | Optional; default `true` on overview refresh |

### Canonical `date_type` values

```text
all_orders
not_delivered
bill_done_early
bill_open
done_after_delivery
bill_done_in_dates
delivered_in_dates
bill_done_old
delivered_old
still_bill_open
still_not_delivered
```

Legacy aliases continue to normalize (e.g. `placed_all` → `all_orders`, `order` → `all_orders`) for one release.

### Response (additive)

Existing `locations` payload unchanged in shape. When `include_summaries` is true:

```json
{
  "locations": [ ],
  "invalidRange": false,
  "filterSummaries": [
    {
      "key": "all_orders",
      "group": "status",
      "label": "All orders",
      "total": 1768328.0,
      "orderCount": 120,
      "addsToAllOrders": true
    },
    {
      "key": "bill_done_early",
      "group": "status",
      "label": "Bill done early",
      "total": 50000.0,
      "orderCount": 4,
      "addsToAllOrders": true
    },
    {
      "key": "still_bill_open",
      "group": "backlog",
      "label": "Still bill open",
      "total": 880000.0,
      "orderCount": 90,
      "addsToAllOrders": false
    }
  ],
  "activeDateType": "all_orders"
}
```

**Invariants**:

- For Group A keys with `addsToAllOrders: true` excluding `all_orders` itself, sum of those totals equals `all_orders.total` within 0.01 (or document known POS edge if any).
- `locations` charts always reflect `date_type` / `activeDateType` eligibility only.
- Backlog summary totals do not depend on `from`/`to` membership for place date.

## 2. Brand sales

**Endpoint**: `GET /api/admin/dashboard/brand-sales`  
Accepts the same canonical `date_type` set (no summaries required for v1).

## 3. UI contract — filter slot

| Element | Behavior |
|---------|----------|
| Date From / To | Default today–today; changing range refreshes summaries + charts |
| Group A block | Title e.g. “Orders created in these dates (add up)”; chips with label + total; tally hint |
| Group B block | Title e.g. “Finished in these dates (separate)”; chips; do not claim add-up to All orders |
| Group C block | Title e.g. “Still open (any day)”; chips; range-independent totals |
| Selection | One active `date_type`; updates Grand Total / charts |
| Empty | Totals show `0`; charts empty state |

## 4. Non-goals (contract)

- Exporting filter definitions to Excel from this API
- Cross-company rollup
- Persisting user’s last selected filter server-side (session/local state OK)
