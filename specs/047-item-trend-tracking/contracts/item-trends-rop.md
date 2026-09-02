# GET /api/admin/purchasing/item-trends/rop

ROP suggestions for purchasing / supplier admin review.

## Auth
- `requirePermission("purchasing.item_trends.read")` — read suggestions
- Applying ROP uses existing **`PATCH /api/admin/osf/profiles/[sku]`** with `purchasing.osf.manage`

## Query

| Param | Type | Rules |
|-------|------|--------|
| `ropWindow` | `3m` \| `2m` \| `custom` | Default `3m` (calendar months, Colombo) |
| `ropFrom`, `ropTo` | `YYYY-MM-DD` | Required when `ropWindow=custom` |
| `from`, `to` | `YYYY-MM-DD` | Movement overlay comparison range (default last 7 days) |
| `priority` | string | Optional filter |
| `sku` | string | Optional |
| `offset`, `limit` | number | Pagination; default limit 50 |

## Behavior
- `windowSales` = units sold in ROP window via `aggregateSalesBySkuInRange`
- `suggestedRop = round(windowSales * 2)`
- `currentRop` from `ProductOsfRop` (primary includeInRop column)
- `overlay`: increase | hold | decrease from movement signals vs current ROP

## Response `200`

```json
{
  "windowLabel": "Last 3 calendar months",
  "ropFrom": "2026-06-01",
  "ropTo": "2026-08-31",
  "rows": [
    {
      "sku": "ABC123",
      "priority": "Top Priority",
      "currentRop": 40,
      "windowSales": 45,
      "suggestedRop": 90,
      "overlay": "increase",
      "columnKey": "common_rop"
    }
  ],
  "total": 1200,
  "offset": 0,
  "limit": 50
}
```

## Apply flow (existing API)

```http
PATCH /api/admin/osf/profiles/{sku}
Content-Type: application/json

{
  "rops": [{ "columnKey": "common_rop", "ropQty": 90 }]
}
```

Dashboard UI pre-fills suggested value; user confirms save. No new write endpoint.

## Errors
- `400` invalid ropWindow or missing custom dates
