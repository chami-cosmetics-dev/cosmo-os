# Contract: Vault OSF Sales History Import

**Feature**: `052-vault-osf-rebuild`
**Date**: 2026-09-09

Used to back-fill months the ERPs cannot supply (April and May 2026 today).
Live ERP months are never written here; generation prefers ERP figures when
present.

Existing ROP template/import (`GET /api/admin/osf/rop-template`,
`POST /api/admin/osf/rop-import`) is reused unchanged. Headers resolve to
`sv` / `ori` / `ae` once those columns are seeded.

---

## Auth

| Permission | Capability |
|------------|------------|
| `purchasing.osf.manage` | Download template; upload history |

---

## `GET /api/admin/osf/vault/sales-history`

**Query**: `month` required, `YYYY-MM`.

**Response `200`**: xlsx, filename `OSF-sales-history-{month}.xlsx`

**Sheet**

| Column | Source |
|--------|--------|
| SKU | ERP1 enabled stock item codes (same row set as generate) |
| Barcode | When known |
| SV | Existing `OsfMonthlySalesHistory.qty` for that month + `sv`, or blank |
| ORI | Same for `ori` |
| AE | Same for `ae` |

Headers accept labels (`SV`, `ORI`, `AE`) or keys (`sv`, `ori`, `ae`),
case-insensitive, matching the ROP import convention.

**Errors**: `400` invalid month; `401` / `403`; `409` Vault OSF not configured.

---

## `POST /api/admin/osf/vault/sales-history`

**Body**: `multipart/form-data`

| Field | Required | Rules |
|-------|----------|-------|
| `file` | yes | `.xlsx` / `.xls` |
| `month` | yes | `YYYY-MM` — every row in the file is attributed to this month |

**Processing**

1. Require `SKU` header (alias `Variant SKU`).
2. Map remaining headers to `sv` / `ori` / `ae`. Unrecognized headers → listed
   in `errors`, those columns ignored.
3. Blank cell → **no change** (same as ROP import).
4. Non-blank → non-negative integer; upsert `OsfMonthlySalesHistory`.
5. Unknown SKU (not an ERP1 stock item and not a Vault OS `ProductItem` SKU) →
   row error; no writes for that row.
6. Duplicate SKU rows → error for that SKU; apply none of that SKU's cells.
7. Valid SKUs still commit if other rows fail.

**Response `200`**

```json
{
  "month": "2026-04",
  "updatedCells": 42,
  "skippedBlank": 900,
  "rowsProcessed": 341,
  "errors": [
    { "row": 15, "sku": "X", "message": "Unknown SKU" },
    { "row": 20, "sku": "Y", "column": "SV", "message": "qty must be a non-negative integer" }
  ]
}
```

**Errors**: `400` unreadable file / missing SKU / missing month; `401` / `403`;
`409` not configured.

---

## UI contract

On the Vault OSF panel (manage users):

- Month picker + **Download sales history template**
- **Upload sales history** with busy spinner
- Toast summary: `{updatedCells} cells updated for {month}` plus error count
- Existing ROP download/upload stay on the hub; they now operate on SV/ORI/AE
  once columns are seeded
