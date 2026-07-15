# Research: Vault Sales SMS Logs & Delivery Visibility

**Feature**: `004-vault-sales-sms-logs`  
**Date**: 2026-07-15

## R1 — Vault UI surface vs Cosmo OGF logs

**Decision**: Dedicated Vault page at `/dashboard/sales-sms-logs` labeled **Sales SMS Logs**. Cosmo keeps `/dashboard/ogf-logs` (**OGF & Sales Logs**) gated on `OGF_LOCATION_ID` / `hasOgf`.

**Rationale**: Clarification Option B. Vault has no OGF; gating SMS ops behind OGF hid failures. Separate routes avoid confusing Vault users with OGF empty states while preserving Cosmo habits.

**Alternatives considered**:
- Shared `/dashboard/ogf-logs` with Vault-friendly label — rejected (clarification B).
- Single “Notification Logs” label on both — rejected; Cosmo branding of OGF should stay.

## R2 — Why Vault automation appeared “not to send”

**Decision**: Treat as multi-cause; product surfaces diagnosable state rather than guessing one root cause.

Known/likely causes in this codebase:
1. **Nav gate**: Cosmo-only `hasOgf` hid logs on Vault (primary UX gap).
2. **Schedule**: Cron was midnight-adjacent UTC; now **09:00 Asia/Colombo** (`30 3 * * *` UTC) for both OSes — must be **deployed on Vault’s Vercel project** (crons are per deployment).
3. **Config**: Disabled / empty recipients / Hutch portal missing → skip or fail logs (already written by `runDailySalesSmsForCompany`).
4. **Idempotency**: Successful day skips cron re-send (by design).

**Rationale**: Spec FR-006 / SC-006 require operator-visible blockers without engineering.

**Alternatives considered**:
- Ops-only runbooks — rejected for v1 (clarification A wants in-page status).
- Heartbeat table for cron — deferred; last attempt + status summary is enough for common cases.

## R3 — In-page status summary

**Decision**: Vault page header shows: `enabled`, recipient count, last attempt (reportDate + status + time Colombo), and static/next-run copy **09:00 Asia/Colombo**.

**Rationale**: Clarification Option A. Reuse `DailySalesSmsConfig` + latest `DailySalesSmsSendLog` — no new tables.

**Alternatives considered**:
- “Missing yesterday after 09:15” red banner (Option C) — deferred; can derive client-side later from last attempt vs previous Colombo day.
- Logs table only — rejected.

## R4 — Resend vs Send for date

**Decision**: Reuse `GET/POST /api/admin/company/daily-sales-sms/resend?reportDate=` with `force: true` / `source: manual` for both:
- Resend on an existing row
- **Send for date** when no row exists

**Rationale**: Clarification Option A; existing resend already rebuilds from orders and does not require a prior log row.

**Alternatives considered**: New endpoint — rejected (simplicity). Failed-only resend — rejected.

## R5 — Permission model

**Decision**: Match Cosmo OGF logs — `settings.manage` for page + resend/send-for-date (same as `ogf-logs` / `ogf-resend`). Settings SMS Portal remains `settings.sms_portal` for recipient config.

**Rationale**: Spec FR-008; avoids inventing a new permission for v1.

**Alternatives considered**: `settings.sms_portal` only — rejected; Cosmo logs already use `settings.manage`.

## R6 — Shared UI components

**Decision**: Extract a small client/server panel for Daily Sales SMS history + Resend button shared by Cosmo OGF page section and Vault page; Vault adds status + Send-for-date form.

**Rationale**: Prevent Cosmo/Vault column drift while keeping nav/routes separate (Principle V — share at second real use).

**Alternatives considered**: Full copy-paste of Cosmo SMS section — acceptable short-term but higher drift risk; prefer extract if touch Cosmo file anyway.

## R7 — Detecting Vault for nav

**Decision**: Show Vault **Sales SMS Logs** when `!process.env.OGF_LOCATION_ID` (or `NEXT_PUBLIC_APP_NAME === "Vault OS"`), with `canViewAudit` / same gate as Cosmo OGF logs (`settings.manage` via audit-style access — mirror sidebar `canViewAudit` + Cosmo page auth).

**Rationale**: Cosmo already passes `hasOgf={Boolean(OGF_LOCATION_ID)}`. Invert for Vault entry. Prefer `APP_NAME === "Vault OS"` if a future Cosmo env lacks OGF temporarily — document both; implement one primary check (`!hasOgf` for Sales SMS Logs **or** `isVault`).

**Recommended implementation**: 
- Cosmo: `hasOgf &&` → OGF & Sales Logs
- Vault: `!hasOgf &&` → Sales SMS Logs  
  (mutual exclusivity today; avoids two links on Cosmo)

## R8 — Schema / migrations

**Decision**: **No migration** for this feature.

**Rationale**: Config + send log already exist from `003`.

**Alternatives considered**: Cron heartbeat model — out of scope.
