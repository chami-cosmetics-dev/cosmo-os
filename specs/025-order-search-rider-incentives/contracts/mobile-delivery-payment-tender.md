# POST /api/mobile/v1/deliveries/{id}/payment (tender extension)

Extends existing rider payment payload with cash tender fields. Backward compatible for clients that omit them when no cash is collected.

## Auth
- Existing rider mobile session

## Body (additions)
| Field | Type | Rules |
|-------|------|--------|
| `customerGaveAmount` | number | required when cash/COD is part of collection; ≥ cash due |
| `changeAmount` | number | optional client hint; server recomputes and stores |

Existing `paymentMethod` / `collectedAmount` / `lines[]` unchanged.

## Server rules
1. Determine `cashDue` from COD lines sum, or full amount if single COD method.
2. If `cashDue > 0`: require `customerGaveAmount`; reject if `customerGaveAmount + 0.001 < cashDue`.
3. Persist `changeAmount = round(customerGaveAmount − cashDue, 2)`.
4. Response `payment` includes `customerGaveAmount`, `changeAmount`.

## Response `payment` fragment
```json
{
  "id": "cuid",
  "collectedAmount": "3500.00",
  "customerGaveAmount": "5000.00",
  "changeAmount": "1500.00",
  "paymentMethod": "cod",
  "lines": []
}
```
