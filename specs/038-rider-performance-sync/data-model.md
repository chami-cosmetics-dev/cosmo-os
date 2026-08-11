# Data Model: Rider Performance Sync & Analytics

**Feature**: `038-rider-performance-sync`  
**Date**: 2026-08-11

No new Prisma models. Behavior and read models built on existing tables.

## Entities (existing)

### RiderDeliveryTask
- **Identity**: `id`; unique `orderId`
- **Fields**: `riderId`, `status` (`assigned` | `accepted` | `arrived` | `completed` | `failed`), `assignedAt`, `acceptedAt`, `arrivedAt`, `completedAt`, `failedAt`, exchange/special fields
- **Relationships**: `order`, `rider` (User) — cascade on rider delete
- **Rules**: Performance day = `completedAt` in Asia/Colombo; open statuses feed Riders Assigned/In progress regardless of assign day

### Order (delivery slice)
- **Fields used**: `fulfillmentStage`, `deliveryCompleteAt`, `deliveryCompleteById`, `deliveryOutcome`, `riderDeliveryToken`, `dispatchedByRiderId`, `financialStatus`, shipping display inputs (`shippingLines`, `rawPayload`, `totalShipping`, …)
- **Rules**: Link complete without task → may set delivery-complete without rider credit; voided/cancelled/refunded excluded from **incentive** eligibility

### RiderDeliveryChargeRule
- **Identity**: unique `labelKey` (normalized label)
- **Fields**: `label`, `district`, `shippingAmount`, `riderDeliveryCharge`, `shippingAccount`, `costCenter`
- **Rules**: Incentive uses `riderDeliveryCharge` only; import upserts by `labelKey`; blank rider-charge rows skipped

### DeliveryPayment (+ lines)
- **Used by**: Riders page location cash/bank/card/already-paid totals for completed deliveries in scope

### User + EmployeeProfile
- **Rider roster**: `employeeProfile.isRider` + `status: active` for Riders list

## Derived read models (API, not persisted)

### RiderPerformanceRow
- `riderId`, `name`, `knownName`, `completedCount`, `incentiveTotal`, `unmatchedCount`

### RiderPerformanceRangeSummary
- `from`, `to`, `totalCompletions`, `totalIncentive`, `ridersWithCompletions`, `unmatchedTotal`
- `dailySeries[]`: `{ date: YYYY-MM-DD, completedCount, incentiveTotal }`
- `riders[]`: RiderPerformanceRow sorted by name

### RiderOpsStatusSummary
- `assigned`, `inProgress` — open tasks (any assign day)
- `completed`, `failed` — within selected Colombo date range
- `total` — define as sum of cards shown (document in API: open + dated completed/failed)

## State transitions

```text
assigned → accepted → arrived → completed
                              ↘ failed
```

App complete and link confirm (with task): → `completed` + order `delivery_complete`  
Link confirm (no task): order `delivery_complete` only  
Second complete: no-op / already complete

## Validation rules

- Shipping label key: trim, collapse whitespace, lowercase
- Money: non-negative; blank rider charge → skip row on import
- Date range: `to` ≥ `from`; Colombo day bounds
- Permissions: `staff.read` (riders/performance), `settings.company` (charge upload)
