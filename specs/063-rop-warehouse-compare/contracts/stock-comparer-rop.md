# Contract: Stock Comparer ROP extensions

**Feature**: `063-rop-warehouse-compare`  
**Base path**: `/api/admin/reports/stock-comparer`  
**Auth**: `reports.stock_comparer` via `requirePermission`  
**Scope**: current user’s OS `companyId` only  

Extends the 060 contract. Existing fields stay. This feature does not add a route and does not create ERP stock, Stock Entry, or Stock Transfer.

`export const dynamic = "force-dynamic"`  
`export const maxDuration = 60`

Errors: `{ "error": string, "code"?: string, "detail"?: string }`.

## GET `/`

### Query

| Param | Required | Rules |
|-------|----------|--------|
| `threshold` | no | Finite number. Default `0`. Unchanged. |
| `ropPercent` | no | Finite number, `0` through `100` inclusive. Omit → no percent sections. |
| `focusWarehouse` | no | Exact warehouse `name` from this run’s configured list. Ignored for computation when `ropPercent` is omitted. |

| Invalid | Status | Body |
|---------|--------|------|
| `threshold` not a finite number | `400` | `{ "error": "Stock threshold must be a number" }` |
| `ropPercent` present and out of range or not a number | `400` | `{ "error": "Reorder percent must be a number from 0 through 100" }` |
| `focusWarehouse` not in the configured warehouse list | `400` | `{ "error": "Unknown warehouse" }` |

ERP down and missing warehouses: same `502` / `409` as today. Do not return a stale percent list.

### Response `200`

Existing keys unchanged: `threshold`, `itemCount`, `warehouseCount`, `salesWindow`, `salesStatus`, `criticalCutoffUnits`, `rows`, `brandViolations`.

Added:

```json
{
  "ropPercent": 30,
  "focusWarehouse": "Main Warehouse - Trading",
  "watchedWarehouseCount": 3,
  "warehouses": [
    {
      "name": "Main Warehouse - Cosmo",
      "columnKey": "cosmetics_lk",
      "label": "Cosmetics.lk",
      "kind": "main",
      "erpSource": "ERP1",
      "watched": true
    }
  ],
  "ropWatch": [
    {
      "SKU": "CAN07_1",
      "commonSku": "CAN07",
      "Product Title": "Example",
      "erp1ProductPriority": "Top Priority",
      "erp2ProductPriority": null,
      "vatStatus": "Vat",
      "hits": [
        {
          "columnKey": "cosmetics_lk",
          "label": "Cosmetics.lk",
          "warehouse": "Main Warehouse - Cosmo",
          "erpSource": "ERP1",
          "role": "cosmetics-main",
          "qty": 30,
          "rop": 100,
          "percentOfRop": 0.3,
          "hit": true,
          "ropMissing": false,
          "websiteOutOfStock": false
        }
      ],
      "context": [],
      "elsewhere": []
    }
  ],
  "shopCompare": [],
  "focusCompare": []
}
```

`shopCompare` row: identity fields + `mainQty`, `websiteOutOfStock`, `shops` (`LocationStock` as on `rows`).

`focusCompare` row: identity fields + `focusWarehouse`, `qty`, `rop`, `percentOfRop`, `ropMissing`, `elsewhere`.

### Rules

- `ropPercent` omitted: `ropPercent` is `null`, `ropWatch` / `shopCompare` / `focusCompare` are `[]`. `warehouses` may still be returned so the picker can render. `rows` still follow `threshold`.
- Percent hit: `rop > 0` and `qty * 100 <= rop * ropPercent`. Stock `30`, ROP `100`, percent `30` is in. Stock `31` is out.
- `ropWatch` includes a SKU only when at least one watched warehouse hits. Watched set = Cosmetics main + non-shop ERP2 warehouses (research R4).
- `websiteOutOfStock` is true only when Cosmetics main qty is `<= 0`.
- `shopCompare` SKUs = threshold `rows` ∪ cosmetics-main percent hits.
- `focusCompare` omits the focus warehouse from `elsewhere`.
- Identity filters are **not** applied on the server.
- `rows` and `brandViolations` rules from `specs/060-stock-compare-redesign/contracts/stock-comparer.md` stay in force.

## UI contract

| Control | Behavior |
|---------|----------|
| Threshold + Run | Unchanged main tab and brand tab |
| Reorder percent + Run | Fills ROP watch. Blank or invalid percent: toast, no request |
| Shops tab | Renders `shopCompare`, then client filters |
| Compare tab | Warehouse select + same percent. Run sends `focusWarehouse` |
| Common SKU, variant SKU, priority, VAT | Client AND-filters on the active tab’s rows. No refetch |
| Export | Active tab, **filtered** rows only. Main and brand exports stay available |

Tabs: **Main** (default, existing), **Shops**, **Compare**, **Brand**. Main remains the default on first open.
