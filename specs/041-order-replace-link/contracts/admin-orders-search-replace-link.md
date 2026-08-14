# Order search — replace-link enrichment

Applies to:
- `GET /api/admin/orders/quick-search` (`lib/page-data/orders-quick-search.ts`)
- `GET /api/admin/orders/page-data` search results (`lib/page-data/orders.ts`)

## Behavior (additive)
For each matched order in the result set (one hop only):

1. If order has `replacedByOrderId` → include `replacedByOrder` summary on that hit.
2. If other cancelled orders have `replacedByOrderId = this.id` → include `replacedFromOrders` summaries (or a compact `replacedFromOrder` when exactly one is enough for UI — prefer array for consistency with detail).

Do **not** auto-insert full separate rows for counterparts unless product UI already lists related cards; minimum bar: each hit carries counterpart metadata so UI can show badge/link. Prefer also including the counterpart as an additional result row when searching by the cancelled number so staff can open either (dedupe by `id`).

## Suggested hit shape extension
```json
{
  "id": "cuid",
  "orderLabel": "1001",
  "replacedByOrder": {
    "id": "cuid2",
    "orderLabel": "SI-0001"
  },
  "replacedFromOrders": []
}
```

## Non-goals
- Multi-hop chain expansion in one response
- Changing base match rules for `q` / `search` (contains / endsWith stay as today)
