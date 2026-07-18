# Contract: Finance Approval and ERP Invoice Lifecycle

**Feature**: `008-sales-report-erp-si-date`  
**Audience**: Web clients, approval API, Shopify ingestion, ERP integration

## 1. Shopify Order Intake Contract

### Trigger

A newly persisted, non-voided Shopify order whose payment gateway requires order-payment finance approval (KOKO/bank).

### Required outcome

1. Create or retrieve one pending `order_payment_approval` for the order.
2. Claim the ERP SI sync slot atomically.
3. Create one submitted, stock-updating ERP Sales Invoice.
4. Store the real ERP SI name on the order.
5. Do not create a Payment Entry while the order is financially pending.
6. Keep the order excluded from fulfillment through approval state.

### Failure outcome

If SI creation fails:

- the approval remains pending;
- fulfillment remains blocked;
- the order records the existing ERP SI sync error/retry metadata;
- the SI can be retried automatically or manually while approval remains pending.

### Idempotency

- Duplicate webhook delivery must not create duplicate pending approvals.
- Duplicate/concurrent SI attempts must respect the local claim/lease and recover by ERP company + order reference lookup.
- A real existing SI is reused.

## 2. Review Approval Endpoint

`PATCH /api/admin/approvals/{id}`

### Authorization

- Authenticated user required.
- Requires `finance.approvals.manage`.
- Approval must belong to the user's company.
- Existing finance-location scope must be enforced.
- `{id}` must satisfy `cuidSchema`.

### Approve request

```json
{
  "action": "approve",
  "reviewNote": "Optional approval note"
}
```

### Approve preconditions

- Approval type is `order_payment_approval`.
- Approval status is `pending`.
- Linked order exists.
- `Order.erpnextInvoiceId` is a real SI name, not `null`, `"pending"`, or `"pending_approval"`.
- SI creation is not currently held by an active retry lease.

### Approve success

```json
{
  "ok": true,
  "status": "approved"
}
```

Required side effects:

- serialize the decision so only one approve/reject request wins;
- apply one ERP Payment Entry to the existing SI;
- preserve existing PE failure recording behavior;
- update order financial/invoice-complete/fulfillment state as today;
- mark approval approved with reviewer/time/note;
- do not create another SI.

### Approve blocked because SI is unavailable

HTTP `409 Conflict`

```json
{
  "error": "ERP Sales Invoice is not ready. Retry ERP sync before approving this order.",
  "code": "ERP_SI_NOT_READY",
  "retryable": true,
  "approvalStatus": "pending"
}
```

No approval, payment, invoice-complete, or fulfillment-unlock mutation may occur.

## 3. Reject Request Contract

### Request

```json
{
  "action": "reject",
  "reviewNote": "Payment receipt could not be verified"
}
```

For `order_payment_approval`, `reviewNote` is:

- required after trimming;
- minimum 5 characters;
- maximum 500 characters.

Other approval types retain their existing validation/behavior.

### Validation failure

HTTP `400 Bad Request`

```json
{
  "error": "A rejection reason between 5 and 500 characters is required.",
  "code": "REJECTION_REASON_REQUIRED"
}
```

### Reject success

```json
{
  "ok": true,
  "status": "rejected",
  "erpInvoiceCancellation": "cancelled"
}
```

`erpInvoiceCancellation` may be:

- `cancelled`
- `already_cancelled`

Required ordering and side effects:

1. Serialize decision for the pending approval.
2. Strictly cancel or confirm cancellation of the linked ERP SI.
3. Only after ERP success:
   - set the OS order financial status to `voided`;
   - set approval status to `rejected`;
   - record reviewer, time, and trimmed reason;
   - mark related notifications read;
   - notify the requester after commit.
4. The order remains blocked from fulfillment.

### ERP cancellation failure

HTTP `502 Bad Gateway`

```json
{
  "error": "ERP Sales Invoice could not be cancelled. The approval remains pending; retry rejection.",
  "code": "ERP_SI_CANCEL_FAILED",
  "retryable": true,
  "approvalStatus": "pending"
}
```

Required invariant:

- approval remains `pending`;
- order remains financially `pending`;
- no rejection notification is sent;
- fulfillment remains blocked;
- detailed ERP error is logged/audited server-side but raw provider details are not exposed.

### Concurrent/completed decision

- A competing completed decision returns `409 Conflict`.
- Repeating the same already-completed rejection may return idempotent success without cancelling twice.
- An already-cancelled SI is a successful cancellation result.

## 4. ERP Sales Invoice Cancellation Contract

The existing SI cancellation helper gains strict/idempotent semantics for finance rejection.

### Inputs

- Order reference/name
- Company location / ERP instance
- Real SI name when known
- Strict mode enabled for finance rejection

### Result

```ts
type SalesInvoiceCancellationResult = {
  outcome: "cancelled" | "already_cancelled" | "not_found";
  invoiceName?: string;
};
```

### Strict-mode behavior

- Missing ERP credentials/company: throw.
- Known SI, `docstatus = 1`: cancel and return `cancelled`.
- Known SI, `docstatus = 2`: return `already_cancelled`.
- Known SI missing or unexpected draft/state: throw.
- No known SI: perform definitive company + order-reference lookup.
- No SI found after definitive lookup: return `not_found`; the approval orchestrator decides whether this is acceptable for legacy recovery.
- Provider/network failure: throw a sanitized integration error.

### Existing caller compatibility

Shopify cancellation and other existing callers may retain non-strict behavior unless their contract is explicitly tightened and regression-tested.

## 5. Manual SI Retry Contract

Existing failed ERP sync listing, automatic retry, and manual retry must include finance-pending orders.

### Required behavior

- Pending finance approval does not suppress SI failure/retry.
- Retry creates only the submitted unpaid SI.
- Retry does not create a PE while `financialStatus !== "paid"`.
- Active retry lease prevents concurrent attempts.
- Stale `"pending"` claims and legacy `"pending_approval"` placeholders are recoverable.
- Successful retry stores the real SI name; approval remains pending.

## 6. Fulfillment Gate Contract

For payment gateways requiring finance approval:

| Latest approval state | Queue visibility | Fulfillment/print/dispatch |
|---|---:|---:|
| Missing | Blocked | Blocked |
| Pending | Blocked | Blocked |
| Cancelled/invalidated | Blocked | Blocked |
| Rejected | Blocked | Blocked with rejection reason |
| Approved | Allowed subject to existing stage rules | Allowed subject to existing stage rules |

ERP SI presence does not unlock fulfillment.

The gate applies to:

- fulfillment queue queries;
- individual fulfillment actions;
- invoice rendering/printing;
- bulk print/dispatch;
- shared delivered/invoice-complete operations where direct or bulk paths can bypass earlier stages.

## 7. Client UX Contract

Both finance review surfaces must:

- label the order-payment rejection input as required;
- enforce 5–500 trimmed characters for UX;
- preserve the entered reason after a retryable ERP failure;
- show cancellation progress;
- display safe server errors;
- show the recorded rejection reason in history/order details.

Client checks are convenience only; the server remains authoritative.

## 8. Observability Contract

Structured logs/audit entries for rejection include:

- approval ID;
- order ID;
- company/location IDs;
- ERP SI name;
- cancellation outcome or sanitized error;
- reviewer ID;
- rejection reason in permitted audit metadata.

No ERP credentials or raw provider response bodies may be logged or returned.
