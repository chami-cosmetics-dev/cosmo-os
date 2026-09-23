# Research: Shopify Stock Showdown

**Feature**: `059-shopify-stock-showdown` | **Date**: 2026-09-22

## R1 — Permission and nav

**Decision**: New key `purchasing.shopify_stock_showdown.read`. Add to `DEFAULT_PERMISSIONS` with description “View Shopify stock showdown.” Page + APIs use a small `requireShopifyStockShowdownAccess` helper (mirror `lib/store-stock-count/auth.ts`). Sidebar entry under Purchasing (near stock comparer / item trends). **Do not** auto-pin to `stores-level-*` unless product later asks — admins assign explicitly (spec assumption).

**Rationale**: Spec requires a dedicated permission independent of stock comparer, item trends, and store stock count. Purchasing namespace fits Shopify replenishment planning; stores can still be granted the key.

**Alternatives considered**:
- Reuse `reports.stock_comparer` — rejected (file-based cosmetics comparer; wrong UX and grant coupling).
- Reuse `purchasing.item_trends.read` — rejected (broader dashboard; different job).
- `store.*` key — rejected (primary audience is Shopify replenishment / purchasing).

## R2 — Shopify on-hand source

**Decision**: Destination stock = `ProductItem.inventoryQuantity` for the selected `CompanyLocation` that has a Shopify identity (`shopifyLocationId` and/or `shopifyShopName` / admin handle). Match items by normalized SKU within that location. Threshold filter runs on this integer field.

**Rationale**: Products webhook already keeps `inventoryQuantity` current per Shopify location. Spec “Shopify items stock” maps cleanly; avoids a live Shopify Admin API call on every dashboard open.

**Alternatives considered**:
- Live Shopify Inventory Levels API — extra credentials latency; not needed when webhook sync is healthy.
- ERP warehouse labeled “Website Inventory” as destination stock — may diverge from Shopify; use only as exclusion from “elsewhere,” not as primary Shopify qty.

## R3 — Destination picker

**Decision**: `GET destinations` returns `CompanyLocation` rows for the OS `companyId` where Shopify is configured (`shopifyLocationId` non-null, or shop name/handle present). User must pick one destination when multiple exist; if exactly one, auto-select.

**Rationale**: Spec FR-011. Locations already bind Shopify shop ↔ OS company.

**Alternatives considered**: Hardcoded Cosmetics.lk / Cosmo online location — breaks Vault and multi-shop tenants.

## R4 — Elsewhere stock (ERP locations + shops)

**Decision**: Resolve OSF columns via `resolveOsfColumns(companyId)`. For each column with warehouses, classify source as **shop** (`isShopWarehouseName` / Cosmetics internal shop columns) or **ERP location** (other warehouses). Fetch live `Bin.actual_qty` with `fetchBinActualQty` for the **low-stock SKU set only**, batched per ERP instance. Omit sources with qty <= 0 from the “has stock elsewhere” list (show explicit empty state when none remain). Deduplicate by normalized warehouse name so the same physical place is not listed twice under two column labels.

**Rationale**: Spec requires both ERP locations and shops. OSF columns already encode warehouse ↔ shop mapping used elsewhere. SKU-batched bin fetch fits the small <=3 working set (unlike store stock count’s full catalog dump).

**Alternatives considered**:
- Full Bin dump per company (store-stock-count pattern) — overkill for hundreds of low-stock SKUs.
- Item Trends stock snapshot only — may be stale; live bins preferred for transfer decisions.
- Cosmetics stock-comparer priority warehouses — Cosmo cosmetics-specific file logic; wrong for general Shopify showdown.

## R5 — Exclude destination from sources

**Decision**: Remove from elsewhere/suggestion sources: (1) warehouses linked to the selected destination `CompanyLocation` (`erpnextWarehouse` + `CompanyLocationWarehouse` rows), (2) warehouses whose names look like the online/website channel for that destination when identifiable. Never suggest transferring from Shopify to itself.

**Rationale**: Spec comparison is “other” locations; double-counting destination stock as a source would mislead.

**Alternatives considered**: Show destination warehouse in the list for transparency — rejected; confuses transfer direction.

## R6 — Last-30-day Shopify sales

**Decision**: Trailing **30 calendar days ending today (Asia/Colombo)**, inclusive, same spirit as item-trends cover. Aggregate units from `OrderLineItem` joined to `Order` where `companyId` matches, `companyLocationId` = destination, and channel is Shopify/web (`sourceName` in `shopify` / `web`, or presence of non-manual `shopifyOrderId`). Count completed demand (prefer delivery/invoice complete timestamps consistent with item-trends date SQL). Sum `quantity` by normalized SKU for SKUs in the showdown set.

**Rationale**: Spec assumption: Shopify-channel sales for the destination, not POS/company-wide retail.

**Alternatives considered**:
- All completed orders at the location including POS — rejected (not Shopify demand).
- `salesByOsfColumnInRange` as-is — that helper attributes POS/warehouse shops; reuse date-window ideas but keep a Shopify-specific filter.

## R7 — Suggestion formula

**Decision**: Pure function:

1. `demandGap = max(0, last30ShopifyUnits − shopifyOnHand)`.
2. If `demandGap === 0` or no sources with qty > 0 → no quantity suggestion (still may list sources; UI shows “demand covered / zero demand” when gap is 0).
3. Else sort sources by available qty descending; walk sources allocating `min(remainingGap, sourceQty)` until gap filled or sources exhausted.
4. Each allocation is one suggestion row: `source → destination`, `suggestedQty`. Cap never exceeds source qty (SC-006).

**Rationale**: Spec assumption for covering recent demand without over-pulling. Deterministic and unit-testable.

**Alternatives considered**:
- Suggest full source qty always — over-transfers.
- Rank by “slow mover” like item-trends outlet balance — different product; out of scope.
- Auto Stock Entry — forbidden by FR-008 / constitution simplicity.

## R8 — API shape and timeouts

**Decision**: Two GETs: `/destinations` (cheap) and `/showdown?destinationId=&mode=lte3|oos` with `maxDuration = 60`. Single showdown response includes items, elsewhere sources, sales units, and suggestions so the UI does not N+1. On partial ERP instance failure: mark affected sources unavailable; still return Shopify list + sales; do not invent 0 stock for failed instances.

**Rationale**: Matches store-stock-count timeout discipline; one payload keeps the panel simple.

**Alternatives considered**: Separate “elsewhere” call per SKU — latency explosion. Background job — unnecessary for v1.

## R9 — Schema / migration

**Decision**: No new tables or columns.

**Rationale**: All inputs already exist (`ProductItem`, orders, OSF columns, ERP bins, RBAC permission upsert).

## R10 — Relationship to Item Trends outlet balance

**Decision**: Keep showdown as a **separate** page. Do not embed inside Item Trends. May reuse shop-name helpers and bin credentials only.

**Rationale**: Spec is Shopify-threshold-first with 30-day Shopify demand; outlet balance is cross-shop movement imbalance with different ranking. Coupling would violate Constitution V.
