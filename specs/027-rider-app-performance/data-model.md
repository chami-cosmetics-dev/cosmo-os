# Data Model: 027-rider-app-performance

## Existing entities (reused)

### Order
- `totalShipping` Decimal? — incentive amount source (null/≤0 → 0)
- `financialStatus` — voided/cancelled/canceled/refunded excluded from incentive
- Display label: `orderNumber` → `name` → `shopifyOrderId`

### RiderDeliveryTask
- `riderId`, `orderId`, `status`, `completedAt`, `failedAt`, `failureReason`
- **Completed** for incentive: `status = completed` + `completedAt` in pay-period window + eligible order
- **Failed** for count: `status = failed` + `failedAt` in pay-period window (no incentive)

### User / EmployeeProfile
- Rider identity = authenticated mobile `userId` with `isRider`

## New entity

### RiderPayPeriodConfig (singleton)

| Field | Type | Rules |
|-------|------|--------|
| `id` | String (cuid) | Primary key; at most one logical row (enforce via app upsert + optional unique `singletonKey`) |
| `singletonKey` | String | Fixed value `"default"` with `@@unique` so only one config row exists |
| `paydayDayOfMonth` | Int? | `null` = not configured; when set MUST be 1–31 inclusive |
| `updatedAt` | DateTime | Auto |
| `updatedById` | String? | Optional audit of last ops editor |

**Validation:**
- Zod: `z.number().int().min(1).max(31).nullable()`
- Period math clamps D to each month’s last day when that month is shorter (e.g. D=31 in February → 28/29)
- PUT without permission → 403
- Riders never write this model

**Why not on Company:** Spec requires one payday for all companies in the database.

## Derived / API DTOs (no ledger table)

### PayPeriodWindow
- `start` DateTime (startOfDay of period start)
- `end` DateTime (endOfDay of last included day)
- `kind`: `current` | `previous`

### RiderPersonalPerformanceSummary
- `paydayConfigured` boolean
- `paydayDayOfMonth` number | null
- `period` PayPeriodWindow | null
- `completedCount` number
- `failedCount` number
- `incentiveTotal` string (decimal fixed 2)
- `todayCompletedCount` number (calendar today, for home cue)
- `todayIncentiveTotal` string
- `lines[]` optional detail rows for reconciliation

### RiderPerformanceLine
- `taskId`, `orderId`, `orderLabel`, `completedAt`, `incentiveAmount` (shipping), `tenantId` (client-side when merged)

## State / attribution rules

```text
Payday unset:
  → paydayConfigured=false; no period window; no implied totals

Completion in window:
  completedAt ∈ [period.start, period.end]
  + status=completed
  + eligible financialStatus
  → +1 completedCount, +shippingIncentiveAmount(totalShipping)

Failure in window:
  failedAt ∈ [period.start, period.end]
  + status=failed
  → +1 failedCount, +0 incentive

Order voided after complete:
  → excluded on recompute (same as admin dashboard)

Period switch:
  current | previous only (no deeper history)
```

## Migration notes

- Additive: new `RiderPayPeriodConfig` table only.
- Create with `npm run db:migrate:create`; apply with `npm run db:deploy:all` (vault + cosmo-dev + cosmo-prod).
- No backfill; `paydayDayOfMonth` starts null until ops sets it in Settings.
- Set the **same** day on each deployment riders use (Cosmo + Vault DBs).
