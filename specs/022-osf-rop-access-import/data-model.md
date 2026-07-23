# Data Model: OSF Full Column Access, Shop ROPs & ROP Import

## Entities

### OsfUserColumnAccess (evolve)

Per Cosmo user, company-scoped marks for assignable OSF Excel columns.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | FK company |
| userId | string | FK user |
| columnKeys | string[] | Stable access ids from catalog (replaces `columnGroups`) |
| createdAt | datetime | |
| updatedAt | datetime | |

**Uniqueness**: `(companyId, userId)` unique.

**Validation**:

- `userId` / `companyId` valid CUIDs; user in same company.
- Each `columnKeys` entry MUST be a known catalog id at save time (or unknown ids ignored on resolve — prefer reject unknown on PUT).
- Identity columns are never stored (always implied).

**Migration**:

1. Add `columnKeys String[] @default([])`.
2. Backfill from `columnGroups` using fixed map: `pricing`/`cost`/`margins`/`sales` → their static header ids.
3. Drop `columnGroups`.

**Lifecycle**: Unchanged — PUT from Access UI; cascade with User/Company.

### Column access catalog (code + runtime, not a DB table)

Built from:

- Static Main headers outside `identityHeaders()`
- Active `OsfColumnConfig` rows → `stock:{key}`, `rop:{key}`, `order:{key}` when that column participates in stock / ROP / order emission

See [research.md](./research.md) R1.

### OsfColumnConfig (existing)

Shop columns for Cosmetics.lk use `directWarehouses` + `erpnextInstanceId`, `companyLocationId` null.

| Field of interest | Behavior |
|-------------------|----------|
| key | Stable id fragment for access keys + `ProductOsfRop.columnKey` |
| label | Excel / Access / template header display |
| includeInStock | Emits stock column when active |
| includeInRop | Emits ROP column + appears in product editor + ROP template |
| active | Must be true to appear |

**Shop ROP enablement**: Cosmetics.lk shop rows SHOULD have `includeInRop: true` when shops are in scope for this feature (update seed + existing rows as needed).

### ProductOsfRop (existing — unchanged shape)

| Field | Type | Notes |
|-------|------|--------|
| companyId | string | |
| sku | string | Catalog SKU |
| columnKey | string | `OsfColumnConfig.key` (location or shop) |
| ropQty | int | ≥ 0 |

Bulk import upserts by `(companyId, sku, columnKey)`.

### ProductOsfProfile / ProductItem (read for template)

Template rows: all SKUs in OSF generate scope (same catalog basis as OSF generate). Barcode from product item / variant barcode source already used on OSF.

### Permissions (existing)

| Key | Purpose |
|-----|---------|
| `purchasing.osf.permission` | Access assignment UI; full columns on own download |
| `purchasing.osf.manage` | ROP edit, columns settings, ROP template/import; full columns on download |
| `purchasing.osf.read` | Full OSF generate (columns filtered by marks unless manage/permission) |
| `purchasing.tools.read` | Reorder-only generate (same column filter) |

## Effective column resolution (derived)

```text
if has(manage) OR has(osf.permission):
  → all catalog keys (+ identity)
else:
  → identity ∪ OsfUserColumnAccess.columnKeys  (or identity only if no row)
```

Unknown stored keys ignored at generate time (fail closed for those ids).

## TOTAL ORDER QTY (derived)

```text
signedSum = Σ finite per-column ORDER QTY values (include negatives)
TOTAL ORDER QTY = max(0, signedSum)
```

Common SKU Reorder aggregates use the same floor-at-zero rule on their signed constituents / per-variant TOTALs as specified in research R5.

## Relationships

```text
Company 1──* OsfUserColumnAccess *──1 User
Company 1──* OsfColumnConfig
Company 1──* ProductOsfRop   (sku + columnKey → OsfColumnConfig.key)
```
