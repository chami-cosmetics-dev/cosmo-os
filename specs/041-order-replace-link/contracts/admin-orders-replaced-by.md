# PATCH /api/admin/orders/[id]/replaced-by

Set or clear the cancel→replace link on a **cancelled** Cosmo OS order.

## Auth
- `requirePermission("orders.cancel")` (or equivalent cancel-capable permission already used for order cancel)
- Company-scoped: order `id` must belong to caller `companyId`
- **Cosmo OS only**: if `isVaultOsDeployment()`, respond `403` with clear message (Vault out of scope)

## Path
| Param | Type | Rules |
|-------|------|--------|
| `id` | string | `cuidSchema` — cancelled order id |

## Body
```json
{
  "replacedByOrderNumber": "#SI-0001"
}
```
or clear:
```json
{
  "replacedByOrderNumber": null
}
```

| Field | Type | Rules |
|-------|------|--------|
| `replacedByOrderNumber` | string \| null | If string: trimmed, non-empty, max length per `LIMITS` / existing order-number limits. If null: clear link. |

## Behavior
1. Load order by `id` + `companyId`.
2. Reject if not found (`404`).
3. Reject if `cancelledAt` is null (`400` — link only after cancel).
4. If `replacedByOrderNumber` is null → set `replacedByOrderId = null`, return updated summary.
5. Else resolve number to exactly one company order (exact CI match on `name` / `orderNumber` / `erpnextInvoiceId`):
   - 0 matches → `400` not found
   - >1 matches → `400` ambiguous
   - match.id === source.id → `400` cannot replace self
6. Set `replacedByOrderId` to resolved id.
7. Audit log recommended (entity Order, action replace-link set/clear).

## Response `200`
```json
{
  "order": {
    "id": "cuid",
    "orderLabel": "1001",
    "cancelledAt": "2026-08-14T10:00:00.000Z",
    "replacedByOrder": {
      "id": "cuid2",
      "orderLabel": "SI-0001",
      "name": "SI-0001",
      "orderNumber": null,
      "erpnextInvoiceId": "SI-0001"
    }
  }
}
```

## Errors
- `400` validation / not cancelled / unresolved / ambiguous / self
- `401` / `403` auth or Vault deployment
- `404` source order not found
