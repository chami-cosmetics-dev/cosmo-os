# Contract: Purchasing Suite APIs

**Feature**: `012-osf-purchasing-suite`  
**Date**: 2026-07-20

## Auth

| Permission | Capabilities |
|------------|----------------|
| `purchasing.osf.read` | Classic full OSF generate; view OSF hub (existing) |
| `purchasing.osf.manage` | OSF columns, absolute ROP, availability, OGF (existing) |
| `purchasing.tools.read` | Margin/compare UI; filtered reorder-only OSF; purchasing tool nav |
| `purchasing.tools.manage` | PATCH `reorderThresholdPercent` |
| `reminders.purchasing_rop_threshold` | ROP-threshold reminder bubble |

---

## `GET /api/admin/purchasing/sku-pricing`

**Auth**: `purchasing.tools.read`

**Query**: `q` (search) or exact `sku`

**Response 200**

```json
{
  "items": [
    {
      "sku": "CAN07_1",
      "productTitle": "string",
      "brand": "string|null",
      "discountedPrice": 1200.0,
      "mrp": 1500.0,
      "latestCost": 800.0,
      "latestSupplier": "Acme|null",
      "costSource": "item_rate|purchase_receipt|null"
    }
  ]
}
```

Blank `latestCost` when ERP/allowlist yields nothing — never invented.

**Errors**: 403 missing permission; 400 validation

---

## `PATCH /api/admin/osf/profiles/[sku]` (extend)

**Auth**: `purchasing.osf.manage` **or** `purchasing.tools.manage` for threshold-only updates (implementation may accept either; tools.manage must be sufficient for threshold).

**Body** (additive)

```json
{
  "reorderThresholdPercent": 70
}
```

`null` clears → effective default 70. Zod: int 1–100 or null.

---

## `POST /api/admin/osf/generate` (extend)

**Auth**: Full catalog generate → `purchasing.osf.read`. When `belowThresholdOnly: true` → require `purchasing.tools.read`.

**Body** (additive)

```json
{
  "salesMonth": "2026-07",
  "asOfDate": "2026-07-20",
  "belowThresholdOnly": true
}
```

**Response**: XLSX download. Rows limited to below-threshold SKUs. If none: still 200 with empty/notice sheet; UI shows toast.

**Workbook rules**:
- Per-warehouse `ORDER QTY` = signed ROP − stock
- `TOTAL ORDER QTY` = sum of positive warehouse order qtys only
- Common SKU Reorder buy aggregate follows positive-only rule

---

## Reminders integration

Category key: `purchasing_rop_threshold`  
Permission: `reminders.purchasing_rop_threshold`  
Payload: list of `{ sku, productTitle, stockPctOfRop, thresholdPercent, href }` capped per existing reminder limits.  
Href: purchasing OSF or reorder page suitable for filtered download.
