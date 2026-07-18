# Data Model: Arrival-Time ERP SI for Finance-Approval Orders

**Feature**: `008-sales-report-erp-si-date`  
**Date**: 2026-07-18

No Prisma schema change is planned. This feature changes how existing records and ERP documents transition through their lifecycle.

## Entity: Order

Existing Shopify-originated order stored in PostgreSQL.

### Relevant existing fields

| Field | Role in this feature |
|---|---|
| `id` | Internal order identifier |
| `companyId` | Tenant isolation |
| `companyLocationId` | Selects ERP company, warehouse, and credentials |
| `shopifyOrderId` | Unique ingestion/idempotency key |
| `financialStatus` | `pending` before approval, `paid` after approval, `voided` after rejection/cancellation |
| `paymentGatewayPrimary` / `paymentGatewayNames` | Determines whether finance approval is required |
| `erpnextInvoiceId` | SI lifecycle: `null`, transient `"pending"`, legacy `"pending_approval"`, or real ERP SI name |
| `erpnextSyncError` / `erpnextSyncFailedAt` | SI creation failure visibility |
| `erpnextSyncAutoRetryCount` | Automatic retry tracking |
| `erpnextSyncNextAutoRetryAt` | Next SI retry schedule |
| `erpnextSyncRetryLeaseExpiresAt` | Prevents concurrent/stale SI retry ownership |
| `erpPeSyncError` / `erpPeSyncFailedAt` | Payment Entry failure visibility |
| `invoiceCompleteAt` / `invoiceCompleteById` | Existing post-approval invoice completion audit |
| `fulfillmentStage` / `fulfillmentStageEnteredAt` | Existing fulfillment progression |

### Validation and invariants

- `companyId` and `companyLocationId` must resolve within the authenticated user's permitted scope before any finance mutation.
- A new finance-approval order must have a pending payment approval before its real SI can expose it to normal order surfaces.
- A real SI ID is required before payment approval can complete.
- A finance-approval order has at most one active submitted SI.
- Rejection succeeds only after the SI is cancelled or confirmed already cancelled.
- Successful rejection sets `financialStatus = "voided"`.

### ERP SI state interpretation

| Local value | Meaning | Allowed action |
|---|---|---|
| `null` | SI not created / creation failed | Retry SI creation |
| `"pending"` | SI creation claimed/in progress | Wait if lease active; recover if stale |
| `"pending_approval"` | Legacy order waiting under old workflow | Treat as no real SI; retry creation |
| Real SI name | Submitted ERP SI exists | Approve → PE; reject → cancel SI |

## Entity: ApprovalRequest

Existing finance decision record.

### Relevant existing fields

| Field | Role in this feature |
|---|---|
| `id` | Approval route parameter; validated as CUID |
| `companyId` | Tenant scope |
| `companyLocationId` | Finance location scope |
| `type` | Must be `order_payment_approval` for this lifecycle |
| `status` | `pending`, `approved`, `rejected`, or legacy/cancelled state |
| `orderId` | Links the finance decision to the order/SI |
| `reviewNote` | Required 5–500 character rejection reason for this approval type |
| `reviewedById` | Finance reviewer |
| `reviewedAt` | Decision timestamp |

### Validation rules

- Approval and rejection require `finance.approvals.manage`.
- Approval ID uses `cuidSchema`.
- For `order_payment_approval` + reject:
  - trim whitespace;
  - minimum 5 characters;
  - maximum 500 characters;
  - persist in `reviewNote`.
- Other approval types keep their current note rules.
- Only a pending request may transition to approved/rejected; repeated completed requests are handled idempotently or return a conflict based on the existing decision.

## External Entity: ERP Sales Invoice

ERPNext submitted invoice representing the sale.

### Relevant attributes

| Attribute | Required behavior |
|---|---|
| `name` | Stored in `Order.erpnextInvoiceId` |
| `company` | Must match the order location's configured ERP company |
| `po_no` | Stable Shopify/order reference used for recovery lookup |
| `posting_date` / `posting_time` | Set by existing Asia/Colombo SI creation logic |
| `docstatus` | `1` when submitted; `2` when cancelled |
| `update_stock` | `1`, reducing stock at arrival |
| `outstanding_amount` | Full amount before approval; zero after valid PE |

### Invariants

- Created once at order arrival or by SI retry while approval remains pending.
- No Payment Entry is created while the order remains financially pending.
- Cancellation is strict and idempotent:
  - submitted → cancel;
  - already cancelled → success;
  - known SI missing/unexpected → error.

## External Entity: ERP Payment Entry

ERPNext payment allocated to the existing SI after finance approval.

### Relevant attributes

| Attribute | Required behavior |
|---|---|
| Party/company | Derived from existing SI/order/location mappings |
| Mode of payment | Existing gateway-to-ERP mapping |
| Reference | Existing submitted SI |
| Amount | SI outstanding amount |
| Posting timestamp | Existing finance-approved payment timestamp behavior |

### Invariants

- Never created before finance approval.
- Created against the existing SI; approval must not create another SI.
- Sequential retries should no-op when SI outstanding amount is already zero.

## State Transitions

### Successful arrival and approval

```text
Shopify order received
  → Order.financialStatus = pending
  → ApprovalRequest = pending
  → Order.erpnextInvoiceId: null → "pending" → real SI name
  → ERP SI submitted, outstanding, stock reduced
  → fulfillment remains blocked by ApprovalRequest
  → finance approves
  → Payment Entry applied to existing SI
  → Order.financialStatus = paid
  → invoiceCompleteAt set / fulfillment stage advanced
  → ApprovalRequest = approved
  → fulfillment unlocked
```

### SI creation failure and recovery

```text
Arrival SI creation fails
  → ApprovalRequest remains pending
  → fulfillment remains blocked
  → ERP sync error and retry schedule recorded
  → approval attempt returns retryable conflict (no late SI creation)
  → manual/automatic SI retry creates submitted unpaid SI
  → finance may approve normally
```

### Rejection

```text
Order has submitted unpaid SI + pending ApprovalRequest
  → reviewer supplies 5–500 character reason
  → serialize decision for pending approval
  → ERP SI cancelled (or confirmed already cancelled)
  → stock restored
  → Order.financialStatus = voided
  → ApprovalRequest = rejected with reason/reviewer/time
  → fulfillment remains blocked
  → recalculated OS and ERP sales both exclude the order
```

### Rejection cancellation failure

```text
ERP cancellation fails
  → no ApprovalRequest status change
  → no Order financial-status change
  → approval remains pending and fulfillment remains blocked
  → safe retryable API error returned and audit/log written
  → reviewer retries rejection after ERP recovers
```

## Relationships

```text
Company
  └── CompanyLocation
        ├── ErpnextInstance/configuration
        └── Order
              ├── ApprovalRequest (latest order-payment approval controls fulfillment)
              ├── ERP Sales Invoice (one active SI identity)
              └── ERP Payment Entry (created after approval)
```

## Migration Impact

- Prisma migration: **none**
- Data backfill: **none required**
- Legacy `"pending_approval"` rows: retained as retryable placeholders and migrated organically when SI retry succeeds
- Production database deployment: **not applicable unless implementation later discovers a necessary schema change; any such change must follow the constitution's multi-database migration process**
