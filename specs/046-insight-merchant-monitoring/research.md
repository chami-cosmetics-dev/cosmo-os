# Research: Insight Merchant Monitoring

**Feature**: `046-insight-merchant-monitoring`  
**Date**: 2026-08-29

## R1 — Loyalty tier for monitoring rollups

**Decision**: Use `effectiveLoyaltyTierKey(contact.loyaltyAssignedTier)` — same as `lib/customer-insight/filters.ts` list rows. Unassigned (`loyaltyAssignedTier` null) → **Standard**.

**Rationale**: Spec FR-003 says assigned tier overrides spend. Production insight filter already uses registered tier only (`erp-loyalty.ts` ignores computed spend for badge). Monitoring must match what admins see on filtered contact lists.

**Alternatives considered**: `classifyLoyaltyTierKey(lifetimeTotal)` — rejected (inflates Gold/Plat counts for high spenders not yet registered). Union of assigned OR computed — rejected (conflicts with live insight badges).

---

## R2 — Recency bucket boundaries

**Decision**: Pure helper `classifyPurchaseRecencyBucket(lastPurchaseAt, asOfYmd)` in `lib/customer-insight/merchant-monitoring-recency.ts` with Vitest. Buckets (days since last purchase, inclusive, Colombo calendar day diff):

| Bucket key | Days since last purchase |
|------------|--------------------------|
| `today` | 0 (same calendar day as `asOfYmd`) |
| `d1_30` | 1–30 |
| `d31_90` | 31–90 |
| `d91_180` | 91–180 |
| `d181_365` | 181–365 |
| `d365_plus` | > 365 |
| `never` | `lastPurchaseAt` is null |

`asOfYmd` = period **end** date (`toYmd` from period resolution).

**Rationale**: Matches spec user story 3; testable without DB; reused by drill-down date mapping.

**Alternatives considered**: Month-based presets (existing `noPurchaseMonths`) — rejected (spec requires explicit day bands). SQL `CASE WHEN` only — rejected for drill-down reuse; helper first, SQL can call same logic in tests.

---

## R3 — Period presets (Today / MTD / custom)

**Decision**: Client resolves preset to `fromYmd` / `toYmd` (YYYY-MM-DD) before API call — same UX pattern as `merchant-dashboard-panel.tsx`. Server Zod validates dates; helper `resolveMerchantMonitoringPeriod({ fromYmd, toYmd, todayYmd })`:

- Clamp `toYmd` to `todayYmd` if future.
- Reject `fromYmd > toYmd`.
- Return `{ fromYmd, toYmd, periodEndYmd: toYmd, periodLabel }` where `periodLabel` is `Today`, `MTD`, or `from – to`.

**Purchased-in-period** = allocated contact has ≥1 qualifying purchase (Adapt `invoiceDate` or Cosmo order in `customerLifetimeTotalOrderWhere`) with date ∈ `[fromYmd, toYmd]` inclusive (Colombo day bounds via existing `parseDayStartUtc` / `parseDayEndUtc`).

**Recency buckets** use `periodEndYmd` only; changing `fromYmd` does not shift bucket boundaries (only purchased-in-period count changes).

**Rationale**: Spec FR-008 separates portfolio snapshot (no period) from purchase metrics (period). Matches merchant dashboard mental model.

**Alternatives considered**: Server-only preset enum — rejected (duplicates GM panel logic). Using `lastPurchaseAt` in range as purchased-in-period — rejected (misses repeat buyers whose last purchase is outside range).

---

## R4 — Aggregation performance (no new tables)

**Decision**: Single-pass in-memory rollup:

1. Reuse `listInsightMerchantRosterOptions` + alias map from `allocation-summary.ts`.
2. `prisma.contactMaster.findMany` where `companyId` and `assignedMerchant` not null — select `id, assignedMerchant, loyaltyAssignedTier, email, birthMonth, birthDay, lastPurchaseAt` (batched if >10k rows).
3. Roll into `Map<merchantValue, MerchantMonitoringAccumulator>` for portfolio + recency tier splits.
4. Purchased-in-period: batched `adaptPurchaseHistory` distinct `contactId` + order attribution query on contact id set, intersect allocated ids.

Company totals = sum of merchant rows. No N+1 lifetime totals (tier uses assigned only).

**Rationale**: No migration (Constitution I). 50k rows × ~7 fields fits memory; aligns with existing `lifetimeTotalsByContactId` batching patterns. Portfolio table must load without timeout (SC-004).

**Alternatives considered**: Materialized view / new summary table — rejected (Principle V; premature). Per-merchant API calls from client — rejected (performance rule: one page-data endpoint).

---

## R5 — API shape

