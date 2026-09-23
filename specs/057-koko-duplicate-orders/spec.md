# Feature Specification: KOKO Duplicate Order Minimization

**Feature Branch**: `057-koko-duplicate-orders`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Minimize duplicate KOKO orders when two merchants chat the same customer, capture KOKO link generated time before finance approval, group suspected duplicate orders on finance approval (including cross-day and already-approved siblings), and give finance a permission to cancel the losing duplicate in OS and ERP."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture KOKO link generated time before finance (Priority: P1)

Real flow: merchant generates a KOKO payment link in the KOKO portal, sends it to the customer, customer pays, then merchant creates the order in **ERP**; the order syncs into Cosmo OS. In OS it must **not** go straight to finance approval. It first reaches a merchant confirmation step (aligned with sample-adding handling). The merchant pastes or enters the KOKO link **generated time** shown in the KOKO portal, confirms, and only then does the order enter finance approval with that time visible on the approval.

**Why this priority**: Without generated time on the order, finance cannot tell which of two customer payment links was actually paid when both merchants receive the same screenshot.

**Independent Test**: Sync one KOKO order from ERP into OS, enter a link generated time, confirm, and verify the finance approval view shows that time with the order details.

**Acceptance Scenarios**:

1. **Given** a KOKO payment order that has arrived in OS from ERP, **When** the merchant has not yet confirmed link generated time, **Then** the order does not appear as ready for finance approval.
2. **Given** a KOKO order awaiting link-time confirmation, **When** the merchant enters a valid generated date/time and confirms, **Then** the order moves to finance approval and finance can see the recorded link generated time.
3. **Given** a KOKO order awaiting link-time confirmation, **When** the merchant tries to confirm without a generated time, **Then** confirmation is blocked with a clear message that the time is required.
4. **Given** finance is reviewing a pending KOKO approval, **When** they open the approval, **Then** they see customer phone, items, amounts, and the merchant-entered KOKO link generated time so they can match it to the paid link in the KOKO portal.

---

### User Story 2 - Group suspected duplicate KOKO approvals for finance (Priority: P1)

Finance opens the finance approvals view and sees suspected duplicate KOKO orders grouped together when they share the same customer phone and the same item set (same products and quantities), even if different merchants placed them or they were placed on different days within the lookback window. Groups can include a pending approval next to an already-approved sibling so finance can cancel the late duplicate.

**Why this priority**: Matching paid-link time only works if finance can see competing orders together; otherwise they may approve both.

**Independent Test**: Create two KOKO orders for the same phone and same items with different merchants/times; open finance approvals and confirm they appear in one group with both link generated times visible.

**Acceptance Scenarios**:

1. **Given** two pending KOKO approvals for the same customer phone and identical item sets, **When** finance opens approvals, **Then** both appear in one duplicate group (not as unrelated separate rows only).
2. **Given** order A placed today and order B placed tomorrow for the same phone and same items, **When** both are in the lookback window, **Then** they still appear in the same group.
3. **Given** finance already approved order A, **When** order B later enters finance approval for the same phone and same items within the lookback window, **Then** B is shown grouped with the already-approved A so finance can cancel B.
4. **Given** a paid KOKO link whose portal generated time matches only one order in the group, **When** finance approves that matching order, **Then** the other order(s) in the group remain visible for cancel action (not auto-approved).
5. **Given** two KOKO orders for the same phone but different item sets, **When** finance opens approvals, **Then** they are not forced into the same duplicate group.

---

### User Story 3 - Finance cancel duplicate with dedicated permission (Priority: P1)

A finance user who has a new cancel-duplicate permission can cancel the non-matching (or surplus) KOKO order from the grouped finance view. Cancellation applies in Cosmo OS and in ERP so stock, fulfillment, and payment records stay consistent.

**Why this priority**: Grouping without a safe cancel path still leaves duplicate fulfilled/paid risk.

**Independent Test**: With the new permission granted, cancel one order from a duplicate group and verify it is cancelled in OS and ERP; without the permission, cancel is unavailable.

**Acceptance Scenarios**:

