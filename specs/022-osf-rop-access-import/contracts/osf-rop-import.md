# Contract: OSF ROP Template Import & TOTAL Formula

## Permission

| Key | Capability |
|-----|------------|
| `purchasing.osf.manage` | Download ROP template; upload ROP import; item-wise ROP edit (existing) |

## GET `/api/admin/osf/rop-template`

**Auth**: `purchasing.osf.manage`

**Response**: `200` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Filename**: `OSF-ROP-template-{yyyy-mm-dd}.xlsx` (or similar)

**Sheet content**:

| Column | Source |
|--------|--------|
| SKU | Catalog SKU (OSF scope, all SKUs) |
| Barcode | Variant barcode when known |
| `{label}` for each active `includeInRop` OSF column | Current `ProductOsfRop.ropQty` or blank |

Column order follows `OsfColumnConfig.sortOrder`.

**Headers**: Prefer human labels matching ROP-by-column UI (e.g. `GCC Shop`, `LMJ`). Import resolves headers → `OsfColumnConfig.key` by case-insensitive label match among active ROP columns; exact key as header also accepted.

## POST `/api/admin/osf/rop-import`

**Auth**: `purchasing.osf.manage`

**Body**: `multipart/form-data` with file field `file` (`.xlsx` / `.xls` / `.csv` optional if parse supports)

**Processing rules**:

1. Require `SKU` header (or `Variant SKU` alias).
2. Map other headers to ROP column keys; unrecognized non-SKU/Barcode headers → error listed, those columns ignored.
3. Blank ROP cell → **no change** to existing ROP.
4. Non-blank → must be non-negative integer (floor if decimal with no fraction, else error); upsert `ProductOsfRop`.
5. Unknown SKU → row error; no writes for that row.
6. Duplicate SKU rows → error for that SKU; apply **none** of that SKU’s cells.
7. Valid SKUs still commit even if other rows fail (per-SKU transaction granularity OK).

**Response** `200`:

```json
{
  "updatedCells": 42,
  "skippedBlank": 1200,
  "rowsProcessed": 800,
  "errors": [
    { "row": 15, "sku": "X", "message": "Unknown SKU" },
    { "row": 20, "sku": "Y", "column": "LMJ", "message": "ROP must be a non-negative integer" }
  ]
}
```

**Errors**: `401` / `403` / `400` unreadable file / missing SKU column.

## UI contract

- On OSF hub (manage users): **Download ROP template** + **Upload ROP** with busy/spinner + toast summary (`notify`).
- Product editor continues to list all `active && includeInRop` columns (shops appear when flag on).

## Totals formula (generate)

| Aggregate | Rule |
|-----------|------|
| Per-column `ORDER QTY` | Unchanged: `ROP − stock` (signed; blank if ROP missing) |
| `TOTAL ORDER QTY` | `max(0, Σ signed per-column order qtys)` |
| `Common SKU Reorder` | Same signed-sum-then-floor-at-zero policy (replaces positives-only) |

Helper name (implementation): e.g. `sumSignedOrderQtysFlooredAtZero` replacing call sites of `sumPositiveOrderQtys` for these aggregates.
