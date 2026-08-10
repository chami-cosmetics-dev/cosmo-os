# Quickstart: OSF Zip Clear & Priority Cascade Filters

**Feature**: `034-osf-zip-clear-cascade`  
**Contracts**: [contracts/osf-supplier-orders-cascade.md](./contracts/osf-supplier-orders-cascade.md)  
**Data model**: [data-model.md](./data-model.md)  
**Parent feature**: [031-osf-supplier-orders](../031-osf-supplier-orders/quickstart.md)

## Prerequisites

- Cosmo OS local app running (`npm run dev`)
- User with OSF / purchasing permission (same as Supplier Orders)
- Catalog with multiple brands and ERP priorities populated so at least one priority covers a **subset** of brands
- At least one SKU with non-zero TOTAL ORDER QTY and allowlisted suppliers for a successful generate

## Setup

```bash
npm run dev
```

Open `/dashboard/purchasing/osf` → **Supplier orders**.

## Validation scenarios

### 1. Priority cascades brand list

1. Set Brand to **All brands**; note approximate brand count.
2. Select a specific priority (e.g. Top Priority).
3. Open Brand dropdown.
4. **Expect**: Fewer or equal brands vs All priorities; every listed brand has ≥1 item under that priority (spot-check by selecting a brand and opening search).
5. Switch back to **All priorities**.
6. **Expect**: Full brand list restored.

### 2. Invalid brand resets

1. Select priority A and brand B that exists under A.
2. Change to priority C where brand B has no matching items (if available in data).
3. **Expect**: Brand control resets to **All brands**.
4. If brand B also exists under C, **Expect**: brand B stays selected.

### 3. Products follow priority (+ brand)

1. Select a specific priority; Brand = All.
2. Open item search with empty query.
3. **Expect**: Only SKUs for that priority.
4. Select a brand from the cascaded list; reopen search.
5. **Expect**: Intersection of priority and brand.
6. With rows already in the table, change priority/brand.
7. **Expect**: Table rows remain; search list updates.

### 4. Clear after successful Generate zip

1. Add ≥1 row; allocate valid supplier qty; click **Generate zip**.
2. **Expect**: Zip downloads; success toast; **working table is empty**.
3. Refresh the page.
4. **Expect**: Table still empty (draft not restored).

### 5. Failed generate keeps table

1. Build a table with over-allocation (or force generate error if possible).
2. Click Generate.
3. **Expect**: Error feedback; rows and allocations still present.

### 6. Manual Clear table still works

1. Add rows without generating.
2. Click **Clear table**.
3. **Expect**: Table empty; refresh stays empty.

## API smoke (optional)

```bash
# All brands
curl -s "http://localhost:3000/api/admin/osf/supplier-orders/page-data" -H "Cookie: …"

# Priority-scoped brands
curl -s "http://localhost:3000/api/admin/osf/supplier-orders/page-data?priority=Top%20Priority" -H "Cookie: …"
```

Compare `brands` lengths; scoped list should be ⊆ full list.

## Done when

- [ ] Scenarios 1–6 pass
- [ ] No regression to multi-supplier zip contents (031 generate behavior)
