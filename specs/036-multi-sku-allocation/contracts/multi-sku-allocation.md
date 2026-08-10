# Contract: Multi-SKU Location Allocation

**Feature**: 036-multi-sku-allocation  
**Auth**: `store.allocation.read` (unchanged)

## Existing endpoints (reuse)

### `GET /api/admin/store-allocation/lookup?q=`

Unchanged. Client uses result to **append** a session row (or focus duplicate).

### `GET /api/admin/store-allocation/plan?sku=&takeQty=`

Unchanged. Client calls once per session item when `takeQty` changes (debounced). Response locations use `sales90d` + `suggestedQty` as today.

## Updated: `POST /api/admin/store-allocation/export`

### Request body

```json
{
  "items": [
    {
      "sku": "SKU-1",
      "description": "…",
      "barcode": "…",
      "companyReorderQty": 50,
      "takeQty": 30,
      "locations": [
        { "columnKey": "col_a", "label": "Location A", "qty": 12 },
        { "columnKey": "col_b", "label": "Location B", "qty": 18 }
      ]
    }
  ]
}
```

### Validation

| Rule | Error |
|------|--------|
| `items` length 1…50 | 400 |
| Each `takeQty` ≥ 1 for included rows | 400 (or strip zeros client-side before POST) |
| Each item: Σ `locations.qty` === `takeQty` | 400 with `{ sku, takeQty, sum }` |
| Zod string/number limits as existing single-SKU schema | 400 |

### Response

- `200`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Filename: `store-allocation-multi-YYYY-MM-DD.xlsx` (or similar)

### Workbook contents (contractual)

1. **By location** sheet (or first sheet): rows of `{ locationLabel, sku, qty }` for qty &gt; 0; optional subtotal per location.
2. **By SKU** detail: for each item, identity block + location qty list (compatible with today’s single-SKU sheet layout repeated).

## Client UI contract (walkthrough)

| Surface | Behavior |
|---------|----------|
| Session list | Search/scan add; take qty inputs; remove; max 50 |
| Start walkthrough | Enabled when ≥1 item has takeQty &gt; 0 and plan ready |
| Location step | Shows all included items’ qty for current location; editable |
| Navigation | Prev/Next + Left/Right when not focused in number input; skip all-zero locations |
| Progress | `label` + `index/total` among non-empty steps |
| Export | Enabled when every takeQty&gt;0 item has Σ qty === takeQty |

## Out of scope (contract)

- ERP stock transfer APIs
- Server-side session persistence
- Bulk paste upload endpoint
