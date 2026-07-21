# Data Model: SKU Supplier Compare

**Feature**: `014-sku-supplier-compare`  
**Persistence**: None (v1) — all fields computed from ERP at request time

## Derived view: SupplierPurchaseSummary

One row per **supplier identity** for a given `(companyId, sku)` at read time.

| Field | Type | Source / rule |
|-------|------|----------------|
| `supplierKey` | string | `normalizeSupplierKey(supplier_name \|\| supplier)` — grouping only |
| `displayName` | string | Human label: `supplier_name` or `supplier` |
| `bestEverRate` | number \| null | Min positive `rate` across allowlisted receipt lines for this SKU+supplier |
| `bestEverDate` | string \| null | `posting_date` (YYYY-MM-DD) of row that established `bestEverRate`; tie → newer date |
| `lastRate` | number \| null | `rate` on newest allowlisted receipt for this SKU+supplier |
| `lastDate` | string \| null | `posting_date` of that newest receipt |
| `lastQty` | number \| null | Qty on last receipt line (informational) |

## Derived view: RankedSupplierOption

`SupplierPurchaseSummary` plus UI/computed fields:

| Field | Type | Rule |
|-------|------|------|
| `optionLabel` | string | `Best Option 1`, `Option 2`, … after sort |
| `optionRank` | number | 1-based index |
| `recently` | boolean | `lastDate` within 30 calendar days of today |
| `lastPurchasedFrom` | boolean | `lastDate === max(lastDate)` across all suppliers for SKU |

## Sort order (ranking)

1. `bestEverRate` ascending (`null` last)
2. Tie: `lastDate` descending (newer first)
3. Tie: `displayName` localeCompare

## Relationships

```text
Company
  └── Supplier (allowlist) ── filters ERP receipt rows
  └── ProductItem (sku) ── matches ERP item_code
  └── ERP Purchase Receipt lines ── aggregated into SupplierPurchaseSummary[]
```

## Multi-ERP merge (per supplier key)

When multiple OSF ERP instances return data for the same SKU:

- **bestEverRate**: minimum rate across instances; **bestEverDate** from the row that wins (newer date on tie)
- **lastRate / lastDate**: instance with the **newest** `lastDate` wins for that supplier key
- Suppliers only present in one instance still appear

Same merge philosophy as `lib/osf/erp-merge.ts` but keyed by `(supplierKey, sku)` not just `sku`.

## Validation rules

- SKU: required, trimmed, max `LIMITS.sku`
- Rates: positive finite numbers only; zero/negative/NaN ignored for best-ever
- Dates: ISO `YYYY-MM-DD` from ERP; missing → null; no fabrication
- Allowlist empty → fail-open (legacy OSF behavior)

## Not stored (v1)

- Preferred supplier selection
- Quote history
- Cached aggregation snapshots
