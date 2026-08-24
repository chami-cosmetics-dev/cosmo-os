# Data Model: Store Stock Count

**Feature**: `044-stores-stock-count` | **Date**: 2026-08-24

No new Prisma models. Domain objects are API payloads + client session state.

## Entities

### Selectable ERP company

| Field | Type | Notes |
|-------|------|--------|
| instanceId | string | `ErpnextInstance.id` (CUID) |
| instanceLabel | string | Instance label for disambiguation |
| erpCompany | string | ERP Company `name` |

### Count item (one row per SKU)

| Field | Type | Notes |
|-------|------|--------|
| sku | string | ERP `item_code`; merge key is case-insensitive trim, display preserves first-seen casing |
| name | string | ERP `item_name` |
| description | string | ERP `description` (may be empty) |
| barcodes | string[] | Unique, trimmed; Item.barcode ∪ Item Barcode children |
| stockByCompany | Record\<companyKey, number \| null\> | `null` = unavailable for that company this load |
| count | number \| null | **Client only.** `null` = not counted; `0` = counted none |
| difference | number \| null | Derived; not stored |

`companyKey` = `${instanceId}::${erpCompany}` (display uses name + instanceLabel; identity is the pair).

### Live stock (per SKU per ERP company)

Sum of ERP `Bin.actual_qty` for non-group warehouses of that company. No bin row → `0`. Fetch error → `null`.

### Count session (client)

| Field | Type | Notes |
|-------|------|--------|
| selected | Selectable ERP company[] | Confirmed set currently loaded / loading |
| items | Count item[] | Union of loaded companies |
| counts | Map skuKey → number \| null | Survives stock refresh |
| highlightedSku | string \| null | Last unique scan |
| loadingCompany | identity \| null | Progress |
| companyErrors | { identity, message }[] | Failed company loads |

## Validation rules

1. At least one company to load items; POST items is **one** company per request.
2. `instanceId` is a CUID the user may access (must belong to their OS `companyId`’s instances).
3. `erpCompany` trimmed, length-capped; must exist on that instance’s Company list (reject unknown names — do not invent).
4. Count input: integer ≥ 0; reject non-numeric / negative / fraction; keep previous valid value.
5. Scan increment: +1 only on **unique** barcode match among **currently loaded** items.
6. Difference: see [research R8](./research.md).
7. Disabled / non-stock ERP items are not listed.
8. Do not persist counts server-side.

## State transitions (session)

```text
[No companies]
  → select companies → confirm load
  → POST items per company (sequential)
  → items on screen, all counts null
  → scan/type barcode → unique match → count 0|n → n+1, highlight
  → type count → set absolute n (or null if cleared)
  → refresh → POST items again per company → replace stockByCompany, keep counts
  → change companies + confirm → drop counts, reload
  → clear counts → all counts null
  → leave page → session gone
```

## Existing sources (read-only)

- `ErpnextInstance` (base URL, API key/secret, label)
- ERPNext: Company, Item, Item Barcode, Warehouse, Bin
- `Permission` / `RolePermission` seed for `store.stock_count.read`

Not used as stock source: Shopify `ProductItem.inventoryQuantity`, Cosmetics stock-comparer files.
