# Contract: OSF Generate Variants (Main / VAT / Non-VAT)

## Permission

Unchanged from current Cosmo OSF generate:

| Key | Capability |
|-----|------------|
| `purchasing.osf.read` | Full / filtered generate |
| `purchasing.tools.read` or `.manage` | Below-threshold reorder generate |

Vault OS deployments continue to reject Cosmo OSF generate (`COSMO_OSF_NOT_ON_VAULT`).

## POST `/api/admin/osf/generate`

### Body (extends existing)

```json
{
  "salesMonth": "2026-09",
  "asOfDate": "2026-09-16",
  "osfVariant": "main",
  "includeInactive": false,
  "belowThresholdOnly": false,
  "maxStockPctOfRop": 70,
  "vendorIds": [],
  "itemStatusCategories": [],
  "skuPrefix": ""
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `osfVariant` | `"main" \| "vat" \| "non_vat"` | No (default `main`) | Drives catalog slice + VAT ROP rules |
| (all existing fields) | as today | | Unchanged semantics except as noted below |

### Membership

| `osfVariant` | Catalog rows |
|--------------|--------------|
| `main` | Same as today (optional `itemStatusCategories` still filters ERP1/ERP2 priority) |
| `vat` | SKUs where ERP1 **or** ERP2 Product Priority is `Vat` (case-insensitive). Variant filter is authoritative; do not require caller to also pass `itemStatusCategories: ["Vat"]`. |
| `non_vat` | SKUs where **neither** ERP1 nor ERP2 Product Priority is `Vat`. |

Other filters (`vendorIds`, `skuPrefix`, `includeInactive`, below-threshold / `maxStockPctOfRop`) still apply after membership.

### VAT ROP rules (`osfVariant === "vat"` only)

1. Emit ROP headers only for Cosmetics.lk column + shop columns (`includeInRop` + active).
2. Omit other company-wise ROP headers.
3. `Total ROP` = Cosmetics.lk ROP value only (not sum of shop ROPs).
4. Derived % / 70% / availability / threshold pre-filter use that Total ROP.
5. Stock columns: unchanged (all active `includeInStock`).

### Main / Non-VAT ROP rules

Unchanged: all active `includeInRop` columns; Total ROP = sum of those values.

### Success response

`200` workbook download:

| Header | Example |
|--------|---------|
| `Content-Type` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `Content-Disposition` | `attachment; filename="OSF-vat-2026-09-16.xlsx"` |
| `X-OSF-Row-Count` | row count |
| `X-OSF-Variant` | `main` \| `vat` \| `non_vat` |

**Filename matrix**:

| Variant | Full | Reorder (`belowThresholdOnly`) |
|---------|------|--------------------------------|
| main | `OSF-{date}.xlsx` | `OSF-reorder-{date}.xlsx` |
| vat | `OSF-vat-{date}.xlsx` | `OSF-reorder-vat-{date}.xlsx` |
| non_vat | `OSF-non-vat-{date}.xlsx` | `OSF-reorder-non-vat-{date}.xlsx` |

### Errors

Same as today: `400` validation, `401`/`403` auth, `409` Vault, `502` ERP.

Empty catalog after filters: existing empty-file / user-visible empty outcome (do not 500).

## UI contract — `OsfGeneratePanel`

1. Control to choose **Main OSF** | **VAT OSF** | **Non-VAT OSF** (default Main).
2. Generate / reorder buttons send `osfVariant` in POST body.
3. Busy/spinner + toast errors via `notify` (existing action-loading UX).
4. Optional ERP Product Priority dropdown remains for Main; when VAT / Non-VAT selected, membership comes from variant (UI may leave priority at All or hide it — prefer leave All / ignore for vat/non_vat).
5. Download uses server `Content-Disposition` filename so variant is visible in saved file name.

## ROP maintenance (no API change)

Existing product ROP edit + `/api/admin/osf/rop-template` + `/api/admin/osf/rop-import` already cover Cosmetics.lk and shop columns when those columns have `includeInRop`. No new endpoints for US3.
