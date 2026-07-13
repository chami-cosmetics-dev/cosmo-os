# Contract: Admin Daily Sales SMS

**Feature**: `003-admin-daily-sales-sms`  
**Date**: 2026-07-13

## SMS body format (normative)

```text
Day (YYYY-MM-DD)
Value:  N,NNN,NNN
Count:        N
-----------------------
MTD Sales: N,NNN,NNN
MTD Sales (Location Wise):
CODE->: N,NNN,NNN
CODE->: N,NNN,NNN
```

- Amounts: integer LKR with thousand separators (en-LK style)
- Location lines: non-zero MTD only; `shortName` then `->: `
- Optional leading greeting (e.g. `Hi All,`) is **out of scope** unless product asks later — sample in chat included greeting but core metrics block above is required

## Admin API

### `GET /api/admin/company/daily-sales-sms`

**Auth**: `settings.sms_portal`

**Response 200**:
```json
{
  "enabled": true,
  "recipients": ["0766713205"],
  "lastSentReportDate": "2026-06-30",
  "lastSendStatus": "sent"
}
```

### `PUT /api/admin/company/daily-sales-sms`

**Auth**: `settings.sms_portal`

**Body**:
```json
{
  "enabled": true,
  "recipients": ["0766713205", "0771234567"]
}
```

**Validation**: Zod — recipients array of trimmed strings, max length per number and max count; empty array OK.

**Response 200**: same shape as GET after save.  
**Audit**: `writeAuditLog` module `settings`.

### `POST /api/admin/company/daily-sales-sms/preview`

**Auth**: `settings.sms_portal`

**Body**:
```json
{
  "reportDate": "2026-06-30",
  "sendTest": false
}
```

- `reportDate` optional — default previous Colombo day
- `sendTest: true` → send to configured recipients (or require explicit test phone in body if empty)

**Response 200**:
```json
{
  "reportDate": "2026-06-30",
  "dayValue": 1970256,
  "dayCount": 198,
  "mtdValue": 43287867,
  "locations": [{ "code": "WEB", "value": 25877955 }],
  "messageBody": "Day (2026-06-30)\n..."
}
```

## Cron API

### `GET /api/cron/daily-sales-sms`

**Auth**: `Authorization: Bearer ${CRON_SECRET}` (same as other crons)

**Behavior**:
1. Resolve previous Asia/Colombo calendar day as `reportDate` (override with `?date=YYYY-MM-DD` for ops)
2. For each company with enabled config and recipients:
   - Skip if already successfully sent for `reportDate`
   - Aggregate, format, send to each recipient
   - Record send log
3. Return summary JSON: `{ processed, sent, skipped, failed }`

**Schedule** (`vercel.json`): e.g. `30 18 * * *` (UTC) aligned with existing midnight-Colombo jobs.

## Admin API — manual resend (OGF logs)

### `POST /api/admin/company/daily-sales-sms/resend` (or GET with query, matching OGF style)

**Auth**: Same as OGF logs / resend (`settings.manage` — consistent with `app/api/admin/ogf-resend/route.ts`)

**Body / query**:
```json
{ "reportDate": "2026-06-30" }
```

**Behavior**: Rebuild message for `reportDate`, send to current configured recipients via `sendSms`, append `DailySalesSmsSendLog` with `triggeredBy`/`source: manual`, status sent|failed.

**Response 200**:
```json
{ "ok": true, "reportDate": "2026-06-30", "recipientCount": 1 }
```

## OGF logs page contract

Page: `/dashboard/ogf-logs`

- **Section A (existing)**: OGF email history from `OgfEmailLog` + Resend batch email — unchanged.
- **Section B (new)**: Daily Sales SMS history from `DailySalesSmsSendLog` (latest N), columns: Sent At (Colombo), Report date, Recipients, Source, Status, Error, Resend action.
- Failed rows MUST show `errorSummary` and enable Resend.
- Empty SMS section copy: no SMS attempts yet (distinct from email empty state).

## Errors

| Status | When |
|--------|------|
| 401/403 | Missing permission / cron secret |
| 400 | Invalid body / bad `reportDate` |
| 200 + skipped | Empty recipients or disabled (not an error for cron) |
| 404 | Resend for unknown day with nothing to rebuild still allowed (rebuild from orders); fail only if no recipients / SMS portal down |
