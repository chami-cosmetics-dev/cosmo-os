# Data Model: KOKO Duplicate Order Minimization

**Feature**: `057-koko-duplicate-orders`  
**Date**: 2026-09-18

## Entity: Order (extended)

Existing sales order (ERP / Shopify). New fields for KOKO link-time gate.

### New fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `kokoLinkGeneratedAt` | DateTime? | No | Merchant-entered portal link generated time (minute precision) |
| `kokoLinkTimeConfirmedAt` | DateTime? | No | When merchant confirmed; also gate for creating finance approval |
| `kokoLinkTimeConfirmedById` | String? | No | User id who confirmed; FK → User, onDelete SetNull |

### Indexes (recommended)

- `@@index([companyId, kokoLinkTimeConfirmedAt])` — optional ops/reporting  
- Existing `[companyId, customerPhone]` / createdAt indexes used for duplicate candidate scans (add composite if missing and needed after query plan)

### Existing fields used

- `companyId`, `customerPhone`, `paymentGatewayPrimary`, `paymentGatewayNames`
- `sourceName` (`erpnext` for deferred-approval path)
- `financialStatus`, `cancelledAt`, `fulfillmentStage`
- `lineItems` → SKU / qty for fingerprint
- `approvalRequests` (`order_payment_approval`)
- `assignedMerchantId`, `name`, `orderNumber`, `totalPrice`, `createdAt`

## Entity: ApprovalRequest (unchanged schema)

No new columns required for v1. Link time read via `order.kokoLinkGeneratedAt`.  
Types used: `order_payment_approval` (pending / approved / cancelled / rejected).

## Entity: Permission (seed)

| Key | Description |
|-----|-------------|
| `finance.approvals.cancel_koko_duplicate` | Cancel duplicate KOKO orders from finance approvals (OS + ERP) |

Grant on finance / admin role seeds alongside existing `finance.approvals.*` as product decides (default: finance manage roles that already approve payments).

## Derived (not persisted in v1)

### Item fingerprint

- From `OrderLineItem`: key = `sku` (or product item code) + quantity.
- Sorted multiset string (same spirit as abandoned-cart `cartFingerprint`).
- Exact duplicate: identical fingerprints.

### Phone key

- `canonicalPhoneForErpCustomerId(customerPhone)`; null/unusable phone → never auto-grouped.

### Duplicate group

- Members: same `companyId` + phone key + item fingerprint.
- Window: any member with `createdAt` within `KOKO_DUPLICATE_LOOKBACK_DAYS` (30) of the newest member in the candidate set.
- Include: pending and approved `order_payment_approval` KOKO orders (and siblings still in cancel context).
- Exclude from actionable cancel list: voided / fully cancelled unless needed as read-only approved anchor.
- Ephemeral `duplicateGroupId` = stable hash of `phoneKey|fingerprint` for UI binding (not stored).

### ERP KOKO awaiting link time

- Predicate: ERP source + KOKO payment + `kokoLinkTimeConfirmedAt` is null + not cancelled/voided.
- Appears in sample / merchant handling queues.
- Must **not** have pending finance approval yet.

## Validation rules

- `kokoLinkGeneratedAt` required to confirm; must be a valid datetime (minute precision OK).
- Confirm rejected if order is not ERP KOKO (or not in allowed stages).
- Confirm rejected if finance already **approved** payment (edits locked).
- Duplicate notice is informational; confirm allowed when siblings exist.
- Cancel-duplicate requires `finance.approvals.cancel_koko_duplicate`; target must be in a duplicate group with ≥2 members (or explicitly flagged surplus).

## State transitions

```text
[ERP KOKO ingested]
    → no order_payment_approval yet
    → sample / order_received (merchant)
    → optional soft duplicate notice on confirm UI

[merchant confirms link time]
    → set kokoLinkGeneratedAt, kokoLinkTimeConfirmedAt/By
    → create order_payment_approval (pending)
    → finance queue

[finance approves matching order]
    → approval approved + KOKO ref (existing)
    → sibling pending remains pending (no auto-approve)

[finance cancel-duplicate on surplus]
    → cancel pending approval if any
    → cancel OS order + ERP SI (existing cancel family)
    → no approved KOKO ref on cancelled surplus

[bank / non-KOKO approval gateways]
    → unchanged immediate approval path
```

## Constants

```text
KOKO_DUPLICATE_LOOKBACK_DAYS = 30
ORDER_PAYMENT_APPROVAL = "order_payment_approval"  # existing
PERMISSION = "finance.approvals.cancel_koko_duplicate"
APP_TIME_ZONE = Asia/Colombo  # interpret/display link time
```
