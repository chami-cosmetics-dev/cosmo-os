# GET /api/admin/orders/quick-search

Quick order lookup for Cosmo OS dashboard home.

## Auth
- `requirePermission("orders.read")` (or equivalent any-of with dashboard + orders read)
- Scoped to caller’s `companyId`

## Query
| Param | Type | Rules |
|-------|------|--------|
| `q` | string | trimmed; min length 2; max 120 |
| `limit` | number | optional; default 20; max 50 |

## Behavior
Search company orders where any of:
- `orderNumber` contains / endsWith `q` (existing orders-page style)
- `name` contains / endsWith `q`
- `customerPhone` / address phone variants match
- customer name derived from shipping/billing address contains `q` (case-insensitive)

## Response `200`
```json
{
  "orders": [
    {
      "id": "cuid",
      "orderNumber": "1234",
      "name": "#1234",
      "orderLabel": "1234",
      "customerName": "A. Perera",
      "customerPhone": "07xxxxxxxx",
      "fulfillmentStage": "dispatched",
      "totalPrice": "3500.00",
      "currency": "LKR"
    }
  ]
}
```

## Errors
- `400` invalid / too-short `q`
- `401` / `403` auth
