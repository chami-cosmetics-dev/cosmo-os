# Research: Item Trends Simple Rebuild

## Common SKU = parent item code

**Decision**: `ORD04_1` / `ORD04_2` share parent stem `ORD04` (strip trailing `_\d+`). If no numeric suffix, fall back to Shopify product id, else the SKU itself.

**Rationale**: Manager example is explicit. Shopify gid grouping hid the parent code buyers search.

**Alternatives considered**: Shopify product id only (050). Rejected.

## Stock source = snapshot history, default yesterday

**Decision**: Location/Item stock from `ErpStockSnapshot` for a chosen `snapshotDate`. Default yesterday (Asia/Colombo). If that night missing, use latest stored night and say so. Nightly cron unchanged; recapture replaces that date only; 90-day prune stays.

**Rationale**: User kept overnight snapshot and asked to pick historical dates.

**Alternatives considered**: Live ERP on page load (slow). Latest-only snapshot (cannot look back).

## One warehouse display name

**Decision**: Show OSF column label; if it looks like `CODE - PLACE` (e.g. `LWK - OGF`), display `PLACE` only.

**Rationale**: Dual company+shop captions were the complaint.

**Alternatives considered**: Map to Cosmo location name only — misses Cosmetics.lk shop columns without a location.

## Order district persist

**Decision**: Add nullable `Order.district`. Webhook sets it via `resolveAddressDistrict(shippingAddress)`. Districts view uses stored value, else infer, else Unmapped. Backfill script for old rows.

**Rationale**: User asked to mark orders, not only infer at read time.

**Alternatives considered**: Infer-only (already exists; does not “mark”).

## Market gap stays

**Decision**: Keep `fetchMarketGapForSkus` on item/location item rows; badge opens Market Price Compare.

**Rationale**: Used with competitor MCP.

## UI chrome to remove

**Decision**: Drop KPI cards, charts, focus list, weekday patterns, newly-added/slowdown panels, outlets transfer block, compare overlay. Tabs: Location, Item, Districts, ROP.

**Rationale**: Spec: simple so anyone can get data.
