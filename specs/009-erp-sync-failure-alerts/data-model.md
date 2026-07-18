# Data Model: ERP Sync Failure Alerts

**Feature**: `009-erp-sync-failure-alerts`  
**Date**: 2026-07-18

## Entities

### Order (existing — extend)

| Field | Type | Notes |
|-------|------|--------|
| erpnextInvoiceId | string? | SI name, or sentinel `pending` / `pending_approval` |
| erpnextSyncError | string? | Failure / stuck reason |
| erpnextSyncFailedAt | DateTime? | First/latest recorded failure or stuck classification time |
| erpnextSyncAutoRetryCount | int | Existing |
| erpnextSyncLastAutoRetryAt | DateTime? | Existing |
| erpnextSyncNextAutoRetryAt | DateTime? | Existing |
| erpnextSyncRetryLeaseExpiresAt | DateTime? | Existing |
| **erpnextSyncStartedAt** | DateTime? | **New** — set when claiming `pending`; cleared on success / cleared with `ERP_SYNC_SUCCESS_CLEAR` |
| totalPrice | Decimal | Primary “including shipping” candidate |
| totalShipping | Decimal? | Fallback shipping |
| currency | string | Grouping key |
| financialStatus | string? | Exclude voided/cancelled |
| createdAt | DateTime | Business-day membership (Asia/Colombo) |
| companyId | string | Tenant |

**Validation / rules**:
- Claim path: `null` → `pending` sets `erpnextSyncStartedAt = now()`.
- Stale: `pending` + null error + startedAt older than 5 minutes → mark failed with interrupted message.
- Success clear includes nulling startedAt, error, failedAt, retry schedule fields (extend `ERP_SYNC_SUCCESS_CLEAR`).

### ErpSyncFailureEmailConfig (new)

Company-scoped alert settings (1:1 Company).

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | Unique |
| recipients | Json (string[]) | Emails; max ~20 |
| enabled | boolean | Default `true` |
| createdAt / updatedAt | DateTime | |

**Relations**: `Company` 1:1 `ErpSyncFailureEmailConfig`

**Validation**:
- Trim, lowercase for duplicate detection; require `@`; max length per `emailSchema` / LIMITS
- Empty array allowed (preview OK; live send skips)
- Company isolation enforced by auth context `companyId`

### ErpSyncFailureEmailSendLog (new)

Append-only send / skip history.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | |
| reportDate | string | `YYYY-MM-DD` Colombo calendar day |
| status | string | `sent` \| `skipped_no_recipients` \| `skipped_disabled` \| `skipped_no_failures` \| `skipped_already_sent` \| `failed` |
| subject | string? | |
| htmlBody | string? | Optional snapshot (truncate if huge) or store summary JSON instead if size risk |
| summaryJson | Json? | `{ orderCount, totalsByCurrency, orderIds[] }` for immutable snapshot without huge HTML |
| recipientCount | int | |
| recipients | Json (string[]) | Snapshot at send time |
| errorSummary | string? | |
| source | string | `cron` \| `manual` \| `preview_test` |
| createdAt | DateTime | |

**Indexes**: `(companyId, createdAt desc)`, `(companyId, reportDate, status)`

**Dedupe**: Cron treats existing **successful** `sent` for `(companyId, reportDate)` as already sent. Failures / manual / test remain append-only.

### Company / CompanyLocation (existing)

- Company: tenant boundary; add relations to config + send logs
- Location: name for report rows via `order.companyLocation`

## Logical report snapshot (computed; persisted via send log summary)

- `companyName`, `reportDate`, `cutoffLabel` (`23:59 Asia/Colombo`), `generatedAt`
- `orders[]`: name, shopify id, customer, phone, location, orderAt, erpState, reason, failedAt, retryStatus, amountIncl, shipping, amountExcl, currency
- `totalsByCurrency[]`: `{ currency, count, sumIncl, sumShipping, sumExcl }`

## State transitions

### Sync recovery

```text
[pending, no error, age < 5m] → in progress (do not auto-retry)
[pending, no error, age ≥ 5m] → mark failed (interrupted) → schedule retry if retryable
[has error, due, lease free] → claim lease → retryOrderErpSync → success clear | mark failed again
[non-retryable error] → manual only
```

### Cutoff email

```text
[cron after Colombo midnight]
  → reportDate = previous Colombo day
  → load config
  → disabled / no recipients / already sent → skip (log)
  → build snapshot of unresolved orders for reportDate
  → no failures → skip_no_failures (log)
  → send Maileroo → sent | failed (log; orders unchanged)
```
