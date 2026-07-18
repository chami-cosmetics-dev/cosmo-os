# Feature Specification: Create ERP Sales Invoice at Order Arrival for Finance-Approval Orders

**Feature Branch**: `008-sales-report-erp-si-date`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "plan changed — when approval came, now we do NOT create erp SI until approve granted. We can do like this for approvals: create SI for them when order came to OS, but can't go through fulfilment process till approve granted; erp SI created under unpaid. Then our OS sales report and ERP sales report total mismatch solved. After getting finance approvement, erp PE create and invoice complete, and can go through fulfilment process. Also working functions should not break."

## Problem Statement

Orders paid via gateways that need finance approval (KOKO / bank transfer) arrive from Shopify and are counted in the OS sales report on their **arrival day** (they come in as `pending`, which the report already counts). But today the OS does **not** create an ERP Sales Invoice (SI) for these orders until finance approves — which can be a later day. ERP therefore recognizes the sale only on the approval day. The result is a persistent mismatch: the OS daily/MTD sales total (and the SMS and dumps built from it) disagree with ERP's sales report for the same day.

Rather than delay the OS's recognition of the sale, this feature makes **ERP recognize the sale on the same day the order arrives**: an **unpaid** ERP Sales Invoice is created immediately when a finance-approval order is received (exactly as normal orders already get an unpaid SI at arrival), while the order is still blocked from fulfillment until finance approves. On approval, the payment is recorded in ERP (Payment Entry) and the invoice/fulfillment proceed as today. On rejection, the finance user supplies a reason and the unpaid SI is cancelled in ERP (reversing stock). This reconciles the OS and ERP sales reports on the arrival day **without changing any OS reporting, SMS, or dump logic** — so existing working functions are preserved.

## Clarifications

### Session 2026-07-17

- Q: On finance rejection of an order that already has an unpaid ERP SI, what happens to the SI? → A: Finance rejects with a valid reason, then the ERP SI is cancelled/voided (reversing stock).
- Q: Should the arrival-time SI reduce ERP stock immediately, or defer to approval? → A: Reduce stock at arrival, like every other Sales Invoice; rejection/void restores it.
- Q: How to handle the previous spec 008 (opposite approach — delaying OS recognition)? → A: Rewrite spec 008 to this arrival-time-unpaid-SI approach.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unpaid ERP Sales Invoice created when a finance-approval order arrives (Priority: P1)

When a KOKO / bank order arrives from Shopify, the OS immediately creates its ERP Sales Invoice as **unpaid/outstanding** (no payment recorded yet), just like a normal unpaid order does today — so ERP recognizes the sale on the arrival day.

**Why this priority**: This is the core change that makes ERP's sales for the day include the finance-approval orders, which is what reconciles the two reports.

**Independent Test**: Send a KOKO/bank order into the OS. Immediately (before any approval) confirm an ERP Sales Invoice exists for it, dated the arrival day, with an outstanding (unpaid) balance and no Payment Entry.

**Acceptance Scenarios**:

1. **Given** a new finance-approval (KOKO/bank) order is received, **When** the order is processed, **Then** an ERP Sales Invoice is created for it on the arrival day as unpaid/outstanding, with no Payment Entry yet.
2. **Given** the SI is created for a finance-approval order, **When** ERP inventory is inspected, **Then** stock is reduced for the invoiced items at arrival (same as a normal Sales Invoice).
3. **Given** normal (non-approval, e.g. COD) orders, **When** they arrive, **Then** their ERP sync behavior is unchanged from today.
4. **Given** duplicate/concurrent webhooks for the same order, **When** processed, **Then** exactly one ERP Sales Invoice is created (no duplicates).

---

### User Story 2 - Finance-approval orders stay blocked from fulfilment until approved (Priority: P1)

Even though the ERP SI now exists at arrival, a finance-approval order MUST NOT be able to move through the fulfilment process (dispatch, invoice print, bulk dispatch) until finance approval is granted.

**Why this priority**: Creating the SI early must not accidentally unlock fulfilment; the payment still needs finance sign-off before goods move.

