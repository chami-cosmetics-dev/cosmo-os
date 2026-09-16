# Data Model: OSF VAT Variants

**Feature**: `056-osf-vat-variants`  
**Date**: 2026-09-16

No new database tables or Prisma migrations. Feature is generate-time behavior over existing entities.

## Existing entities (unchanged schema)

### ProductItem

| Field | Role for this feature |
|-------|------------------------|
| `sku` | Catalog row identity |
| `erp1ProductPriority` | Synced Cosmetics.lk ERP1 Product Priority |
| `erp2ProductPriority` | Synced Cosmetics.lk ERP2 Product Priority |
| `itemStatusCategory` | **Not used** for VAT OSF membership |

**VAT predicate**: trimmed ERP1 or ERP2 priority equals `Vat` (case-insensitive).

**Non-VAT predicate**: neither ERP1 nor ERP2 priority is Vat.

### OsfColumnConfig

| Field | Role |
|-------|------|
| `key` / `label` | ROP / stock column identity |
| `includeInRop` / `includeInStock` / `active` | Column participation |
| `companyLocationId`, `directWarehouses`, … | Warehouse resolution (unchanged) |

**Logical roles at generate time (derived, not stored)**:

| Role | Detection |
|------|-----------|
| Cosmetics.lk ROP | Active + `includeInRop` + Cosmetics.lk location column |
| Shop ROP | Active + `includeInRop` + shop / `cosmo_shop_*` column |
| Other company ROP | Active + `includeInRop` + neither of the above |

### ProductOsfRop

| Field | Role |
|-------|------|
| `sku`, `columnKey`, `ropQty` | Per-column ROP values shown on all variants |

VAT OSF still reads Cosmetics.lk + shop keys; other company keys are simply not emitted as ROP columns on VAT workbooks.

### ProductOsfProfile

Unchanged (`reorderThresholdPercent`, etc.). Threshold math on VAT uses Cosmetics.lk-only Total ROP.

## Generate-time concepts (not persisted)

### OsfVariant

| Value | Catalog | ROP columns | Total ROP |
|-------|---------|-------------|-----------|
| `main` | Full eligible catalog | All active `includeInRop` | Sum of those ROP values |
| `vat` | VAT SKUs only | Cosmetics.lk + shop ROPs only | Cosmetics.lk ROP only |
| `non_vat` | Non-VAT SKUs only | Same as Main | Same as Main |

### Validation rules

- `osfVariant` required on new clients; default `main` for backward compatibility if omitted.
- `vat` / `non_vat` membership evaluated after catalog build (or as catalog filter), before ERP bin fetch narrowing.
- Empty catalog after filter → existing empty-workbook / clear message behavior (no crash).

## State transitions

None. ERP priority change → next generate membership changes; no workflow state machine.
