# GET /api/admin/riders/performance

Rider completed-delivery counts and shipping-based incentives for a date range.

## Auth
- `requirePermission("staff.read")`
- Scoped to caller’s `companyId`

## Query
| Param | Type | Rules |
|-------|------|--------|
| `from` | ISO date | required (start of day, app TZ) |
| `to` | ISO date | required (end of day); `to` ≥ `from` |
| `riderId` | cuid | optional filter to one rider |

## Behavior
For each active rider with ≥1 completed delivery task in range (or all roster riders with zeros):
- Count `RiderDeliveryTask` where `status = completed`, `completedAt` in range, order `financialStatus` not voided/cancelled as defined by product rules
- `incentiveTotal` = sum of related `Order.totalShipping` (null treated as 0)

## Response `200`
```json
{
  "from": "2026-07-27T00:00:00.000Z",
  "to": "2026-07-27T23:59:59.999Z",
  "riders": [
    {
      "riderId": "cuid",
      "name": "Rider Name",
      "knownName": "Known",
      "completedCount": 12,
      "incentiveTotal": "4800.00"
    }
  ]
}
```

## Errors
- `400` invalid dates
- `401` / `403` auth