1. **Given** a finance user with the new permission and a duplicate group containing one approved and one pending order, **When** they cancel the pending duplicate, **Then** that order is cancelled in OS and ERP and removed from pending approval work.
2. **Given** a finance user without the new permission, **When** they view a duplicate group, **Then** they can still review and approve as today but cannot perform the duplicate-cancel action.
3. **Given** finance cancels a duplicate that was never approved, **When** cancel completes, **Then** no KOKO payment reference is attached to the cancelled order as an approved payment.

---

### User Story 4 - Duplicate notice when confirming link time in OS (Priority: P2)

Orders are created in ERP after payment, so Cosmo OS cannot warn before the merchant generates a KOKO link or before ERP order create. After the order lands in OS, when the merchant is confirming link generated time, OS shows a notice if another KOKO order for the same phone (and matching item set when applicable) already exists within the lookback window—so the merchant can pause, coordinate, or avoid pushing a known duplicate into finance.

**Why this priority**: Cannot block ERP create; still useful signal once OS owns the order, before finance queue grows.

**Independent Test**: With an existing open/pending KOKO order for phone X in OS, sync a second same-phone KOKO order from ERP and open link-time confirmation; confirm a duplicate notice appears.

**Acceptance Scenarios**:

1. **Given** an open or pending-finance KOKO order for phone X already in OS, **When** a second KOKO order for phone X arrives from ERP and the merchant opens link-time confirmation, **Then** they see a clear duplicate notice with enough context (other order/ref, merchant if available, link time if present).
2. **Given** that notice, **When** the merchant still confirms link time, **Then** the order may proceed to finance (notice does not hard-block), and finance grouping remains the resolution path.

---

### Edge Cases

- Merchant generates KOKO link and creates ERP order before OS knows anything: no OS warning at link/ERP create time (out of scope); detection starts when order is in OS.
- Customer pays one link but sends the same screenshot to both merchants: finance uses link generated time vs KOKO portal paid-link time to approve only the matching order and cancel the other.
- Two KOKO links generated in the same minute: finance treats time match as ambiguous and must use additional portal details (amount, reference) before approving; merchants should be able to correct entered time before finance approval if mistyped.
- Orders same phone and same items but different payment methods (e.g. one COD, one KOKO): not grouped as KOKO duplicates.
- Partial item overlap (shared some SKUs but not identical sets): not grouped as full duplicates under default rules.
- One order already cancelled: it may still appear in historical group context when useful, but does not block approving the remaining valid order.
- Lookback window exceeded: older orders are not auto-grouped; finance can still search by phone manually.
- Merchant enters wrong generated time: they can edit until finance has approved; after approval, only finance correction/cancel paths apply.
- ERP cancel fails: OS must not silently report success; finance sees failure and can retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require a KOKO link generated date/time on KOKO payment orders before those orders enter the finance approval queue.
- **FR-002**: Merchants MUST be able to enter/confirm the KOKO link generated time during the pre-finance merchant stage (sample-adding / order confirmation handling) and MUST NOT skip this for KOKO payment orders.
- **FR-003**: Finance approval views for KOKO MUST display the recorded link generated time alongside customer phone, merchant, items, and amount.
- **FR-004**: Finance approvals MUST group suspected duplicate KOKO orders that share the same customer phone number and the same item set (identical product identities and quantities, line order irrelevant).
- **FR-005**: Duplicate grouping MUST include orders from different merchants and MUST include orders placed on different calendar days when all members fall within the configured lookback window (default: 30 days from the newest order in the candidate set).
- **FR-006**: Duplicate groups MUST be able to include already-approved KOKO orders together with later pending siblings so finance can cancel the late duplicate.
- **FR-007**: Approving one order in a duplicate group MUST NOT auto-approve sibling orders; finance MUST explicitly approve or cancel each.
- **FR-008**: System MUST provide a dedicated permission controlling finance cancellation of duplicate KOKO orders (OS + ERP). Users without that permission MUST NOT perform that cancel action.
- **FR-009**: When finance cancels a duplicate under FR-008, the system MUST cancel the order in Cosmo OS and in ERP (or surface a clear failure if ERP cancel cannot complete).
- **FR-010**: When a merchant confirms KOKO link generated time in OS, system MUST show a duplicate notice if another open or pending-finance KOKO order already exists for the same phone within the lookback window (especially when item sets match). This MUST NOT attempt to warn before ERP order create.
- **FR-011**: Non-KOKO payment orders MUST keep their existing finance/sample flows unchanged by this feature.
- **FR-012**: Link generated time MUST be stored with minute precision (date + time) as entered from the KOKO portal display, and MUST remain visible to finance for matching against the portal’s paid-link generated time.
- **FR-013**: KOKO orders MUST be treated as originating from ERP sync into OS; pre-finance link-time capture and duplicate handling apply after the order exists in OS.

