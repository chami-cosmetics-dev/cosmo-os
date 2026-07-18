# Feature Specification: Delivery & CC Checkout Invoice Complete

**Feature Branch**: `011-delivery-cc-invoice-complete`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "when we approve delivery payment here it mark erp SI as paid but not mark as invoice completed in OS, also another thing we have cc checkout orders no? they ara paid via gateway orders, like koko and bank transfer orders i want mark cc checkout orders invoice complete at order received stage but fulfilment process allowed even innvoice complete when invoice complete PE should create also"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delivery payment approval completes invoice in OS (Priority: P1)

A finance or operations user approves a delivery collection payment (COD, card on delivery, cash, etc.) from the delivery payments queue. Today the linked ERP Sales Invoice becomes paid, but the order in OS stays short of **invoice complete**. After this change, the same approval must also mark the order **invoice complete** in OS so OS and ERP stay aligned.

**Why this priority**: Staff already treat delivery-payment approval as “payment settled”; leaving OS without invoice complete creates a false backlog on invoice-complete work and mismatched OS vs ERP status.

**Independent Test**: Approve one pending delivery collection for an order with a linked unpaid SI; confirm ERP SI is paid **and** the OS order is invoice complete.

**Acceptance Scenarios**:

1. **Given** a delivery collection awaiting approval with a linked ERP Sales Invoice, **When** an authorized user approves the delivery payment, **Then** the ERP SI is marked paid (existing behavior) **and** the OS order is marked invoice complete.
2. **Given** delivery payment approval succeeds for payment in ERP, **When** staff view the order in OS, **Then** it does not remain in an “awaiting invoice complete” state for that same settled payment.
3. **Given** delivery payment approval fails or cannot settle payment in ERP, **When** the user attempts approval, **Then** the OS order is **not** marked invoice complete solely from that failed approval.

---

### User Story 2 - CC Checkout invoice complete at order received with PE (Priority: P1)

CC Checkout orders are prepaid via the payment gateway (same prepaid class as KOKO and bank transfer). When such an order reaches the **order received** stage in OS, the system must mark it **invoice complete** and create the ERP Payment Entry (PE) against the linked Sales Invoice — without waiting for delivery-payment approval or a post-delivery invoice-complete queue step.

**Why this priority**: Prepaid gateway orders are already paid; delaying invoice complete until delivery collection or later stages causes wrong queues (e.g. CC Checkout appearing as delivery collection) and missing or late PEs.

**Independent Test**: Place or use a CC Checkout test order through order received; confirm OS invoice complete, ERP PE present (or visible failure), and order still appears in the next fulfillment steps.

**Acceptance Scenarios**:

1. **Given** a new CC Checkout order with a linked ERP Sales Invoice, **When** it reaches order received in OS, **Then** the order is marked invoice complete in OS and an ERP PE is created for the CC Checkout payment path (or a visible PE failure is recorded if ERP rejects).
2. **Given** a CC Checkout order already invoice complete with PE done at order received, **When** staff continue fulfillment, **Then** the order does **not** require a second manual invoice-complete action for the same payment.
3. **Given** PE creation fails at order received for a CC Checkout order, **When** the attempt completes, **Then** authorized users see a PE failure and can retry — the system does not silently claim invoice complete success with no PE and no failure record when a PE was required.

---

### User Story 3 - Fulfilment continues after early invoice complete (Priority: P1)

Orders that become invoice complete early (especially CC Checkout at order received, and delivery-collection orders once payment is approved) must still move through the normal fulfillment pipeline (print, packing, dispatch, deliver, etc.). Invoice complete must mean “payment settled / PE handled,” not “fulfillment finished.”

**Why this priority**: Blocking fulfillment after early invoice complete would stop warehouse and delivery work for prepaid and settled orders.

**Independent Test**: Take a CC Checkout order marked invoice complete at order received through at least print → dispatch (or the product’s equivalent next stages); confirm stages advance without being forced back to invoice-complete-only.

**Acceptance Scenarios**:

1. **Given** a CC Checkout order already invoice complete at order received, **When** fulfillment staff perform subsequent stage actions, **Then** those stages are allowed and the order progresses toward delivery.
2. **Given** an order marked invoice complete via delivery payment approval, **When** any remaining fulfillment work still applies, **Then** invoice complete does not block completing that work (and does not reopen a duplicate invoice-complete obligation for the same payment).
3. **Given** an order that is invoice complete early, **When** operations review queues, **Then** it does not appear as needing invoice complete again for that same settled payment, while still appearing in the correct open fulfillment stages.

---

### Edge Cases

