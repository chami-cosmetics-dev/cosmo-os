# Data Model: Purchasing Calculator Stacked Layout

No persistence or Prisma entities. This feature only reorders UI and adjusts client selection lifecycle.

## UI state (client)

| Field | Type | Notes |
|-------|------|--------|
| `q` | string | Search query |
| `items` | `PricingItem[]` | Search results shown in the top list |
| `selected` | `PricingItem \| null` | Active SKU for the detail panel; **cleared on new search** |
| `sellingPrice` / `marginPercent` / `newSupplierPrice` | string | Margin/quote inputs; reset when selection clears |
| `suppliers` / `suppliersLoading` / `suppliersError` | existing | Cleared/reset when selection clears or new SKU selected |
| `loading` | boolean | Search in flight |

## Entities (unchanged shapes)

### Search result list item (`PricingItem`)

Unchanged from existing calculator: `sku`, `productTitle`, `brand`, `latestCost`, `latestSupplier`, `mrp`, `discountedPrice`, etc.

### SKU detail panel

Same content blocks as today, rendered full-width under the list:

- Identity (SKU, title, brand)
- Purchase / cost
- Original / discounted price note
- Supplier compare
- Margin inputs + quote compare

## State transitions

```text
[idle]
  → user types / Search
  → clear selected (+ related detail state)
  → items updated
  → [results, no selection]

[results, no selection]
  → click row
  → selected set, load suppliers
  → [results + detail]

[results + detail]
  → click other row → update selected / suppliers
  → new search → clear selected → [results, no selection]
```

## Validation rules

- Search min length and debounce unchanged.
- No new server validation.
