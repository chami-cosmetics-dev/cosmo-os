# Research: Stock Compare Redesign

**Feature**: `060-stock-compare-redesign` | **Date**: 2026-09-24

## R1 — Scope and permission

**Decision**: Redesign the existing Cosmetics Stock Comparer in place. Keep page `/dashboard/purchasing/stock-comparer`, API `/api/admin/reports/stock-comparer`, and permission `reports.stock_comparer`. No new permission, no new dashboard.

**Rationale**: Spec is a redesign of the current tool. Constitution V forbids a parallel page. Access already matches the audience.

**Alternatives considered**:
- New permission / sibling page — rejected (spec reuses existing access; 059 already owns the new Shopify-only dashboard).
- Reuse Shopify Stock Showdown (059) UI — rejected (059 is Shopify on-hand ≤3 + transfer suggestions; this feature is Cosmetics main vs all warehouses + brand tab).

## R2 — Cosmetics main quantity

**Decision**: Cosmetics main remains warehouse name match `main warehouse - cosmo` (current `MAIN_COSMO_WAREHOUSE`). Main-tab inclusion is `qty <= threshold` on that row only. Do **not** use `ProductItem.inventoryQuantity` as the filter.

**Rationale**: Spec assumption: Cosmetics main warehouse feeds Shopify; live storefront qty is not a second filter. Existing Bin fetch already supplies this warehouse. 059 will own Shopify on-hand if/when built.

**Alternatives considered**:
- Filter on Shopify `inventoryQuantity` — rejected (duplicates 059; spec says Cosmetics main is the figure).
- Sum all Cosmetics.lk online warehouses as “main” — rejected (ambiguous; operators already treat Cosmo main as the Shopify-feeding bin).

## R3 — Online vs shop grouping

**Decision**: After parse/skip `all warehouses`, classify each non-main warehouse:

1. **Shop** if `isShopWarehouseName` (`lib/item-trends/physical-shops.ts`) — name contains `shop`, exclude website / transit / all-warehouses.
2. **Online** otherwise (other mains, Website Inventory, Stores, and any configured non-shop stock warehouse).

Per shop, keep current pick: shop-floor row over that shop’s “main warehouse”; display name via existing `OUTLET_ALIASES` / `outletFromRow`. Per online warehouse, one row per warehouse name (no outlet-priority buckets). Locations with qty ≤ 0 omitted from elsewhere.

**Rationale**: Spec replaces P1/P2/P3 with **online first, then shops**. Shop heuristic already used by Item Trends / OSF shop sync. Reusing it avoids a second warehouse taxonomy.

**Alternatives considered**:
- Keep Priority 1/2/3 columns and only sort them — rejected (spec says those groups are not primary).
- Hardcoded Cosmetics shop list only — rejected (“all configured warehouses”).
- Treat Website Inventory as Cosmetics main — rejected; only exact Cosmo main is main. Website Inventory stays online-elsewhere.

## R4 — Drop priority columns

**Decision**: Remove `priority` 1|2|3 from the report row. Replace with `online: LocationStock[]` and `shops: LocationStock[]`, plus flattened summary strings/qtys for table and export. Delete `PRIORITY_1` / `PRIORITY_2` sets from the comparer helper (or leave unused and delete in the same change).

**Rationale**: Spec FR-005. Old tests that assert Priority 2 Pepiliyana must be rewritten to assert shop group.

**Alternatives considered**: Keep priority as a hidden sort inside shops — rejected (extra concept, no spec need). Shop list A–Z is enough.

## R5 — Last-90-day Cosmetics.lk / Shopify-facing sales

**Decision**: Trailing **90 calendar days** ending now, **Asia/Colombo**, half-open `[start, endExclusive)` like OSF assist sales. Aggregate completed units (`osfCompletedSalesOrderWhere`: delivery/invoice complete, not cancelled) for the OS `companyId` where the order is **website-channel**: `resolveCosmeticsLkChannel(sourceName) === "website"` (shopify / web / blank / unknown). Prefer orders at a Cosmetics.lk `CompanyLocation` when the tenant has one; if location mapping is missing, website-channel filter alone is the fallback.