**Decision**: One read endpoint + one export endpoint (no new page route).

| Route | Purpose |
|-------|---------|
| `GET /api/admin/customer-insight/merchant-monitoring` | JSON payload: period meta, `rows[]`, `companyTotals`, `recencyMatrix` |
| `GET /api/admin/customer-insight/merchant-monitoring/export` | PDF bytes; same query params |

Auth: `requirePermission("contacts.insight.read")` + `hasInsightAdminView` (same as allocation-summary).

Optional query: `assignedMerchant` (filter to one merchant).

**Rationale**: Follows `.cursor/rules/performance-optimization.mdc` page-data pattern; mirrors allocation-summary auth.

**Alternatives considered**: Extend allocation-summary route — rejected (response shape too different). Client-side aggregation — rejected (security + performance).

---

## R6 — PDF generation

**Decision**: `lib/customer-insight/merchant-monitoring-pdf.ts` using **pdfmake** (same stack as `lib/dispatch-pdf.ts`). Landscape A4; header: company name, period label, generated-at; tables for portfolio rows + recency matrix. Export route reuses `buildMerchantMonitoringReport()` then `generateMerchantMonitoringPdf()`.

**Rationale**: Only existing PDF stack in repo; spec FR-010; no new dependency.

**Alternatives considered**: Client print-to-PDF — rejected (inconsistent layout). XLSX — rejected (spec asks PDF; CSV already exists for allocation summary).

---

## R7 — Drill-down into Insight filter

**Decision**: Extend `customerInsightFilterQuerySchema` with optional `lastPurchaseFrom`, `lastPurchaseTo`, and `loyalty` (`gold` | `platinum` | `standard`) — same shapes as call-queue assign schema. Add `recencyBucketToLastPurchaseRange(bucket, asOfYmd)` helper for click mapping.

Click on monitoring cell → switch Customer Insight to **Filter** tab with query params: `assignedMerchant`, `loyalty`, `lastPurchaseFrom`, `lastPurchaseTo`. Never-purchased bucket → `noPurchaseFrom`/`noPurchaseTo` or dedicated `lastPurchaseEmpty` flag (use `noPurchaseMonths` legacy or add `hasPurchase=false` filter field).

For **never purchased**: add optional `hasLastPurchase: "false"` to filter schema (cleaner than fake date range).

**Rationale**: Spec FR-012; reuses existing filter list UI and export path.

**Alternatives considered**: Open call-queue assign panel only — rejected (recency drill is contact list, not queue assign). New dedicated contact list route — rejected (Principle V).

---

## R8 — Missing DOB / email on call-queue contact open

**Decision**: When insight loads for a contact opened from **my call queue** or assign flow, show a compact `Alert` if `getLoyaltyProfileMissingFields` includes **Email** or **Birth date (month & day)** only. Link/focus to existing profile edit card. No new API.

**Rationale**: Spec FR-013/014; reuses `loyalty-profile-complete.ts` and existing profile PATCH.

**Alternatives considered**: Block call until complete — rejected (spec says highlight, not gate). Show all loyalty missing fields — rejected (spec scopes to DOB + email for monitoring alignment).

---

## R9 — UI placement

**Decision**: Replace/extend the **Merchant allocations** card in Customer Insight **Admin** tab with **Merchant monitoring** card: period chips (Today / MTD / custom), merchant dropdown, portfolio table, expandable recency matrix per merchant (or single matrix when one merchant selected). Keep **Export CSV** on allocation summary as FR-011; add **Export PDF** beside Refresh.

**Rationale**: Spec assumption: Admin tab extension; existing `canExportFilteredCsv` / `hasInsightAdminView` gating.

**Alternatives considered**: New sidebar route — rejected (spec). Embed in Merchant Dashboard — rejected (spec says Insight page).

---

## R10 — Performance pitfalls (first implementation review)

**Decision**: When implementing `buildMerchantMonitoringReport`, follow R4 batched queries strictly. Avoid these anti-patterns that caused slow loads:

1. **Do not** load `phones` / `emails` relations on every allocated contact for portfolio rollup — DOB/email completeness uses `birthMonth`, `birthDay`, and `email` on `ContactMaster` only.
2. **Do not** fetch all company orders for the period when lookup key count exceeds a threshold — always filter Adapt/Cosmo queries to the allocated contact id / phone / email key set (chunked `IN` batches).
3. **Prefer** one `groupBy` or batched `findMany` over per-contact Adapt calls (N+1).
4. **Test** with realistic data: monitoring must return in <5s (SC-004). If slow, profile `buildMerchantMonitoringReport` before adding UI polish.

**Rationale**: First pass hung on "Loading monitoring…" due to unfiltered order scan + heavy relation joins.
