# Data Model: VAT OSF Column Access & Shop Columns

**Feature**: `058-vat-osf-column-access` | **Date**: 2026-09-21

## Entities

### OsfUserColumnAccess (extend)

Per Cosmo user, per company, **per OSF variant** — which non-core Excel access keys they may receive on download.

| Field | Type | Notes |
|-------|------|--------|
| id | string (cuid) | PK |
| companyId | string | FK Company |
| userId | string | FK User |
| osfVariant | string enum | `main` \| `vat` \| `non_vat` — **new** |
| columnKeys | string[] | Access catalog ids (`Cosmetics MRP`, `stock:…`, `rop:…`, `order:…`) |
| createdAt / updatedAt | datetime | |

**Uniqueness**: `@@unique([companyId, userId, osfVariant])` (replaces `companyId_userId`).

**Migration**:
1. Add `osfVariant` nullable temporarily or with default `'main'`.
2. Backfill all existing rows → `main`.
3. Drop old unique; add new unique.
4. No rows created for `vat` / `non_vat` → effective marks empty until assigner saves.

**Validation**:
- `columnKeys` ⊆ variant-filtered catalog for that company.
- Unknown keys rejected on PUT; sanitize drops stale keys on GET.
- User must be purchasing-eligible (existing rule).

### OsfColumnConfig (reuse; shop auto-create)

No schema change. Auto-created Cosmetics shops:

| Field | Value for new shop |
|-------|-------------------|
| key | `cosmo_shop_<slug>` stable from warehouse name |
| label | Human shop label (e.g. “GCC Shop”) |
| companyLocationId | `null` |
| erpnextInstanceId | Cosmetics.lk location’s instance |
| directWarehouses | `[exact ERP warehouse name]` |
| includeInStock | `true` |
| includeInRop | `true` |
| active | `true` until warehouse out of scope |
| sortOrder | after existing Cosmetics shop columns |

**Identity**: Prefer match by `directWarehouses` containing the ERP warehouse name (or key if already present) to avoid duplicates on rename when identity is stable; on rename update `label` / warehouse list without orphaning `ProductOsfRop` keyed by `columnKey`.

### ProductOsfRop (reuse)

Unchanged. New shop column keys participate when `includeInRop` is true. Deactivated columns leave historical ROP rows; they simply stop appearing on generate.

### OsfVariant (logical)

Already in code: `main` | `vat` | `non_vat`. Display names:

| Code | Product label |
|------|----------------|
| main | Main OSF |
| vat | VAT Items OSF |
| non_vat | Others (Non-VAT) OSF |

## Relationships

```text
Company 1──N OsfUserColumnAccess (per user × variant)
User    1──N OsfUserColumnAccess
Company 1──N OsfColumnConfig
OsfColumnConfig.key ── ProductOsfRop.columnKey (logical)
ERP1 Warehouse (Cosmetics) ──(sync)──→ OsfColumnConfig shop row
```

## State transitions — shop column

| Event | Column state |
|-------|----------------|
| Qualifying warehouse appears | Upsert active; stock+ROP on |
| Warehouse disabled / fails shop-name rules | `active = false` |
| Warehouse renamed (same identity) | Update label/warehouses; keep key if possible |
| Reactivated | `active = true` again |

## Access resolution (runtime)

```text
if manage OR permission → effective = "all" (within variant workbook column set)
else load OsfUserColumnAccess for (company, user, variant)
  → intersection(columnKeys, variantCatalog)
  → plus always-on identity headers
```

VAT Items workbook column set = static non-location columns + Cosmetics.lk + shop location columns only.
