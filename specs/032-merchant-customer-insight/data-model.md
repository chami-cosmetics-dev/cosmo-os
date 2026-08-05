# Data Model: Merchant Customer Insight

**Feature**: `032-merchant-customer-insight`  
**Date**: 2026-08-05

v1 introduces **no new Prisma models**. Insight is a **read model** over existing entities.

## Existing entities (read)

### ContactMaster

| Field | Use |
|-------|-----|
| `id` | Insight key (`cuid`) |
| `companyId` | Tenant scope |
| `name` | Display name |
| `phoneNumber` | Primary phone |
| `email` | Optional display |
| `lastPurchaseAt` | Recency hint (UI); frequency also computed from history |
| `phones` / `emails` | Lookup + order matching |

Related: `ContactPhone.phoneNumber`, `ContactEmail.email`.

### Order (+ OrderLineItem)

| Field | Use |
|-------|-----|
| `companyId`, `customerPhone`, `customerEmail`, `customerId` | Match to contact (phone-first) |
| `totalPrice` | Lifetime total + chart + invoice amount |
| `cancelledAt` | If set → exclude from loyalty total / item / chart aggregates; still list in history with cancelled status |
| `createdAt`, `orderNumber`, `name`, `erpnextInvoiceId` | Invoice date/reference |
| `financialStatus`, `fulfillmentStatus`, `fulfillmentStage` | Status display |
| `OrderLineItem.quantity`, `price`, product title | Top-items |

### AdaptPurchaseHistory

| Field | Use |
|-------|-----|
| `contactId` | Direct link to ContactMaster |
| `ttlAmount` | Lifetime total + chart + invoice amount |
| `invoiceDate`, `salesInvoiceNo` | Invoice date/reference |
| `lineItems` (JSON) | Top-items (via existing Adapt line UI helpers) |
| `currency` | Display if present (expect LKR) |

## Derived read models (not stored)

### LoyaltyTier

| Field | Type | Rules |
|-------|------|--------|
| `key` | `standard` \| `gold` \| `platinum` | From `lifetimeTotal` |
| `label` | string | Standard / Gold / Platinum |
| `code` | `loyalcs` \| `loyalcs2` \| null | Gold → loyalcs; Platinum → loyalcs2 |
| `lifetimeTotal` | number | Sum per research R3 |
| `thresholds` | `{ goldMin, platinumAbove }` | `100000`, `250000` |

### CustomerInsightSummary

| Field | Description |
|-------|-------------|
| `contact` | id, name, phones, email |
| `loyalty` | LoyaltyTier |
| `frequency` | orderCount, firstOrderAt, lastOrderAt, avgDaysBetweenOrders \| null |
| `topItems` | [{ name, quantity, spend }] top N |
| `series` | { month: string, spend: number, orderCount: number }[] |
| `invoices` | paginated UnifiedInvoiceRow[] |
| `invoicePagination` | page, pageSize, total |

### UnifiedInvoiceRow

| Field | Description |
|-------|-------------|
| `id` | Stable key (`order:{id}` or `adapt:{id}`) |
| `source` | `order` \| `adapt` |
| `date` | ISO date |
| `reference` | Human invoice/order label |
| `status` | Display status |
| `amount` | number |
| `includedInLoyaltyTotal` | boolean |

## Validation rules

- Search `phone`: required, trimmed, min length after strip (e.g. ≥7 digits), max per `LIMITS`
- `contactId`: `cuidSchema`
- `invoicesPage`: positive int, default 1
- `invoicesPageSize`: int 1–50 (default 25)
- Search results: hard max 10 rows
- Company scope: all queries filter `companyId` of current user

## State transitions

None — view-only. Loyalty tier changes only when underlying order/Adapt data changes (recomputed on next read).

## Relationships (logical)

```text
ContactMaster 1──* ContactPhone
ContactMaster 1──* AdaptPurchaseHistory
ContactMaster ──(phone/email match)──* Order
Order 1──* OrderLineItem
```
