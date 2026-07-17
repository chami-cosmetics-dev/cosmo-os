# Research: Admin Daily Sales SMS

**Feature**: `003-admin-daily-sales-sms`  
**Date**: 2026-07-13

## R1 — Sales definition & aggregation source

**Decision**: Use the same eligibility as dashboard sales with `date_type: "order"`:
- Day/MTD window on `Order.createdAt` with Asia/Colombo day bounds (`T00:00:00+05:30` … `T23:59:59.999+05:30`)
- Include only orders whose financial status is in `{ paid, pending }` (voided/cancelled excluded)
- Value = sum of `totalPrice`; Count = order count
- MTD = from 1st of month through report day inclusive
- Location breakdown via `companyLocationId`; label = `CompanyLocation.shortName` or truncated `name`

**Rationale**: Spec assumes created-day sales excluding voided; `lib/page-data/dashboard-sales.ts` already implements Colombo bounds and paid/pending eligibility — numbers stay consistent with dashboard “order date” views.

**Alternatives considered**:
- Invoice-complete / delivered-only sales — rejected for v1 (spec default is created day); can swap filter later in one module.
- Raw Shopify export totals — rejected; OS is source of truth for automation.

## R2 — SMS delivery

**Decision**: Call existing `sendSms(companyId, phone, message)` from `lib/hutch-sms.ts` for each configured recipient. Phone normalization already maps `0766713205` → `94766713205`.

**Rationale**: Company SMS portal (Hutch) is already configured; no new vendor; `SmsLog` retains send audit.

**Alternatives considered**:
- New SMS provider — rejected (constitution simplicity + existing portal).
- Email-only — rejected (spec requires SMS).

## R3 — Recipient storage

**Decision**: New Prisma model `DailySalesSmsConfig` (1:1 company) with `recipients Json` string array. Seed/default UX: empty until settings save; document initial number **0766713205** for ops to enter (or one-time seed on first Cosmo settings open is optional — prefer explicit save in UI).

**Rationale**: `Company` has no settings JSON blob; stuffing into `SmsNotificationConfig.additionalRecipients` mixes order-lifecycle SMS with reports. Dedicated config is clearer and holds dedupe-related fields if needed.

**Alternatives considered**:
- Env var only — rejected (FR-005 editable list).
- Reuse notification trigger enum — rejected (wrong domain coupling + still needs migration).

## R4 — Duplicate protection & send log

**Decision**: `DailySalesSmsSendLog` with unique `(companyId, reportDate)` for successful automatic sends. Cron skips if a successful log exists for that report day unless `?force=1` / admin “resend”.

**Rationale**: Mirrors `OgfEmailLog` pattern; satisfies FR-010.

**Alternatives considered**:
- Only in-memory / Vercel logs — rejected (re-runs would double-SMS).
- Mark on config alone (`lastSentReportDate`) — acceptable simpler variant; send log preferred for audit of skip/fail.

## R5 — Scheduling

**Decision**: Cron route `GET /api/cron/daily-sales-sms` authenticated with `Authorization: Bearer CRON_SECRET`. Schedule in `vercel.json` similar to `ogf-sale` (`30 18 * * *` UTC ≈ 00:00 Asia/Colombo) so the job sends for **previous** Colombo calendar day.

**Rationale**: Established cron auth; Colombo midnight alignment already used for OGF sale.

**Alternatives considered**:
- Manual-only send — rejected as sole approach (P2 automation required); keep preview/manual as complement.
- External scheduler — rejected; Vercel crons already in repo.

## R6 — Permissions & UI placement

**Decision**: Guard config/preview with `requirePermission("settings.sms_portal")`. Place settings UI near existing SMS portal / SMS notifications settings.

**Rationale**: Same operators manage Hutch credentials and SMS features; avoid inventing `settings.manage` (not in DEFAULT_PERMISSIONS).

**Alternatives considered**:
- New permission key — optional later if RBAC split is needed; not required for MVP.
- `dashboard.view` for preview only — possible but settings ownership fits recipients better.

## R7 — Multi-tenant scope

**Decision**: Implement in shared codebase; enable for Cosmo first (recipients + shortNames). Cron iterates companies that have `DailySalesSmsConfig` with ≥1 recipient (or all companies and skip empty) so Vault stays quiet until configured.

**Rationale**: Spec FR-012 Cosmo-first; Vault reuse without code fork.

## R8 — Failure UI + manual resend (OGF logs)

**Decision**: Show `DailySalesSmsSendLog` rows on existing `/dashboard/ogf-logs` as a second section (“Daily Sales SMS”), with Resend like `OgfResendButton` / `app/api/admin/ogf-resend/route.ts`. Do not overload `OgfEmailLog` rows.

**Rationale**: Operators already use [OGF Email Logs](https://os.cosmetics.lk/dashboard/ogf-logs) for nightly failure recovery; putting SMS failures elsewhere would be missed.

**Alternatives considered**:
- New sidebar page only for SMS — rejected (extra navigation; duplicates habit).
- Store SMS failures inside `OgfEmailLog` — rejected (wrong shape: batchCode/emailTo vs reportDate/phones).
- Failed ERP Syncs panel — rejected (ERP domain, wrong audience).

**Permission**: Keep page on existing `settings.manage` (same as OGF logs today) for the SMS section, or allow read if user already has page access; resend uses same gate as OGF resend.
