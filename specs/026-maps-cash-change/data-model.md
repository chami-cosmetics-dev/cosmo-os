# Data Model: 026-maps-cash-change

## Delivery destination (mobile, derived — no new table)

Built from order shipping/billing address JSON already on the delivery DTO.

| Attribute | Source | Rules |
|-----------|--------|--------|
| Address text | `getAddressText(shipping/billing)` | Empty / `"No address"` → cannot open maps |
| Optional lat/lng | Not required for v1 | If later available, may prefer `geo:lat,lng` |

**Behaviors** (not persisted):
- Open maps attempts (geo / https)
- Clipboard copy of address text on fallback

## Delivery payment tender (reuse 025)

### DeliveryPayment (existing / on main)

| Field | Type | Rules |
|-------|------|--------|
| `collectedAmount` | Decimal(12,2) | Amount due / collected for reconciliation & ERP — **unchanged meaning** |
| `customerGaveAmount` | Decimal(12,2)? | Cash handed by customer; required when cashDue &gt; 0 |
| `changeAmount` | Decimal(12,2)? | `customerGaveAmount − cashDue`; ≥ 0; server authoritative |
| `paymentMethod` / `lines[]` | existing | Split: cashDue = sum of COD line amounts |

### Validation rules

1. `cashDue` = sum of COD/`cod` line amounts when lines present; else full `collectedAmount` when method is COD.
2. If `cashDue > 0`: `customerGaveAmount` required and `customerGaveAmount ≥ cashDue` (ε 0.001).
3. Persist `changeAmount = round(customerGaveAmount − cashDue, 2)`.
4. Non-cash-only collections: tender fields optional/null; UI may hide customer-gave.

### State

No new status machine. Tender is set when payment is submitted with the delivery payment create/update flow.

## Relationships

- `Order` 1—1 `DeliveryPayment` (existing)
- Rider app payment form drafts tender client-side → POST payment → stored on `DeliveryPayment`
- Cosmo OS order/fulfillment detail reads tender for display

## Out of scope for this feature’s schema

- New maps preference tables
- Incentive / shipping fields (025)
- Changing ERP PE amounts based on customer gave (PE stays on collected/cash lines)