- Delivery payment approval when the ERP SI is already fully paid: still mark OS invoice complete if not already; do not create a duplicate PE.
- Delivery payment approval when no linked ERP SI exists: surface failure; do not mark OS invoice complete as if payment settled.
- CC Checkout at order received when SI already fully paid: mark OS invoice complete without creating a duplicate PE.
- CC Checkout at order received with no linked SI yet: surface a clear failure / PE failure path; do not pretend PE succeeded.
- Order already invoice complete in OS before delivery payment approval: approval must not regress fulfillment stage or re-queue invoice complete for the same payment.
- Non–CC Checkout prepaid paths (KOKO, bank transfer, WebXPay): unchanged by this feature unless they already share the same prepaid rules — this feature targets delivery-payment OS sync and CC Checkout early complete.
- COD / card-on-delivery / cash delivery collections: invoice complete happens on **delivery payment approval**, not at order received.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an authorized user successfully approves a delivery collection payment that settles the linked ERP Sales Invoice, the system MUST also mark the related OS order as invoice complete.
- **FR-002**: Delivery payment approval MUST NOT mark the OS order invoice complete if ERP payment settlement did not succeed for that approval attempt.
- **FR-003**: For CC Checkout (gateway-prepaid) orders, when the order reaches the **order received** stage, the system MUST mark the order invoice complete in OS.
- **FR-004**: For CC Checkout orders marked invoice complete at order received, the system MUST attempt to create the ERP Payment Entry against the linked Sales Invoice using the CC Checkout payment path rules.
- **FR-005**: When a PE is required for that CC Checkout invoice-complete attempt and ERP does not create it, the system MUST record a visible PE failure and allow retry — it MUST NOT leave a silent “invoice complete / all good” state with no PE and no failure record.
- **FR-006**: If the linked SI is already fully paid in ERP, invoice-complete / PE attempts MUST NOT create an additional PE and MUST treat payment as already satisfied.
- **FR-007**: Orders that are invoice complete before fulfillment ends (CC Checkout at order received, or after delivery payment approval) MUST still be allowed to proceed through remaining fulfillment stages.
- **FR-008**: An order that is already invoice complete for a settled payment MUST NOT be required to complete invoice complete again for that same payment (no duplicate invoice-complete queue obligation).
- **FR-009**: Non–CC Checkout delivery-collection payment types (e.g. COD, card on delivery, cash) MUST continue to settle payment via delivery payment approval; they MUST NOT be auto–invoice-completed at order received solely because of this feature.

### Key Entities

- **Order (OS)**: Fulfillment stage (including order received and invoice complete), payment method (including CC Checkout), link to ERP Sales Invoice, PE failure state if any.
- **Delivery collection / delivery payment**: Rider-collected or delivery-time payment awaiting finance/ops approval; approval today pays the ERP SI.
- **ERP Sales Invoice**: Linked invoice that becomes paid when delivery payment is approved or when a PE is posted.
- **ERP Payment Entry (PE)**: Payment recorded against the Sales Invoice for the chosen / mapped payment mode.
- **CC Checkout order**: Gateway-prepaid order type analogous to other prepaid gateways (KOKO, bank transfer), targeted for early invoice complete at order received.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of successful new delivery payment approvals that settle the ERP SI, the related OS order is invoice complete after the same approval (no OS/ERP paid mismatch for that action).
- **SC-002**: For 100% of new CC Checkout orders that reach order received with a PE required, either a PE exists on the linked SI or a visible PE failure is recorded from that invoice-complete attempt (no silent gaps).
- **SC-003**: In verification of at least 5 CC Checkout orders invoice-completed at order received, staff can advance at least the next two fulfillment stages without being blocked by invoice-complete status.
- **SC-004**: In verification of at least 5 successful delivery payment approvals, none of those orders remain listed as needing invoice complete for the same settled payment.
- **SC-005**: Sample COD / card-on-delivery orders are not auto–invoice-completed at order received; they only become invoice complete after successful delivery payment approval (or the existing post-delivery path where that still applies).

## Assumptions

- “Approve delivery payment” refers to the existing delivery collections / delivery payments approval action that already marks the ERP Sales Invoice as paid.
- “Invoice complete in OS” means the same business status used elsewhere in fulfillment (order no longer awaiting invoice-complete for that payment), including any related financial status the product already sets on invoice complete.
- “Order received” is the early OS fulfillment stage when the order is first received into fulfillment — not post-delivery.
- CC Checkout is treated as gateway-prepaid, similar in payment class to KOKO and bank transfer, but its **invoice-complete + PE timing** for this feature is specifically **at order received** (earlier than delivery payment approval; not dependent on that queue).
- KOKO, bank transfer, and WebXPay timing rules from prior invoice-complete work remain as already defined unless they already share identical prepaid handling; this feature does not redefine those gateways except by analogy.
- Fulfilment “allowed while invoice complete” means stage progression after payment settlement is not gated on invoice complete being false; warehouse/delivery work continues.
- Historical orders already stuck (ERP paid, OS not invoice complete) may be fixed operationally or via a follow-up repair path; this feature’s primary scope is correct behavior for new approvals and new CC Checkout order-received events.
- Both products sharing this codebase (where delivery payment and CC Checkout exist) should follow the same rules.
