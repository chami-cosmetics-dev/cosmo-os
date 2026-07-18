# Feature Specification: Cosmo Return Cancel by Payment Status

**Feature Branch**: `010-cosmo-return-cancel`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "now we have build return order process, when orders came to stores they mark it as return order then merchant can follow up with that order and if customer want it back then rearrange it or cancel request it, now i want change logic little bit, no need all orders send cancel reqest for return cancel request, only paid orders should trigger cancel request if order not paid then merchant grant access cancel it in cosmo os we can canel in the os and cancel it in shopify and erp automatically but in vault os process different they dont have shopify admin api key, then they have to request all orders for finance approvements, keep exsisting process for vault os and i want change it for cosmo os, got it?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cancel unpaid returned orders directly in Cosmo OS (Priority: P1)

In Cosmo OS, when a returned order is unpaid and the customer does not want the order rearranged, an authorized merchant cancels it immediately from the returned-orders workflow. The order is cancelled in Cosmo OS, Shopify, and ERP in the same action — without creating a finance cancel-approval request.

**Why this priority**: This is the core behavior change. Unpaid returns should not wait on finance when Cosmo can cancel Shopify and ERP automatically.

**Independent Test**: Take an unpaid returned order in Cosmo OS, choose Cancel (not Request Cancel), confirm, and verify the order is cancelled in OS, Shopify, and ERP with no pending return-cancel approval.

**Acceptance Scenarios**:

1. **Given** a Cosmo OS returned order whose payment status is unpaid (not paid), **When** an authorized merchant chooses Cancel with a required cancel remark, **Then** the system cancels the order in Cosmo OS, Shopify, and ERP without creating a finance return-cancel approval request.
2. **Given** a successful direct cancel of an unpaid returned order, **When** the merchant views the returned-orders list, **Then** that return is marked solved/cancelled consistently with today’s post-cancel outcome (no pending cancel request remains).
3. **Given** an unpaid returned order in Cosmo OS, **When** the merchant opens cancel actions, **Then** the primary cancel action is direct Cancel (not “Request Cancel”).

---

### User Story 2 - Paid returned orders still require finance cancel approval in Cosmo OS (Priority: P1)

In Cosmo OS, paid returned orders continue to use the existing cancel-request path: the merchant submits a return cancel request with a remark, and finance approves or rejects before cancellation is completed.

**Why this priority**: Paid money requires finance oversight; only unpaid Cosmo returns skip the approval gate.

**Independent Test**: Take a paid returned order in Cosmo OS, request cancel, and confirm a finance return-cancel approval is created and direct cancel is not available.

**Acceptance Scenarios**:

1. **Given** a Cosmo OS returned order whose payment status is paid, **When** an authorized merchant requests cancel with a cancel remark, **Then** a return-cancel finance approval request is created (existing process) and the order is not cancelled yet.
2. **Given** a pending return-cancel approval for a paid Cosmo returned order, **When** finance approves, **Then** cancellation proceeds as today (including linked Shopify/ERP outcomes of the existing approved path).
3. **Given** a Cosmo OS paid returned order, **When** the merchant opens cancel actions, **Then** only Request Cancel is offered — not direct Cancel.

---

### User Story 3 - Vault OS keeps finance approval for every return cancel (Priority: P1)

Vault OS does not have Shopify Admin API credentials, so merchants cannot auto-cancel Shopify from the OS. Vault therefore keeps today’s rule: every return cancel (paid or unpaid) goes through a finance cancel-approval request.

**Why this priority**: Prevents regressing Vault operations and documents the intentional Cosmo-only change.

**Independent Test**: In Vault OS, attempt cancel on both a paid and an unpaid returned order; both create finance return-cancel requests and neither offers Cosmo-style direct cancel.

**Acceptance Scenarios**:

1. **Given** a Vault OS returned order (paid or unpaid), **When** an authorized merchant requests cancel with a cancel remark, **Then** a finance return-cancel approval request is created as today.
2. **Given** Vault OS returned-orders cancel UI, **When** a merchant opens cancel actions, **Then** direct Cancel (auto Shopify/ERP cancel without finance) is not available.
3. **Given** Cosmo OS and Vault OS configurations, **When** the same unpaid returned-order cancel path is exercised in each, **Then** Cosmo cancels directly and Vault still requires finance approval.

---

### User Story 4 - Rearrange and store return marking stay unchanged (Priority: P2)

Store staff still mark orders as returned; merchants still follow up and can rearrange when the customer wants the order again. This feature only changes when cancel requires finance approval versus direct cancel in Cosmo OS.

**Why this priority**: Confirms scope boundary so rearrange and return intake do not regress.

**Independent Test**: Mark a return, rearrange a returned order, and confirm both flows behave as before in Cosmo and Vault.

**Acceptance Scenarios**:

1. **Given** an order returned to store, **When** staff mark it as a return, **Then** it appears in the returned-orders follow-up list as today.
2. **Given** a returned order the customer wants again, **When** the merchant rearranges it, **Then** rearrange (including any existing finance/bank-transfer gates) works as today in both Cosmo OS and Vault OS.

---

### Edge Cases