**Independent Test**: For a finance-approval order that has its unpaid SI but no approval yet, attempt each fulfilment action and confirm each is blocked with the finance-pending message, and the order does not appear in fulfilment queues.

**Acceptance Scenarios**:

1. **Given** a finance-approval order with an unpaid SI and a pending approval request, **When** a user attempts to fulfil, print the invoice, or bulk-dispatch it, **Then** the action is blocked with a clear "finance approval pending" reason.
2. **Given** the same order, **When** fulfilment queues/lists are viewed, **Then** the order is excluded until approval is granted.
3. **Given** the order later receives approval, **When** fulfilment is attempted, **Then** it is allowed.

---

### User Story 3 - On approval, payment is recorded and the invoice/fulfilment proceed (Priority: P1)

When finance approves a finance-approval order, ERP records the payment (Payment Entry) against the already-existing SI, the invoice is marked complete/paid in the OS, and the order can proceed through fulfilment — matching today's post-approval outcome.

**Why this priority**: Approval must still result in a paid invoice and an unblocked order; otherwise the workflow is broken for approved orders.

**Independent Test**: Approve a finance-approval order that already has an unpaid SI; confirm a Payment Entry is created against that SI (outstanding goes to zero), the order shows paid/invoice-complete, the fulfilment stage advances, and fulfilment is unblocked.

**Acceptance Scenarios**:

1. **Given** an approved finance-approval order with an existing unpaid SI, **When** approval completes, **Then** a Payment Entry is recorded against that SI and the SI's outstanding amount becomes zero.
2. **Given** approval completes, **When** the order is inspected, **Then** it is marked paid / invoice-complete and its fulfilment stage advances as it does today.
3. **Given** approval completes, **When** the SI already existed from arrival, **Then** no second/duplicate SI is created (payment is added to the existing SI).

---

### User Story 4 - On rejection, finance gives a reason and the unpaid SI is cancelled (Priority: P1)

When finance rejects a finance-approval order, the reviewer must provide a rejection reason, and the previously-created unpaid ERP SI is cancelled/voided in ERP (reversing the stock reduction), so ERP does not carry a phantom receivable for a rejected order.

**Why this priority**: Because the SI now exists early, rejection must clean it up; otherwise ERP sales/receivables and stock stay wrong for rejected orders.

**Independent Test**: Reject a finance-approval order that has an unpaid SI, supplying a reason; confirm the ERP SI is cancelled, the reduced stock is restored, and the order remains blocked from fulfilment with the rejection reason visible.

**Acceptance Scenarios**:

1. **Given** a finance-approval order with an unpaid SI, **When** finance rejects it, **Then** a rejection reason is required and recorded.
2. **Given** the rejection is recorded, **When** ERP is inspected, **Then** the order's Sales Invoice is cancelled/voided and the stock it consumed is restored.
3. **Given** the order was rejected, **When** fulfilment is attempted, **Then** it remains blocked (rejected), consistent with today's behavior.
4. **Given** the SI cannot be cancelled automatically (e.g. ERP error), **When** rejection is processed, **Then** the failure is surfaced/logged so an operator can resolve it rather than silently leaving an open SI.

---

### User Story 5 - OS and ERP sales reports reconcile without changing OS reporting (Priority: P1)

With ERP creating the SI on the arrival day, the OS daily/MTD sales report, the Daily Sales SMS, and the report dumps continue to use their existing arrival-day logic and now reconcile with ERP's sales report for the same day — with no change to OS reporting/SMS/dump computation.

**Why this priority**: Reconciliation is the whole point; achieving it without touching working reporting/SMS/dump code is what keeps existing functions safe.

**Independent Test**: For a day containing finance-approval orders, compare the OS sales total (dashboard, SMS, dump) with ERP's sales report for that day and company; they reconcile within tolerance, and the OS reporting code is unchanged.

**Acceptance Scenarios**:

