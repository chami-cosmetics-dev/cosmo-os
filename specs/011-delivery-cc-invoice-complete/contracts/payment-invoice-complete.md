# Contract: Delivery & CC Checkout Invoice Completion

**Feature**: `011-delivery-cc-invoice-complete`  
**Date**: 2026-07-18

This document defines behavioral changes to existing authenticated routes and webhook processing. It does not introduce a new public endpoint.

## 1. Delivery-payment approval

**Endpoint**: `PATCH /api/admin/approvals/{id}`  
**Request**:

```json
{
  "action": "approve",
  "note": "optional reviewer note"
}
```

**Existing security contract**:
- Require `finance.approvals.manage`.
- Validate `{id}` with the existing CUID/UUID schema.
- Validate the body and note length with the existing Zod schema.
- Enforce reviewer location scope.
- Require a pending approval and protect concurrent review.

### Successful delivery settlement

Applicable when `ApprovalRequest.type = delivery_payment_approval`.

ERP outcome must be one of:
- `created`: submitted Payment Entry created against the linked SI.
- `already_paid`: linked SI has no outstanding amount; no duplicate PE created.

OS outcome:
- Approval is approved with reviewer audit fields.
- `Order.financialStatus = "paid"`.
- `Order.invoiceCompleteAt` is set if absent.
- `Order.invoiceCompleteById` records the reviewer where applicable.
- A physically delivered order closes at `fulfillmentStage = "invoice_complete"` and `fulfillmentStatus = "fulfilled"`.
- PE failure fields are cleared only after confirmed success.
- Response clearly reports approval success and ERP settlement outcome.

### Failed delivery settlement

Examples:
- No linked/submitted SI.
- Missing company/location ERP configuration.
- Required MOP cannot resolve.
- ERP rejects or times out creating the PE.

Required outcome:
- The order is not falsely marked invoice complete or paid from this failed attempt.
- The approval is not returned as a clean successful settlement.
- `erpPeSyncError`, `erpPeSyncFailedAt`, and resolved/selected `erpPeSyncMop` are recorded when an order is available.
- Response includes a user-facing ERP settlement error.
- A retry path remains available without duplicate PE risk.

### Idempotency and concurrency

- Concurrent reviewers must not produce multiple PEs.
- An SI with `outstanding_amount <= 0` returns `already_paid`.
- A prior approved approval alone is not sufficient proof that ERP settlement succeeded.
- Repeating an already-successful action must not regress fulfillment or reopen invoice complete.

## 2. Shopify CC Checkout order-received processing

**Endpoint**: `POST /api/webhooks/shopify/orders`  
**Trigger**: Shopify order create/update processing for a paid order whose normalized gateway is CC Checkout.

**Existing security/validation contract**:
- Preserve Shopify webhook authenticity checks.
- Preserve payload validation and order upsert behavior.
- Preserve location-scoped ERP configuration.

### Canonical classification

The CC Checkout class includes case-insensitive/common-separator variants:
- `cc`
- `cc checkout`
- `cc_checkout`
- `cc-checkout`

It maps to the configured WebXPay ERP mode of payment. Other gateway mappings remain unchanged.

### Successful ERP payment outcome

After ERP SI creation/linking:
- Create a submitted PE using the configured WebXPay MOP, or accept `already_paid`.
- Set `Order.financialStatus = "paid"`.
- Set `Order.invoiceCompleteAt`.
- Do not set a terminal physical stage at order received.
- Keep `fulfillmentStatus` open and retain the current physical `fulfillmentStage`.
- Clear PE failure fields only after confirmed success.

Webhook retries/order updates are idempotent: an already-paid SI does not receive another PE, and an existing invoice-completion timestamp is retained.

### Failed ERP payment outcome

- Missing SI, required MOP/configuration, or ERP rejection must not silently skip.
- Record visible PE failure fields.
- Do not claim clean invoice completion without a PE/already-paid confirmation.
- Preserve the order so authorized staff can review and retry.
- Return/record processing status consistently with existing webhook retry policy; do not create duplicate OS orders.

## 3. Fulfillment actions and queue data

**Existing endpoint family**: `POST /api/admin/orders/{id}/fulfillment` and order page-data endpoints.

Contract:
- A CC Checkout order with `invoiceCompleteAt` set and a nonterminal `fulfillmentStage` remains eligible for its physical fulfillment actions.
- Order-received/sample, print, ready-to-dispatch, dispatch, and delivery guards continue to use physical stage and existing permissions.
- The manual invoice-complete queue excludes any order with `invoiceCompleteAt` set.
- Non-CC delivery-collection orders remain excluded from early order-received invoice completion.
- After physical delivery, an order already carrying `invoiceCompleteAt` may close terminally without creating another PE.

## 4. Failed Payment Entry list and retry

**List endpoint**: `GET /api/admin/orders/failed-erp-syncs?kind=payment_entry`  
**Retry endpoint**: `POST /api/admin/orders/{id}/retry-erp-pe-sync`

### Eligibility

Include:
- Existing terminal invoice-complete PE failures.
- CC Checkout PE failures while the physical fulfillment stage is nonterminal.

Exclude:
- Voided/cancelled orders.
- Orders outside the authorized user's location scope.
- Orders with no PE failure/repair condition.

### Retry request

Use the existing optional MOP override contract and server-side validation. The server resolves and validates location configuration; the client cannot authorize or define arbitrary ERP behavior.

### Retry outcomes

- `created` or `already_paid`: establish/retain invoice completion, set paid, clear `erpPeSync*`, preserve nonterminal physical stage when fulfillment is still open.
- Failure: refresh error, failure timestamp, and MOP; return a clear error.
- Retry never creates a duplicate PE for an already-paid SI.

## 5. Response/UI expectations

Admin surfaces must distinguish:
- Payment approved and PE created.
- Payment approved because SI was already paid.
- ERP payment failed; invoice completion not confirmed; retry required.

No flow may report a clean successful invoice completion while a required PE is absent and no visible failure is recorded.
