# Research: Item Trends Stock Phases

## Snapshot vs live ERP

**Decision**: Nightly `fetchPositiveBinsByWarehouses` per OSF stock warehouses; persist `ErpStockSnapshot`. Item Trends reads latest `snapshotDate` for the company.

**Rationale**: Outlets tab already fans out live Bin calls and still feels slow. User confirmed realtime is not available for this page.

**Alternatives considered**: Live fetch with cache headers (stale on each reload); Redis cache (new infra). Rejected.

## OOS for a date range

**Decision**: v1 = sold in selected range at location AND latest snapshot qty ≤ 0. Historical nightly zeros are stored going forward but not required for the first list.

**Rationale**: Without history, "OOS during the range" is unknowable. Sold + now zero matches the shop replenishment question.

**Alternatives considered**: Infer OOS from sales gaps. Too noisy.

## Common SKU

**Decision**: Group key = `shopifyProductId` if present, else `sku`. Label = `productTitle`. Expand to variant `sku` + `variantTitle`.

**Rationale**: ProductItem already has Shopify product id. No new mapping table.

**Alternatives considered**: Heuristic SKU prefix split. Fragile across brands.

## 50% rule

**Decision**: `avgDaily = unitsInRange / inclusiveDays`; `weekNeed = avgDaily * 7`; send if `stock < weekNeed * 0.5`; `suggestedSendQty = ceil(weekNeed - stock)`.

**Rationale**: User: enough for next week; location should still have 50% of that need; capture which items to send.

**Alternatives considered**: Flag at 50% but send only the 50% gap. User wants next-week coverage, so fill to 100% of week need.

## Online first

**Decision**: Reuse `isOnlineChannelName` / Cosmetics.lk location columns as `online`; remaining shop OSF columns as `physical`. Sort online then physical by label.

**Rationale**: Existing physical-shop helpers already exclude website.

## ROP total

**Decision**: Sum `ProductOsfRop.ropQty` for the SKU across all column keys.

**Rationale**: User: current ROP should be total ROP. Apply still writes the primary ROP column (existing behavior).