1. **Given** a day with finance-approval orders, **When** the OS sales total and ERP's sales report for that day/company are compared, **Then** they reconcile within rounding tolerance.
2. **Given** the existing Daily Sales SMS and report dumps, **When** they run after this change, **Then** their computation logic is unchanged and their totals now match ERP.
3. **Given** a rejected order whose SI was cancelled, **When** the day's ERP sales report is produced, **Then** that order is not counted as a sale in ERP (matching its removal from the reconciled picture).

---

### User Story 6 - Existing working functions are unaffected (Priority: P2)

COD/normal order sync, other approval types (delivery payment, returns, payment-method-change, cancel), return/credit-note flows, Shopify-cancel voiding, SMS delivery/logging/resend, dashboards, and dumps all continue to work as today.

**Why this priority**: The change is scoped to when the finance-approval SI is created and to rejection cleanup; nothing else should regress.

**Independent Test**: Exercise a COD order, a return, a Shopify-cancelled order, and an SMS/dump run; confirm each behaves exactly as before the change.

**Acceptance Scenarios**:

1. **Given** a non-approval order, **When** it arrives, **Then** its ERP sync is identical to today.
2. **Given** existing return, payment-method-change, and cancel approval flows, **When** they run, **Then** they behave as today.
3. **Given** a Shopify-cancelled finance-approval order that already had an unpaid SI, **When** the cancellation is processed, **Then** the existing cancel/void path voids the SI (no double-void, no orphaned SI).

---

### Edge Cases

- **SI creation fails at arrival** for a finance-approval order: the existing sync-failure/retry machinery applies; the order still shows finance-pending and stays blocked from fulfilment until an SI exists and approval is granted.
- **Rejection when stock already reduced**: cancelling the SI restores stock; if cancel fails, the failure is surfaced for manual resolution.
- **Re-approval / payment-method-change on KOKO/bank**: must not create a second SI; payment is applied to the existing SI.
- **Shopify cancels the order before approval**: the existing cancel path voids the already-created SI once, without conflicting with the rejection path.
- **Order arrives just before midnight, webhook processed after midnight**: SI posting day may differ from the Shopify order day by one day (a pre-existing boundary condition for all orders); treated as an accepted minor residual, not introduced by this change.
- **Voided/negative-total orders**: continue to be treated as voided and are not invoiced.
- **Duplicate approval webhooks/actions**: approval records the PE once; no duplicate Payment Entries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a finance-approval (KOKO/bank) order is received, the system MUST create its ERP Sales Invoice immediately as unpaid/outstanding (no Payment Entry), dated the arrival day, using the same SI creation behavior as existing unpaid orders.
- **FR-002**: The arrival-time Sales Invoice MUST reduce ERP stock for the invoiced items, identical to a normal Sales Invoice.
- **FR-003**: A finance-approval order MUST remain blocked from all fulfilment actions (dispatch, invoice print, bulk dispatch) and excluded from fulfilment queues until finance approval is granted, even though its SI already exists.
- **FR-004**: The fulfilment block MUST be driven by the pending finance-approval state (not by the absence of an SI), so that creating the SI early does not unlock fulfilment.
- **FR-005**: On finance approval of a finance-approval order that already has an SI, the system MUST record the payment as an ERP Payment Entry against that existing SI (bringing outstanding to zero) without creating a second SI.
- **FR-006**: On approval, the order MUST be marked paid / invoice-complete and its fulfilment stage advanced, and fulfilment MUST become allowed — matching today's post-approval outcome.
- **FR-007**: On finance rejection, the reviewer MUST provide a rejection reason, which is recorded.
- **FR-008**: On finance rejection, the system MUST cancel/void the order's ERP Sales Invoice, reversing the stock it consumed.
- **FR-009**: If cancelling the SI on rejection fails, the system MUST surface/log the failure for operator resolution rather than silently leaving an open SI.
- **FR-010**: A rejected order MUST remain blocked from fulfilment, consistent with today's rejected-order behavior.
- **FR-011**: The system MUST NOT create duplicate Sales Invoices for the same order across arrival, retries, approval, or re-approval; exactly one SI per order lifecycle (until cancelled).
- **FR-012**: OS sales reporting logic (daily/MTD computation, Daily Sales SMS body and all its send paths, dashboards, and report dumps) MUST remain unchanged; reconciliation is achieved by ERP creating the SI on the arrival day, not by changing OS reporting.
- **FR-013**: For any given day and company, the OS sales total MUST reconcile with ERP's own sales report for that day within rounding tolerance, including finance-approval orders.
- **FR-014**: Rejected orders whose SI is cancelled MUST NOT be counted as sales in ERP for that day.
- **FR-015**: The behavior MUST apply to both Cosmo OS and Vault OS, each against its own company/tenant and ERP company, with no cross-tenant mixing.
- **FR-016**: All other existing flows MUST continue to work unchanged: non-approval (COD) sync, return/credit-note flows, payment-method-change and other approval types, Shopify-cancel voiding, and SMS/dump/dashboard behavior.