### Key Entities

- **KOKO Order**: Sales order paid (or to be paid) via KOKO; carries customer phone, items, merchant, and link generated time once confirmed.
- **KOKO Link Generated Time**: Date/time the payment link was created in the KOKO portal; merchant-entered, used by finance to match the paid link.
- **Finance Approval (KOKO)**: Pending finance review that shows order details, link generated time, and KOKO reference capture on approve.
- **Duplicate Order Group**: Set of KOKO orders/approvals sharing phone + identical item set within the lookback window; may mix pending and approved members.
- **Duplicate Cancel Permission**: Capability that allows authorized finance users to cancel a surplus duplicate in OS and ERP.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of KOKO orders that reach finance approval include a recorded link generated time.
- **SC-002**: In test scenarios with two same-phone, same-item KOKO orders from two merchants, finance users identify and resolve the correct paid order (approve one, cancel the other) in under 5 minutes using grouped view + portal time match.
- **SC-003**: At least 80% of known same-phone same-item KOKO duplicate pairs within the lookback window appear in a duplicate group without manual search.
- **SC-004**: After rollout, accidental double-approval of same-customer same-item KOKO duplicates drops by at least 70% versus the prior month’s counted incidents (or reaches zero in a measured sample of 20 staged duplicates).
- **SC-005**: Finance users with the new permission can complete OS+ERP cancel of a duplicate from the group view in one guided action; users without permission cannot cancel.
- **SC-006**: When a second same-phone KOKO order is already in OS and a merchant opens link-time confirmation, a duplicate notice is shown in at least 90% of staged same-phone cases within the lookback window.

## Assumptions

- Real order path is: KOKO portal link → customer pays → merchant creates order in **ERP** → order syncs to Cosmo OS. OS cannot warn at link create or ERP place time.
- User’s proposed flow (pre-finance link-time capture + finance grouping + cancel permission) is the right core approach; OS-side duplicate notice at link-time confirmation is optional awareness only, not a place-order block.
- “Sample adding stage” means the existing merchant pre-fulfillment / sample-free-issue handling path is the natural place to confirm link generated time; if a KOKO order needs no samples, merchant can still confirm time and proceed to finance without inventing sample lines.
- “Same items” means identical multiset of product identities and quantities (not partial overlap).
- Default lookback for grouping and OS duplicate notices is 30 calendar days; configurable later if ops needs longer/shorter.
- Matching paid links remains a **manual** finance check against the KOKO portal (no automated KOKO portal sync in this feature).
- Time-only matching can be ambiguous for same-minute links; finance uses amount/reference as tie-breakers; capturing portal reference at merchant time is out of scope for v1 unless already available.
- Duplicate notice at link-time confirmation is soft (does not hard-block confirm); finance grouping remains the resolution path.
- Cancel-in-ERP reuses existing paid-order cancel / finance cancel patterns where they already exist; this feature adds the permission and the duplicate-group entry point.
- Feature is Cosmo OS sales/finance workflow only; KOKO portal and ERP order-entry screens are unchanged for pre-create warnings.

## Out of Scope

- Warning or blocking merchants inside ERP or the KOKO portal before link generate / order create.
- Automatic pull of paid status or references from the KOKO portal API.
- Deduplicating non-KOKO payment methods (COD, bank transfer, card) in this same grouping UI (may follow later).
- Automatically cancelling the non-matching sibling when one is approved (finance must choose).
- Changing how customers receive or pay KOKO links outside Cosmo OS.