Do **not** count ERP1 POS / `erpnext` / `erpnext-pos` (shop-counter) or `manual`.

Return `sales90d` per listed SKU and a catalog-wide map for ranking. On query failure: `salesStatus = "unavailable"`, still return stock rows, no Critical badges.

**Rationale**: Spec: Cosmetics.lk / Shopify-facing units, not shop-counter. `resolveCosmeticsLkChannel` already defines website vs ERP1 vs manual. Reuse completion window helpers; do not wait for unimplemented 059 sales module.

**Alternatives considered**:
- `salesByOsfColumnLast90d` — rejected (POS/column attribution, not Shopify demand).
- Company-wide completed sales — rejected (mixes shops).
- Live Shopify Analytics API — extra credentials; orders already in Neon.

## R6 — Critical badge (top 20%)

**Decision**: Pure helper. Among catalog SKUs with `sales90d >= 1`, sort units descending. Cutoff = units at index `ceil(n * 0.20) - 1` (0-based). Every SKU with `sales90d >= cutoff` is Critical. Zero-sale SKUs never Critical. Ties at the cutoff all Critical.

Apply badge **after** threshold filter; badge does not change inclusion. If `salesStatus !== "ok"` or `n === 0`, no badges.

**Rationale**: Spec assumption (top 20% of SKUs that sold ≥1 unit). Deterministic, unit-testable, independent of threshold.

**Alternatives considered**:
- Top 10 SKUs only — arbitrary for large catalogs.
- Critical = any sale + main qty 0 — spec asked for **top** sellers.
- Percentile among flagged rows only — a raised threshold would change who is “top”; spec says ranking is the 90-day catalog window.

## R7 — API

**Decision**: Keep one `GET /api/admin/reports/stock-comparer?threshold=` (`maxDuration = 60`). Same live Bin pull as today (catalog SKUs × configured OSF stock warehouses). After flatten:

1. `buildCosmeticsStockReportDetails` (new online/shops shape).
2. Attach `sales90d` + `critical` from R5/R6.
3. `buildBrandWarehouseViolations` unchanged (brand lists stay as specified).

One payload feeds both tabs so a tab switch does not refetch (spec User Story 5).

**Rationale**: Existing route already auth-gates and fetches bins. Extending it is simpler than a second endpoint.

**Alternatives considered**: Split stock vs brand GETs — extra latency; brand uses the same stock rows. Page-data bundle — report is user-triggered, not first-paint.

## R8 — UI and exports

**Decision**: Redesign `CosmeticsStockComparer` with existing `Tabs` (`main` default, `brand`). Shared threshold + Run report. Main tab: table + Export stock report (online columns then shop columns, 90-day sales, Critical). Brand tab: violation table + Export brand report (existing brand sheet). Preview first 100 rows on screen; export full set.

**Rationale**: Spec FR-001/014. Tabs already used on Item Trends. Keep xlsx-js-style exports.

**Alternatives considered**: Two pages — rejected. Combined single export — rejected (tab-specific files).

## R9 — Schema / jobs

**Decision**: No Prisma models, no migrations, no background job.

**Rationale**: Live bins + existing orders + existing RBAC. Constitution I stays green.

## R10 — Relationship to 059 Shopify Stock Showdown

**Decision**: Do not implement 059 here. Do not import from `lib/shopify-stock-showdown` (not in tree). Sidebar / permission stay Stock Comparer only.

**Rationale**: Spec FR-017. 059 is Shopify qty ≤3 + advisory transfers. This is Cosmetics-main threshold + brand violations.

## R11 — Agent context script

**Decision**: Skip. Repo has no `.specify/scripts/powershell/update-agent-context.ps1` (same as 041–059).

**Rationale**: Nothing to run. Context is this plan + research + contracts.
