# Data Model: ROP Warehouse Compare

**Feature**: `063-rop-warehouse-compare` | **Date**: 2026-10-08

No new tables. Reads existing rows and ERP bins.

## Existing records (read only)

### ProductOsfRop

| Field | Use |
|-------|-----|
| `companyId` | Current user’s company only |
| `sku` | Variant SKU |
| `columnKey` | OSF column |
| `ropQty` | Reorder point for that column. `<= 0` → missing for the percent rule |

### OsfColumnConfig (via `resolveOsfColumns`)

| Field | Use |
|-------|-----|
| `key`, `label` | Identity and display |
| `warehouses` | Bin names for this column |
| `erpnextInstanceId` | ERP1 vs ERP2 via the route’s existing label rule |
| `active`, `includeInStock`, `includeInRop` | Column must be active. Watch and focus need `includeInRop`. Stock bins follow columns already included in the Stock Comparer pull (`includeInStock`) |

### ProductItem (via `buildCatalogRows`)

| Field | Use |
|-------|-----|
| `sku` | Variant SKU |
| `productTitle` | Title |
| `erp1ProductPriority`, `erp2ProductPriority` | Priority filter |
| `erp1TaxStatus`, `erp2TaxStatus` | Input to `vatStatusLabel` |

### ERP Bin

| Field | Use |
|-------|-----|
| warehouse + item code | Stock in hand. Same map the current route builds (`warehouse::sku`) |

## Derived shapes (response only)

### WarehouseOption

| Field | Rules |
|-------|--------|
| `name` | Exact bin / warehouse name |
| `columnKey` | Owning OSF column, or null if none |
| `label` | Column label, else warehouse name |
| `kind` | `main` \| `online` \| `shop` from `classifyWarehouseKind` |
| `erpSource` | `ERP1` \| `ERP2` \| `""` |
| `watched` | True for Cosmetics main and for non-shop ERP2 company warehouses (R4) |

### RopWatchHit

| Field | Rules |
|-------|--------|
| `columnKey`, `label`, `warehouse` | Location |
| `erpSource` | `ERP1` or `ERP2` |
| `role` | `cosmetics-main` \| `erp2-company` |
| `qty` | That warehouse’s bin qty (missing bin → 0) |
| `rop` | Column `ropQty`, or null when missing / `<= 0` |
| `percentOfRop` | `percentOfRop(qty, rop)` as a 0–1 ratio, else null |
| `hit` | R3 inclusive test |
| `ropMissing` | True when this warehouse cannot be judged |
| `websiteOutOfStock` | True only for `cosmetics-main` when `qty <= 0` |

### RopWatchRow

One per SKU that has **at least one** `hit`.

| Field | Rules |
|-------|--------|
| `SKU` | Variant SKU |
| `commonSku` | `baseSku(SKU)` |
| `Product Title` | Catalog title |
| `erp1ProductPriority`, `erp2ProductPriority` | As stored; null if blank |
| `vatStatus` | `vatStatusLabel` (may be `""`) |
| `hits` | Watched warehouses with `hit === true` |
| `context` | Other watched warehouses for this SKU that are not hits (including `ropMissing` or website OOS on main) |
| `elsewhere` | Positive qty at other locations, same online-then-shop shape as today. Omit qty `<= 0` and `all warehouses` |

### ShopCompareRow

| Field | Rules |
|-------|--------|
| Identity fields | Same as `RopWatchRow` (`SKU`, `commonSku`, title, priorities, `vatStatus`) |
| `mainQty` | Cosmetics main bin qty, or null when that warehouse row is absent |
| `websiteOutOfStock` | `mainQty != null && mainQty <= 0` |
| `shops` | Shop locations with positive qty only; one per physical shop |

Included when the SKU is on the threshold `rows` list **or** has a cosmetics-main percent hit. Not included for ERP2-only hits unless main also qualifies.

### FocusCompareRow

| Field | Rules |
|-------|--------|
| Identity fields | Same as `RopWatchRow` |
| `focusWarehouse` | The chosen name |
| `qty`, `rop`, `percentOfRop`, `ropMissing` | Focus warehouse only |
| `elsewhere` | Positive qty at **other** warehouses. Focus name must not appear |

Included only when focus `hit` is true.

## Validation

| Input | Result |
|-------|--------|
| `threshold` | Unchanged: finite number, default `0`, else `400` |
| `ropPercent` omitted | Percent sections empty; threshold report still runs |
| `ropPercent` not finite, or `< 0`, or `> 100` | `400`. Do not substitute 70 |
| `focusWarehouse` omitted | `focusCompare` = `[]` |
| `focusWarehouse` not in the configured warehouse list | `400` |
| ROP missing or `<= 0` | Not a hit |
| Stock negative, ROP positive | Hit for any percent 0–100 |
| Priority / VAT / SKU filters | Not query params. Client-only |

## State

No persisted report. A run replaces the previous payload. Filters do not change stored stock or reorder points.

## Relationships

```text
ProductItem.sku ──< ProductOsfRop.sku
OsfColumnConfig.key ──< ProductOsfRop.columnKey
OsfColumnConfig.warehouses ── Bin.warehouse
Bin qty + ProductOsfRop.ropQty ── RopWatchHit / FocusCompareRow
```
