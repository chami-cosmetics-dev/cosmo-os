# Quickstart: Vault Sales SMS Logs & Delivery Visibility

**Feature**: `004-vault-sales-sms-logs`  
**Date**: 2026-07-15

Validation guide after implementation. Details: [contracts](./contracts/vault-sales-sms-logs.md), [data-model](./data-model.md).

## Prerequisites

- Vault env: `npm run env:use vault` (or deploy against Vault)
- User with `settings.manage` (and ability to open SMS Portal settings)
- Daily Sales SMS recipients configured + Hutch SMS portal configured for the Vault company
- Cosmo env available for regression smoke

## 1. Vault navigation (no OGF)

1. Sign in to Vault OS (`OGF_LOCATION_ID` unset / `NEXT_PUBLIC_APP_NAME=Vault OS`).
2. Confirm sidebar shows **Sales SMS Logs** (not gated on OGF).
3. Confirm Cosmo (with OGF) still shows **OGF & Sales Logs** only, not a second Vault-named link.

**Expected**: Vault opens `/dashboard/sales-sms-logs` with status summary + SMS table; no OGF email section.

## 2. Status summary

1. Open Sales SMS Logs with SMS enabled and ≥1 recipient.
2. Confirm summary shows enabled, recipient count, last attempt (or none), next run **09:00 Asia/Colombo**.
3. Disable Daily Sales SMS in Settings → SMS Portal; refresh logs page.

**Expected**: Summary reflects disabled; cron should skip (verify later via empty/skip log after a cron dry-run if needed).

## 3. Send for date (no prior row)

1. Pick a past Colombo report date with known sales and **no** successful log (or accept a new manual row).
2. Use **Send for date** → confirm API success and new log row `source=manual`, `status=sent` or `failed` with error.
3. Confirm phones receive SMS on success.

**Expected**: Catch-up works without an existing row ([contract](./contracts/vault-sales-sms-logs.md)).

## 4. Resend from row

1. Open a failed (or prior) log row → **Resend**.
2. Confirm new attempt logged; status updates accordingly.

## 5. Cron schedule (ops)

1. Confirm `vercel.json` has `/api/cron/daily-sales-sms` → `30 3 * * *` (09:00 Asia/Colombo).
2. After deploy to the **Vault** Vercel project, open Project → Settings → Cron Jobs and confirm that path/schedule is listed for Vault (Cosmo’s project is separate — both need the cron).
3. Optional: authorized `GET /api/cron/daily-sales-sms?date=YYYY-MM-DD` with `CRON_SECRET` against the Vault host → summary JSON + log rows for the Vault company.

**Expected**: Automation hits Vault DB/recipients; not Cosmo’s.

## 6. Cosmo regression

1. On Cosmo with OGF: open **OGF & Sales Logs**.
2. Confirm OGF email section + Daily Sales SMS section + Resend still work.

## Automated checks

```bash
npm test
```

Add/run any Vitest covering nav/status helpers introduced by this feature.

## Done when

- [ ] Vault nav + page without OGF
- [ ] Status summary accurate
- [ ] Send for date + Resend work and log
- [ ] Vault cron schedule deployed / verified
- [ ] Cosmo OGF & Sales Logs unchanged
