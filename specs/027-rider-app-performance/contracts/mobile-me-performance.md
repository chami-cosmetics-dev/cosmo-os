# GET /api/mobile/v1/me/performance

Signed-in rider’s personal pay-period performance and incentive.

## Auth
- Rider mobile session (`requireRiderMobileSession`)
- Data scoped to `session.userId` only (never other riders)

## Query
| Param | Type | Rules |
|-------|------|--------|
| `period` | string | optional; `current` (default) or `previous` |

## Behavior
1. Load singleton `RiderPayPeriodConfig`.
2. If `paydayDayOfMonth` is null → return `paydayConfigured: false`, null period/totals fields as documented below (still 200).
3. Else compute pay window for `period` via `lib/rider-pay-period.ts` (app local day helpers).
4. Aggregate for this rider only:
   - Completions: `RiderDeliveryTask` `status=completed`, `completedAt` in window, order eligible for incentive → count + sum shipping incentive
   - Failures: `status=failed`, `failedAt` in window → failed count
5. Also compute **today** (startOfDay–endOfDay) completed count + incentive for home cue (even when viewing previous period).
6. Include line items for completed eligible deliveries in the selected period (for reconciliation).

## Response `200` (configured)
```json
{
  "paydayConfigured": true,
  "paydayDayOfMonth": 25,
  "period": {
    "kind": "current",
    "from": "2026-07-25T00:00:00.000Z",
    "to": "2026-08-24T23:59:59.999Z"
  },
  "completedCount": 8,
  "failedCount": 2,
  "incentiveTotal": "550.00",
  "todayCompletedCount": 3,
  "todayIncentiveTotal": "200.00",
  "lines": [
    {
      "taskId": "cuid",
      "orderId": "cuid",
      "orderLabel": "OS-1234",
      "completedAt": "2026-07-28T10:00:00.000Z",
      "incentiveAmount": "200.00"
    }
  ]
}
```

## Response `200` (not configured)
```json
{
  "paydayConfigured": false,
  "paydayDayOfMonth": null,
  "period": null,
  "completedCount": null,
  "failedCount": null,
  "incentiveTotal": null,
  "todayCompletedCount": 0,
  "todayIncentiveTotal": "0.00",
  "lines": []
}
```
Note: `today*` may still reflect today’s completions when useful for the route cue, or be zeroed when payday unset — implementation SHOULD still return today’s cue fields from eligible completions today so the home cue works before payday is set; pay-period fields remain null/unconfigured.

**Preferred when unset:** keep `todayCompletedCount` / `todayIncentiveTotal` accurate from today’s completions; leave period aggregates null.

## Errors
- `400` invalid `period`
- `401` / `403` auth
