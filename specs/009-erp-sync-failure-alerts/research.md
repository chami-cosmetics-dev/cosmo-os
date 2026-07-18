# Research: ERP Sync Failure Alerts

**Feature**: `009-erp-sync-failure-alerts`  
**Date**: 2026-07-18

## R1 — Stale pending (“zombie”) detection

**Decision**: Add `Order.erpnextSyncStartedAt` set whenever the sync slot is claimed (`erpnextInvoiceId` → `"pending"`). Treat as stale when `erpnextInvoiceId === "pending"`, `erpnextSyncError` is null, and `erpnextSyncStartedAt` (or fallback `updatedAt` for backfill) is older than **5 minutes**. On detection, call `markOrderErpSyncFailed` with a fixed message such as `ERP sync interrupted before completion` (sets `erpnextSyncFailedAt`, schedules auto-retry when classification allows).

**Rationale**: Spec requires auto-trigger for empty-error failures. Existing `scheduleUnscheduledFailedErpSyncs` skips empty errors. Vercel webhook/`maxDuration` is typically ≤60s; 5 minutes avoids racing an in-flight sync while recovering true zombies before end-of-day.

**Alternatives considered**:
- Use only `updatedAt` — rejected (unrelated order updates refresh it while pending stays stuck).
- Immediate retry of all pending without age — rejected (can collide with live webhook sync).
- Separate “zombie” table — rejected (constitution simplicity; Order fields already hold sync state).

## R2 — Silent early returns after claim

**Decision**: After a successful claim to `"pending"`, `syncOrderToERPNext` / `syncOrderToERPNextFromOrder` must not return success without an ERP SI id. Convert credential / company-warehouse / empty-line-item skips into thrown errors (or call `markOrderErpSyncFailed` and clear pending). Keep existing `assertOrderHasErpSalesInvoice` on retry paths. Existing SI lookup by `po_no` remains the duplicate-protection path.

**Rationale**: These silent returns are a primary creator of zombie pending with no error.

**Alternatives considered**:
- Only classify zombies later — incomplete; new silent skips would keep creating them.
- Clear pending without error — rejected (orders would disappear from failed list without ops visibility).

## R3 — Auto-retry integration

**Decision**: Reuse existing cron `GET /api/cron/failed-erp-syncs-auto-retry` (`* * * * *`), delays `1m / 3m / 10m / 30m`, lease 2 minutes, batch limit. Extend the unscheduled sweep to: (1) classify stale pending → mark failed; (2) then schedule as today when `erpnextSyncError` is present and retryable. Non-retryable classifications stay manual-only.

**Rationale**: Spec wants auto-trigger before cutoff without a second retry engine.

**Alternatives considered**:
- Separate zombie-only cron — rejected (duplicate claim/lease complexity).
- Unlimited retries until midnight — rejected (existing 4-attempt schedule is enough; email covers leftovers).

## R4 — Cutoff time & report day

**Decision**: Cron `GET /api/cron/erp-sync-failure-email` scheduled at **`35 18 * * *` UTC** ≈ **00:05 Asia/Colombo**. Report date = **previous** Colombo calendar day. Qualifying orders: company + `createdAt` in that day’s Colombo bounds, not voided/cancelled, and still matching failed-ERP-sync eligibility (`erpnextInvoiceId` null/`pending`/`pending_approval` with error, or stale/pending-without-SI) at snapshot time. Auth: `Authorization: Bearer ${CRON_SECRET}`.

**Rationale**: Spec’s 11:59 PM local cutoff is satisfied by a post-midnight snapshot of the completed local day (same pattern as OGF/`daily-sales-sms` Colombo alignment). Safer than racing exactly 23:59.

**Alternatives considered**:
- Cron at 23:59 Colombo for “today” — racey for last-minute orders still within the 5-minute in-progress allowance.
- Mid-morning digest — rejected (spec wants end-of-day reconciliation for next-day ERP posting risk).

## R5 — Email delivery & snapshot

**Decision**: Send via Maileroo (`lib/maileroo.ts`) with a new `sendErpSyncFailureAlertEmail` supporting multiple `to` addresses (same pattern as finance approval). Persist `ErpSyncFailureEmailSendLog` with status, recipients snapshot, optional HTML/summary JSON for totals/order ids, `source` = `cron` | `manual` | `preview_test`. Automatic success dedupe on `(companyId, reportDate)` for cron; test/manual always append. Email failure must not mutate order ERP fields.

**Rationale**: No Resend in repo; Maileroo is production email. Snapshot immutability matches FR-029.

**Alternatives considered**:
- Resend — not in codebase.
- Reuse `EmailTemplate` rows only — rejected for structured order tables; optional subject prefix ok.
- In-app notifications only — rejected (spec requires email to heads).

## R6 — Settings UI, permissions, multi-tenant

**Decision**: Company-scoped `ErpSyncFailureEmailConfig` (`enabled`, `recipients` JSON string[]). UI form mirroring `daily-sales-sms-settings-form` (enabled checkbox, one email per line, last send log, report date, Preview, Send test email). Mount on settings email surface (`settings.email_templates` permission) so both Cosmo and Vault admins can configure independently. Seed/document Vault initial recipient `buddhima.cosmetics@outlook.com` (explicit save preferred over silent hard-code). Cron iterates companies with enabled config + recipients; empty/disabled → skip with log.

**Rationale**: Spec UI reference is Daily Sales SMS; email domain fits `settings.email_templates`. Per-company DB isolation already separates Cosmo vs Vault.

**Alternatives considered**:
- `failed_webhooks.read` only — operators see failures but may lack settings write; email-templates owners already manage recipients elsewhere.
- Hard-code Vault email in cron — rejected long-term (FR-020 editable list).

## R7 — Amounts including / excluding shipping

**Decision**: For each order row:
- **Including shipping** = order display/total used for sales consistency (`totalPrice` when it is the storefront total; document and reuse the same helper used for ERP/shipping display if `totalPrice` is known-subtotal in some paths).
- **Shipping** = net shipping from existing resolvers (`resolveOrderShippingDisplay` / ERP shipping helper rules: free-shipping coupon → 0; else discounted shipping lines; else `totalShipping`).
- **Excluding shipping** = including − shipping (clamp shipping so excluding never exceeds including).

Group and sum by `currency`. Show all three in row and summary.

**Rationale**: Spec requires both shipping-inclusive and exclusive totals for daily tally vs ERP.

**Alternatives considered**:
- Always `totalPrice − totalShipping` only — rejected without free-shipping / discounted-line handling.
- Item subtotal rebuild from line items — heavier; use stored totals + shipping resolvers first.

## R8 — Failed panel UX for empty errors

**Decision**: In `failed-erp-syncs-panel`, when `erpnextInvoiceId === "pending"` and no `erpnextSyncError`, show copy like “Sync interrupted or stuck pending” and show `erpnextSyncStartedAt` or detection time instead of `—`.

**Rationale**: Spec/ops clarity while auto-retry catches up.

## R9 — Agent context script

**Decision**: `.specify/scripts/powershell/update-agent-context.ps1` is not present in this repo; skip agent-context update and note in plan completion. No blocker for design artifacts.

**Alternatives considered**: Invent a new agent context file without the Spec Kit script — out of scope for this command.
