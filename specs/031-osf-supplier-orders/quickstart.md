# Quickstart: OSF Supplier Orders

**Feature**: `031-osf-supplier-orders`  
**Contracts**: [contracts/osf-supplier-orders.md](./contracts/osf-supplier-orders.md)  
**Data model**: [data-model.md](./data-model.md)

## Prerequisites

- Cosmo OS local app running (`npm run dev`)
- User with OSF / purchasing permission (same as OSF generate)
- Catalog with vendors (brands), ERP priorities populated, ROPs + warehouses configured so TOTAL ORDER QTY can be non-zero for at least one SKU
- Cosmo `Supplier` allowlist configured; ERP purchase history preferred for “recent” sort demos

## Setup

```bash
npm run dev
```

Open `/dashboard/purchasing/osf` and locate the **Supplier Orders** (or equivalent) section on the hub.

## Validation scenarios

### 1. Optional brand + empty search list

1. Leave brand on **All brands**; optionally set priority (e.g. Top Priority).
2. Open item search without typing.
3. **Expect**: List of SKUs with descriptions (paginated if large).
4. Choose a brand; reopen/refresh search.
5. **Expect**: Only that brand’s items; working table (if any) unchanged.

### 2. Typeahead filter + add to table

1. Type part of a SKU or description.
2. **Expect**: List narrows to matches.
3. Select an item.
4. **Expect**: Table row with SKU, description, **read-only** reorder qty (TOTAL ORDER QTY).
5. Select the same SKU again.
6. **Expect**: No duplicate row.

### 3. Filter change keeps table

1. Add item under brand A.
2. Switch to brand B; add another item.
3. **Expect**: Both rows remain.

### 4. Multi-supplier allocation (partial)

1. On a row with reorder qty 20, allocate Sup1=5, Sup2=10; leave others empty.
2. **Expect**: UI allows save; no error for under-allocation.
3. Set allocations summing to 25 (&gt; 20).
4. Click Generate.
5. **Expect**: Blocked with clear over-allocation message.

### 5. Generate zip

1. With valid partial allocations for two suppliers, click Generate.
2. **Expect**: One `.zip` download.
3. Open zip — two Excel files named by supplier.
4. Each file columns: SKU, Description, Order Qty — quantities match allocations only (empty suppliers absent).

### 6. Browser persistence

1. Build a draft with ≥1 row and allocations.
2. Refresh the page; return to OSF hub.
3. **Expect**: Table and allocations restored.
4. Click Clear.
5. **Expect**: Table empty; refresh stays empty.

### 7. API smoke (optional)

```bash
# After login cookie/session available in browser; use UI Network tab or authenticated curl
# GET /api/admin/osf/supplier-orders/page-data
# GET /api/admin/osf/supplier-orders/items?page=1&pageSize=50
# GET /api/admin/osf/supplier-orders/suppliers?sku=YOUR_SKU
# POST /api/admin/osf/supplier-orders/generate  (body per contract)
```

## Automated checks (after implementation)

```bash
npm test -- lib/osf/supplier-orders
```

Expect unit coverage for allocation validation and zip/export helpers.

## Done when

- All scenarios 1–6 pass manually
- Unit tests green for allocate/export helpers
- No Prisma migration introduced for this feature
