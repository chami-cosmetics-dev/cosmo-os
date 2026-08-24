# Contract: Store Stock Count APIs

**Feature**: `044-stores-stock-count`  
**Base path**: `/api/admin/store-stock-count`  
**Auth**: `store.stock_count.read` via `requireStoreStockCountAccess`  
**Scope**: current user’s OS `companyId` only  

Errors: `{ "error": string }` with 4xx/5xx. ERP failures on **items** are **not** a blanket 502 for the whole multi-company UI — see POST items.

No route in this feature creates or updates ERP stock.

---

## GET `/companies`

List ERP companies from all configured ERP instances for this OS.

### Response `200`

```json
{
  "companies": [
    {
      "instanceId": "clxxxxxxxx",
      "instanceLabel": "ERP1 - Cosmetics",
      "erpCompany": "Pevi"
    }
  ]
}
```

Sort: instance label A–Z, then `erpCompany` A–Z.

### Errors

- `401` / `403`
- `404` no company on the user
- `200` with `companies: []` if instances exist but Company list is empty; if **all** instances fail, `502` `{ "error": "…" }`

---

## POST `/items`

Load **one** ERP company’s stock items + live on-hand. Client calls once per selected company.

`export const maxDuration = 60`

### Body

```json
{
  "instanceId": "clxxxxxxxx",
  "erpCompany": "Pevi"
}
```

Zod: `instanceId` = `cuidSchema`; `erpCompany` = trimmed string 1–140.

### Response `200`

```json
{
  "instanceId": "clxxxxxxxx",
  "instanceLabel": "ERP1 - Cosmetics",
  "erpCompany": "Pevi",
  "items": [
    {
      "sku": "ABC_1",
      "name": "Item name",
      "description": "Optional text",
      "barcodes": ["4790123456789"],
      "stock": 12.0
    }
  ]
}
```

- `stock` is a number (including `0`).
- Include disabled=0 stock items even when `stock` is 0.
- Do **not** include `count` or `difference` (client session).

### Errors

- `400` validation / unknown `erpCompany` for that instance / `instanceId` not in this OS
- `401` / `403`
- `502` that ERP unreachable or Item/Bin/Warehouse listing failed — body `{ "error": string, "instanceId": "…", "erpCompany": "…" }` so the client can mark **that** company unavailable and keep other companies’ rows/counts

---

## Client-only (not HTTP)

| Action | Behavior |
|--------|----------|
| Scan / type barcode + Enter | Match loaded `barcodes`; unique → +1 count, highlight, clear field |
| Ambiguous / unknown / empty | No count change; toast except empty |
| Set count field | Absolute integer ≥ 0 |
| Difference | `count - sum(numeric stocks for selected companies)` when counted and all those stocks are numbers |
| Refresh | Repeat POST `/items` per selected company; merge stock; keep counts by SKU |
| Change companies | Confirm if any count set; then drop counts and reload |

---

## Out of contract

- Stock Reconciliation / Stock Entry / warehouse picker
- Saved count documents
- Camera scanning
- Rider / merchant APIs
