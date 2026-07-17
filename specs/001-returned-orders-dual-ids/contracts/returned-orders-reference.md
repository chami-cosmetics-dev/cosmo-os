# Contract: Returned Orders Dual ID + Waybill Single ID

**Feature**: `001-returned-orders-dual-ids`

## 1. Dual reference (returned orders only)

Use `formatInvoiceOrderReference` (or equivalent) to obtain `shopifyRef`, `erpRef`, `showBoth`.

| UI | Behavior |
|----|----------|
| List invoice column | If `showBoth`: Shopify on top, ERP below (smaller). Else: single ref |
| Return Action summary | Same dual rules |
| Search / export filter | Match `invoiceNo`, Shopify ref fields, ERP SI fields |

## 2. Source-primary (waybill)

`resolveSourcePrimaryOrderRef(order): string`

| Origin | Result |
|--------|--------|
| `erpnext` / `erpnext-pos` | Non-placeholder ERP SI (with existing fallbacks) |
| Otherwise | Shopify order number |
| Never | `"A / B"` dual join or stacked dual UI |

Waybill create/print/view MUST use this single string.

## 3. Non-interference

- Changing returned-orders dual UI MUST NOT reintroduce dual IDs on waybill.
- Changing waybill to single ID MUST NOT remove dual display from returned orders.
