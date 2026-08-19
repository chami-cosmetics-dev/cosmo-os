# GET /api/admin/riders/performance

Completed deliveries + rider pay (shipping-rule charges) for a date range, with analytics series and unmatched markers.

## Auth
- `requirePermission("staff.read")`
- Scoped to caller’s `companyId`

## Query
| Param | Type | Rules |
|-------|------|--------|
| `from` | `YYYY-MM-DD` preferred (also legacy ISO datetime) | required; Asia/Colombo day start |
| `to` | `YYYY-MM-DD` preferred | required; Asia/Colombo day end; `to` ≥ `from` |
| `riderId` | cuid | optional |

## Behavior
- Source: `RiderDeliveryTask` with `status = completed`, `completedAt` in Colombo range, `order.companyId` = caller company
- `incentiveTotal` / per-delivery incentive = `RiderDeliveryChargeRule.riderDeliveryCharge` matched by normalized shipping rule label (not customer shipping amount)
- Voided/cancelled/refunded orders: excluded from incentive; still counted in `completedCount` only if product keeps current void skip for both—**v1 keeps existing `isIncentiveEligibleOrder` skip for both count and incentive** (match today’s admin aggregate) unless implement tasks explicitly split ops vs pay counts
- Unmatched label (no rule): contributes `0` incentive; increments `unmatchedCount` / `unmatchedTotal`
- Include `dailySeries` for charts (Colombo calendar day buckets)

## Response `200`
```json
{
  "from": "2026-08-10T18:30:00.000Z",
  "to": "2026-08-11T18:29:59.999Z",
  "summary": {
    "totalCompletions": 40,
    "totalIncentive": "12000.00",
    "ridersWithCompletions": 3,
    "unmatchedTotal": 2
  },
  "dailySeries": [
    { "date": "2026-08-11", "completedCount": 40, "incentiveTotal": "12000.00" }
  ],
  "riders": [
    {
      "riderId": "cuid",
      "name": "Yohan",
      "knownName": null,
      "completedCount": 12,
      "incentiveTotal": "3600.00",
      "unmatchedCount": 1
    }
  ]
}
```

## Errors
- `400` invalid date range
- `401` / `403` auth
- `404` no company on user
