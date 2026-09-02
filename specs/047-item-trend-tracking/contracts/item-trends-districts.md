# GET /api/admin/purchasing/item-trends/districts

District leaderboard, item×district drill-down, and area growth status.

## Auth
- `requirePermission("purchasing.item_trends.read")`

## Query

| Param | Type | Rules |
|-------|------|--------|
| `from`, `to` | `YYYY-MM-DD` | Required |
| `compareFrom`, `compareTo` | `YYYY-MM-DD` | Optional prior window |
| `district` | string | Optional; when set, include `items` for that district only |
| `sortBy` | `units` \| `amount` \| `speed` | Default `units` |
| `includeAreaGrowth` | boolean | Default true |

## Behavior
- District from `resolveAddressDistrict(order.shippingAddress)`
- Unmapped orders → `district: "Unmapped"` row
- `items` (when `district` set): top SKUs by units in that district with movement signals

## Response `200`

```json
{
  "districts": [
    {
      "district": "Colombo",
      "units": 450,
      "amount": "125000.00",
      "sharePct": 36,
      "changePct": 12.5,
      "growthStatus": "growing"
    }
  ],
  "items": [],
  "expansion": [
    {
      "district": "Gampaha",
      "score": 78,
      "deliveryUnits": 120,
      "shopUnits": 15,
      "growthPct": 22,
      "topSkus": ["SKU1", "SKU2"],
      "nearestStore": "OGF Main",
      "reasons": ["High delivery demand", "Low shop coverage", "2 Top Priority fast movers"]
    }
  ]
}
```

## Errors
- Same as page-data
