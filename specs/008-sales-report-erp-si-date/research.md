# Phase 0 Research: Arrival-Time ERP SI for Finance-Approval Orders

**Feature**: `008-sales-report-erp-si-date`  
**Date**: 2026-07-18

## Decision 1: Reuse the existing submitted, unpaid Sales Invoice path

**Decision**: KOKO/bank orders will create a submitted ERP Sales Invoice during Shopify webhook processing through the same `syncOrderToERPNext` path used by other orders. The SI keeps `docstatus: 1` and `update_stock: 1`; because the order is still financially `pending`, no Payment Entry is created.

**Rationale**:

- The existing SI path already creates an outstanding invoice and reduces stock.
- ERP recognizes the sale on the order-arrival day without changing OS dashboards, Daily Sales SMS, or report dumps.
- Reusing the current mapping preserves gateway, customer, warehouse, item, tax, and company contracts.

**Alternatives considered**:

- **Create an ERP draft SI**: rejected because a draft does not provide the required submitted-sale and stock behavior.
- **Change OS reports to use SI creation date**: rejected by the revised feature direction and would require risky changes across every reporting surface.
- **Build a separate finance-order SI creator**: rejected because it would duplicate the existing ERP mapping.

## Decision 2: Create the pending approval before starting ERP synchronization

**Decision**: For a new non-voided approval-required order, synchronously create or retrieve the pending `ORDER_PAYMENT_APPROVAL`, then claim and run normal SI synchronization. Do not write the `"pending_approval"` placeholder for new orders.

**Rationale**:

- Once a real SI replaces the placeholder, the pending approval is the authoritative fulfillment gate.
- Awaiting approval creation closes the temporary window where an order has a real SI but no approval row.
- Existing order and approval uniqueness constraints provide duplicate protection.

**Alternatives considered**:

- **Fire-and-forget approval creation**: rejected because failure or delay could expose the order to fulfillment.
- **Keep `"pending_approval"` while also storing the real SI**: impossible with the current single invoice-ID field.
- **Add a duplicated approval status to `Order`**: rejected because it introduces schema/migration and synchronization risks without being necessary.

## Decision 3: Approval state—not ERP invoice presence—controls fulfillment

**Decision**: Pending, cancelled, missing, or rejected payment approval blocks fulfillment; only the latest approved payment approval unlocks it. Placeholder checks are removed from active gating, while placeholder recognition remains for legacy records.

**Rationale**:

- Finance orders now have a valid SI before approval.
- Action guards already consult the latest approval request.
- Rejected orders must never become queue-visible simply because their approval is no longer pending.

**Alternatives considered**:

- **Gate on SI absence or placeholder**: rejected because every new finance order now has a real SI.
- **Block if any historical rejection exists**: rejected because a later approved reapproval would remain blocked forever.

## Decision 4: A missing SI prevents approval from completing

**Decision**: Finance approval requires a real ERP SI ID. If SI creation is absent, failed, or currently leased/in progress, return a retryable conflict and leave the approval pending. The existing SI retry action/automation must create the unpaid SI first. Approval does not create a late SI for new records.

**Rationale**:

- Creating the SI only when approval is clicked—possibly the next day—would recreate the original OS/ERP daily-sales mismatch.
- The order must remain blocked until both the submitted SI and finance approval are valid.
- Pending finance approvals must therefore participate in failed-SI listing and automatic/manual retry.

**Alternatives considered**:

- **Synchronously create a missing SI during approval**: rejected because the SI posting date could be later than the OS sale date.
- **Approve first and repair ERP asynchronously**: rejected because it can unlock fulfillment without a valid SI.
- **Permanently fail the order**: rejected because existing retry machinery can recover transient ERP failures.

## Decision 5: Approval creates only the Payment Entry

**Decision**: After confirming a real SI exists, approval updates the OS payment/invoice-complete state and invokes the existing finance-approved prepaid Payment Entry synchronization against that SI. It must not create a second SI.

**Rationale**:

- `runPostApprovalErpSync` already detects an existing SI and can apply the PE.
- ERP outstanding amount checks provide sequential retry protection.
- This preserves payment-method mapping and current post-approval stage transitions.

**Alternatives considered**:

- **Replace the SI during approval**: rejected because it would duplicate or redraft the sale.
- **Embed payment in the arrival SI**: rejected because finance has not approved the payment.

## Decision 6: Reject only after strict, idempotent ERP cancellation

**Decision**: `ORDER_PAYMENT_APPROVAL` rejection requires a trimmed reason of 5–500 characters. The submitted SI must be cancelled before the approval commits as rejected. Cancellation treats an already-cancelled SI as success. If ERP cancellation fails, return a safe retryable `502` response and leave the approval pending.

**Rationale**:

- A rejected approval with an open SI would leave a false receivable and consumed stock.
- Leaving the approval pending preserves the fulfillment block and allows the same action to be retried.
- Idempotent cancellation handles ambiguous ERP responses where cancellation succeeded but the caller timed out.

**Concurrency approach**:

- Serialize approve/reject for the same pending approval with a database row lock or equivalent conditional claim.
- Recheck `status = "pending"` before side effects.
- For rejection, hold the serialization boundary across strict ERP cancellation and the final status/order update. This is acceptable for a low-volume finance action and avoids adding a new durable `rejecting` state.
- If ERP cancellation succeeds but the database commit fails, retry sees the already-cancelled SI and can safely finish.

**Alternatives considered**:

- **Mark rejected before ERP cancellation**: rejected because later retry is blocked and the UI would falsely show cleanup as complete.
- **Mark rejected and log a cancellation failure**: rejected because fulfillment/report state and ERP state diverge.
- **Add a `rejecting` status**: rejected for this scope because it requires schema/state-machine changes and stale-claim recovery.
- **Create a credit note**: rejected because the user selected cancellation/void and the invoice is unpaid.