### Key Entities

- **Order**: The Shopify-originated sale in the OS. For finance-approval orders it now links to a real (unpaid) ERP Sales Invoice from arrival, instead of a "pending approval" placeholder.
- **ERP Sales Invoice (SI)**: Created unpaid/outstanding at arrival for finance-approval orders (reducing stock); paid via a Payment Entry on approval; cancelled/voided on rejection.
- **ERP Payment Entry (PE)**: The payment record created against the SI only when finance approves.
- **Finance Approval Request**: The approval step that gates fulfilment (and now PE creation) for KOKO/bank orders; approval → PE + invoice complete, rejection → reason + SI cancel.
- **Sales Report (logical)**: OS daily/MTD totals, SMS body, and dumps — unchanged in logic, now reconciled with ERP because the SI exists on the arrival day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a controlled day containing finance-approval orders, the OS daily sales value and count reconcile with ERP's sales report for that day within a rounding tolerance of 1 currency unit.
- **SC-002**: 100% of newly received finance-approval orders have an unpaid ERP Sales Invoice dated their arrival day, before any approval action.
- **SC-003**: 100% of finance-approval orders remain unfulfillable (blocked in queues and actions) until approval is granted, despite having an SI.
- **SC-004**: On approval, 100% of these orders receive a Payment Entry against the existing SI (outstanding → 0) with no duplicate SI created.
- **SC-005**: On rejection with a reason, 100% of these orders have their SI cancelled and stock restored (or a logged failure requiring manual action), and none are counted as ERP sales.
- **SC-006**: No regressions: existing COD sync, returns, other approvals, Shopify-cancel voiding, and SMS/dump/dashboard outputs pass their acceptance checks unchanged.
- **SC-007**: The reconciliation holds for both Cosmo OS and Vault OS, verified for at least one representative day per tenant.

## Assumptions

- "Unpaid SI at arrival" reuses the system's existing behavior for non-`paid` orders: the SI is submitted and outstanding, stock is reduced, and no Payment Entry is created until payment is recorded. Only the finance-approval branch changes (it no longer defers SI creation).
- The fulfilment block for finance-approval orders is anchored on the pending finance-approval state, so an existing SI does not by itself permit fulfilment.
- Approval continues to record the payment via the existing prepaid Payment Entry path against the existing SI; the previous "create SI on approval" behavior collapses to "create PE on approval" because the SI already exists.
- Rejection requires a reason (new requirement for this flow) and triggers cancellation of the existing SI using the system's existing SI-cancel capability; a cancel failure is treated as an operator-actionable error, not a silent success.
- OS sales attribution stays on the arrival day exactly as today (orders counted while `pending`/`paid`); no reporting, SMS, or dump computation changes — this is what preserves "working functions."
- Asia/Colombo day boundaries, LKR formatting, voided/cancelled exclusions, per-location codes, and the 09:00 Asia/Colombo Daily Sales SMS schedule from specs `003-admin-daily-sales-sms` and `004-vault-sales-sms-logs` remain the baseline.
- The rare arrival-vs-posting day boundary (order created just before midnight, SI posted just after) is an accepted pre-existing residual affecting all orders, not something this feature introduces or must eliminate.
- Both tenants keep separate company/ERP data; reconciliation is always per company/tenant.
