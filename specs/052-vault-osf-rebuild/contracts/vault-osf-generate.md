# Contract: Vault OSF Generate

**Feature**: `052-vault-osf-rebuild`
**Date**: 2026-09-09

The Cosmo generator `POST /api/admin/osf/generate` is unchanged. Vault uses a
separate route so Cosmo workbook bytes cannot regress (SC-007).

## Auth

| Permission | Capability |
|------------|------------|
| `purchasing.osf.read` | Generate Vault OSF |
| `purchasing.osf.manage` | Generate; also ROP template/import (existing routes) |

Admins / super_admin inherit both via existing RBAC.

Company scope is always `context.user.companyId`. The Vault layout is selected
when the company has at least one `OsfColumnConfig` with `erpCompany` set. If
none are set, this route returns `409` rather than emitting a Cosmo-shaped
file.

---

## `POST /api/admin/osf/vault/generate`

**Auth**: `purchasing.osf.read`

**Body** (JSON, Zod):

```json
{
  "asOfDate": "2026-09-07"
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `asOfDate` | no | `YYYY-MM-DD`. Default: today in Asia/Colombo |

Unlike the Cosmo generator there is no `salesMonth` — the reporting window is
always 1 April of the reporting year through `asOfDate`. Cosmo-only filters
(`belowThresholdOnly`, `maxStockPctOfRop`, `vendorIds`, `itemStatusCategories`,
`includeInactive`) are not accepted.

**Success `200`**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Disposition: `attachment; filename="OSF-vault-{asOfDate}.xlsx"`
- Header `X-OSF-Row-Count`: integer catalog row count
- Header `X-OSF-Sales-From`: `YYYY-MM-DD` (always `{year}-04-01`)
- Header `X-OSF-Sales-To`: `asOfDate`

Workbook layout is defined in [vault-osf-workbook.md](./vault-osf-workbook.md).

**Errors**

| Status | Code | When |
|--------|------|------|
| `400` | — | Invalid `asOfDate` |
| `401` / `403` | — | Auth / permission |
| `404` | — | No `companyId` on the user |
| `409` | `VAULT_OSF_NOT_CONFIGURED` | No active columns with `erpCompany` |
| `502` | `ERP_UNAVAILABLE` | Either ERP unreachable, or ERP credentials missing. Body `detail` names the instance / business unit. Never emit zeros for the missing side. |
| `500` | — | Unexpected failure |

**502 body**

```json
{
  "error": "ERP unreachable",
  "code": "ERP_UNAVAILABLE",
  "detail": "ERP2 (Origins / AE) GET /api/resource/Bin [502]: ..."
}
```

---

## Generation pipeline (server)

1. Resolve three `VaultBusinessUnit`s from `OsfColumnConfig` (`sv`, `ori`, `ae`).
2. Load ERP1 enabled stock items → `VaultCatalogRow[]`. Join `ProductItem` on SKU
   for Priority Status only.
3. Parallel ERP reads (fail the whole request on any `OsfErpError`):
   - Bin `actual_qty` for each unit's warehouses
   - Sales Invoice lines, one month × company at a time, `docstatus = 1`
   - Purchase Invoice lines, same partition, allowlisted suppliers only
   - ERP1 `Item Price` (Standard Selling) + item-code `Pricing Rule`s valid on
     `asOfDate`
4. Overlay `OsfMonthlySalesHistory` onto months that still have no ERP cell.
5. Overlay `ProductOsfRop` (blank if unset).
6. Compute derived columns (max sale, AVE, reorder qty).
7. Write the workbook.

---

## UI contract

Vault OSF panel on `/dashboard/purchasing/osf` (same page, additional panel;
Cosmo generate panel stays for Cosmo tenants):

- As-of date picker (default today Colombo)
- **Generate OSF** button with busy spinner + "Generating..."
- Disable other panel actions while busy
- Success: browser download of the xlsx
- Failure: `notify.error` with the ERP-unavailable detail when present

Do not offer Cosmo-only controls (sales month, below-threshold filter, OGF
sync) on this panel.
