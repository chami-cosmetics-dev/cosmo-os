# Data Model: 025-order-search-rider-incentives

## Existing entities (reused)

### Order
- `orderNumber` String? — business-facing number (primary display when present)
- `name` String? — Shopify/ERP display name / SI reference
- `shopifyOrderId` String — hard fallback
- `totalShipping` Decimal? — source of rider incentive amount
- `totalPrice` Decimal — order total
- `financialStatus` — exclude voided from incentive aggregates
- `customerPhone`, address JSON — search fields
- Relations: `deliveryPayment`, `riderDeliveryTask`

### RiderDeliveryTask
- `riderId`, `orderId`, `status`, `completedAt`
- Completion (`status = completed` + `completedAt`) triggers incentive eligibility

### DeliveryPayment (extended)
Existing: `expectedAmount`, `collectedAmount`, `paymentMethod`, `collectionStatus`, `lines[]`, refs.

### DeliveryPaymentLine (existing)
Used for split methods; cash due for tender = sum of COD line amounts when lines exist, else full `collectedAmount` when method is COD.

## New / changed fields

### DeliveryPayment — cash tender

| Field | Type | Rules |
|-------|------|--------|
| `customerGaveAmount` | Decimal(12,2)? | Cash bills/coins handed by customer; required when cash is collected |
| `changeAmount` | Decimal(12,2)? | `customerGaveAmount − cashDue`; must be ≥ 0 at save |

**Validation**:
- If any COD/cash collection: `customerGaveAmount` required and ≥ `cashDue` (unless remaining due covered by other lines in a split — then ≥ cash line total).
- `changeAmount` stored for display consistency; server recomputes and rejects mismatch > 0.01.
- Non-cash-only payments (card/bank/already_paid with no COD): tender fields optional/null.

## Derived / aggregated (no required new table for v1)

### RiderPerformanceRow (API DTO)
- `riderId`, `riderName`
- `completedCount` — completed tasks in range (non-void orders)
- `incentiveTotal` — sum of `order.totalShipping` for those completions (null → 0)
- `dateFrom`, `dateTo`

### Order display label (helper)
- Prefer: `orderNumber` → else `name` → else `shopifyOrderId`
- Optional secondary: `name` when both `orderNumber` and `name` exist and differ

## State transitions

```text
Delivery payment (cash path):
  pending collection
    → rider enters methods + customerGaveAmount
    → server sets changeAmount
    → collected / partially_collected as today

Incentive eligibility:
  RiderDeliveryTask.completed + Order not voided
    → include totalShipping in rider aggregate for completedAt date
  Order voided / cancelled after complete
    → exclude from dashboard aggregates (recompute), or reverse ledger if ledger added later
```

## Migration notes

- Additive nullable columns on `DeliveryPayment` (safe deploy).
- Create via `npm run db:migrate:create`; apply with `npm run db:deploy:all`.
- No backfill required; historical rows show tender as empty until re-recorded (rare).
