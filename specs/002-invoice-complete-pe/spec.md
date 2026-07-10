# Feature Specification: Invoice Complete PE Integrity

**Feature Branch**: `002-invoice-complete-pe`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "in vault os we build invoice complete function logic is when we invoice complete in erp side PE should create, for erp PE payment type we choose in our os this function we use both OS, now problem is i can see SV1008360 this order invoice completed in vault os, but in erp PE not created https://supplement-vault-lk-01.m.frappe.cloud/app/sales-invoice/SV100-0695 like that i think more orders can still there, also another issue i can see when KOKO and banktransfer and webxpay order already invoice complete when them get finance approval no then that orders should not come to invoice complete stage again in our OS cuz they already invoice completed and PE created"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invoice complete always creates or clearly fails ERP payment (Priority: P1)

A fulfillment or finance user marks an order invoice complete in Vault OS or Cosmo OS and selects the ERP payment mode. The linked ERP Sales Invoice must receive a Payment Entry (PE) for that mode. If PE creation fails, the user must see that the payment did not land in ERP and must be able to retry — the OS must not look “fully done” while ERP has no PE with no visible failure.

**Why this priority**: Silent missing PEs cause accounting gaps (example: order SV1008360 / SI [SV100-0695](https://supplement-vault-lk-01.m.frappe.cloud/app/sales-invoice/SV100-0695)) and can affect many orders.

**Independent Test**: Mark invoice complete on a test order with a known unpaid SI; confirm PE appears in ERP for the chosen mode, or confirm a visible failure + retry path if ERP rejects.

**Acceptance Scenarios**:

1. **Given** an order with a linked unpaid ERP Sales Invoice, **When** a user marks invoice complete and chooses a payment mode, **Then** ERP has a Payment Entry against that invoice for the chosen mode (or outstanding becomes paid as expected for that flow).
2. **Given** ERP cannot create the PE, **When** the user marks invoice complete, **Then** the OS records a visible PE failure for that order and offers retry — it does not present a silent “all good” state with no PE in ERP.
3. **Given** the same invoice-complete + payment-mode flow, **When** used in Vault OS or Cosmo OS, **Then** PE creation rules behave the same for both products.

---

### User Story 2 - Find and repair orders already invoice-complete without ERP PE (Priority: P1)

Operations can identify orders that are already invoice complete in the OS but still have no PE on the linked ERP Sales Invoice (like SV1008360 / SV100-0695 and any similar backlog), and can create/retry the missing PE without re-running the whole fulfillment journey.

**Why this priority**: Existing gaps must be closable; fixing only new completes leaves historical accounting wrong.

**Independent Test**: From the known example order (and a filtered list of similar cases), run repair/retry until the SI shows PE / paid as expected.

**Acceptance Scenarios**:

1. **Given** an order that is invoice complete in OS with a linked SI that still has outstanding balance and no PE from this flow, **When** an authorized user opens the repair/retry path, **Then** they can create the PE using a selectable payment mode.
2. **Given** multiple such orders exist, **When** operations review the failure/repair list, **Then** those orders are discoverable without manually opening each SI in ERP.

---

### User Story 3 - Correct payment-path rules (prepaid vs normal) (Priority: P1)

Payment paths must stay separated:

**A — Finance-approval required (KOKO, bank transfer, WebXPay)**  
- These orders need finance approval before they continue through the normal fulfillment process.  
- Invoice complete for these orders happens as part of / as a result of **finance approval** (not as a separate “user picks MOP on invoice-complete queue” step for first payment).  
- ERP PE for these orders is created when **finance approves** (with the payment mode rules for that approval path).  
- If such an order is **already** invoice complete (and PE already created when required), a later finance approval must **not** send it back to the invoice-complete queue or restart fulfillment from an earlier stage.

**B — Normal orders (other payment types, no finance approval)**  
- No finance approval required.  
- They go through fulfillment normally (print → … → deliver).  
- After the order is marked **delivered**, a user may mark **invoice complete** in the OS and choose the ERP payment mode.  
- ERP PE for these orders is created at **invoice complete** (user action in OS).

**Why this priority**: Mixing the two paths causes wrong PE timing, duplicate invoice-complete work, and stage regressions after approval.

**Independent Test**: (1) Approve a KOKO/bank/WebXPay order → PE at approval, fulfillment continues without requiring a second invoice-complete PE step for the same payment. (2) Deliver a COD/other order → invoice complete in OS creates PE. (3) Already invoice-complete prepaid + later approval → does not reappear in invoice-complete queue.

**Acceptance Scenarios**:

1. **Given** a KOKO, bank transfer, or WebXPay order awaiting finance approval, **When** finance approves, **Then** the ERP PE is created (or already-paid is respected) as part of that approval path, and the order may proceed in fulfillment without being treated as an unpaid “needs invoice complete” case for that same payment.
2. **Given** a KOKO, bank transfer, or WebXPay order already invoice complete with PE done, **When** finance approval is granted again or late, **Then** the order does not return to the invoice-complete queue or get forced back to an earlier fulfillment stage solely because of that approval.
3. **Given** a normal (non–finance-approval) order marked delivered, **When** a user marks invoice complete and chooses payment mode, **Then** the ERP PE is created (or failure is visible) at that step — no finance approval was required to reach this point.
4. **Given** a finance-approval–required order that is not yet approved, **When** staff attempt to run it through fulfillment as if it were a normal order, **Then** it must not skip the finance-approval gate (existing product rule: approve-needed orders proceed in fulfillment only after finance approve).

---

### Edge Cases

- Order invoice complete in OS but SI already fully paid in ERP (outstanding ≤ 0): do not create a duplicate PE; treat as success / no-op for PE.
- Order invoice complete in OS but no linked ERP Sales Invoice: surface a clear failure; do not pretend PE succeeded.
- Prepaid finance approval when SI still unpaid: create PE on approval; do not leave silent success without PE or failure record.
- Normal-order invoice complete (post-delivery): PE at user invoice complete; same integrity rules as US1.
- Partial PE / wrong mode already on SI: repair path must not blindly create a second full PE without operator awareness (prefer skip if already paid; otherwise show ERP error).
- Bulk invoice complete: applies to the **normal** (user invoice-complete) path; same PE integrity rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For **normal** (non–finance-approval) orders, when a user marks invoice complete after delivery and selects an ERP payment mode, the system MUST attempt to create the corresponding Payment Entry on the linked ERP Sales Invoice (Vault OS and Cosmo OS).
- **FR-002**: For **KOKO, bank transfer, and WebXPay** orders, the system MUST create the ERP PE as part of **finance approval** (not as a separate first-time user invoice-complete PE step for that same payment), and those orders MUST only proceed through fulfillment after finance approval.
- **FR-003**: The system MUST NOT leave a silent “success / invoice complete / approved” state when a PE was required for that path and ERP has no PE and no recorded PE failure for that attempt.
- **FR-004**: When PE creation fails on either path, the system MUST expose the failure to authorized users and allow retry with a selectable payment mode (consistent with existing failed-ERP payment recovery expectations).
- **FR-005**: Authorized users MUST be able to discover orders that are invoice complete in the OS but still missing a required ERP PE (including known cases such as SV1008360 / SV100-0695 and similar backlog).
- **FR-006**: From that discovery/repair path, authorized users MUST be able to create or retry the missing PE without re-dispatching or re-completing the full fulfillment pipeline.
- **FR-007**: For KOKO, bank transfer, or WebXPay orders that are already invoice complete in the OS (and PE already created when required), granting finance approval MUST NOT move them to an earlier fulfillment stage or list them as needing invoice complete again for that payment.
- **FR-008**: If the linked SI is already fully paid in ERP, approval / invoice complete / repair MUST NOT create an additional PE and MUST treat payment as already satisfied.

### Key Entities

- **Order (OS)**: Fulfillment stage (including invoice complete), payment method/gateway, link to ERP Sales Invoice, PE failure state if any.
- **ERP Sales Invoice**: Source invoice (e.g. SV100-0695); outstanding amount indicates whether a PE is still needed.
- **ERP Payment Entry**: Payment recorded against the Sales Invoice for the mode chosen in the OS.
- **Finance approval**: Approval event that must not re-open invoice complete for already-completed prepaid orders.
- **Payment mode selection**: User-chosen ERP mode of payment used when creating the PE (cash, COD, card, bank transfer, KOKO, WebXPay, etc., as configured per location).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of new **user invoice-complete** actions on normal (non–finance-approval) orders where a PE is required, either a PE exists on the linked SI or a visible PE failure is recorded in the same action (no silent gaps).
- **SC-002**: For 100% of new **finance approvals** on KOKO / bank transfer / WebXPay orders where a PE is required, either a PE exists on the linked SI or a visible PE failure is recorded from that approval (no silent gaps).
- **SC-003**: Known example SV1008360 / SI SV100-0695 (and any similar listed backlog found during verification) can be repaired so the SI is paid/PE-present without redoing dispatch/delivery.
- **SC-004**: In verification of at least 5 KOKO / bank transfer / WebXPay orders that were already invoice complete with PE done, finance approval never returns them to the invoice-complete queue or forces an earlier fulfillment stage.
- **SC-005**: Operations can identify missing-PE cases from the OS without manually checking each SI in ERP for the sampled backlog.
- **SC-006**: Same path rules pass smoke checks on both Vault OS and Cosmo OS environments.

## Assumptions

- **Two invoice-complete flows**:
  1. **Finance-approval orders (KOKO / bank transfer / WebXPay)** — On finance approve: mark invoice complete + create PE, then send to **print** and continue fulfillment (dispatch/deliver). After deliver, close fulfillment stage without requiring a second manual invoice-complete for the same payment.
  2. **Other orders** — No finance approval. Full fulfillment → mark delivered → appear on Invoice Complete → staff mark invoice complete manually (PE at that step).
- Invoice complete already supports choosing an ERP payment mode for the normal (user) path; this feature hardens integrity, repair, and stage rules rather than inventing a new payment-mode UI from scratch.
- “PE required” means the linked SI still has outstanding amount greater than zero at the time of the PE attempt (approval or invoice complete / repair).
- Historical missing PEs are fixed via discover + retry/repair, not by automatically creating PEs for every past order without operator action.
- Both Vault OS and Cosmo OS share this codebase behavior; verification should cover both where these flows are used.
- Example SI [SV100-0695](https://supplement-vault-lk-01.m.frappe.cloud/app/sales-invoice/SV100-0695) is the Vault ERP illustration of the silent-missing-PE class of defect.
