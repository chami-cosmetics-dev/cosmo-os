# Contract: `POST /api/admin/products/order-availability`

**Auth**: `requirePermission("products.order_availability.read")`. Company scope comes from `auth.context.user.companyId`.
**Side effects**: none (read-only, FR-020).

## Request

```json
{
  "lines": [
    { "sku": "SKU1", "qty": 2 },
    { "sku": "sku3" },
    { "sku": "SKU4", "qty": 1 }
  ]
}
```

Zod schema `orderAvailabilityRequestSchema` in `lib/validation/order-availability.ts`:
- `lines`: array, 1..200 raw entries. Each entry is `{ sku: trimmedString(1, LIMITS.sku.max), qty?: int 1..100000 }`.
- After normalisation (merge duplicates), more than 50 distinct SKUs → 400.

## Response 200

```json
{
  "checkedAt": "2026-10-22T09:14:03.120Z",
  "capMonth": "2026-10",
  "lines": [
    { "key": "SKU1", "sku": "SKU1", "itemCode": "SKU1", "itemName": "…", "qty": 2, "unitPrice": 1450, "found": true }
  ],
  "notFound": ["SKU9"],
  "unpricedSkus": [],
  "orderValue": 8250,
  "orderValueIsLowerBound": false,
  "cap": { "limit": 5000000, "nearThreshold": 500000, "error": null },
  "companies": [
    {
      "company": "Company 1 (Pvt) Ltd",
      "warehouses": ["Main - C1"],
      "lines": {
        "SKU1": { "status": "covered", "available": 12, "byWarehouse": [{ "warehouse": "Main - C1", "available": 12 }] }
      },
      "coveredCount": 3, "shortCount": 0, "missingCount": 2,
      "totalAvailable": 5, "fullCoverage": false,
      "cap": { "usedMtd": 3100000, "orderValue": 8250, "headroomAfter": 1891750, "status": "ok" },
      "option": "A"
    }
  ],
  "options": ["Company 1 (Pvt) Ltd", "Company 3 (Pvt) Ltd"],
  "noOptionReason": null
}
```

- `companies` is already sorted per the data-model ranking. The client renders `options` first, then "Other companies" (every company whose `option` is null).
- `noOptionReason` is one of:
  - `null` (at least one option)
  - `"all_over_cap"` (FR-013)
  - `"cap_unavailable"` (cap read failed, `cap.error` set, FR-018)
  - `"no_coverage"` (no company holds any found SKU)
  - `"no_found_skus"` (every SKU was not found)

## Errors

| Status | When | Body |
|--------|------|------|
| 400 | invalid body, 0 SKUs, >50 distinct SKUs | `{ "error": "…", "details"?: … }` |
| 401/403 | no session / missing permission | `{ "error": "…" }` (from `requirePermission`) |
| 400 | user has no company | `{ "error": "Company not found" }` |
| 502 | ERP2 not configured, or the warehouse/Bin read failed | `{ "error": "Could not read ERP2 stock: …" }` (message truncated to 300 chars) |

A failed cap read is **not** an error status. The response is 200 with `cap.error` set, every `companies[].cap.status = "unknown"`, `options: []` and `noOptionReason: "cap_unavailable"`.
