# Contract: Invoice print modes

**Endpoint**: `GET /api/admin/orders/{id}/invoice`  
**Content-Type**: `text/html; charset=utf-8` (success)

Path `{id}`: CUID of the order.

## Query modes

| Mode | Query | Permission | Mutates order? | `print.autoPrint` in template | Use from |
|------|-------|------------|----------------|-------------------------------|----------|
| View HTML | _(none)_ or other non-print flags | `fulfillment.order_print.read` | No | false | Debugging / open without dialog |
| **View-only print** | `preview=1` (preferred) and/or `print=preview` | `fulfillment.order_print.read` | **No** | **true** | Order details **Print Invoice** |
| Formal print | `print=1` or `print=true` | `fulfillment.order_print.print` | **Yes** (`printCount`, `lastPrinted*`, possible stage) | true | Fulfillment Print queue, bulk print |

### View-only print (this feature)

- **MUST** render the same print-format HTML as other modes (location default format).
- **MUST NOT** increment `printCount` or set `lastPrintedAt` / `lastPrintedById`.
- **MUST NOT** change `fulfillmentStage` or package-ready fields.
- **MUST** set template context so the format can auto-trigger `window.print()` when the format supports `{{print.autoPrint}}`.

### Formal print (unchanged)

- **MUST** retain current mutation + permission behavior.
- Order-details **Print Invoice** **MUST NOT** use this mode after this feature.

## Error responses (existing)

| Status | When |
|--------|------|
| 401 | Missing/insufficient permission |
| 400 | Invalid id |
| 404 | No company or order not found |
| 409 | Finance payment approval block (body: reason text) |

On any error, order print fields remain unchanged.

## UI contract: Order details modal

- Control label: **Print Invoice** (distinct from timeline step “Print”).
- Visible when user can perform view-only invoice GET (read permission), including unprinted and cancelled orders.
- Action: `window.open` to view-only print URL for the current `orderId`.
- Must not imply timeline advancement (no success toast claiming “printed”; no forced refresh that exists only to pick up print mutations).
