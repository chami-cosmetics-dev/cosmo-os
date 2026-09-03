# Market Prices CSV Import & Export

Bulk competitor price workflow (competitor prices only — MRP/PROMO/OGF from catalog).

## Auth
- Template + export: `purchasing.market_prices.read`
- Import: `purchasing.market_prices.manage`

---

## GET /api/admin/purchasing/market-prices/template

Returns CSV file download with header row:

```text
sku,competitor,competitor_title,product_url,price_lkr,in_stock,check_date,notes,pack_size
```

Includes one example comment row (stripped on import) or separate README in quickstart.

---

## POST /api/admin/purchasing/market-prices/import

Multipart `file` (CSV) or JSON `{ "csv": "…" }`.

### Query
- `preview=1` — validate only, no writes

### Body (commit)
- After preview, client sends `{ "commitToken": "…" }` from preview response (hash of normalized rows + user id + expiry 15 min)

### Preview response `200`

```json
{
  "commitToken": "…",
  "summary": {
    "totalRows": 50,
    "validRows": 48,
    "createCount": 10,
    "updateCount": 38,
    "skipCount": 0,
    "errorCount": 2
  },
  "errors": [
    { "line": 12, "field": "competitor", "message": "Unknown competitor: Foo" },
    { "line": 27, "field": "sku", "message": "SKU not found: BAD-SKU" }
  ],
  "sampleChanges": [
    { "line": 2, "sku": "CERAVE-236", "competitor": "liberty-store", "action": "update", "oldPrice": 8500, "newPrice": 8200 }
  ]
}
```

### Commit response `200`

```json
{
  "applied": 48,
  "errors": []
}
```

### Validation rules
- Required: `sku`, `competitor`, `price_lkr`, `check_date`
- `competitor_title`, `product_url` required on **create**; optional on update (keep existing)
- `in_stock`: `yes`/`no`/`true`/`false`/`1`/`0`
- `check_date`: `YYYY-MM-DD` or `DD/MM/YYYY`
- `price_lkr` positive decimal
- Unknown SKU → row error (no auto-create)
- Valid rows apply even when sibling rows fail

---

## GET /api/admin/purchasing/market-prices/export

Same query params as [page-data](./market-prices-page-data.md) (layer, filters, q).

### Response
- `200` `text/csv` with columns:
  `sku,title,brand,mrp,promo,ogf,competitor_median,gap_mrp_pct,gap_promo_pct,gap_ogf_pct,competitor_count,latest_check_date,any_stale`

---

## Errors
- `400` malformed CSV / missing columns
- `401` / `403` auth
- `409` commit token expired or mismatched
