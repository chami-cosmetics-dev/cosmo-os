# Data Model: Shopify Stock Showdown

**Feature**: `059-shopify-stock-showdown` | **Date**: 2026-09-22

No new Prisma models. Shapes below are API/UI read models derived from existing tables + ERP bins.

## Entities (read / computed)

### ShopifyDestination

| Field | Type | Notes |
|-------|------|--------|
| id | string | `CompanyLocation.id` |
| name | string | Location display name |
| shopifyShopName | string \| null | Shopify shop label when set |
| shopifyLocationId | string \| null | Shopify location id when set |

**Source**: `CompanyLocation` where Shopify is configured for the OS company.

**Validation**: Must belong to caller’s `companyId`.

---

### ShowdownItem

| Field | Type | Notes |
|-------|------|--------|
| sku | string | Normalized trim; empty SKU items excluded from transfer matching |
| productTitle | string | From `ProductItem` |
| variantTitle | string \| null | Optional |
| shopifyStock | number (int >= 0) | `ProductItem.inventoryQuantity` |
| last30ShopifyUnits | number | Units sold last 30d on Shopify channel at destination |
| demandGap | number | `max(0, last30ShopifyUnits − shopifyStock)` |
| elsewhere | StockSource[] | Sources with qty > 0 (or empty → UI empty state) |
| suggestions | TransferSuggestion[] | May be empty when gap 0 or no stock elsewhere |
| elsewhereStatus | `"ok"` \| `"partial"` \| `"unavailable"` | ERP fetch health for this item’s sources |

**Inclusion rules**:
- Default mode `lte3`: `shopifyStock <= 3`
- Mode `oos`: `shopifyStock === 0`
- Same `companyLocationId` as selected destination

---

### StockSource

| Field | Type | Notes |
|-------|------|--------|
| key | string | Stable id: e.g. `${instanceId}::${warehouse}` or column key |
| label | string | Human name (shop or warehouse/location) |
| kind | `"shop"` \| `"erp_location"` | Classification for UI |
| warehouse | string | ERP warehouse name used for bin lookup |
| erpInstanceId | string | Which ERP held the bin |
| qty | number | `actual_qty`; negatives treated as 0 for suggestions |
| available | boolean | false when that instance’s bin fetch failed |

**Relationships**: Many sources per `ShowdownItem`. Destination warehouses excluded (see research R5). Deduped by normalized warehouse so one physical place appears once.

---

### TransferSuggestion

| Field | Type | Notes |
|-------|------|--------|
| sourceKey | string | References `StockSource.key` |
| sourceLabel | string | Copy for display |
| destinationId | string | Selected Shopify destination |
| suggestedQty | number | Integer >= 1; capped by source qty |
| basis | `"last_30_shopify_sales"` | Fixed for v1 |

**State**: Advisory only — no persistence, no ERP document lifecycle.

**Allocation rules** (see research R7): fill `demandGap` from sources sorted by qty descending; stop when gap filled.

---

### Permission

| Field | Value |
|-------|--------|
| key | `purchasing.shopify_stock_showdown.read` |
| description | View Shopify stock showdown |

Upserted via existing RBAC seed; no schema migration.

## Relationships

```text
ShopifyDestination 1──* ShowdownItem (ProductItems at location, filtered by stock)
ShowdownItem 1──* StockSource (elsewhere bins)
ShowdownItem 1──* TransferSuggestion (computed from gap + sources)
```

## Validation rules

- `mode` ∈ `{ lte3, oos }`; default `lte3`
- `destinationId` required when >1 destination exists; must be Shopify-capable location in company
- `suggestedQty` never > source `qty` and never > remaining demand gap at allocation time
- Empty SKU: may appear in list for visibility but skipped for elsewhere match / suggestions

## State transitions

None persisted. Refresh = re-fetch showdown; suggestions recalculate each load.
