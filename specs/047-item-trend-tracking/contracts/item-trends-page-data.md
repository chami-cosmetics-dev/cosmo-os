# GET /api/admin/purchasing/item-trends/page-data

Primary Item Trends super dashboard payload. Returns KPIs, movement lists, and optional zones based on `sections`.

## Auth
- `requirePermission("purchasing.item_trends.read")`
- Scoped to caller's `companyId`
- Store users with `EmployeeProfile.locationId`: outlet-scoped sections only unless `purchasing.osf.manage` or admin bypass

## Query

| Param | Type | Rules |
|-------|------|--------|
| `from` | `YYYY-MM-DD` | Required; Asia/Colombo day start |
| `to` | `YYYY-MM-DD` | Required; `to` ≥ `from` |
| `compareFrom` | `YYYY-MM-DD` | Optional; default = prior equal-length window |
| `compareTo` | `YYYY-MM-DD` | Optional; paired with compareFrom |
| `priority` | string | Optional filter: `Top Priority`, `Newly Added`, etc. |
| `district` | string | Optional; scope movement to one district |
| `sections` | comma-separated | Default `kpis,movement,newItems,slowdowns`. Also: `districts`, `expansion`, `outlets`, `transfers`, `rop`, `patterns`, `areaGrowth` |
| `limit` | number | Default 50, max 100 per list section |

## Behavior
- Unit sales: `osfCompletedSalesOrderWhere` + `orderLineItem` (see `lib/osf/assist-sales.ts`)
- Movement speed: units / calendar days in `[from, to]`
- Comparison: `[compareFrom, compareTo]` or auto prior window
- Priority from ERP-synced product data (OSF source)
- Patterns section omitted if range < 28 days (empty array + `patternsAvailable: false`)

## Response `200`

```json
{
  "meta": {
    "from": "2026-08-26T18:30:00.000Z",
    "to": "2026-09-02T18:29:59.999Z",
    "compareFrom": "2026-08-19T18:30:00.000Z",
    "compareTo": "2026-08-26T18:29:59.999Z",
    "scopedLocationId": null,
    "patternsAvailable": true,
    "intelligentEngine": "disabled"
  },
  "kpis": {
    "fastMoverCount": 42,
    "newItemSignalCount": 8,
    "slowdownCount": 5,
    "patternHitCount": 3,
    "topDistrict": "Colombo",
    "totalUnitsTracked": 1250
  },
  "movement": [
    {
      "sku": "ABC123",
      "title": "Sample Item",
      "priority": "Top Priority",
      "unitsCurrent": 24,
      "unitsPrior": 12,
      "speedPerDay": 3.4,
      "speedChangePct": 100,
      "signal": "fast_mover",
      "signalSource": "rule_based",
      "sparkline": [1, 2, 0, 4, 3, 5, 9]
    }
  ],
  "newItems": [],
  "slowdowns": []
}
```

## Errors
- `400` invalid dates or range > 366 days
- `401` / `403` auth
- `404` no company on user
