# Research: Item Trends Super Dashboard

**Feature**: `047-item-trend-tracking`  
**Date**: 2026-09-02

## R1 — Permission & audience

**Decision**: Add `purchasing.item_trends.read` to `lib/rbac.ts` `DEFAULT_PERMISSIONS`; grant to `manager` role alongside existing purchasing keys. Page + read APIs use `hasPermission` / `requirePermission("purchasing.item_trends.read")`. ROP apply reuses `purchasing.osf.manage` on existing OSF profile PATCH routes. Admin / `super_admin` bypass unchanged.

**Store scoping**: Users with `purchasing.item_trends.read` and `EmployeeProfile.locationId` set see **outlet-scoped** zones (outlet balance, local movement) for that location’s OSF column(s) only; users with `purchasing.osf.manage` or admin bypass see company-wide zones.

**Rationale**: Spec FR-002/029; matches OSF and Rider performance gating; avoids new “store trends” permission.

**Alternatives considered**: Reuse `purchasing.osf.read` only (rejected—too broad for store staff); separate `store.trends.read` (rejected—extra permission surface).

## R2 — Sales & movement aggregation

**Decision**: Unit movement uses **`osfCompletedSalesOrderWhere`** + `orderLineItem.quantity` (same as `lib/osf/assist-sales.ts` `aggregateSalesBySkuInRange`). Movement speed = units / calendar days in range (Asia/Colombo). Comparison period = immediately preceding equal-length window.

**Revenue** (district leaderboard amount toggle): line `quantity * unitPrice` or existing dashboard line total helpers where available; units remain primary for ROP and transfer logic.

**Rationale**: Spec FR-031 / SC-002 reconciliation with OSF and operational sales; purchasing already trusts OSF completion semantics.

**Alternatives considered**: Dashboard placed-date filters (rejected for item movement—misaligns with “what actually moved”); ERP SI date (rejected—slower, duplicate source).

## R3 — Product priority

**Decision**: Read priority from existing ERP-synced product fields used by OSF (same source as OSF assist page-data). Filter/sort Top Priority, Newly Added, Non Priority, Discontinue from synced `ProductItem` / profile data—no new priority table.

**Rationale**: Spec FR-005; single source of truth with OSF.

## R4 — District attribution

**Decision**: For each eligible order, `resolveAddressDistrict(order.shippingAddress)` from `lib/address-district.ts`. Unresolved → `"Unmapped"` bucket. Aggregate line items to district in application layer (fetch lines + orders in range, group in memory). v1 acceptable for company order volume; add DB-side aggregation only if profiling requires.

**Rationale**: Logic already proven in `lib/reports/csv.ts` tests; no existing analytics precedent.

**Alternatives considered**: Shipping rule label district field (rejected as primary—labels are sub-district; customer address is demand truth); ContactMaster.district (rejected—order shipping address is correct for sales geography).

## R5 — Outlet stock & transfer candidates

**Decision**: Outlets = **`OsfColumnConfig`** rows with `includeInStock` / shop columns; map to `CompanyLocation` via `companyLocationId`. **Stock**: `fetchSkuColumnLiveStock` / `fetchBinActualQty` (`lib/osf/sku-column-stock.ts`, `lib/osf/erp-stock.ts`). **Movement per outlet**: extend `salesByOsfColumnLast90d` pattern—attribute completed sales to column via `order.companyLocationId` → column key (existing store-allocation attribution).

**Transfer rule (v1)**: Same SKU at ≥2 outlets; source = bottom quartile movement in range + stock ≥ median across outlets for that SKU; destination = top quartile movement; min 3 units sold at destination in range; min 5 stock at source.

**Rationale**: Spec US9; reuses proven OSF column + ERP stock paths; no auto-transfer (operational process).

## R6 — ROP suggestion formula

**Decision**: **Suggested ROP = round(highest calendar-month units in the selected window × 2)** — not window total × 2. Example: 4000 / 1000 / 8000 → 16000. Windows: default last **3 calendar months** (Colombo month boundaries via existing date helpers); preset **2 months**; custom `from`/`to` dates inclusive. Read current ROP from `ProductOsfRop` (primary ROP column or sum per spec 006 conventions—use same column set as OSF assist for v1).

