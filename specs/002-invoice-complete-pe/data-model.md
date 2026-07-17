# Data Model: Invoice Complete PE Integrity

**Feature**: `002-invoice-complete-pe`  
**Date**: 2026-07-10

## Overview

No new Prisma models required for the planned fix. Reuse existing Order PE-failure fields and ERP Sales Invoice / Payment Entry as external entities.

## Entities

### Order (OS — existing)

| Field / concept | Role |
|-----------------|------|
| `fulfillmentStage` | `delivery_complete` → invoice-complete queue; `invoice_complete` = done in OS |
| `financialStatus` | Set `paid` on invoice complete |
| `erpnextInvoiceId` | Canonical SI name for PE lookup (must be preferred over `name` / `po_no` alone) |
| `name` / `shopifyOrderId` | Fallback SI / `po_no` lookup |
| `paymentGatewayPrimary` / `paymentGatewayNames` | Prepaid detection (KOKO, bank transfer, WebXPay) |
| `invoiceCompleteAt` / `invoiceCompleteById` | Audit of completion |
| `erpPeSyncError` | Visible PE failure message |
| `erpPeSyncFailedAt` | When PE last failed |
| `erpPeSyncMop` | Mode used / to retry |
| `companyLocationId` | ERP instance + MOP config |

**Validation / invariants (feature)**:
- After invoice complete with PE required: either SI outstanding ≤ 0, or PE created, or `erpPeSyncError` set.
- Already `invoice_complete` + finance approve (prepaid focus): stage must not become `print` solely due to approval.

### ERP Sales Invoice (external)

| Concept | Role |
|---------|------|
| `name` | e.g. `SV100-0695` |
| `po_no` | Often Shopify order name |
| `outstanding_amount` | PE needed iff > 0 |
| `docstatus` | Submitted invoices only |

### ERP Payment Entry (external)

Created against SI with mode of payment chosen in OS (`mopNameOverride` / resolved MOP).

### ApprovalRequest (existing)

| Type | Stage rule change |
|------|-------------------|
| `order_payment_approval` | If order already `invoice_complete`, do not force `print` |
| `payment_method_change_approval` | Treat `invoice_complete` as post-delivery (do not force `print`) |
| `delivery_payment_approval` | Prefer persist PE failures to `erpPeSync*` |

## State transitions

```text
delivery_complete ──(mark invoice complete + MOP)──► invoice_complete
                         │
                         ├─ PE ok / SI already paid ──► clear erpPeSync*
                         └─ PE required & fail ───────► erpPeSyncError set (stage still invoice_complete)

invoice_complete ──(finance approve prepaid)──► stay invoice_complete
                    (do NOT → print → … → delivery_complete queue)

invoice_complete ──(operator PE retry)──► clear erpPeSync* on success
```

## Discovery set (logical, not new table)

Orders where:
- `fulfillmentStage = invoice_complete`
- Linked SI exists (`erpnextInvoiceId` or resolvable)
- SI `outstanding_amount > 0` (checked at list/retry time against ERP)
- Optionally `erpPeSyncError` is null (silent gap) **or** non-null (known failure)

Operators act via existing retry with selectable MOP.
