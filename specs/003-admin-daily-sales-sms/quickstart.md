# Quickstart: Admin Daily Sales SMS

**Feature**: `003-admin-daily-sales-sms`  
**Date**: 2026-07-13

## Prerequisites

- Cosmo env active (`npm run env:use cosmo-dev` or vault only if testing isolation)
- Migrations applied after implementation (`db:deploy:<target>` / `db:deploy:all`)
- Company **SMS portal** configured (Hutch) so test sends work
- Location **short names** set (WEB, OGF, CTW, …) under Locations settings
- User with `settings.sms_portal`

## Validation scenarios

### 1. Preview message (no phones required)

1. Open Daily Sales SMS settings (with SMS portal settings).
2. Preview for a known day (e.g. `2026-06-30`).
3. Confirm body shape matches [contracts/daily-sales-sms.md](./contracts/daily-sales-sms.md): Day / Value / Count / MTD / location lines.
4. Spot-check Value/Count/MTD against dashboard sales for the same order-date range.

### 2. Save recipient

1. Add `0766713205` to recipients; save.
2. Reload page — number persists.
3. Remove and re-add; confirm empty list is allowed.

### 3. Test send

1. With SMS portal working and recipient saved, run preview with **send test** (or dedicated test action).
2. Confirm phone receives SMS; check `SmsLog` / gateway success.
3. Clear recipients; confirm live send is skipped with clear status.

### 4. Cron / dedupe (staging)

1. Call cron with `CRON_SECRET` and optional `?date=YYYY-MM-DD`.
2. Expect one successful send per company/day.
3. Call again — expect skip (already sent).
4. Force/resend only via explicit admin action if implemented.

### 5. OGF logs — failure + manual resend

1. Open `/dashboard/ogf-logs` (Cosmo).
2. Confirm **OGF Email History** still lists email rows/resend as before.
3. After a failed daily sales SMS (or force failure in staging), confirm a **Daily Sales SMS** section shows the failed row with error text.
4. Click **Resend** → SMS delivered (or new failed row with updated error); source shows `manual`.

## Unit tests

```bash
npx vitest run lib/daily-sales-sms.test.ts
```

Cover: formatting (thousand separators, location lines), empty day, month boundary MTD, empty recipients skip.

## Go-live checklist (Cosmo prod)

- [ ] Migration deployed to all DBs
- [ ] Recipients include `0766713205` (+ others as needed)
- [ ] Location shortNames correct
- [ ] Cron entry live on Cosmo Vercel project
- [ ] User confirms prod enable (constitution IV)
