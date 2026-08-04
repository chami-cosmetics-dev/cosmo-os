# Contract: OSF Supplier Orders APIs

**Feature**: `031-osf-supplier-orders`  
**Base path**: `/api/admin/osf/supplier-orders`  
**Auth**: Same permission class as OSF generate / purchasing (`requirePermission` consistent with `/api/admin/osf/generate`).

All responses JSON unless noted. Errors: `{ "error": string, ... }` with 4xx/5xx.

---

## GET `/page-data`

Bootstrap filters for the panel.

### Response `200`

```json
{
  "brands": [{ "id": "cuid", "name": "Vendor Name" }],
  "priorities": ["Top Priority", "Priority", "Newly Added", "Vat"]
}
```

`priorities` aligns with `lib/product-items/erp-priority-options.ts` (canonical list; may include additional known values).

---

## GET `/items`

Searchable OSF items with reorder qty.

### Query

| Param | Required | Description |
|-------|----------|-------------|
| q | no | Substring match on SKU and description; omit/empty = all matching other filters |
| vendorId | no | Brand filter (cuid); omit = all brands |
| priority | no | Exact ERP priority string; omit = all |
| page | no | 1-based page (default 1) |
| pageSize | no | Default 50, max 200 |

### Response `200`

```json
{
  "items": [
    {
      "sku": "ABC_1",
      "description": "Product title",
      "vendorId": "cuid",
      "vendorName": "Brand",
      "reorderQty": 20
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 123,
  "hasMore": true
}
```

`reorderQty` = TOTAL ORDER QTY at request time (floored at 0).

### Errors

- `400` invalid query (bad cuid, pageSize)
- `401` / `403` auth

---

## GET `/suppliers`

Suppliers for allocation on one SKU.

### Query

| Param | Required | Description |
|-------|----------|-------------|
| sku | yes | SKU string (trimmed, length-limited) |

### Response `200`

```json
{
  "sku": "ABC_1",
  "suppliers": [
    {
      "supplierId": "cuid",
      "supplierName": "Supplier A",
      "lastPurchaseAt": "2026-07-01T00:00:00.000Z",
      "sortGroup": "sku_recent"
    },
    {
      "supplierId": "cuid2",
      "supplierName": "Supplier B",
      "lastPurchaseAt": null,
      "sortGroup": "other"
    }
  ]
}
```

Order: `sku_recent` (newest `lastPurchaseAt` first), then `other` (stable by name). Allowlist rules match OSF purchasing.

### Errors

- `400` missing/invalid sku
- `401` / `403` auth

---

## POST `/generate`

Build zip of supplier Excels from the working draft.

### Body

```json
{
  "rows": [
    {
      "sku": "ABC_1",
      "description": "Product title",
      "reorderQty": 20,
      "allocations": [
        { "supplierId": "cuid", "supplierName": "Supplier A", "qty": 5 },
        { "supplierId": "cuid2", "supplierName": "Supplier B", "qty": 10 }
      ]
    }
  ]
}
```

### Validation (server)

- Zod: row/allocation shape, string length limits, non-negative qty, cuid for supplierId when present
- At least one allocation with `qty > 0` across all rows
- For each row with `reorderQty > 0`: sum of positive allocation qtys ≤ `reorderQty`
- Empty/zero allocations omitted from files

### Response `200`

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="OSF-supplier-orders-{date}.zip"`
- Zip entries: one `.xlsx` per supplier with positive lines  
  - Suggested entry name: `{safeSupplierName}-order-{date}.xlsx`
  - Sheet columns: `SKU`, `Description`, `Order Qty`

### Errors

- `400` validation / over-allocation / no positive lines — JSON body with `error` and optional `sku` list
- `401` / `403` auth

---

## UI contract (panel)

| Control | Behavior |
|---------|----------|
| Priority select | Optional; values from page-data |
| Brand select | Optional; “All brands” default |
| Item search | On open/focus with empty q → list page 1; typing filters; rows show SKU + description (+ reorder qty optional in list) |
| Add | Appends working row; duplicate SKU ignored |
| Table | SKU, description, read-only reorder qty, supplier allocations UI, remove |
| Clear | Wipes table + localStorage draft |
| Generate | POST draft; download zip blob |
| Persistence | Load/save draft on mount/change (`osf_supplier_orders_draft_v1`) |
