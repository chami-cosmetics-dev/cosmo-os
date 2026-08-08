# Contract: Store Location Allocation APIs

**Feature**: `035-store-location-allocation`  
**Base path**: `/api/admin/store-allocation`  
**Auth**: `store.allocation.read` (or final key chosen in research — one key, documented in rbac)

Errors: `{ "error": string, ... }` with 4xx/5xx.

---

## GET `/lookup`

Resolve one item by SKU or barcode.

### Query

| Param | Required | Description |
|-------|----------|-------------|
| q | yes | Trimmed search; exact barcode preferred, else SKU/title match |

### Response `200`

```json
{
  "item": {
    "sku": "ABC_1",
    "barcode": "4790…",
    "description": "Product title",
    "priorityErp1": "Top Priority",
    "priorityErp2": null,
    "companyReorderQty": 50
  },
  "matches": []
}
```

When multiple partial SKU matches and no exact barcode hit:

```json
{
  "item": null,
  "matches": [
    { "sku": "ABC_1", "barcode": "…", "description": "…" }
  ]
}
```

### Errors

- `400` missing/invalid q  
- `401` / `403` auth  
- `404` optional when zero matches (`item: null`, `matches: []` also acceptable)

---

## GET `/plan`

Build location split inputs + suggestions for a SKU and take qty.

### Query

| Param | Required | Description |
|-------|----------|-------------|
| sku | yes | Exact SKU |
| takeQty | yes | Non-negative integer (0 → all suggested 0) |

### Response `200`

```json
{
  "sku": "ABC_1",
  "description": "Product title",
  "barcode": "…",
  "companyReorderQty": 50,
  "takeQty": 30,
  "shortShipment": true,
  "locations": [
    {
      "columnKey": "lmj",
      "label": "LMJ",
      "locationRop": 10,
      "stock": 2,
      "need": 8,
      "sales30d": 12,
      "suggestedQty": 7
    }
  ]
}
```

`shortShipment` = `takeQty > 0 && takeQty < companyReorderQty`.  
Sum of `suggestedQty` MUST equal `takeQty` when `takeQty ≥ 1`.

### Errors

- `400` validation  
- `401` / `403`  
- `404` unknown SKU  
- `502` ERP unavailable for stock (prefer soft-fail stock=0 with `erpAvailable: false` flag if consistent with OSF patterns)

---

## POST `/export`

Download allocation plan as Excel.

### Body

```json
{
  "sku": "ABC_1",
  "description": "Product title",
  "barcode": "4790…",
  "companyReorderQty": 50,
  "takeQty": 30,
  "locations": [
    { "columnKey": "lmj", "label": "LMJ", "qty": 7 }
  ]
}
```

### Validation

- Zod length limits  
- Sum of location `qty` === `takeQty`  
- All qty ≥ 0 integers  

### Response `200`

- `Content-Type`: spreadsheet MIME  
- `Content-Disposition`: `attachment; filename="store-allocation-{sku}-{date}.xlsx"`  
- Columns: Location, Qty (plus header rows for SKU, barcode, description, take qty, company reorder qty)

### Errors

- `400` validation / sum mismatch  

---

## UI contract

| Control | Behavior |
|---------|----------|
| Search | Focusable input; Enter submits (scanner); shows item or match list |
| Item card | Priority, SKU, barcode, description, TOTAL ORDER QTY |
| Take qty | Integer input; refreshes plan |
| Location table | ROP, stock, need, sales30d, suggested, editable qty |
| Warning | takeQty > companyReorderQty |
| Export | Enabled when sum(qty)==takeQty |
| Print | Optional browser print of same summary |
