# Data Model: Admin Daily Sales SMS

**Feature**: `003-admin-daily-sales-sms`  
**Date**: 2026-07-13

## Entities

### DailySalesSmsConfig (new)

Company-scoped settings for admin daily sales SMS.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | Unique — one config per company |
| recipients | Json (string[]) | E.164-ready local numbers, e.g. `["0766713205"]`; max ~20 |
| enabled | boolean | Default `true`; when false cron skips even if recipients exist |
| createdAt / updatedAt | DateTime | |

**Relations**: `Company` 1:1 `DailySalesSmsConfig`

**Validation**:
- Each recipient: non-empty, digits/`+` only after trim; normalize via Hutch formatter at send time
- Deduplicate numbers in list on save
- Empty array allowed (preview OK; live send skips)

### DailySalesSmsSendLog (new)

One row per company + report calendar day for automatic (and optionally manual) sends.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | |
| reportDate | string / Date @db.Date | Colombo calendar day `YYYY-MM-DD` |
| status | enum/string | `sent` \| `skipped_no_recipients` \| `skipped_disabled` \| `failed` |
| messageBody | string? | Snapshot of SMS text (truncate if huge) |
| recipientCount | int | |
| errorSummary | string? | |
| triggeredBy | string | `cron` \| `manual` \| `preview_test` |
| createdAt | DateTime | |

**Constraints**: Cron dedupe looks for an existing **successful** send for `(companyId, reportDate)`. Failure and manual resend rows are append-only so OGF logs can show history.

**Recommended**: No unique that blocks multiple failed/manual rows; query “already sent successfully?” before automatic cron send. OGF logs lists latest N by `createdAt desc`.

### Order (existing, read-only for this feature)

Used for aggregation:
- `createdAt`, `totalPrice`, `financialStatus`, `companyLocationId`, `companyId`

### CompanyLocation (existing)

- `shortName` — SMS location code (WEB, OGF, …)
- `name` — fallback label

### SmsPortalConfig / SmsLog (existing)

Delivery path unchanged; each `sendSms` writes `SmsLog`.

## Logical report (not persisted as its own table)

Computed in memory / returned by preview API:

- `reportDate`, `dayValue`, `dayCount`, `mtdValue`
- `locations: { code, value }[]` (non-zero only)
- `messageBody`

## State transitions (send)

```text
[cron/manual] → load config
  → disabled or empty recipients → skip (log optional)
  → already sent for reportDate → skip
  → aggregate + format → send each recipient → mark sent / failed
```
