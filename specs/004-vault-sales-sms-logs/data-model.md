# Data Model: Vault Sales SMS Logs & Delivery Visibility

**Feature**: `004-vault-sales-sms-logs`  
**Date**: 2026-07-15

No new Prisma models. Reuse entities from `003-admin-daily-sales-sms`.

## Entities (existing)

### Daily Sales SMS Configuration (`DailySalesSmsConfig`)

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | Unique per company |
| enabled | boolean | Cron skips when false |
| recipients | JSON string[] | Normalized phone list |
| createdAt / updatedAt | datetime | |

**Vault page status summary** reads: `enabled`, `recipients.length`.

### Daily Sales SMS Send Attempt (`DailySalesSmsSendLog`)

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | Tenant scope |
| reportDate | string | `YYYY-MM-DD` Asia/Colombo calendar day |
| status | string | `sent` \| `failed` \| `skipped_*` |
| messageBody | string? | Truncated body |
| recipientCount | int | |
| recipients | JSON | Snapshot at send |
| errorSummary | string? | Provider/config errors |
| source | string | `cron` \| `manual` \| `preview_test` |
| createdAt | datetime | Display as Colombo local |

**Indexes** (existing): `(companyId, createdAt desc)`, `(companyId, reportDate, status)`.

### Relationships

- `Company` 1—1 `DailySalesSmsConfig`
- `Company` 1—N `DailySalesSmsSendLog`

## Status summary (UI DTO — not persisted)

Derived at page load:

| Field | Source |
|-------|--------|
| enabled | Config |
| recipientCount | `normalizeRecipientList(config.recipients).length` |
| lastAttempt | Latest log by `createdAt` (reportDate, status, createdAt, errorSummary) |
| nextScheduledLabel | Constant: **09:00 Asia/Colombo** (document cron `30 3 * * *` UTC) |

## Validation / business rules

- Company-scoped: never show another company’s logs.
- Manual Resend / Send for date: require non-empty recipients; reject invalid `reportDate`; allow send when no prior log (catch-up).
- Cron: skip duplicate successful `reportDate` for same company; still log other skip reasons when applicable.
- Vault page: no `OgfEmailLog` reads.

## State transitions (send attempt)

```text
[trigger: cron | manual | preview_test]
    → sent | failed | skipped_disabled | skipped_no_recipients | skipped_already_sent
```

Manual Send for date / Resend always attempt send when recipients exist (force path); result `sent` or `failed`.
