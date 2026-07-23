# Feature Specification: Paid Return Cancel Creates Credit Note

**Feature Branch**: `020-paid-cancel-credit-note`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "there is an issue when we request cancel after return order finance aproval created and when we cancel order in OS its cancel no? but problem is if its paid order then it cant be cancel it should create credit note"

## Problem Statement

When a returned order goes through **Request Cancel** and finance approval is created, completing that cancel in the OS currently performs a normal **cancel** of the order (and its linked sales document). That is correct for unpaid orders. For **paid** orders it is wrong: a paid sale cannot simply be cancelled — finance must reverse it with a **credit note**. Today the paid path still cancels, which breaks accounting and ERP expectations after return-cancel approval.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finance-approved cancel of a paid return creates a credit note (Priority: P1)

A merchant requests cancel on a paid returned order; finance approves. Instead of cancelling the paid sale as if it were unpaid, the system completes the return cancel by creating a credit note against the original paid invoice, and the OS order/return ends in the same voided/returned solved state staff expect after a credit note.

**Why this priority**: This is the defect. Paid money must be reversed via credit note, not cancelled.

**Independent Test**: Take a paid returned order with a pending return-cancel finance approval, approve it, and verify a credit note is created (not a plain cancel of the paid invoice), with the OS order marked voided/returned and the return follow-up solved.

**Acceptance Scenarios**:

1. **Given** a paid returned order with an approved return-cancel finance request, **When** the cancel completion runs, **Then** the system creates a return credit note against the original paid sale, the original sale is marked credit-noted (not left as paid), and the outcome is **not** an unpaid-style cancel of that invoice.
2. **Given** that credit-note completion succeeds, **When** staff view the order and returned-orders list, **Then** the order shows the voided/returned outcome consistent with other credit-noted returns, and the return is solved with no open cancel request.
3. **Given** a paid returned order whose return-cancel approval is still pending, **When** finance has not yet approved, **Then** no credit note is created and the order remains uncancelled.
4. **Given** completion creates a return document but the original paid sale still shows as paid (not credit-noted), **When** the system evaluates success, **Then** completion is treated as failed/incomplete until the original is credit-noted (or an equivalent confirmed credit-note state).

---

### User Story 2 - Unpaid return cancel still cancels (no credit note) (Priority: P1)

When return cancel completes for an order that is **not paid** (including Vault unpaid returns that still go through finance approval, and Cosmo unpaid direct cancel), the system continues to cancel the unpaid sale. It must not create a credit note for unpaid orders.

**Why this priority**: Prevents over-correcting the unpaid path while fixing paid cancels.

**Independent Test**: Complete cancel on an unpaid returned order (finance-approved or Cosmo direct cancel) and confirm cancel/void of the unpaid sale occurs with no credit note created for that cancel.

**Acceptance Scenarios**:

1. **Given** an unpaid returned order whose cancel completes (finance approval or Cosmo direct cancel), **When** completion finishes successfully, **Then** the unpaid sale is cancelled/voided and **no** credit note is created for that action.
2. **Given** a Vault unpaid returned order with a finance return-cancel approval, **When** finance approves, **Then** completion still uses cancel (not credit note), matching unpaid rules.

---

### User Story 3 - Merchants still request cancel; finance still approves or rejects (Priority: P2)

Merchants continue to submit return cancel requests for paid returns (and for Vault returns as today). Finance still approves or rejects those requests. Only the **completion outcome after approval** changes for paid orders (credit note instead of cancel). Rejected requests still leave the order uncancelled and create no credit note.

**Why this priority**: Confirms the request/approval UX stays intact; only the paid completion side-effect changes.

**Independent Test**: Request cancel on a paid return, reject once (no credit note, order intact), then approve a second paid return and confirm credit note completion.

**Acceptance Scenarios**:

1. **Given** a paid returned order, **When** a merchant requests cancel with a remark, **Then** a return-cancel finance approval is created and the order is not yet credit-noted or cancelled.
2. **Given** a pending return-cancel approval for a paid return, **When** finance rejects it, **Then** no credit note is created, the order remains active as today after rejection, and no cancel completion runs.
3. **Given** Cosmo unpaid direct cancel and Vault/Cosmo request-cancel UI rules from the existing return-cancel policy, **When** staff open cancel actions, **Then** those entry rules remain unchanged by this feature.

---

### Edge Cases

