# Contract: Vault Sales SMS Logs

**Feature**: `004-vault-sales-sms-logs`  
**Date**: 2026-07-15  
**Related**: `specs/003-admin-daily-sales-sms/contracts/daily-sales-sms.md`

## Navigation

| Deployment | Nav label | Href | Visible when |
|------------|-----------|------|----------------|
| Cosmo OS | OGF & Sales Logs | `/dashboard/ogf-logs` | `hasOgf` (`OGF_LOCATION_ID` set) + audit/settings access |
| Vault OS | Sales SMS Logs | `/dashboard/sales-sms-logs` | `!hasOgf` + same access pattern as Cosmo OGF logs |

Cosmo must not lose OGF & Sales Logs. Vault must not depend on OGF.

## Page: `GET /dashboard/sales-sms-logs` (Vault)

**Auth**: `requirePermission("settings.manage")` (same as Cosmo `/dashboard/ogf-logs`)

**Sections**:

1. **Status summary**
   - Enabled: yes/no
   - Recipient count
   - Last attempt: report date, status, Colombo timestamp (or “None yet”)
   - Next scheduled run: **09:00 Asia/Colombo**
2. **Send for date**
   - Input: `reportDate` (`YYYY-MM-DD`)
   - Action calls resend API (below)
3. **Attempt history**
   - Source: `DailySalesSmsSendLog` for user’s `companyId`, latest N (e.g. 100), `createdAt desc`
   - Columns: Sent At (Colombo), Report date, Recipients, Source, Status, Error, Resend
   - Empty state: no attempts yet; does **not** mention OGF

**Must not** load or render `OgfEmailLog`.

## Page: Cosmo `/dashboard/ogf-logs` (unchanged behavior)

- Section A: OGF email history + email Resend
- Section B: Daily Sales SMS history + SMS Resend (existing)
- Nav remains OGF-gated

## API (reuse)

### Status fields (optional GET extend)

`GET /api/admin/company/daily-sales-sms`  
**Auth**: `settings.sms_portal` today — Vault page may instead load config via server Prisma under `settings.manage` like `ogf-logs`, **or** call existing GET if the viewer has SMS portal permission. Prefer **server-side Prisma on the page** (mirror `ogf-logs`) to avoid a second permission gate mismatch.

### Manual send / resend

`GET|POST /api/admin/company/daily-sales-sms/resend`  
**Auth**: `settings.manage`  
**Query/body**: `{ "reportDate": "YYYY-MM-DD" }`  

**Behavior** (unchanged contract, clarified for Vault):
- Rebuild + send even if no prior log row exists (**Send for date**)
- `source: manual`, force path
- Response: `{ ok, reportDate, recipientCount, status, message? }`

## Cron (both OSes)

`GET /api/cron/daily-sales-sms`  
**Schedule**: `30 3 * * *` UTC = **09:00 Asia/Colombo**  
**Auth**: `Bearer CRON_SECRET`  

Must be registered on **each** Vercel project (Cosmo and Vault). Vault cron uses Vault `DATABASE_URL` / companies only.

## Errors

| Status | When |
|--------|------|
| 401/403 | Not authenticated / missing `settings.manage` |
| 400 | Invalid `reportDate`; no recipients configured |
| 200 + failed | Hutch/provider error; logged with `errorSummary` |
