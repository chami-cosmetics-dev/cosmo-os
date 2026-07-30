# Feature Specification: ERP Draft Orders into OS

**Feature Branch**: `028-erp-draft-orders`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "we have to take erp draft order to our OS, no need old ones we can get today onword"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See today's ERP draft orders in Cosmo OS (Priority: P1)

An operations or fulfillment user needs orders that staff create as drafts in ERPNext to appear in Cosmo OS the same day for visibility—without waiting for the ERP document to be submitted. While the ERP document remains draft, staff may view the order only; fulfillment actions stay blocked until submit. Drafts created before the feature start day are intentionally not brought over.

**Why this priority**: Without draft intake, OS only learns about ERP-native sales after submit, leaving same-day drafts invisible to ops.

**Independent Test**: Create a new ERP draft Sales Invoice dated today (not present in OS); trigger intake; confirm a corresponding Cosmo OS order appears with ERP reference and draft status. Confirm a draft dated yesterday (or earlier) is not created in OS.

**Acceptance Scenarios**:

1. **Given** a new ERP draft Sales Invoice with posting/creation date of today (company local calendar day) that is not already in OS, **When** draft intake runs (webhook or sync), **Then** Cosmo OS creates an order linked to that ERP document.
2. **Given** an ERP draft Sales Invoice with posting/creation date before today, **When** draft intake runs, **Then** Cosmo OS does not create an order for it.
3. **Given** an ERP draft already imported into OS, **When** the same draft is received again unchanged, **Then** OS does not create a duplicate order (idempotent update or no-op).

---

### User Story 2 - Keep the OS order in sync when the draft changes or is submitted (Priority: P1)

After a draft is in OS, ERP users may edit lines/amounts or submit the invoice. Ops need the OS order to reflect the latest ERP state so fulfillment and finance are not working from stale draft data.

**Why this priority**: Stale draft copies would cause wrong picks, invoices, and payment handling.

**Independent Test**: Import a draft; change a line quantity in ERP and re-send; submit the invoice in ERP; confirm OS reflects the update and then treats the order as a normal submitted ERP-sourced order (same path as existing submitted SI intake).

**Acceptance Scenarios**:

1. **Given** an OS order created from an ERP draft, **When** the draft is updated in ERP and intake receives the update, **Then** OS order header, customer, and line items match the updated draft.
2. **Given** an OS order that originated as an ERP draft, **When** that document is submitted in ERP, **Then** the same OS order is updated (not duplicated) and is no longer marked as draft-only.
3. **Given** an OS order from an ERP draft, **When** the ERP document is cancelled, **Then** OS reflects cancellation consistently with existing ERP cancel handling for ERP-sourced orders.

---

### User Story 3 - View draft-origin orders in existing OS order views (Priority: P2)

Staff need draft-origin ERP orders visible in the same order lists and detail views they already use for ERP-sourced orders, with a clear indication that the ERP document is still a draft and that the order is view-only until submitted.

**Why this priority**: Separate hidden queues reduce adoption; visibility in familiar screens is required for day-one value.

**Independent Test**: After import, open the standard orders UI; locate the order by ERP reference or customer; confirm a draft / view-only indicator is visible and fulfillment actions are unavailable while ERP remains draft.

**Acceptance Scenarios**:

1. **Given** a successfully imported ERP draft, **When** a user with order access opens the orders experience, **Then** they can find the order by ERP document name / reference or customer details.
2. **Given** the ERP document is still draft, **When** the user opens order detail, **Then** the UI clearly shows that the source ERP document is draft and the order is view-only.
3. **Given** the ERP document is still draft, **When** the user attempts print, pick, pack, dispatch, payment, or other fulfillment/finance actions, **Then** those actions are blocked with a clear explanation that the ERP document must be submitted first.
4. **Given** the ERP document has been submitted, **When** the user opens the same order, **Then** the draft / view-only indicator is gone and the order behaves like other submitted ERP-sourced orders.

---

### Edge Cases