- Cancel remark missing on direct cancel or request cancel → action is blocked with a clear required-field message (same as today’s request-cancel rule).
- Shopify cancel succeeds but ERP cancel fails (or the reverse) on Cosmo direct cancel → the merchant sees a clear failure, the partial outcome is visible for recovery, and the system does not silently report full success.
- Order is already cancelled / voided / solved → direct cancel and request cancel are not offered again.
- Pending return-cancel approval already exists → merchant cannot create a duplicate request or also run direct cancel for the same return.
- Payment status is ambiguous (e.g. partially paid, refunded, pending) → only fully **paid** uses the finance request path in Cosmo; all other non-paid statuses use direct cancel (see Assumptions).
- Merchant lacks cancel permission → both direct cancel and request cancel are denied.
- Vault OS environment accidentally treated as Cosmo → must not enable direct Shopify cancel when Shopify Admin cancel is unavailable for that deployment.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: In Cosmo OS, when a merchant cancels a **returned** order that is **not paid**, the system MUST cancel the order in Cosmo OS, Shopify, and ERP without creating a finance return-cancel approval request.
- **FR-002**: In Cosmo OS, when a merchant cancels a **returned** order that **is paid**, the system MUST create a finance return-cancel approval request (existing Request Cancel flow) and MUST NOT cancel the order until finance approves.
- **FR-003**: In Vault OS, return cancel MUST continue to require a finance return-cancel approval request for **all** returned orders (paid and unpaid); direct Cosmo-style cancel MUST NOT be available.
- **FR-004**: Cosmo OS MUST determine paid vs not-paid using the order’s financial/payment status: only **paid** triggers the finance cancel-request path; any non-paid status uses direct cancel.
- **FR-005**: Both direct cancel and request cancel MUST require a cancel remark before proceeding.
- **FR-006**: Cosmo OS returned-orders cancel UI MUST present **Cancel** for unpaid returns and **Request Cancel** for paid returns, so merchants can tell which path will run.
- **FR-007**: Vault OS returned-orders cancel UI MUST continue to present **Request Cancel** (finance approval) for all returns.
- **FR-008**: On Cosmo direct cancel, if Shopify or ERP cancellation fails, the system MUST surface a clear error and MUST NOT claim full success; recoverable failure state MUST remain visible to authorized staff.
- **FR-009**: Existing rearrange, return-to-store marking, and finance approve/reject of return-cancel requests MUST remain unchanged except for the Cosmo unpaid direct-cancel branch.
- **FR-010**: Direct cancel and request cancel MUST respect existing authorization rules for returned-order cancel actions.
- **FR-011**: The system MUST prevent duplicate concurrent cancel paths for the same returned order (e.g. pending finance cancel request plus direct cancel).
- **FR-012**: After a successful Cosmo direct cancel, the returned-order follow-up state MUST match the outcome used when finance-approved cancel succeeds today (solved/cancelled, no open cancel request).

### Key Entities

- **Returned order**: An order marked returned to store and tracked in the returned-orders follow-up list.
- **Payment status (paid vs not paid)**: The order’s financial status used to choose Cosmo cancel path; **paid** → finance request; otherwise → direct cancel.
- **Return cancel request**: Finance approval item used for paid Cosmo returns and for all Vault return cancels.
- **Direct cancel**: Cosmo-only action that cancels the order in OS, Shopify, and ERP without finance approval.
- **Operating system deployment**: Cosmo OS vs Vault OS; cancel policy differs by deployment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In Cosmo OS UAT, 100% of unpaid returned-order cancel attempts that succeed cancel the order in OS, Shopify, and ERP with zero finance return-cancel approval records created for those attempts.
- **SC-002**: In Cosmo OS UAT, 100% of paid returned-order cancel attempts create a finance return-cancel approval and do not cancel until finance approves.
- **SC-003**: In Vault OS UAT, 100% of returned-order cancel attempts (paid and unpaid sample of at least 3 each) create finance return-cancel approvals and never offer Cosmo-style direct cancel.
- **SC-004**: Merchants can complete Cosmo unpaid direct cancel (remark + confirm) in under 1 minute for a ready returned order.
- **SC-005**: Rearrange and return-to-store marking pass their existing acceptance checks unchanged in both Cosmo OS and Vault OS.
- **SC-006**: When Cosmo direct cancel partially fails (Shopify or ERP), 100% of tested failure cases show a visible error and do not report full success.

## Assumptions

- Scope is the **returned-orders cancel** path only (merchant follow-up after store marks return). Other cancel/approval types (order cancel approval, finance prepaid approval, etc.) are unchanged.
- **Paid** means the order’s financial status is fully `paid`. Partially paid, pending, unpaid, authorized, voided, refunded, and other non-`paid` values are treated as **not paid** for Cosmo cancel routing (direct cancel).
- Cosmo OS has working Shopify Admin cancel capability; Vault OS does not, which is why Vault keeps finance approval for every return cancel.
- Direct cancel in Cosmo reuses the same end-state expectations as today’s finance-approved return cancel (order cancelled/voided consistently across linked systems), but without the approval wait.
- Rearrange, bank-transfer rearrange gates, and return remark/save flows stay as today.
- Existing permissions that allow return cancel / request cancel continue to gate both paths; no new role is introduced unless planning discovers a gap.
- “Merchant” means authorized returned-orders operators (store/ops staff with cancel permission), not a new persona.
