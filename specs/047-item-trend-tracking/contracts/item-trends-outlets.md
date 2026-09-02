# GET /api/admin/purchasing/item-trends/outlets

Outlet balance, per-outlet movement, and transfer candidates.

## Auth
- `requirePermission("purchasing.item_trends.read")`
- Scoped: store users limited to their `EmployeeProfile.locationId` column(s)

## Query

| Param | Type | Rules |
|-------|------|--------|
| `from`, `to` | `YYYY-MM-DD` | Required |
| `sku` | string | Optional filter |
| `columnKey` | string | Optional single outlet OSF column |
| `transfersOnly` | boolean | Default false |

## Behavior
- Outlets from `OsfColumnConfig` with stock columns
- Stock: live ERP via `fetchSkuColumnLiveStock` (batched, max 50 SKUs per request if filtered)
- Movement: sales attributed via `order.companyLocationId` → column key
- `transfers`: pairs matching transfer candidate rules (see data-model.md)

## Response `200`

```json
{
  "outlets": [
    {
      "sku": "ABC123",
      "columnKey": "shop_colombo",
      "outletName": "Shop Colombo",
      "stockQty": 48,
      "unitsInRange": 2,
      "speedPerDay": 0.3,
      "stockPressure": "high_slow"
    }
  ],
  "transfers": [
    {
      "sku": "ABC123",
      "sourceColumnKey": "shop_a",
      "sourceOutletName": "Shop A",
      "sourceStock": 50,
      "sourceSpeed": 0.2,
      "destColumnKey": "shop_b",
      "destOutletName": "Shop B",
      "destStock": 5,
      "destSpeed": 4.1,
      "message": "Move stock from Shop A to Shop B"
    }
  ]
}
```

## Errors
- `403` when store user requests unauthorized columnKey
- `503` partial ERP stock failure: return movement with `stockQty: null` + `stockStale: true` per row