- ERP sends a draft with missing company / location mapping → intake fails clearly; no orphan order is created for an unmapped company.
- ERP draft has line items whose SKUs are unknown in OS → order is still created with available data; unknown lines are visible so ops can fix catalog mapping (same spirit as existing ERP order intake gaps).
- Same ERP draft name received for two companies / instances → each maps only to its configured location; no cross-company overwrite.
- Clock near midnight: “today onward” uses the company location’s local calendar date for the ERP document’s posting or creation date, not an arbitrary UTC cutoff that would drop late-evening local drafts.
- Historical drafts that are edited today but originally created before the start day → remain excluded (cutoff is based on original document date, not “last modified today”).
- Duplicate webhook retries → idempotent; one OS order per ERP draft document per company mapping.
- User attempts fulfillment while ERP is still draft → action is refused; order remains view-only until submit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST import ERPNext draft Sales Invoices into Cosmo OS as orders when the document’s posting or creation date is on or after the feature start calendar day (“today onward”).
- **FR-002**: System MUST NOT backfill or create OS orders for ERP draft Sales Invoices dated before the feature start day.
- **FR-003**: System MUST treat intake as idempotent: repeated delivery of the same ERP draft updates the existing OS order rather than creating duplicates.
- **FR-004**: System MUST update the linked OS order when a previously imported draft is amended or submitted in ERP, preserving a single OS order identity.
- **FR-005**: System MUST associate imported draft orders with the correct company location using existing ERP company / instance mapping rules.
- **FR-006**: Users with normal order access MUST be able to find and open draft-origin ERP orders in existing order views, with a clear draft-state indicator while the ERP document remains draft.
- **FR-007**: System MUST apply the same authorization model as existing ERP-sourced order intake and order viewing (no weaker access path for drafts).
- **FR-008**: When ERP draft intake cannot map company/location, the system MUST reject or skip with a clear operational signal and MUST NOT create a mis-assigned order.
- **FR-009**: While the ERP document remains draft, draft-origin OS orders MUST be **view-only**: users can open and inspect the order, but MUST NOT perform print, pick, pack, dispatch, payment, stage advances, or other fulfillment/finance mutations until the ERP document is submitted.

### Key Entities

- **ERP Draft Sales Invoice**: An ERPNext Sales Invoice in draft state (not yet submitted), identified by ERP document name, company, posting/creation date, customer, amounts, and line items.
- **OS Order (draft-origin)**: A Cosmo OS order created from an ERP draft Sales Invoice; linked by ERP invoice/document reference; carries a draft-state flag until the ERP document is submitted.
- **Feature start day**: The calendar day from which draft intake is allowed (“today onward”); drafts before this day are permanently out of scope for import.
- **Company / ERP instance mapping**: Existing link between ERP company (and instance credentials) and Cosmo OS company location used to place the order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of eligible ERP draft Sales Invoices created on or after the feature start day that successfully map to a company location appear as OS orders within 2 minutes of intake delivery under normal operating conditions.
- **SC-002**: 0 OS orders are created from ERP drafts dated before the feature start day in acceptance testing with a mixed set of old and new drafts.
- **SC-003**: Re-sending the same draft 3 times results in exactly 1 OS order (no duplicates).
- **SC-004**: After submit of a previously imported draft, ops can complete the same order in OS without creating a second order for the same ERP document (verified in a scripted submit scenario).
- **SC-005**: Authorized users can locate a draft-origin order in the standard orders UI on the first attempt using ERP document name or customer name in UAT.
- **SC-006**: In UAT, 100% of attempted fulfillment/finance actions on draft-state orders are blocked; the same actions succeed on that order after ERP submit.

## Assumptions

- “ERP draft order” means an ERPNext **Sales Invoice** in draft state (docstatus draft), not a separate Sales Order doctype — Cosmo OS already intakes submitted Sales Invoices from ERP and currently skips drafts.
- Direction is ERP → OS only for these drafts; this feature does not change Shopify → ERP sync or create drafts in ERP from OS.
- No historical backfill job is required; “today onward” is sufficient for go-live.
- Feature start day defaults to the calendar day the feature is enabled in each environment (aligned with “today onward”); it may be recorded as a configured cutoff date if ops need a fixed go-live stamp.
- Existing ERP webhook/auth and company-location mapping are reused; draft intake does not introduce a separate trust model.
- Submitted and cancelled ERP Sales Invoice behavior for ERP-sourced orders remains as today once a draft is submitted or cancelled.
- POS vs non-POS classification follows the same rules as existing ERP Sales Invoice intake when those fields are present.
- “View only” means inspect in list/detail only—no print/prep and no warehouse or finance mutations—until the ERP Sales Invoice is submitted.
