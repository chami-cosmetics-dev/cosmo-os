# Quickstart: ERP Sync Failure Alerts

**Feature**: `009-erp-sync-failure-alerts`  
**Date**: 2026-07-18

## Prerequisites

- Target env active (`npm run env:use cosmo-dev` or `vault`)
- Migrations applied (`db:deploy:<target>` / `db:deploy:all` after implementation)
- Maileroo configured (`MAILEROO_API_KEY`, `MAILEROO_FROM_EMAIL`)
- User with `settings.email_templates`
- (Retry path) user/ops with `failed_webhooks.read` / `failed_webhooks.retry`

## Validation scenarios

### 1. Stale pending auto-recovery

1. Create or locate an order with `erpnextInvoiceId = pending`, null sync error, `erpnextSyncStartedAt` older than 5 minutes (staging fixture).
2. Trigger `GET /api/cron/failed-erp-syncs-auto-retry` with `CRON_SECRET` (or wait for minute cron).
3. Expect: error text recorded (interrupted/stuck), `erpnextSyncFailedAt` set, auto-retry scheduled or executed.
4. On success: real SI id stored; order leaves failed list.
5. Concurrent double-run: still a single SI (po_no lookup / lease).

### 2. Failed panel copy

1. Open `/dashboard/orders/failed-erp-syncs`.
2. Confirm stuck-pending rows show a human reason (not `—`) and a detection/start time when available.

### 3. Settings + preview (no send)

1. Open ERP sync failure email settings (email settings surface).
2. For Vault: save `buddhima.cosmetics@outlook.com`; for Cosmo: save a test inbox.
3. Preview a known report date with unresolved failures.
4. Confirm order count and incl/shipping/excl totals match source orders (within 0.01).

### 4. Test email

1. With recipients saved and Maileroo working, Send test email for that date.
2. Inbox shows `[TEST]` subject, order table, and three summary totals.
3. Send log shows `preview_test` and does **not** block later cron for that date.

### 5. Cutoff cron + dedupe

1. Call `GET /api/cron/erp-sync-failure-email?date=YYYY-MM-DD` with `CRON_SECRET`.
2. Expect one `sent` (or `skipped_no_failures` / skip reasons) per company.
3. Call again — expect `skipped_already_sent` for successful companies.
4. Disable config or clear recipients — expect skip without delivery.

### 6. Cross-tenant isolation

1. Configure different recipients on Cosmo vs Vault.
2. Run cron against each env/DB.
3. Confirm each mail only lists that company’s orders and recipients.

### 7. Manual resend after failure

1. Force Maileroo failure (bad key in staging) → log `failed` with error.
2. Fix config; resend for that `reportDate`.
3. New log row `source: manual`; orders’ ERP fields unchanged by the email path.

## Unit tests

```bash
npx vitest run lib/erp-sync-failure-email.test.ts lib/failed-erp-sync-auto-retry.test.ts
```

Cover: stale threshold, interrupted message, shipping/excl arithmetic, multi-currency grouping, recipient normalize/dedupe, cron skip statuses.

## Go-live checklist

- [ ] Migration deployed to all three DBs
- [ ] Vault recipients include `buddhima.cosmetics@outlook.com`
- [ ] Cosmo recipients set by ops
- [ ] Cron entry live on Cosmo and Vault Vercel projects
- [ ] User confirms prod enable (constitution IV)
- [ ] Spot-check one end-of-day email against failed-erp-syncs page
