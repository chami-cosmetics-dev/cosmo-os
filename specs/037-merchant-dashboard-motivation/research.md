# Research: Merchant Dashboard Motivation & Sales Tracking

**Feature**: `037-merchant-dashboard-motivation`  
**Date**: 2026-08-11

## R1 — Delivery surface (extend page-data vs new APIs)

**Decision**: Extend **`GET /api/admin/merchant-dashboard/page-data`** (and `getMerchantDashboardPageData`) with Today, peer boards, location share, and sales history. No new client fetches for v1.

**Rationale**: Workspace performance pattern (aggregated page-data); merchant panel already bootstraps from one payload; avoids duplicate auth/DB chains.

**Alternatives considered**:
- Separate `/peers`, `/history`, `/today` routes — rejected (extra round-trips; merchants hit all sections every load).
- Server Components only — rejected (panel already client with admin switcher refetch).

## R2 — Permissions

**Decision**: Keep existing access: `canAccessMerchantDashboard(roleNames)` **or** `dashboard.merchant_view`. Peer named amounts are intentional for merchant-role users (spec clarifications). Admin switcher + `dashboard.merchant_targets.manage` unchanged.

**Rationale**: Spec assumes merchants already see named peers on Overview; FR-007a requires named amounts on personal boards. New permission would block the product goal.

**Alternatives considered**:
- New `dashboard.merchant_peers.read` — rejected (Principle V; same cohort already visible to merchants with Overview access).
- Hide peer amounts from merchants — rejected by clarify session Q1.

## R3 — Attribution & date windows

**Decision**: Reuse **`fetchMerchantUserSales` attribution rules** (coupon match to user codes, else `assignedMerchantId === userId`) and dashboard sales eligibility (`isDashboardSalesOrderEligible` + `all_orders` date type). All day/month bounds use **Asia/Colombo** via existing `formatAppIsoDate` / `T00:00:00.000+05:30` helpers.

**Rationale**: FR-009 requires consistency with current merchant MTD KPIs.

**Alternatives considered**:
- Merchant-group collapse (brand sales style) — rejected (targets/personal MTD stay individual today).
- SI-date / delivery-date toggles on merchant home — deferred (Overview filter feature; keep `all_orders` unless product asks later).

## R4 — Cohort aggregation performance

**Decision**: Add a **cohort order scan** helper for a date window: load eligible company orders once, attribute each order to at most one merchant in the merchant-role cohort (same coupon/`assignedMerchantId` rules), accumulate per-merchant totals and per-(merchant, location) totals. Run for **Today** and **MTD** windows (and reuse MTD scan for location share + peer board). Admin `overview` rows SHOULD reuse the MTD cohort scan instead of N parallel `fetchMerchantUserSales` where practical.

**Rationale**: Current admin overview is N× full-order fetches — peer boards for **all** merchants would worsen that. Single-pass matches brand-sales aggregation style without new storage.

**Alternatives considered**:
- Keep N×`fetchMerchantUserSales` — rejected at peer+location scale.
- Materialized daily snapshots table — deferred (Constitution I + V until proven slow).

## R5 — Peer board shape (top 10 + self)

**Decision**: Pure function `buildPeerBoard(rows, viewedMerchantId, { limit: 10 })`:
1. Sort by sales desc, then stable displayName/id.
2. Assign **1-based rank** across full cohort (zeros included; last when tied by sort order).
3. Emit **top 10** entries with `{ rank, merchantId, displayName, total, orderCount }`.
4. If viewed merchant not in top 10, **append** their row (true rank).
5. Compute `leaderTotal`, `gapToLeader` (amount), `viewedRank`, motivational `peerBand` from relative position (leader / near-leader / mid / behind / no_sales).

Solo cohort → solo-leader state (no fake peers).

**Rationale**: Matches clarify Q5; keeps payload small; rank remains truthful.

**Alternatives considered**: Full cohort list — rejected (Q5). Anonymized — rejected (Q1).

## R6 — Location share + compact peers

**Decision**: For each location where **viewed merchant total &gt; 0** in the period:
- `locationTotal` = sum of all cohort attributed sales in that location (plus optional Unassigned bucket consistent with existing location maps).
- `selfAmount`, `selfSharePct` = self / locationTotal.
- `peers` = other cohort merchants with amount &gt; 0 in that location, sorted desc, **compact** (cap e.g. top 8 peers + note if more; always exclude duplicating self as a peer row — self shown separately).

Provide **`locationShare.today`** and **`locationShare.mtd`**. UI: toggle or tabs (Today | MTD).

**Rationale**: Clarify Q3–Q4; FR-002a keeps compact, not Overview wall.

**Alternatives considered**: Self-% only — rejected (Q3). Company-wide boards only — rejected (Q3).

## R7 — Sales history windows

**Decision**:
- **Daily**: bucket viewed merchant’s attributed sales for **current Colombo month** day-by-day (`yyyy-mm-dd`, total, orderCount); include zero days optionally as sparse list (prefer **days with sales + today** OR full month sparse — choose **all days from month start through today** for current month so empty days show 0 for coaching).
- **Monthly**: last **3 calendar months** including current: total, orderCount, join `MerchantMonthlyTarget` when present → achieved vs target status using existing percent/status rules.

**Rationale**: Clarify Q2. Computing daily from the same MTD order set is cheap once orders are loaded for the month.

**Alternatives considered**: 12 months / 90-day daily — rejected (Q2). Snapshot tables — deferred.

## R8 — Motivational copy

**Decision**: Keep target cheer bands as-is. Add **peer-relative** messages (separate helper) for leader / chasing / mid-pack / needs-push / no-sales — tone encourage/celebrate/nudge, never punitive (FR-008, US5).

**Rationale**: Spec requires consistency with existing cheer voice.

**Alternatives considered**: Reuse target % bands for peers — weak fit when no target; peer gap needs different language.

## R9 — Schema / migrations

**Decision**: **No Prisma changes** in v1.

**Rationale**: All entities already exist; history/peers are derived. Avoids multi-DB deploy for a read UX feature.

**Alternatives considered**: `MerchantDailySales` cache — only if page-data latency fails SC after ship.
