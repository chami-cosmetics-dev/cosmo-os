# Data Model: OSF Supplier Orders

**Feature**: `031-osf-supplier-orders` | **Date**: 2026-08-04

No new Prisma models. Entities below are API/UI domain objects (and browser draft JSON).

## Entities

### OSF searchable item

| Field | Type | Notes |
|-------|------|--------|
| sku | string | Product / variant SKU identity used in OSF |
| description | string | Display title |
| vendorId | string (cuid) | Brand = Vendor |
| vendorName | string | Brand label |
| reorderQty | number | TOTAL ORDER QTY at fetch/add time; ≥ 0 |
| erpPriority | string \| null | Matched ERP priority for filter display (optional) |

**Relationships**: Belongs to Vendor; stock/ROP inputs are ephemeral compute inputs, not stored on the draft beyond `reorderQty`.

### Working order row (draft)

| Field | Type | Notes |
|-------|------|--------|
| sku | string | Unique key in draft (no duplicate rows) |
| description | string | Snapshot at add |
| reorderQty | number | Read-only snapshot; not user-editable |
| allocations | SupplierAllocation[] | Zero or more |

### Supplier allocation

| Field | Type | Notes |
|-------|------|--------|
| supplierId | string | Cosmo `Supplier.id` when known |
| supplierName | string | Display + Excel filename safety |
| qty | number | ≥ 0; ≤ 0 treated as empty/skipped |

### Supplier option (picker)

| Field | Type | Notes |
|-------|------|--------|
| supplierId | string | |
| supplierName | string | |
| lastPurchaseAt | string (ISO) \| null | For this SKU when history exists |
| sortGroup | `"sku_recent"` \| `"other"` | UI ordering hint |

### Supplier order file (export line)

| Field | Type | Notes |
|-------|------|--------|
| sku | string | |
| description | string | |
| orderQty | number | That supplier’s allocation only (&gt; 0) |

### Draft document (localStorage)

| Field | Type | Notes |
|-------|------|--------|
| version | 1 | Schema version |
| companyId | string | Scope |
| userId | string | Scope |
| updatedAt | string (ISO) | |
| rows | WorkingOrderRow[] | |

## Validation rules

1. **Unique SKU** in draft — selecting an existing SKU does not add a second row.
2. **reorderQty** immutable in UI after add.
3. **Allocation qty** non-negative numbers.
4. **Over-allocation**: if `reorderQty > 0`, sum of allocation qtys with `qty > 0` must be ≤ `reorderQty`.
5. **Generate**: at least one allocation with `qty > 0` across the draft; skip empty suppliers; one Excel per supplier with any positive lines; wrap in one zip.
6. **Filters**: optional `vendorId`; optional ERP priority exact match; `q` optional substring on SKU/description (case-insensitive).

## State transitions

```text
[Empty draft]
    → add SKU → [Draft with rows]
    → allocate / edit qty → [Draft allocated]
    → remove row / clear → [Empty or reduced draft]
    → generate (valid) → [Files downloaded; draft unchanged unless user clears]
    → generate (invalid) → [Error; draft unchanged]
```

Persistence: any mutation writes localStorage; load on panel mount.

## Existing DB entities reused (read-only)

- `ProductItem` (+ vendor, barcode/title fields as needed)
- `Vendor`
- `Supplier` (allowlist)
- OSF ROP / column warehouse mappings already used by generate
- ERP stock & purchase receipts (external; not Prisma)
