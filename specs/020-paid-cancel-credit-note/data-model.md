# Data Model: Paid Return Cancel Creates Credit Note

**Feature**: `020-paid-cancel-credit-note`  
**Date**: 2026-07-23

## Overview

No new Prisma models or required migrations. Completion reuses `Order`, `OrderReturn`, `ApprovalRequest`, and existing `Order.erpReturnSalesInvoiceIds`. Payment status on `Order.financialStatus` selects credit note vs SI cancel at approve time.

## Existing entities

### Order

| Field | Role for this feature |
|---|---|
| `id` | Order identity |
| `companyId` | Tenant boundary |
| `companyLocationId` | ERP + Shopify config scope |
| `financialStatus` | Exact normalized `paid` → credit note; otherwise → SI cancel |
| `erpnextInvoiceId` | Preferred original SI name for credit note / cancel |
| `name` / `orderNumber` | Fallback SI lookup via `po_no` |
| `shopifyOrderId` | Cosmo Shopify cancel when real Admin id |
| `erpReturnSalesInvoiceIds` | Persist created/found Return SI (credit note) names |
| `fulfillmentStage` / `financialStatus` | Paid success → `returned` + `voided` via credit-note patch |
| `cancelledAt` / `cancelledById` / `cancelReason` | Set on successful completion from cancel remark / reviewer |

### OrderReturn

| Field | Role |
|---|---|
| `id` | Linked from `ApprovalRequest.orderReturnId` |
| `actionStatus` | Stays `pending` until ERP+finalize succeed; then `solved` |
| `actionType` | `cancel` on successful completion |
| `cancelRemark` | Merchant reason (already required at request time) |
| `actionDate` / `actionById` | Reviewer completion metadata |

Finance reject continues to reset the return to `pending` without ERP side effects.

### ApprovalRequest

| Field | Role |
|---|---|
| `type` | `return_cancel` |
| `status` | Remains `pending` until completion succeeds → `approved`; reject → `rejected` |
| `orderId` / `orderReturnId` | Load order + return for completion |
| `requestNote` | Optional; cancel remark primarily on return |
| `reviewNote` | Optional sanitized failure hint on failed attempt (non-status); clear on success |

No new approval type.

## Derived completion mode (not stored)

```text
normalize(financialStatus) === "paid"  →  completionMode = credit_note
otherwise                              →  completionMode = cancel_si
```

Optional API display field only; never trusted from the client.

## Validation rules

- Approve requires finance permission and company-scoped approval CUID (existing).
- Paid completion requires resolvable original SI (`erpnextInvoiceId` or submitted SI by `po_no` + company) and location ERP credentials/company.
- Unpaid completion uses strict SI cancel; definitive `not_found` is a hard failure for return-cancel finalize (do not mark solved).
- `erpReturnSalesInvoiceIds` appends are deduped (existing merge helpers).
- Errors returned to the client must be sanitized (no tokens/raw unbounded ERP bodies); cap message length using existing patterns.

## State transitions

### Happy path — paid

```text
pending return_cancel approval
  → ERP ensure credit note (return SI)
  → Cosmo Shopify cancel (or Vault skip)
  → approved + Order voided/returned + Return SI ids + OrderReturn solved
```

### Happy path — unpaid / non-paid

```text
pending return_cancel approval
  → ERP cancel SI
  → Cosmo Shopify cancel (or Vault skip)
  → approved + Order voided/returned + OrderReturn solved
```

### Failure

```text
pending return_cancel approval
  → ERP/Shopify required step fails
  → approval stays pending, return stays pending, clear error to client
  → finance retries approve (ensure CN / cancel SI idempotent)
```

### Reject

```text
pending → rejected; OrderReturn back to pending; no ERP mutation
```

## Relationships

```text
ApprovalRequest (return_cancel)
  ├── OrderReturn (solve on success)
  └── Order
        ├── CompanyLocation (ERP/Shopify)
        └── erpReturnSalesInvoiceIds[] (credit note names)
```

## Optional future fields (out of scope unless UAT proves need)

If operators need visible per-system finance-completion status without reading audits:

| Field on OrderReturn | Meaning |
|---|---|
| `financeCancelErpStatus` | `credit_noted` / `cancelled` / `failed` / null |
| `financeCancelShopifyStatus` | terminal Shopify outcome |
| `financeCancelError` | sanitized last error |

Prefer shipping without these first.
