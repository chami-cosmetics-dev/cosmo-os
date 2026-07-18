# Data Model: Delivery & CC Checkout Invoice Complete

**Feature**: `011-delivery-cc-invoice-complete`  
**Date**: 2026-07-18

## Overview

No new Prisma model or migration is planned. The design separates financial invoice completion (`invoiceCompleteAt`, paid status, and PE outcome) from the physical fulfillment pipeline (`fulfillmentStage`).

## Entities

### Order (OS — existing)

| Field / concept | Feature role |
|---|---|
| `id`, `name`, `shopifyOrderId` | OS identity and ERP SI fallback lookup |
| `fulfillmentStage` | Physical pipeline. CC Checkout stays nonterminal at order received; delivery approval may finish `delivery_complete → invoice_complete` |
| `fulfillmentStatus` | Must not become fulfilled for early CC completion; becomes fulfilled when physical fulfillment closes |
| `financialStatus` | Set to `paid` only after PE creation or ERP confirms the SI is already paid |
| `invoiceCompleteAt` | Independent invoice/payment completion marker; set for successful CC Checkout at order received and successful delivery approval |
| `invoiceCompleteById` | Actor audit. Finance reviewer for delivery approval; system/null attribution is acceptable for webhook-driven CC completion according to existing audit conventions |
| `paymentGatewayPrimary`, `paymentGatewayNames` | Canonical CC Checkout classification and MOP selection |
| `erpnextInvoiceId` | Preferred linked ERP Sales Invoice name |
| `companyLocationId` | ERP credentials/company and configured WebXPay/payment MOP scope |
| `erpPeSyncError` | Visible failure when required PE settlement cannot complete |
| `erpPeSyncFailedAt` | Timestamp of latest PE failure |
| `erpPeSyncMop` | Selected/resolved MOP for display and retry |
| stage timestamp fields | Continue recording physical stage changes independently of early invoice completion |

**Validation and invariants**:
- CC Checkout may have `invoiceCompleteAt != null` while `fulfillmentStage` remains `order_received`, `sample`, `print`, `ready_to_dispatch`, `dispatched`, or `delivery_complete`.
- Early invoice completion must not set `fulfillmentStatus = fulfilled`.
- Delivery-payment approval completes the invoice only after ERP returns `created` or `already_paid`.
- Required PE failure must leave `erpPeSyncError` visible and must not produce a false successful completion.
- Already-paid SI is a successful idempotent outcome and never creates another PE.
- A non-CC delivery-collection order is not early-completed at order received.

### ApprovalRequest (OS — existing)

| Field / concept | Feature role |
|---|---|
| `type = delivery_payment_approval` | Finance action that settles a delivery-collected payment |
| `status` | Must reflect a settlement-safe approval outcome; concurrency guard prevents duplicate review |
| `orderId` | Related physically delivered order |
| reviewer / reviewed timestamp / note | Approval audit |
| amount / payment metadata | Existing approval evidence retained |

**Invariant**: A delivery approval reported as successfully approved must correspond to ERP PE creation or an already-paid SI, followed by OS invoice completion.

### ERP Sales Invoice (external)

| Concept | Feature role |
|---|---|
| `name` | Canonical SI identity, preferably from `Order.erpnextInvoiceId` |
| `docstatus` | Must be submitted before PE creation |
| `outstanding_amount` | `<= 0` means already paid; `> 0` requires PE |
| `po_no` / ERP order identity | Fallback lookup only |

### ERP Payment Entry (external)

| Concept | Feature role |
|---|---|
| `payment_type = Receive` | Incoming customer payment |
| `mode_of_payment` | Location-configured delivery MOP or WebXPay MOP for CC Checkout |
| SI reference and allocated amount | Settles the linked submitted SI |
| submitted status | Required for settlement success |

### DeliveryPayment (OS — existing)

The rider-recorded collection evidence remains the source record for delivery-time payment details. This feature does not add fields, but implementation must preserve existing validation and linkage when approval completes the order.

## State transitions

### CC Checkout at order received

```text
Shopify paid CC Checkout order
  → OS upsert at order_received
  → ERP SI linked/created
  → PE outcome:
      created / already_paid
        → financialStatus = paid
        → invoiceCompleteAt = now
        → keep fulfillmentStage = order_received
        → continue sample/print/dispatch/delivery
      failed / missing required config
        → erpPeSyncError + failed timestamp/MOP
        → no false successful invoice completion
        → retry available to authorized users
```

After physical delivery, existing logic may close the stage:

```text
delivery_complete + invoiceCompleteAt present → invoice_complete
```

No second PE or manual invoice-complete action is required.

### Delivery payment approval

```text
delivery_complete + pending delivery_payment_approval
  → concurrency-safe approval attempt
  → ERP PE outcome:
      created / already_paid
        → approval approved
        → financialStatus = paid
        → invoiceCompleteAt = now
        → fulfillmentStage = invoice_complete
        → fulfillmentStatus = fulfilled
      failed
        → do not claim successful OS invoice completion
        → persist visible PE failure/retry information
```

### Retry

```text
erpPeSyncError present (terminal or early-complete/nonterminal)
  → authorized retry with resolved/overridden MOP
  → created / already_paid: clear erpPeSync* and establish completion
  → failed: refresh erpPeSyncError/failed timestamp
```

## Logical query sets

### Manual invoice-complete queue

- Physical stage is `delivery_complete`.
- `invoiceCompleteAt` is null.
- Excludes CC Checkout already completed at order received and delivery approvals already settled.

### Physical fulfillment queues

- Driven by nonterminal `fulfillmentStage`.
- Early CC Checkout completion does not remove the order.
- Any existing `invoiceCompleteAt: null` predicate must add a targeted CC Checkout early-complete allowance.

### Failed PE list

- `erpPeSyncError` is non-null.
- Order is not voided.
- Includes terminal invoice-complete orders and nonterminal CC Checkout order-received/payment-completion attempts.
- Authorization and location scoping remain unchanged.
