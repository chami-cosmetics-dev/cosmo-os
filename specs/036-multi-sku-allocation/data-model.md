# Data Model: Multi-SKU Location Allocation

**Feature**: 036-multi-sku-allocation  
**Date**: 2026-08-10

No new Prisma models. Session entities are **client-side** (and request/response DTOs).

## Entities

### AllocationSession (client)

| Field | Type | Notes |
|-------|------|--------|
| items | SessionItem[] | Ordered; max 50; unique by sku |
| walkthroughIndex | number \| null | Index into non-empty location steps; null when closed |
| activeSku | string \| null | Optional highlight after duplicate scan |

### SessionItem

| Field | Type | Notes |
|-------|------|--------|
| sku | string | Canonical identity |
| barcode | string \| null | Display |
| description | string | |
| priorityErp1 / priorityErp2 | string \| null | As lookup returns |
| companyReorderQty | number | OSF TOTAL ORDER QTY |
| takeQty | number \| null | Starts null/0; user-entered whole number |
| locations | SessionLocationQty[] | Empty until plan loaded for takeQty &gt; 0 |
| shortShipment | boolean | takeQty &lt; companyReorderQty |
| erpAvailable | boolean | From plan response |
| planStatus | `idle` \| `loading` \| `ready` \| `error` | Per-item plan fetch |

### SessionLocationQty

| Field | Type | Notes |
|-------|------|--------|
| columnKey | string | OSF column key |
| label | string | Location display name |
| locationRop | number | |
| stock | number | |
| need | number | max(0, rop − stock) |
| sales90d | number | |
| suggestedQty | number | From allocate |
| qty | number | Editable; defaults to suggestedQty |

### WalkthroughStep (derived)

| Field | Type | Notes |
|-------|------|--------|
| columnKey | string | |
| label | string | |
| lines | { sku, description, qty }[] | Items with takeQty &gt; 0; qty for this columnKey |
| index / total | number | Position among **non-empty** steps only |

**Derivation rule**: A location is included iff Σ qty for that columnKey across included items &gt; 0 (or at least one line qty &gt; 0). Order = stable OSF active `includeInRop` column order from first successful plan (shared column set).

## Relationships

```text
AllocationSession 1—* SessionItem
SessionItem 1—* SessionLocationQty
WalkthroughStep *— derived from —* SessionItem.locations
```

## Validation rules

- Session length ≤ 50.
- Duplicate sku rejected (focus existing).
- takeQty: integer ≥ 0; blank/0 → no plan / omitted from walkthrough & export.
- For each item with takeQty &gt; 0: Σ locations.qty === takeQty before export.
- Location qty: integer ≥ 0.
- Export body: only items with takeQty &gt; 0 and valid sums.

## State transitions

```text
[empty session]
  → add item (lookup) → SessionItem(takeQty=0, planStatus=idle)
  → set takeQty>0 → planStatus=loading → ready|error
  → open walkthrough → walkthroughIndex=0..n-1 (non-empty steps)
  → edit qty on step → update SessionItem.locations[columnKey].qty
  → export when all exportable items valid
  → remove item → drop from list + rebuild walkthrough sequence
```

## Persistence

None beyond browser memory for the page session. Refresh clears the list (acceptable per Assumptions).
