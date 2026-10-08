# Contract: Rider cash handover and invoice close

**Feature**: `064-rider-handover-invoice`  
**Auth**: `requirePermission` as named per route. OS `companyId` from the signed-in user. Cross-company ids return 404.  
**Dates**: `from` and `to` are `YYYY-MM-DD` Asia/Colombo calendar days. `to < from` → 400 `{ "error": "Invalid date range" }`.

`export const dynamic = "force-dynamic"`

Errors unless noted: `{ "error": string }`.

Zod on query and body. `riderId` and `orderId` use `cuidSchema`.

## GET `/api/admin/riders/handover/summary`

**Permission**: `riders.handover.summary`

### Query

| Param | Required | Rules |
|-------|----------|--------|
| `riderId` | yes | CUID. Rider in this OS company (`employeeProfile.isRider`) |
| `from` | yes | `YYYY-MM-DD` |
| `to` | yes | `YYYY-MM-DD` |

| Invalid | Status |
|---------|--------|
| Bad dates or missing rider | 400 |
| Rider not in company or not a rider | 404 |
| No permission | 403 |

### Response `200`

```json
{
  "riderId": "clx...",
  "riderName": "Sampath",
  "from": "2026-10-08",
  "to": "2026-10-08",
  "companies": [
    { "companyName": "Cosmetics", "cashAmount": "1500.00" }
  ],
  "fullTotal": "1500.00",
  "latestReceipt": null
}
```

`companies` is sorted by `companyName`. Omit a company whose cash is 0. `fullTotal` equals the sum of `cashAmount` within 0.01. `latestReceipt` is the newest `RiderFinanceCashReceipt` for this rider and exact `from`/`to`, or `null`:

```json
{
  "id": "clx...",
  "receivedAt": "2026-10-08T10:00:00.000Z",
  "receivedByName": "Nimali",
  "companies": [{ "companyName": "Cosmetics", "cashAmount": "1500.00" }],
  "fullTotal": "1500.00"
}
```

This response has no `orders` array and no order ids.

Cash rules: [data-model.md](../data-model.md). Card and bank amounts are absent.

## GET `/api/admin/riders/handover/orders`

**Permission**: `riders.handover.receive`

Same query as the summary. Summary permission alone → 403.

### Response `200`

```json
{
  "riderId": "clx...",
  "riderName": "Sampath",
  "from": "2026-10-08",
  "to": "2026-10-08",
  "orders": [
    {
      "orderId": "clx...",
      "orderNumber": "10421",
      "companyName": "Cosmetics",
      "cashAmount": "1500.00",
      "collectedAmount": "1500.00",
      "paymentMethod": "cod",
      "paymentGatewayPrimary": "Cash on Delivery (COD)",
      "invoiceClosed": false,
      "fulfillmentStage": "delivery_complete",
      "eligible": true,
      "blockReason": null,
      "modes": [
        { "key": "cash", "label": "Cash", "mopName": "Cash" },
        { "key": "bank_transfer", "label": "Bank transfer", "mopName": "Bank Transfer" },
        { "key": "card_delivery", "label": "Card on delivery", "mopName": "Card" }
      ],
      "selectedMop": "Cash"
    }
  ]
}
```

`orders` is every completed rider task in the range, including invoice-closed and zero-cash rows. `eligible` is false when invoice-closed, stage is not `delivery_complete`, finance approval blocks the order, or `modes` is empty. `blockReason` says why. `selectedMop` is the mapped order mode when it appears in `modes`, else `null`. `modes` come from that order’s ERP instance only.

## POST `/api/admin/riders/handover/receipts`

**Permission**: `riders.handover.receive`

### Body

```json
{
  "riderId": "clx...",
  "from": "2026-10-08",
  "to": "2026-10-08",
  "confirmDuplicate": false
}
```

`confirmDuplicate` optional, default false.

### Response `201`

The stored receipt (same shape as `latestReceipt` plus `riderId`, `from`, `to`). Totals are the summary computed in this request, not values from the client.

### Response `409`

When a receipt already exists for this company, rider, and exact dates, and `confirmDuplicate` is not true.

```json
{
  "error": "Cash was already marked received for this rider and period",
  "latestReceipt": { }
}
```

No row inserted.

## POST `/api/admin/riders/handover/invoice-complete`

**Permission**: `riders.handover.receive`  
`export const maxDuration = 300`

### Body

```json
{
  "riderId": "clx...",
  "from": "2026-10-08",
  "to": "2026-10-08",
  "modes": [
    { "orderId": "clx...", "modeOfPayment": "Bank Transfer" }
  ]
}
```

`modes` may be empty. Each `modeOfPayment` must be a `mopName` on that order’s instance. Unknown mode → that order fails; the request still runs the other eligible orders. Ids not in the rider/range set are ignored.

The server selects every eligible order in the range. It does not accept an include-list.

### Response `200`

```json
{
  "results": [
    {
      "orderId": "clx...",
      "ref": "10421",
      "success": true,
      "peStatus": "created"
    },
    {
      "orderId": "clx...",
      "ref": "10422",
      "success": false,
      "error": "No submitted Sales Invoice found for order \"10422\""
    }
  ]
}
```

`peStatus` is `created` or `already_paid` on success. Success means the order is invoice-closed and a payment entry exists or the invoice was already fully paid (no second entry). Failure means the order was not stamped invoice complete.

Already invoice-closed orders are omitted from `results` (not submitted again).

### Response `400`

Eligible count &gt; 80:

```json
{ "error": "Too many orders for one close. Shorten the date range." }
```

No order is stamped when this 400 is returned.

## Page

`/dashboard/riders/performance` stays on `riders.performance.read`.

The server page passes:

- `canHandoverSummary` — `riders.handover.summary`
- `canHandoverReceive` — `riders.handover.receive`
- rider roster `{ id, name, knownName }[]` from `fetchRiderRoster` when either flag is true

The handover panel uses the page from/to dates. Summary-only users see Generate and Print. They do not call the orders, receipts, or invoice-complete routes. Receive users see Mark money received, the order table, per-order mode selects, and **Mark invoices completed**.

Print shows only the slip (rider, dates, company lines, full total, Handover by + rider name + signature line, Cash collected + signature line).

## Incentive (existing routes, behavior change)

`GET /api/admin/riders/performance` and `GET /api/mobile/v1/me/performance`:

- `completedCount` / `totalCompletions` / rider-app `completedCount` and `todayCompletedCount`: delivery-complete tasks that are not void, cancelled, or refunded. Unchanged population.
- `incentiveTotal` / `totalIncentive` / rider-app `incentiveTotal` and `todayIncentiveTotal`: same population, amount added only when the order is invoice-closed.
- Per-line `incentiveAmount` is `0.00` until invoice-closed, then the existing rider charge.

No new mobile route. No request shape change.
