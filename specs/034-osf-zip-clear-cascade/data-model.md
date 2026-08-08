# Data Model: OSF Zip Clear & Priority Cascade Filters

**Feature**: `034-osf-zip-clear-cascade` | **Date**: 2026-08-08

No new Prisma models or migrations. This feature reuses 031 entities and clarifies filter/clear state transitions.

## Entities (logical)

### Working order draft (browser)

| Field | Type | Notes |
|-------|------|-------|
| version | 1 | Existing |
| companyId | string | Scoped key |
| userId | string | Scoped key |
| updatedAt | ISO string | |
| rows | WorkingOrderRow[] | Cleared on successful generate or Clear table |

**Transitions**:
- `idle` → `populated` — user adds SKUs
- `populated` → `empty` — **Clear table** OR **successful Generate zip**
- Failed generate: stay `populated`

### Priority filter (UI + API)

| Value | Meaning |
|-------|---------|
| empty / All priorities | No priority restriction on brands or items |
| specific string | Exact match against ProductItem `erp1ProductPriority` **or** `erp2ProductPriority` |

Canonical option list: existing `ERP_PRODUCT_PRIORITY_OPTIONS` from page-data.

### Brand (Vendor)

| Field | Source |
|-------|--------|
| id | `Vendor.id` |
| name | `Vendor.name` |

**Priority-scoped set**: Vendors with ≥1 ProductItem where:
- `companyId` = current company
- `sku` is not null
- `status` ≠ `archived`
- priority match as above (when priority selected)

Null `vendorId` items do not contribute a brand to the dropdown.

### OSF searchable item

Unchanged from 031: SKU, description, vendorId, vendorName, reorderQty. Visibility requires matching active priority and optional brand.

## Validation rules

- Optional `priority` query on page-data: trimmed string, max length consistent with items query (80).
- Brand reset: if selected `vendorId` ∉ returned brands after priority change → clear to all brands.
- Generate clear: only after HTTP success + blob obtained; then `rows = []` and `clearDraft`.

## Relationships

```text
Company
  └── Vendor (brand)
        └── ProductItem (sku, erp1ProductPriority, erp2ProductPriority)
              └── appears in /items when filters match
              └── makes Vendor appear in priority-scoped brand list

Browser draft (localStorage)
  └── rows[] ──cleared──► successful generate | Clear table
```
