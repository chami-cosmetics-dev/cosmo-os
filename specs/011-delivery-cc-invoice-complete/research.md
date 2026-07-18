# Research: Delivery & CC Checkout Invoice Complete

**Feature**: `011-delivery-cc-invoice-complete`  
**Date**: 2026-07-18

## R1 — Represent payment completion independently from physical fulfillment

**Decision**: Use `Order.invoiceCompleteAt` plus `financialStatus = paid` as the payment/invoice-completion marker. Preserve the current nonterminal `fulfillmentStage` for CC Checkout at order received. Only use terminal `fulfillmentStage = invoice_complete` after physical delivery is complete.

**Rationale**: `fulfillmentStage` drives sample, print, dispatch, and delivery queues. Setting it to `invoice_complete` at order received would terminate warehouse flow. The existing prepaid implementation already separates early payment completion from physical progression.

**Alternatives considered**:
- Set CC Checkout directly to terminal `invoice_complete` — rejected because fulfillment filters treat that stage as finished.
- Add a second fulfillment-stage column — rejected because existing `invoiceCompleteAt` already models the needed independent state.

## R2 — Delivery approval settlement boundary

**Decision**: A delivery-payment approval may complete the OS invoice only after `createDeliveryPaymentEntry()` returns `created` or `already_paid`. On success, update the approval and order to paid/terminal invoice complete. On ERP failure, keep the order uncompleted and preserve a visible retryable failure.

**Rationale**: The current route commits approval and `financialStatus = paid` before calling ERP. A later ERP failure leaves OS and ERP inconsistent. The desired business invariant is that successful approval means both ERP settlement and OS invoice completion.

**Alternatives considered**:
- Keep approval successful but record an ERP warning — rejected because FR-002 explicitly forbids OS completion after failed settlement.
- Rely only on the ERP Payment Entry webhook — rejected because it is asynchronous, currently skips orders already marked paid, and does not update invoice completion.

## R3 — Prevent duplicate delivery-approval PEs

**Decision**: Preserve the route's conditional pending-status claim/concurrency guard, but redesign orchestration so a second reviewer cannot create a second PE. ERP `outstanding_amount <= 0` remains the idempotency backstop. Implementation must not treat a prior approved approval as proof of ERP settlement unless the SI is actually paid.

**Rationale**: Moving a remote ERP call before all state coordination can let concurrent reviewers create duplicate entries. Conversely, marking approval complete before ERP causes the current inconsistency. A claimed/serialized approval attempt plus ERP outstanding check provides the required boundary.

**Alternatives considered**:
- Trust the UI to prevent double clicks — rejected because concurrent requests remain possible.
- Add a new database processing state — not selected initially; existing conditional updates and ERP paid detection should be used unless implementation proves them insufficient.

## R4 — CC Checkout PE timing and strictness

**Decision**: Treat normalized CC Checkout as a paid Shopify gateway. During order ingestion, after the linked ERP SI exists, require a configured WebXPay MOP and attempt the PE. Mark OS invoice complete only when PE creation succeeds or the SI is already paid. Record a visible PE failure for missing SI, missing MOP/configuration, or ERP rejection.

**Rationale**: Current SI synchronization already attempts prepaid PE creation for paid CC Checkout orders, but it does not set `invoiceCompleteAt` and may silently skip when no MOP resolves. Tightening the result at this existing boundary avoids a second ERP round trip or duplicate workflow.

**Alternatives considered**:
- Create a finance approval for CC Checkout — rejected because the user requested automatic completion at order received and the gateway is already paid.
- Create PE later at delivery — rejected because it delays accounting and recreates the current wrong queue behavior.

## R5 — Canonical CC Checkout matching

**Decision**: Centralize or reuse a canonical gateway predicate that matches case and common separators for `cc`, `cc checkout`, `cc_checkout`, and `cc-checkout`, while leaving unrelated gateways unchanged. Continue mapping this gateway class to the location's `webxpayMop`.

**Rationale**: Existing code handles case but not separator variants consistently. Ingestion, delivery-approval skipping, ERP MOP resolution, and queue logic must classify the same order identically.

**Alternatives considered**:
- Match only exact `CC CHECKOUT` — rejected because stored gateway variants already appear across the codebase.
- Broaden all gateway normalization globally — rejected as unnecessary scope and a mapping-regression risk.

## R6 — Fulfillment queues after early completion

**Decision**: Update order-received/sample queue predicates so a CC Checkout order with `invoiceCompleteAt` remains eligible for physical fulfillment. Keep the manual invoice-complete queue exclusion based on `invoiceCompleteAt != null`, and keep non-CC behavior unchanged.

**Rationale**: The sample queue currently requires `invoiceCompleteAt: null`, which would hide early-completed CC Checkout orders even if their physical stage remains `order_received`.

**Alternatives considered**:
- Clear `invoiceCompleteAt` until delivery — rejected because OS would not represent the requested early invoice completion.
- Remove the null condition for every order — rejected because it may expose unrelated completed orders; use a targeted early-complete exception.

## R7 — PE failure discovery and retry for nonterminal orders

**Decision**: Extend existing PE failure listing and retry eligibility from terminal-stage-only checks to orders with an invoice-completion attempt/marker and a PE failure, including nonterminal CC Checkout orders. Exclude voided orders and retain permission, location, SI, MOP, and already-paid checks.

**Rationale**: Current failed-PE queries and retry guard require `fulfillmentStage = invoice_complete`. A CC Checkout failure at `order_received` would otherwise be invisible and unrecoverable.

**Alternatives considered**:
- Add a separate CC failure screen — rejected because the existing Failed ERP Syncs → Payment Entry surface already serves this need.
- Automatically retry forever — rejected because configuration or accounting errors need operator visibility and controlled retry.

## R8 — Schema and test strategy

**Decision**: No Prisma schema migration. Reuse `invoiceCompleteAt`, `invoiceCompleteById`, `financialStatus`, `erpPeSyncError`, `erpPeSyncFailedAt`, `erpPeSyncMop`, and existing stage timestamps. Add focused Vitest tests for gateway classification, PE outcomes, approval transitions, queue eligibility, and retry predicates, followed by manual ERPNext validation.

**Rationale**: Existing data fields express all required states and satisfy constitution simplicity. ERP calls need both isolated helper tests and an end-to-end smoke test against configured non-production environments.

**Alternatives considered**:
- Add `paymentCompletionStatus` enum — rejected for this feature because it duplicates existing completion/failure fields and requires coordinated migrations across three databases.

## Resolved unknowns

All planning unknowns are resolved. No `NEEDS CLARIFICATION` items remain.