- Paid order has no usable original sales invoice identity for credit note → completion fails with a clear error; order is not silently marked cancelled/voided as if success occurred.
- Return credit note is created but original sale remains **paid** (known ERP quirk when outstanding is not applied to the original) → not success; system must finish the credit-note linkage so the original is credit-noted, or fail clearly for retry.
- Credit note creation partially succeeds (e.g. return created but original not credit-noted, or Shopify/OS finalization fails) → staff see a recoverable failure; the system does not report full success until all required steps for that path complete.
- Duplicate approve / retry after a successful credit note → must not create a second credit note for the same return-cancel completion; already-completed outcome is treated as success/idempotent.
- Order already voided/returned from a prior credit note → return-cancel completion does not invent another cancel path; state stays consistent.
- Partially paid / refunded / ambiguous payment status → only fully **paid** uses the credit-note completion path; all other non-paid statuses use cancel (same paid definition as Cosmo return-cancel routing).
- Credit note created in ERP but webhook/sync back to OS is delayed → OS completion still records the credit-note outcome for the return cancel; later sync must not double-void or conflict with that outcome.
- Merchant or finance user lacks permission → request/approve remain denied as today; no credit note side effect.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a **paid** returned order’s return-cancel finance approval is approved and cancel completion runs, the system MUST complete the reversal by creating a **return credit note** against the original paid sale **and** leaving the original sale in a **credit-noted** state (not still paid), and MUST NOT complete it via unpaid-style cancel of that paid invoice.
- **FR-001a**: Paid credit-note completion MUST NOT be treated as successful if only a return document exists while the original sale remains paid; both the return and the original credit-noted state are required.
- **FR-002**: When an **unpaid** (or otherwise non-paid) returned order’s cancel completes — whether via finance approval or Cosmo direct cancel — the system MUST continue to cancel/void the unpaid sale and MUST NOT create a credit note for that cancel.
- **FR-003**: The system MUST use the same paid vs not-paid rule as return-cancel routing: only fully **paid** selects credit-note completion; all other payment statuses select cancel completion.
- **FR-004**: Return-cancel request creation, finance reject, rearrange, and Cosmo unpaid direct-cancel **entry** rules MUST remain unchanged; this feature changes only the **post-approval (or equivalent) completion** for paid returns.
- **FR-005**: After successful paid credit-note completion, the OS order MUST end in the voided/returned state consistent with other credit-noted returns, and the returned-order follow-up MUST be solved with no open return-cancel request.
- **FR-006**: If credit-note creation or a required linked step fails, the system MUST show a clear failure, MUST NOT claim full success, and MUST leave a recoverable state for authorized staff.
- **FR-007**: Retry or duplicate completion of an already successfully credit-noted return cancel MUST be idempotent (no second credit note for the same completion).
- **FR-008**: Finance rejection of a return-cancel request MUST NOT create a credit note and MUST NOT cancel the order.
- **FR-009**: Where Shopify cancellation applies to the return-cancel path today, paid credit-note completion MUST still cancel the Shopify order (or treat already-cancelled as success) in addition to the credit note; failure of either required side MUST surface as incomplete.
- **FR-010**: Completion MUST respect existing authorization for finance approve and return-cancel actions.

### Key Entities

- **Returned order**: Order marked returned and tracked in returned-orders follow-up.
- **Payment status (paid vs not paid)**: Chooses completion path after cancel intent; **paid** → credit note; otherwise → cancel.
- **Return cancel request**: Finance approval that gates paid (and Vault) return cancels before completion.
- **Credit note**: Pair of ERP outcomes for a paid reversal — a **return** document against the original sale, and the **original** sale marked credit-noted (not left paid).
- **Cancel completion**: Post-approval (or Cosmo direct) action that either cancels an unpaid sale or credit-notes a paid sale.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In UAT, 100% of successful finance-approved cancels of **paid** returned orders result in a return credit note **and** an original sale marked credit-noted (not still paid), with zero unpaid-style cancels of those paid invoices.
- **SC-001a**: In UAT, zero successful paid completions leave the original sale status as paid while a return document exists.
- **SC-002**: In UAT, 100% of successful cancels of **unpaid**/non-paid returned orders complete via cancel/void with zero credit notes created for those cancels.
- **SC-003**: After successful paid credit-note completion, 100% of tested orders show voided/returned in OS and solved return follow-up with no pending return-cancel approval.
- **SC-004**: Finance rejection of paid return-cancel requests produces zero credit notes and leaves the order uncancelled in 100% of tested rejects.
- **SC-005**: On forced credit-note or linked-step failure, 100% of tested cases show a visible incomplete/error outcome and do not report full success.
- **SC-006**: Duplicate/retry after a successful paid completion creates no additional credit note in 100% of retry attempts.

## Assumptions

- Scope is the **returned-order cancel completion** path (after request cancel / finance approval, and consistent paid vs unpaid routing). Other approval types and non-return cancels are out of scope unless they share the same paid-completion bug and are fixed only as required to keep one completion rule.
- **Paid** means the order’s financial status is fully `paid`, matching the Cosmo return-cancel policy definition.
- Unpaid cancel continues to mean cancelling/voiding the unpaid sales invoice (or equivalent), not issuing a credit note.
- Credit note creation is performed as part of OS-driven completion of the approved paid return cancel (same operational intent as today’s cancel completion, with the correct ERP document type for paid sales).
- A complete paid credit note means **both** a return document against the original sale **and** the original sale showing as credit-noted. Creating a return alone while the original stays paid is a known incomplete ERP outcome and is not accepted as success.
- Existing credit-note → OS voided/returned behavior and Return SI linking remain the expected end state for paid reversals.
- Cosmo vs Vault entry differences from `010-cosmo-return-cancel` stay in force; this feature does not reopen unpaid Cosmo direct cancel vs finance routing.
- Shopify cancel (where applicable) remains part of successful return-cancel completion alongside the correct ERP document (credit note for paid, cancel for unpaid).
