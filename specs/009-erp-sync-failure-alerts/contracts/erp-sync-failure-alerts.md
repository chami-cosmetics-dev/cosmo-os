# Contract: ERP Sync Failure Alerts

**Feature**: `009-erp-sync-failure-alerts`  
**Date**: 2026-07-18

## Email content (normative)

**Subject** (automatic):
```text
ERP sync failures — {CompanyName} — {YYYY-MM-DD} ({N} orders)
```

**Subject** (test):
```text
[TEST] ERP sync failures — {CompanyName} — {YYYY-MM-DD} ({N} orders)
```

**Body must include**:
- Company name, report date (Asia/Colombo), cutoff label (`23:59 Asia/Colombo`), generation timestamp (Asia/Colombo)
- Summary per currency: order count; total including shipping; total shipping; total excluding shipping
- Order table columns: Order #, Customer, Location, Order time, Reason / state, Failed/detected at, Auto-retry, Amount incl. shipping, Shipping, Amount excl. shipping, Currency
- Stuck rows without stored ERP error use reason text: `Sync interrupted or stuck pending` (or the classified interrupted message)

Amounts: thousand separators; currency code labeled per group (do not sum unlike currencies).

## Admin API

### `GET /api/admin/company/erp-sync-failure-email`

**Auth**: `settings.email_templates`

**Response 200**:
```json
{
  "enabled": true,
  "recipients": ["buddhima.cosmetics@outlook.com"],
  "lastSentReportDate": "2026-07-17",
  "lastSendStatus": "sent",
  "lastSendAt": "2026-07-18T00:05:12.000Z"
}
```

### `PUT /api/admin/company/erp-sync-failure-email`

**Auth**: `settings.email_templates`

**Body**:
```json
{
  "enabled": true,
  "recipients": ["buddhima.cosmetics@outlook.com", "ops@example.com"]
}
```

**Validation**: Zod — recipients array of emails (`emailSchema`), max count (~20), dedupe on normalized lowercase; empty array OK.

**Response 200**: same shape as GET after save.  
**Audit**: `writeAuditLog` module `settings`.

### `POST /api/admin/company/erp-sync-failure-email/preview`

**Auth**: `settings.email_templates`

**Body**:
```json
{
  "reportDate": "2026-07-17",
  "sendTest": false
}
```

- `reportDate` optional — default previous Colombo day
- `sendTest: true` → send to configured recipients with `[TEST]` subject; log `source: preview_test` (does not satisfy cron dedupe)

**Response 200**:
```json
{
  "reportDate": "2026-07-17",
  "orderCount": 4,
  "totalsByCurrency": [
    {
      "currency": "LKR",
      "count": 4,
      "sumIncl": 125000.5,
      "sumShipping": 2500,
      "sumExcl": 122500.5
    }
  ],
  "orders": [
    {
      "orderName": "SV1008545",
      "customerEmail": "a@b.com",
      "locationName": "SupplementVault.lk",
      "reason": "Sync interrupted or stuck pending",
      "failedAt": "2026-07-17T18:22:00.000Z",
      "amountIncl": 12000,
      "shipping": 500,
      "amountExcl": 11500,
      "currency": "LKR"
    }
  ],
  "subject": "ERP sync failures — …",
  "sendTest": { "ok": true, "recipientCount": 1 }
}
```

### `POST /api/admin/company/erp-sync-failure-email/resend`

**Auth**: `settings.email_templates` (or same gate as settings page that hosts history)

**Body**:
```json
{ "reportDate": "2026-07-17" }
```

**Behavior**: Rebuild snapshot for `reportDate` from **current** unresolved orders (or last stored summary if product chooses immutable resend of prior snapshot — default: rebuild current state for ops usefulness; note difference from original cron snapshot in log `source: manual`). Send to current recipients; append send log.

**Response 200**:
```json
{ "ok": true, "reportDate": "2026-07-17", "recipientCount": 1, "orderCount": 4 }
```

## Cron API

### `GET /api/cron/erp-sync-failure-email`

**Auth**: `Authorization: Bearer ${CRON_SECRET}`

**Behavior**:
1. Resolve previous Asia/Colombo calendar day as `reportDate` (override `?date=YYYY-MM-DD` for ops)
2. For each company with config:
   - Skip disabled / empty recipients / already successfully sent / zero qualifying failures (log each)
   - Build snapshot, send Maileroo, log result
3. Return `{ processed, sent, skipped, failed }`

**Schedule** (`vercel.json`): `35 18 * * *` (UTC) ≈ **00:05 Asia/Colombo** on Cosmo and Vault deployments.

## Failed ERP syncs UI contract

Page: `/dashboard/orders/failed-erp-syncs`

- Pending-without-error rows MUST show interrupted/stuck reason text instead of blank Error
- Failed/detected time SHOULD show `erpnextSyncFailedAt` or `erpnextSyncStartedAt` when available
- Auto-retry column continues to derive from schedule fields; after stale classification, retries follow existing retryable rules

## Existing retry cron (behavior extension, same URL)

### `GET /api/cron/failed-erp-syncs-auto-retry`

Unchanged auth/schedule. Additional behavior via shared lib:
1. Detect stale pending (≥5 minutes) → `markOrderErpSyncFailed(interrupted message)`
2. Existing schedule + claim + retry loop

## Errors

| Status | When |
|--------|------|
| 401/403 | Missing permission / cron secret |
| 400 | Invalid body / bad `reportDate` / invalid emails |
| 200 + skipped | Disabled, empty recipients, no failures, already sent (cron) |
| 200 + failed log | Maileroo down — orders unchanged |
