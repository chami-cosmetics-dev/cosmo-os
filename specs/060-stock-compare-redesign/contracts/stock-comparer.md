# Contract: Cosmetics Stock Comparer API

**Feature**: `060-stock-compare-redesign`  
**Base path**: `/api/admin/reports/stock-comparer`  
**Auth**: `reports.stock_comparer` via `requirePermission`  
**Scope**: current user’s OS `companyId` only  

`export const dynamic = "force-dynamic"`  
`export const maxDuration = 60`

Errors: `{ "error": string, "code"?: string, "detail"?: string }` with 4xx/5xx.

No route in this feature creates or updates ERP stock, Stock Entry, or Stock Transfer.

---

## GET `/`

Live Cosmetics-main shortage report plus brand-company violations. One call fills both UI tabs.

### Query

| Param | Required | Rules |
|-------|----------|--------|
| `threshold` | no | Finite number. Default `0`. |

Zod / parse: invalid number → `400` `{ "error": "Stock threshold must be a number" }`.

### Response `200`

```json
{
  "threshold": 0,
  "itemCount": 1200,
  "warehouseCount": 18,
  "salesWindow": {
    "from": "2026-06-26",
    "to": "2026-09-24",
    "timezone": "Asia/Colombo",
    "days": 90
  },
  "salesStatus": "ok",
  "criticalCutoffUnits": 42,
  "rows": [
    {
      "SKU": "ACN01_1",
      "Product Title": "Acnes Sealing Gel Pimple Treatment 9g",
      "Main Warehouse Qty": 0,
      "sales90d": 80,
      "critical": true,
      "online": [
        { "name": "Website Inventory - Cosmo", "qty": 5, "kind": "online", "warehouse": "Website Inventory - Cosmo" }
      ],
      "shops": [
        { "name": "Pepiliyana", "qty": 4, "kind": "shop", "warehouse": "Pepiliyana Shop Warehouse" }
      ],
      "Online Warehouse(s)": "Website Inventory - Cosmo",
      "Online Qty": 5,
      "Shop Warehouse(s)": "Pepiliyana",
      "Shop Qty": 4,
      "Stock Available Elsewhere": "Yes"
    }
  ],
  "brandViolations": [
    {
      "SKU": "HL-1",
      "Product Title": "Hada Labo Lotion",
      "Brand": "Hada Labo",
      "ERP Source": "ERP2",
      "Warehouse": "Cool Planet Shop Warehouse",
      "Balance Qty": 1,
      "Rule": "Brand should only appear in ERP1"
    }
  ]
}
```

### Row rules

- `rows` only include SKUs with Cosmetics main (`Main Warehouse - Cosmo`) qty `<= threshold`.
- `online` listed before `shops` in the payload arrays used by UI/export.
- Empty `online` and `shops` → `"Stock Available Elsewhere": "No"`.
- `critical` is false for every row when `salesStatus` is `"unavailable"`; `criticalCutoffUnits` is then `null`.
- Sort: `critical` true first, then Elsewhere Yes, then SKU.

### Brand rules

Unchanged lists and messages from [data-model.md](../data-model.md). Qty must be > 0. Sort: Brand, SKU, Warehouse.

### Errors

| Status | When |
|--------|------|
| `401` / `403` | Missing session or `reports.stock_comparer` |
| `404` | User has no `companyId` |
| `400` | Threshold not a finite number |
| `409` | No active OSF stock warehouses configured (`ERP_WAREHOUSES_MISSING`) |
| `502` | No ERP instances, or ERP unreachable (`ERP_UNAVAILABLE`) |
| `500` | Unexpected failure |

On `502`/`500` the client clears both tab result sets.

### Breaking change vs previous comparer

Response rows no longer include Priority 1/2/3 fields or `priority1` / `priority2` / `priority3` arrays. Only this page consumes the route.
