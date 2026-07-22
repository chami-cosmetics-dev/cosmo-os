# Contract: Sticker Quantity Print Behavior

## Scope

UI contract for Sticker Print (`/dashboard/sticker-print`) when loading a batch from `GET /api/admin/sticker-batches/[id]`. No new endpoints.

## Existing API (unchanged)

### `GET /api/admin/sticker-batches/[id]`

Auth: sticker print/batch read permissions as today.

Response items already include:

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Line id |
| `itemCode`, `itemName`, … | … | Label fields |
| `quantity` | number (positive int) | Labels to print for this line |

Consumers MUST use `quantity` for print expansion and for per-item / total counts. MUST NOT assume one printed label per array element.

## Screen preview contract

| Rule | Expected |
|------|----------|
| Cards rendered | Exactly one sticker preview per `items[]` element |
| Per-item quantity | Visible numeric Quantity for each line (screen only) |
| Total sticker count | `sum(items.map(i => i.quantity))` |
| Must not | Render `quantity` duplicate preview cards on screen |

## Print contract

| Rule | Expected |
|------|----------|
| Labels produced | For each item, `quantity` identical sticker labels |
| Label content | Same fields as today’s single sticker for that item (Cosmo or Vault layout) |
| Quantity badge | Must not appear on printed sticker faces |
| Mixed batch | Independent expansion per line; total labels = sum of quantities |
| Quantity 1 | Exactly one printed label |

## Derived helpers (implementation contract)

```text
expandItemsByQuantity(items) → flat list length === sum(quantity)
totalStickerCount(items) → number === sum(quantity)
```

Invalid/zero quantity: treat as implementation safety (prefer skip or clamp to ≥1 consistent with saved data; normal path is API-validated positive ints).
