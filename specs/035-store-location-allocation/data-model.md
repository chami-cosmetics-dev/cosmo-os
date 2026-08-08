# Data Model: Store Location Allocation

**Feature**: `035-store-location-allocation` | **Date**: 2026-08-08

No new Prisma models for saved plans in v1. Domain objects below are API/UI shapes.

## Entities

### Catalog item (lookup result)

| Field | Type | Notes |
|-------|------|--------|
| sku | string | |
| barcode | string \| null | |
| description | string | product title |
| priorityErp1 | string \| null | |
| priorityErp2 | string \| null | display as priority level(s) |
| companyReorderQty | number | OSF TOTAL ORDER QTY ≥ 0 |

### Allocation location row

| Field | Type | Notes |
|-------|------|--------|
| columnKey | string | OSF column key |
| label | string | Display name |
| locationRop | number | From ProductOsfRop; missing → 0 |
| stock | number | ERP bin sum for column warehouses; missing → 0 |
| need | number | max(0, ROP − stock) |
| sales30d | number | Cosmo completed units last 30d; missing → 0 |
| suggestedQty | number | Whole number from allocate helper |
| qty | number | User-editable; defaults to suggested |

### Take plan (export body)

| Field | Type | Notes |
|-------|------|--------|
| sku | string | |
| description | string | |
| barcode | string \| null | |
| companyReorderQty | number | Snapshot for the sheet |
| takeQty | number | ≥ 1 whole number |
| locations | { columnKey, label, qty }[] | qtys sum to takeQty |

## Validation rules

1. `takeQty` integer ≥ 0; allocate only when ≥ 1.
2. `need`, `sales30d`, `stock`, `locationRop` non-negative.
3. `suggestedQty` / export `qty` integers ≥ 0; sum of location qtys === takeQty for export.
4. Lookup `q` trimmed, length-limited; no fabricated item when not found.
5. Only `active && includeInRop` columns appear as locations.

## Allocate state machine (per request)

```text
[Item selected]
  → enter takeQty
  → compute need/sales/stock per location
  → suggestedQty = allocate(takeQty, weights)
  → optional edit qty
  → export if sum(qty) == takeQty
```

## Existing DB / ERP sources (read-only)

- `ProductItem` (sku, barcode, title, priorities)
- `ProductOsfRop`
- `OsfColumnConfig` (+ location warehouses)
- `Order` / lines + `companyLocationId` (sales)
- ERP bin actual qty
- Permission catalog entry for store allocation
