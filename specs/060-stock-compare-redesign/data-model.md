# Data Model: Stock Compare Redesign

**Feature**: `060-stock-compare-redesign` | **Date**: 2026-09-24

No new Prisma models. Shapes are API/UI read models from existing catalog + ERP bins + completed orders.

## Entities (read / computed)

### ReportRun

| Field | Type | Notes |
|-------|------|--------|
| threshold | number | Inclusive Cosmetics-main cutoff; default 0 |
| itemCount | number | Catalog SKU count used for Bin fetch |
| warehouseCount | number | Distinct warehouse names in flattened bins |
| salesWindow | SalesWindow \| null | Present when sales attempted |
| salesStatus | `"ok"` \| `"unavailable"` | Critical omitted when not `ok` |
| criticalCutoffUnits | number \| null | Min 90-day units to be Critical; null if ranking unavailable |

**Lifecycle**: Not persisted. One user-triggered GET produces both tab payloads. New run replaces both.

---

### SalesWindow

| Field | Type | Notes |
|-------|------|--------|
| from | string (YYYY-MM-DD) | Inclusive start, Asia/Colombo |
| to | string (YYYY-MM-DD) | Inclusive end date shown to user |
| timezone | `"Asia/Colombo"` | Fixed |
| days | `90` | Fixed |

---

### CosmeticsMainShortage

| Field | Type | Notes |
|-------|------|--------|
| SKU | string | Catalog SKU |
| Product Title | string | Item name |
| Main Warehouse Qty | number | Qty at `Main Warehouse - Cosmo` |
| sales90d | number | Website-channel units last 90 days; 0 if none or sales unavailable |
| critical | boolean | Top 20% seller when `salesStatus === "ok"` |
| online | LocationStock[] | Other non-shop warehouses with qty > 0 |
| shops | LocationStock[] | Shop-floor locations with qty > 0 |
| Stock Available Elsewhere | `"Yes"` \| `"No"` | Yes if `online.length + shops.length > 0` |

**Inclusion**: Cosmetics main row exists and `Main Warehouse Qty <= threshold`.

**Display/export flatten** (derived, not stored):

- Online Warehouse(s) / Online Qty
- Shop Warehouse(s) / Shop Qty

**Sort**: Critical first, then Elsewhere = Yes, then SKU.

---

### LocationStock

| Field | Type | Notes |
|-------|------|--------|
| name | string | Online: warehouse label. Shop: aliased outlet name |
| qty | number | > 0 |
| kind | `"online"` \| `"shop"` | Classification (see research R3) |
| warehouse | string | Raw ERP warehouse name used for the qty |

**Rules**:

- Skip warehouse names containing `all warehouses`.
- Exclude Cosmetics main (`main warehouse - cosmo`) from both lists.
- Shop: prefer shop-floor qty over that shop’s back-room / shop-main.
- Deduplicate shops by normalized outlet name; online by normalized warehouse name.

---

### BrandViolation

Existing comparer shape. Unchanged lists.

| Field | Type | Notes |
|-------|------|--------|
| SKU | string | |
| Product Title | string | Brand match source |
| Brand | string | Matched restricted brand |
| ERP Source | `"ERP1"` \| `"ERP2"` | Company found on |
| Warehouse | string | Location of the violating qty |
| Balance Qty | number | Must be > 0 |
| Rule | string | Company 1-only or Company 2-only message |

**Company 1-only** (violation if ERP2): Keune, Jovees, Savol, Palmers, Olay, Melano, Acnes, Hada Labo, Lipice, Wella, ZGTS.

**Company 2-only** (violation if ERP1): Sanford, Golden Rose, Maybeline, Revlon, The Elf, Biovene, Flamingo.

Zero/negative qty and missing ERP source: not a violation. `all warehouses` rows skipped.

---

### Permission

| Field | Value |
|-------|--------|
| key | `reports.stock_comparer` |
| description | Use Cosmetics Stock Comparer upload and export (existing; wording may stay) |

No new key. No schema migration.

## Relationships

```text
ReportRun 1──* CosmeticsMainShortage
ReportRun 1──* BrandViolation
CosmeticsMainShortage 1──* LocationStock (online)
CosmeticsMainShortage 1──* LocationStock (shops)
```

Stock rows and brand rows share the same flattened Bin snapshot for one run.

## Validation rules

- `threshold` must be a finite number (may be 0 or negative; inclusion is `qty <= threshold`).
- Empty SKU / empty warehouse dropped at parse.
- `sales90d` never invented when sales query fails (`salesStatus = unavailable`, treat displayed sales as 0 and `critical = false`).
- Critical never true when `sales90d < 1` or ranking unavailable.

## State transitions

None persisted. Tab switch reuses the last successful `ReportRun`. Threshold edit without Run keeps the last run’s labeled threshold.
