# Data Model: 041-order-replace-link

## Existing entities (reused)

### Order
- `id`, `companyId`
- `orderNumber?`, `name?`, `shopifyOrderId`, `erpnextInvoiceId?` — business-visible identity / ERP SI
- `cancelledAt?`, `cancelledById?`, `cancelReason?`, `financialStatus?`
- Display helper: `formatBusinessOrderNumber` (`lib/order-display-label.ts`)

### OrderExchange (out of scope)
Existing merchant exchange workflow. **Not** used for cancel→replace link in v1.

## New / changed fields

### Order — replacement link (cancelled → live)

| Field | Type | Rules |
|-------|------|--------|
| `replacedByOrderId` | `String?` (FK → `Order.id`) | Nullable. Set only when this order is cancelled (`cancelledAt` set). Points at the Cosmo order that supersedes it. Cleared = no link. |

### Relations

| Relation | Side | Meaning |
|----------|------|---------|
| `replacedByOrder` | Optional `Order?` | The single replacement for this cancelled order |
| `replacedFromOrders` | `Order[]` | Cancelled orders that name this order as their replacement (0..n) |

Prisma sketch (conceptual):

```text
replacedByOrderId String?
replacedByOrder   Order?  @relation("OrderReplacedBy", fields: [replacedByOrderId], references: [id], onDelete: SetNull)
replacedFromOrders Order[] @relation("OrderReplacedBy")

@@index([companyId, replacedByOrderId])
```

**onDelete: SetNull** — if replacement row removed, link clears on cancelled side (rare). No orphan FK.

## Validation rules

1. **Source must be cancelled**: `cancelledAt != null` to set or clear (clear may also be allowed if already cancelled; if somehow set on non-cancelled, clear still OK — prefer reject set on non-cancelled).
2. **Target must exist** in same `companyId`.
3. **Target ≠ source** (`replacedByOrderId !== id`).
4. **Resolve input**: trim; case-insensitive exact match on `name` OR `orderNumber` OR `erpnextInvoiceId`; exactly one row; else reject.
5. **No same-customer rule** (v1).
6. **One outgoing link** per cancelled order (single FK). Many incoming links to one replacement allowed.
7. **Cosmo only**: mutate API rejects on Vault deployment.

## State transitions

```text
Cancelled order (cancelledAt set), replacedByOrderId = null
  → staff enters valid replacement order number
  → replacedByOrderId = target.id

Cancelled order with replacedByOrderId set
  → staff updates to another valid number
  → replacedByOrderId = new target.id
  → staff clears field
  → replacedByOrderId = null

Non-cancelled order
  → set rejected; UI hides editable field
```

Reverse display (replacement detail): derived from `replacedFromOrders` — no write path.

## Migration notes

- Additive nullable FK + index — safe deploy.
- Create via `npm run db:migrate:create`; apply with `npm run db:deploy:all` (vault, cosmo-dev, cosmo-prod) with explicit prod confirmation when deploying prod.
- No historical backfill; staff may optionally fill old cancelled rows later.
- Vault DB receives the column but UI/API mutate gated off; unused nulls are fine.

## Out of scope (data)

- Creating ERP or Shopify orders
- Auto-detecting replacement
- Multi-hop graph materialization
- Syncing link into ERPNext custom fields
