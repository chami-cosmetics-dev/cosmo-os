# GET /api/admin/orders/[id] — replace-link enrichment

Extend existing Cosmo order detail GET (no new auth).

## Additions on `order` / detail payload

When present:

```json
{
  "replacedByOrder": {
    "id": "cuid",
    "orderLabel": "SI-0001",
    "name": "SI-0001",
    "orderNumber": null,
    "erpnextInvoiceId": "SI-0001"
  },
  "replacedFromOrders": [
    {
      "id": "cuid-cancelled",
      "orderLabel": "1001",
      "name": "#1001",
      "orderNumber": "1001",
      "cancelledAt": "2026-08-14T10:00:00.000Z"
    }
  ]
}
```

| Field | Rules |
|-------|--------|
| `replacedByOrder` | null if no outgoing link; else summary of target (may be null fields if target missing after SetNull — then omit or null) |
| `replacedFromOrders` | 0..n cancelled predecessors that point at this order; read-only |

## UI contract (Cosmo only)
- **Cancelled** detail: show editable “Replaced by order number” + save/clear; navigate to `replacedByOrder.id`.
- **Any** detail with `replacedFromOrders.length > 0`: show read-only “Supersedes cancelled order(s)” list with navigation.
- **Vault**: hide editable field; optional hide reverse section if always empty.
- Cancel confirmation / fulfillment `cancel_order` action: **no** replace field.
