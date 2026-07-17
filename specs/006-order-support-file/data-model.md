# Data Model: Order Support File (OSF) Generator

**Feature**: `006-order-support-file`  
**Date**: 2026-07-16

## Entities

### ProductOsfProfile (new)

Company-scoped OSF attributes for one catalog SKU (variant).

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | FK Company |
| sku | string | Trimmed catalog SKU; unique per company |
| shopAvailability | enum/string | `allowed` \| `not_allowed` (default `allowed` or unset/null = blank on export) |
| ogfPrice | Decimal? | Independent OGF Price (Excel column); **not** derived from LWK; null = blank |
| country | string? | Optional; blank in v1 UI unless added |
| createdAt / updatedAt | DateTime | |
| updatedById | string? | Optional audit |

**Unique**: `@@unique([companyId, sku])`  
**Index**: `@@index([companyId])`

### ProductOsfRop (new)

Per-SKU ROP for one OSF column key.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | FK Company |
| sku | string | Matches ProductOsfProfile.sku |
| columnKey | string | Matches OsfColumnConfig.key |
| ropQty | Int | ≥ 0 |
| updatedAt | DateTime | |

**Unique**: `@@unique([companyId, sku, columnKey])`

### OsfColumnConfig (new)

Admin-maintainable OSF column definitions for stock/ROP headers.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | FK Company |
| key | string | Stable slug (`lmj`, `cosmetics_lk`, `cos_rop`, …) |
| label | string | Spreadsheet header text |
| companyLocationId | string? | FK CompanyLocation when stock maps to a location |
| includeInStock | boolean | Emit stock column |
| includeInRop | boolean | Emit ROP / order-qty column |
| sortOrder | Int | Column order |
| active | boolean | Soft disable |

**Unique**: `@@unique([companyId, key])`

### ProductItem / Vendor / CompanyLocation (existing — read)

| Use | Source |
|-----|--------|
| Description, brand, barcode, image, site status, item status, prices | ProductItem (+ Vendor) |
| ERP warehouses for stock | CompanyLocation.erpnextWarehouse + CompanyLocationWarehouse |
| ERP credentials | CompanyLocation.erpnextInstance |

### Order / OrderLineItem (existing — read for monthly sales)

Filter non-voided, stage delivery_complete \| invoice_complete; month from deliveryCompleteAt ?? invoiceCompleteAt (Asia/Colombo).

### OSF Snapshot (logical — not persisted in v1)

Generate request metadata (who, when, salesMonth) may be logged later; v1 returns file only.

## Relationships

```text
Company 1 ── N OsfColumnConfig
Company 1 ── N ProductOsfProfile
ProductOsfProfile 1 ── N ProductOsfRop   (by sku within company)
OsfColumnConfig.key ── ProductOsfRop.columnKey
OsfColumnConfig ──? CompanyLocation ── warehouses ── ERP Bin
ProductItem.sku ── ProductOsfProfile.sku (logical join, not FK)
```

## Validation rules

- `sku`: trimmed, non-empty, max length per `LIMITS` / product SKU limits.
- `shopAvailability`: only `allowed` | `not_allowed` | null.
- `ropQty`: integer ≥ 0; max sensible cap (e.g. 1_000_000).
- `columnKey`: slug `[a-z0-9_]+`.
- Generate: require `purchasing.osf.read`; edit profile/ROP/columns: `purchasing.osf.manage`.
- Never invent stock/cost when ERP returns empty — blank cells.

## State transitions

| Action | Effect |
|--------|--------|
| UI save Shop Availability | Upsert ProductOsfProfile |
| UI save ROP cell | Upsert ProductOsfRop |
| UI save column mapping | Upsert OsfColumnConfig |
| Generate OSF | Read-only assemble; no profile mutation |
| Missing profile | Export Shop Availability / ROP blank or “No ROP” |

## Indexes

- Unique company+sku on profile; unique company+sku+columnKey on ROP; unique company+key on columns.
- Sales aggregation uses existing Order indexes on companyId + fulfillmentStage + deliveryCompleteAt where possible (add composite later if slow).
