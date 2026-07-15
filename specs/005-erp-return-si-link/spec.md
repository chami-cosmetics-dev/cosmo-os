# Feature Specification: ERP Return SI Link

**Feature Branch**: `005-erp-return-si-link`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "erp for credit notes they create return SI no? in our OS theare are no way to link both SI when we search by return SI number we want get original SI in our OS. simple idea is when credit note creates in our os it marked as void but return SI not assign for that. have connection between shopify id and erp credit note SI, return SI missing"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find original order by Return SI number (Priority: P1)

Finance and operations staff often receive a Return Sales Invoice (Return SI) number from ERP after a credit note. They need to search for that Return SI in Cosmo/Vault OS and immediately open the **original** order (the one that was credit-noted / voided), not a dead end or a separate unlinked row.

**Why this priority**: Searching by Return SI is the daily lookup path after ERP credit notes; without it, staff must hunt by Shopify ID or original SI manually.

**Independent Test**: For an order that was credit-noted in ERP with a known Return SI, search that Return SI in the orders list and confirm the original order appears.

**Acceptance Scenarios**:

1. **Given** an original order linked to ERP with a stored Return SI, **When** a user searches using the full Return SI number, **Then** the original order appears in results.
2. **Given** the same order, **When** a user searches using a distinctive suffix of the Return SI number, **Then** the original order still appears (consistent with how other invoice numbers are searched today).
3. **Given** a Return SI that is not linked to any OS order, **When** a user searches that number, **Then** no unrelated original order is incorrectly returned.

---

### User Story 2 - Persist Return SI on the original order when credit note arrives (Priority: P1)

When ERP creates a credit note, it also creates a Return SI that points at the original Sales Invoice. OS already marks the original order voided/returned when it recognizes the credit note. That original order MUST also store the Return SI identity so the link is available for search and display.

**Why this priority**: Assignment is the data prerequisite for reliable search and for closing the “Return SI missing” gap.

**Independent Test**: Simulate or process an ERP credit-note/return event against a known original SI and confirm the original OS order now carries the Return SI reference.

**Acceptance Scenarios**:

1. **Given** an original order matched by ERP’s “return against” original SI, **When** the Return SI credit-note event is received, **Then** the original order is marked voided/returned as today **and** the Return SI number is stored on that same order.
2. **Given** an original order that already has one Return SI stored, **When** another Return SI is issued against the same original, **Then** the new Return SI is retained without losing the previous one.
3. **Given** a credit-note signal for the original SI that does not include a Return SI name, **When** processed, **Then** void/return behavior still applies and the order remains searchable by original SI / Shopify reference (no failure solely because Return SI is absent).

---

### User Story 3 - See Return SI on the original order (Priority: P2)

Staff opening a voided / credit-noted order need to see which Return SI(s) ERP created, alongside the existing Shopify and original ERP SI references, so they can reconcile without leaving OS.

**Why this priority**: Search finds the row; display confirms the correct ERP documents are linked.

**Independent Test**: Open a credit-noted order that has a stored Return SI and confirm the Return SI is visible in the order detail/header area used for ERP references.

**Acceptance Scenarios**:

1. **Given** an original order with one or more stored Return SI numbers, **When** a user opens that order’s detail view, **Then** each Return SI is shown in a way that is distinguishable from the original SI and from the Shopify reference.
2. **Given** an original order with no Return SI stored, **When** a user opens detail, **Then** no blank or misleading Return SI label is shown.

---

### User Story 4 - Recover missing Return SI links for already-voided orders (Priority: P3)

Some orders were already voided from credit notes before Return SI assignment existed. Staff need a bounded way to attach missing Return SI numbers from ERP for those historical cases so search works going forward.

**Why this priority**: Fixes existing gaps without blocking the live webhook path (P1).

**Independent Test**: Run recovery for a known voided order whose ERP Return SI is known but missing in OS; after recovery, search by Return SI finds the original order.

**Acceptance Scenarios**:

1. **Given** a voided/returned original order whose ERP Return SI is known but missing in OS, **When** recovery is run for that order (or a small batch), **Then** the Return SI is stored on the original order.
2. **Given** an active (non-credit-noted) order, **When** recovery runs, **Then** it does not invent a Return SI or incorrectly void the order solely from recovery lookup failure.

---

### Edge Cases

- Return SI arrives before OS can match the original SI → event is skipped or deferred safely; later match must still assign Return SI when original is found.
- Partial / multiple credit notes against one original → all Return SI numbers remain associated with the same original order.
- Finance-reverted or rearranged orders that already skip auto-void → Return SI may still be recorded when known, without incorrectly re-voiding protected states.
- Duplicate webhook for the same Return SI → does not create duplicate display/search noise.
- Return SI equals or resembles Shopify / original SI text → search still returns the correct original order once, without duplicate rows.
- Stray OS rows created only for the Return SI (if any exist historically) → searching Return SI prefers the **original** order; staff are not left only on an unlinked void stub.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store the ERP Return SI number on the **original** OS order when a credit note / return invoice event is recognized against that original.
- **FR-002**: System MUST support multiple Return SI numbers on one original order when ERP issues more than one return against it.
- **FR-003**: Orders search MUST find the original order when the search term matches a stored Return SI (full or suffix match, consistent with existing SI search behavior).
- **FR-004**: Order detail MUST present stored Return SI number(s) distinctly from the original ERP SI and Shopify reference.
- **FR-005**: Existing void/returned credit-note behavior for the original order MUST continue (mark voided/returned as today) in addition to Return SI assignment.
- **FR-006**: System MUST NOT overwrite or clear the original order’s primary ERP SI / Shopify linkage when assigning a Return SI.
- **FR-007**: System MUST provide a recoverable path to attach missing Return SI links for already voided/returned orders where ERP still has the return document.
- **FR-008**: If a Return SI cannot be matched to an original order, the system MUST not attach it to an unrelated order.

### Key Entities

- **Original order**: The Cosmo/Vault order tied to the customer sale (Shopify and/or original ERP SI); becomes voided/returned after credit note.
- **Original Sales Invoice (SI)**: The ERP invoice for the sale; currently linked on the original order.
- **Return Sales Invoice (Return SI / credit note SI)**: The ERP document created for the credit note, pointing at the original SI; must be linked onto the same original order for search and display.
- **Credit note event**: ERP signal that a return was created and/or the original invoice was credit-noted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of newly credit-noted original orders where ERP provides a Return SI, that Return SI is stored on the original order within the same processing event that voids/returns it.
- **SC-002**: Staff searching a known linked Return SI locate the correct original order on the first search attempt in at least 95% of tested cases.
- **SC-003**: Order detail for a linked credit-noted order shows the Return SI without requiring staff to open ERP.
- **SC-004**: After recovery runs on a sample of historical voided orders missing Return SI, at least 90% of those with a discoverable ERP Return SI gain a searchable link in OS.
- **SC-005**: No increase in mis-linked orders (Return SI attached to the wrong original) in verification samples of linked credit notes.

## Assumptions

- ERP Return SI continues to identify the original invoice via its “return against” relationship (or equivalent credit-note linkage) as used today.
- Primary UX target is the main orders list search and order detail ERP references; dedicated new screens are out of scope unless needed for recovery tooling.
- Cosmo OS and Vault OS share this behavior (same credit-note / order model).
- Creating a separate full OS “order” solely for the Return SI is not required for this feature when an original order already exists; linking onto the original is the intended design.
- Existing protections that skip auto-void for finance-reverted or rearranged-active orders remain; Return SI assignment should improve linkage without breaking those protections.
- Historical recovery may be an admin/ops action or batch (not necessarily automatic for all history on day one).