## Decision 7: Rejection voids the OS order

**Decision**: After SI cancellation succeeds, set the OS order's `financialStatus` to `voided`, record the rejection reason/reviewer/time, and keep fulfillment blocked.

**Rationale**:

- ERPNext excludes cancelled (`docstatus = 2`) SIs from the original posting day's sales report.
- OS dashboard and Daily Sales SMS eligibility includes `pending` and `paid` but excludes `voided`.
- Without the OS void transition, the original mismatch would reappear for rejected orders.

**Alternatives considered**:

- **Leave the OS status as `pending`**: rejected because OS would continue counting a sale ERP removed.
- **Delete the order**: rejected because it destroys audit history and breaks related workflows.

## Decision 8: Extend ERP cancellation with a strict mode/result

**Decision**: Enhance the current cancellation helper to optionally require valid ERP configuration and a definitive invoice result. Return an outcome such as `cancelled`, `already_cancelled`, or `not_found`; a known invoice that cannot be found or has an unexpected state is an error.

**Rationale**:

- Existing cancellation callers tolerate missing configuration or invoice lookup, but finance rejection cannot silently succeed.
- A structured outcome enables safe UI/API responses and audit logging.
- Existing Shopify-cancel callers can retain current non-strict behavior.

**Alternatives considered**:

- **Create a second cancellation helper**: rejected because it would duplicate ERP lookup/cancel behavior.
- **Treat not-found as unconditional success**: rejected because the order may still have an open ERP invoice under a known ID.

## Decision 9: Keep legacy placeholder compatibility

**Decision**: New orders stop writing `"pending_approval"`, but helpers that distinguish placeholders from real SI names continue recognizing both `"pending"` and `"pending_approval"`. Failed-SI retry may recover legacy `"pending_approval"` rows while approval remains pending.

**Rationale**:

- Existing databases may contain unresolved legacy orders.
- Treating placeholders as real invoice IDs would produce broken ERP links and Payment Entry attempts.
- Compatibility requires no migration or bulk production operation.

**Alternatives considered**:

- **Delete all placeholder handling immediately**: rejected because historical rows would be misclassified.
- **Mandatory production backfill before deploy**: rejected because the retry-compatible path is safer and avoids an irreversible deployment prerequisite.

## Decision 10: No database migration

**Decision**: Use existing `Order` ERP sync/error/lease fields and `ApprovalRequest.reviewNote`, status, reviewer, and timestamps. No Prisma schema change is planned.

**Rationale**:

- Existing fields can represent the required lifecycle.
- Cancel-before-reject avoids needing a durable cancellation-failure state.
- Avoiding a migration reduces multi-database risk under the project constitution.

**Alternatives considered**:

- **Add `erpSiCancelledAt` or `rejecting` state**: potentially useful for a broader workflow redesign, but unnecessary for this feature's invariant and retry model.

## Decision 11: API validation and authorization remain server-enforced

**Decision**:

- Validate approval IDs with `cuidSchema`.
- Keep `finance.approvals.manage`, company scoping, and finance-location scoping.
- Validate `action` and note through Zod; conditionally require a 5–500-character rejection reason for order-payment rejection.
- Client validation mirrors these rules only for immediate feedback.

**Rationale**:

- Meets workspace security rules: never trust the browser.
- Prevents cross-company/location ERP actions.
- Reuses the shared validation library and existing authorization model.

## Decision 12: Reporting, SMS, and dumps remain unchanged

**Decision**: Do not modify sales aggregation, Daily Sales SMS formatting/delivery, dashboard queries, or report dump computation. Validate them through regression tests and cross-system UAT.

**Rationale**:

- OS already attributes `pending`/`paid` sales to Shopify order arrival date.
- Arrival-time submitted SI makes ERP use the same day in the normal case.
- Rejected orders become `voided` in OS and cancelled in ERP, removing them from both recalculated reports.

**Known residual**: An order created just before midnight but processed into ERP after midnight may still have different dates. This pre-existing boundary is explicitly accepted by the specification.

## Decision 13: Testing strategy

**Decision**: Add focused Vitest unit/orchestration coverage for approval gating, webhook SI creation, retries, strict cancellation, approval/rejection ordering, and reporting eligibility. Perform manual end-to-end UAT against representative non-production Cosmo and Vault ERP companies.

**Rationale**:

- Current tests do not cover the complete webhook → SI → approval/rejection lifecycle.
- ERP state, inventory, and Payment Entries require integration verification beyond mocked unit tests.
- Both tenants must be tested without credential crossover.

**Required automated checks**:

- Finance order creates one pending approval and one unpaid submitted SI; no PE before approval.
- Duplicate webhook/retry attempts do not create duplicate SIs.
- SI failures remain retryable while approval is pending.
- Missing/in-progress SI prevents approval and leaves fulfillment blocked.
- Approval creates one PE against the existing SI and unlocks fulfillment.
- Rejection reason validation; cancellation-before-rejection; failure leaves approval pending.
- Successful rejection voids OS order, cancels ERP SI, restores stock, and stays blocked.
- Pending/rejected real-SI orders remain excluded from all queues/actions.
- COD, Shopify cancellation, returns, other approval types, sales aggregation, SMS, and dumps regressions.

## Resolved Unknowns

All Technical Context unknowns are resolved. No constitution violation or schema migration is required. The remaining ERP ambiguity risk (network response lost after PE creation) is pre-existing; serializing approval actions and checking SI outstanding amount reduces but does not completely eliminate provider-side duplicate ambiguity.
