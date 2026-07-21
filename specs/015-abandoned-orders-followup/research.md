# Research: Abandoned Orders Follow-up

**Feature**: `015-abandoned-orders-followup`  
**Date**: 2026-07-21

## R1 — Shopify API for abandoned checkouts

**Decision**: Use Shopify Admin **GraphQL** `abandonedCheckouts` query at API version `2024-10` (aligned with `lib/shopify-admin.ts`). Paginate with `first` + `pageInfo.hasNextPage` / `endCursor`. Filter with `query: "created_at:>='{iso7DaysAgo}'"` (Shopify search syntax on `created_at`).

**Rationale**: Shopify deprecated the REST Checkout resource as of 2024-07 and introduced the GraphQL `abandonedCheckouts` listing in 2024-10. GraphQL returns customer, line items, totals, `completedAt`, and recovery state needed for FR-013.

**Alternatives considered**:
- REST `GET /checkouts.json` — rejected (deprecated/legacy).
- Shopify webhooks for checkout abandonment — rejected for v1 (spec: page-open + 30 min cron only).

## R2 — Store resolution and credentials

**Decision**: For each company, collect distinct `CompanyLocation.shopifyAdminStoreHandle` values where handle is non-null. Call GraphQL per store handle using global `SHOPIFY_ADMIN_ACCESS_TOKEN` (same pattern as `cancelShopifyOrder` in `lib/shopify-admin.ts`). Persist `shopifyAdminStoreHandle` on each `ShopifyAbandonedCheckout` row.

**Rationale**: Locations already store Shopify store identity; Cosmo uses one Admin token per deployment env. Multi-store companies get merged company-wide list (FR-003a).

**Alternatives considered**:
- Per-location access tokens — not present in schema today.
- Single implicit store from env — rejected; company may have multiple handles on locations.

## R3 — Local persistence vs live-only list

**Decision**: Persist abandoned checkouts in `ShopifyAbandonedCheckout` via upsert on sync. Follow-up fields live on the same row. Track `CompanyAbandonedCheckoutSync.lastSyncedAt` and `lastSyncError` per company.

**Rationale**: Follow-up status, remarks, and audit must survive between syncs; Shopify does not store Cosmo follow-up data. Stale-while-revalidate: show DB immediately, refresh from Shopify when stale.

**Alternatives considered**:
- Fetch Shopify on every list request only — rejected (slow, no durable follow-up, poor offline/stale UX).
- Separate follow-up table keyed by checkout — rejected (unnecessary join for v1).

## R4 — Sync trigger strategy

**Decision**:
1. **Page open**: `GET /api/admin/abandoned-orders/page-data` runs sync when `lastSyncedAt` is null or older than 30 minutes (or always refresh in background without blocking first paint — return cached rows + `syncing` flag).
2. **Cron**: Add `vercel.json` entry `*/30 * * * *` → `/api/cron/abandoned-checkouts-sync` iterating companies with at least one Shopify-configured location; same `syncAbandonedCheckoutsForCompany()`.

**Rationale**: Matches clarified spec (page open + ~30 min background). Cron pattern matches `app/api/cron/daily-sales-sms/route.ts` (`CRON_SECRET` bearer).

**Alternatives considered**:
- Manual refresh only — rejected by clarification.
- Real-time webhooks — rejected by clarification.

## R5 — 7-day window enforcement

**Decision**: Apply cutoff in two places: Shopify GraphQL `created_at` filter for fetch efficiency; server-side discard any row with `abandonedAt < now - 7 days` before upsert. Optional nightly prune of DB rows older than 7 days that are Closed or still Pending with no follow-up activity (keep if `followUpStatus != pending` for reporting — **default: keep closed rows until 7 days from abandonedAt then stop re-importing; do not delete closed history in v1**).

**Rationale**: FR-003b requires no imports older than 7 days; retaining locally synced closed rows within window avoids flicker.

**Alternatives considered**:
- Hard-delete all rows past 7 days — rejected (loses recent closed follow-up history within export window).
- 30-day window — superseded; product decision is last 7 days only.

## R6 — Recovery / converted checkout detection

**Decision**: On sync, if Shopify returns `completedAt != null` or recovery state indicates recovered, set `shopifyRecoveredAt`, auto-set `followUpStatus = closed`, `customerResponse = recovered_sale` (only if not already manually closed with another response — **if user already closed with different response, set `shopifyRecoveredAt` flag but do not overwrite manual response**).

**Rationale**: FR-013 requires auto-recovery visibility without clobbering merchant-recorded outcomes.

**Alternatives considered**:
- Always overwrite with Recovered sale — rejected (destroys manual close data).

## R7 — Follow-up validation rules

**Decision**: Mirror merchant review status strings: `pending`, `follow_up`, `closed`. Customer response enum: `no_more_interest`, `purchased_elsewhere`, `changed_my_mind`, `recovered_sale`, `no_response`. Zod PATCH schema enforces response required when `followUpStatus === closed`; optional otherwise. Allow transition `closed → follow_up` (reopen).

**Rationale**: Direct mapping to clarified acceptance scenarios; consistent with `MerchantOrderReview.reviewStatus` patterns.

**Alternatives considered**:
- Separate `FollowUpRecord` table — rejected (YAGNI).

## R8 — Permissions and defaults

**Decision**: Add `abandoned_orders.read` and `abandoned_orders.manage` to `DEFAULT_PERMISSIONS` in `lib/rbac.ts`. Grant both to `super_admin` and `admin` default role keys; grant read-only to `merchant` role optional — **default: merchant role gets read + manage if they have `orders.read` today for parity with order ops** — actually spec says explicit assignment; **default: admin/super_admin only; merchant role does not auto-receive** (assign via Roles UI).

**Rationale**: Spec assumption: super-admin/admin default; others explicit.

## R9 — UI and export patterns

**Decision**: Page at `/dashboard/orders/abandoned-orders`; panel with filters (date range, follow-up status default pending+follow_up, customer response), inline row editor or slide-over for follow-up; CSV via `GET /api/admin/abandoned-orders/export` using `buildCsv` like `app/api/admin/returns/export/route.ts`.

**Rationale**: Existing patterns for CSV, sidebar (`app-sidebar.tsx` Order Management group), and action-loading UX.

**Alternatives considered**:
- Client-side CSV from loaded page — rejected (must export full filtered set per FR-011).

## R10 — Vault OS / missing token behavior

**Decision**: If `SHOPIFY_ADMIN_ACCESS_TOKEN` missing (Vault deployment), sync no-ops with `lastSyncError` message; page shows empty state explaining Admin API not configured; follow-up still works on any rows already in DB (unlikely on Vault).

**Rationale**: Matches `lib/shopify-admin.ts` token guard; avoids runtime crash.