**Movement overlay**:
- **Increase**: current period speed ≥ prior period + 15% AND units ≥ 3 → badge + suggest `max(formula, currentRop)` review
- **Decrease**: slowdown rule (≥25% drop vs prior equal period, baseline ≥5 units) → badge + suggest `min(formula, currentRop)` review
- **Hold**: otherwise

**Apply**: Client calls existing `PATCH /api/admin/osf/profiles/[sku]` or bulk assist ROP route—dashboard never writes ROP directly.

**Rationale**: Spec clarifications; complements OSF assist (purchase-date window) without replacing it.

## R7 — Expansion opportunity scoring (v1)

**Decision**: Rule-based score per district (excluding Unmapped):

`score = normalized_delivery_units × growth_factor × coverage_gap`

- **Delivery demand**: units to district from shipping address in range
- **Shop coverage**: sum shop-attributed sales (`companyLocationId` on orders) where outlet’s resolved district matches; `coverage_gap = 1 - min(1, shop_units / delivery_units)`
- **Growth**: current vs prior equal period % change, floored at 0 for negative

Rank descending; top reasons string built from template (units, growth, fast-mover count, nearest store name from `CompanyLocation` address district).

**Rationale**: Spec FR-020/021; no manual district→store config table in v1.

**Alternatives considered**: Geo distance API (deferred); manual mapping table (deferred to v2 if inference weak).

## R8 — Intelligent trend engine

**Decision**: **Phased**. **v1 ships rule-based signals only** (speed rank, period compare, weekday recurrence, slowdown thresholds, transfer/ROP overlays). **Phase 2** adds **statistical engine** in `lib/item-trends/intelligent.ts`:

- Emerging trend: 14-day rolling slope vs 28-day baseline (units/day), flag if slope > 2σ
- Soft slowdown: 7-day EMA < 28-day EMA by >20%
- Unusual repeat: autocorrelation peak at 7 or 14 days

Each signal labeled `intelligent_analysis` with metric summary JSON. No external AI agent / LLM in v1–v2; reassess if statistical pass misses SC-005 in pilot.

**Rationale**: Constitution V (simplicity); spec allows plan-phase choice; statistical layer meets “model” intent without ops burden.

**Alternatives considered**: LLM agent per refresh (rejected—cost, latency, explainability); nightly ML training (deferred).

## R9 — Schema / persistence

**Decision**: **No new Prisma models for v1**. All dashboard entities are derived read models computed at request time (or short TTL in-memory cache per company+range if needed). Focus lists: **client session state** (React state + optional `sessionStorage`) for P3; no DB until saved views requested.

**Permission row**: Added via existing RBAC seed sync only—no migration.

**Rationale**: Constitution I—avoid migration unless necessary; spec entities are analytics views.

**Alternatives considered**: `ItemTrendSnapshot` materialized table (deferred—premature for v1); Redis cache (deferred until perf proof).

## R10 — API & UI architecture

**Decision**:

| Layer | Path |
|-------|------|
| Page | `app/(dashboard)/dashboard/purchasing/item-trends/page.tsx` |
| Panel | `components/organisms/item-trends-panel.tsx` (+ zone subcomponents) |
| Lib | `lib/item-trends/` — `aggregate.ts`, `signals.ts`, `district.ts`, `outlets.ts`, `rop-suggest.ts`, `expansion.ts` |
| API | `app/api/admin/purchasing/item-trends/page-data/route.ts` (primary) |
| Lazy API | `.../districts/route.ts`, `.../outlets/route.ts`, `.../rop/route.ts` optional if page-data too heavy |

Query schema in `lib/validation.ts`: `itemTrendsQuerySchema` — `from`, `to`, `compareFrom`/`compareTo` optional auto, `priority`, `district`, `outletColumnKey`, `ropWindow` (`3m` \| `2m` \| `custom`), `sections[]`.

UI: `ChartContainer` + Recharts (bar, line, horizontal bar heatmap-style) like `rider-performance-panel.tsx`; KPI cards; tabs for zones.

**Rationale**: Matches merchant dashboard + rider performance patterns; lazy sections keep first paint fast.

## R11 — Performance

**Decision**: Target initial page-data (movement + KPIs + slowdown) **< 5s p95** for 7-day range on cosmo-dev catalog. Cap list endpoints at **top 100** rows + “show all” table pagination. District/outlet aggregations run in parallel (`Promise.all`). Profile with real data before adding snapshot table.

**Rationale**: SC-001/004; full-catalog scan only on explicit ROP tab with pagination.
