# Feature Specification: Pending Waybill Queue

**Feature Branch**: `021-pending-waybill-queue`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "in our os we can upload waybill lookup files for search order no? we built that process but it comes to upload files they said they can upload one file, if they upload another one older one is gone, i want solution also we can map those orders with our orders and then we can remove delivery completed orders from list only display pending waybills with details"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload multiple waybill files without losing prior data (Priority: P1)

A fulfillment user with import permission uploads a courier waybill file (CSV/Excel) today, then uploads another file tomorrow (or the same day for a different batch). After the second upload, waybills from the first file are still available for search and still appear in the pending list when not delivery-complete. Upload history shows each file separately with row counts and who uploaded it.

**Why this priority**: Losing earlier uploads forces re-work, breaks customer lookup for older tracking numbers, and is the primary pain reported by operators.

**Independent Test**: Upload file A with known waybills; upload file B with different waybills; confirm file A’s waybills still search and appear in the pending list; confirm both uploads appear in upload history.

**Acceptance Scenarios**:

1. **Given** an authorized importer uploads waybill file A, **When** import finishes successfully, **Then** the system records an upload history entry for file A (file name, row counts, uploader, time) and stores the waybill rows for lookup.
2. **Given** file A is already imported, **When** the user uploads a different file B, **Then** waybills that existed only in file A remain searchable and remain in the pending queue (if still pending); they are not wiped by file B.
3. **Given** file B contains the same waybill number as file A, **When** file B is imported, **Then** that waybill’s details are updated from the newer file (latest courier row wins) while other waybills from file A are unchanged.
4. **Given** multiple successful uploads exist, **When** the user opens upload history, **Then** each upload is listed separately with file name, imported/invalid counts, uploader, and timestamp (newest first).
5. **Given** a user lacks import permission, **When** they attempt upload, **Then** the action is denied and no data changes.

---

### User Story 2 - Map uploaded waybills to OS orders (Priority: P1)

After import (or on viewing the pending list), each uploaded waybill is matched to the company’s order using the invoice / order reference from the courier file. Matched rows show OS order identity and status context; unmatched rows are clearly marked so staff can investigate bad references.

**Why this priority**: Mapping is required to know which waybills are still pending delivery versus already completed in Cosmo OS / Vault OS.

**Independent Test**: Import a file containing one invoice that exists as an open OS order and one that does not; verify the first shows as matched with order details and the second as unmatched.

**Acceptance Scenarios**:

1. **Given** an imported waybill row’s invoice/order reference matches an OS order for the same company, **When** mapping runs, **Then** the waybill is linked to that order and the pending list shows the OS order identifier used elsewhere in fulfillment (e.g. Shopify number or sales invoice as appropriate).
2. **Given** an imported row’s reference does not match any company order, **When** mapping runs, **Then** the waybill remains stored for search, appears in the pending list as **unmatched**, and does not invent an order link.
3. **Given** previously unmatched waybills, **When** the matching order later exists (or mapping is re-run), **Then** those waybills become matched without requiring the user to re-upload the same file.
4. **Given** a matched waybill, **When** staff open details, **Then** they see courier fields from the upload (waybill no, invoice/reference, courier, and other non-empty raw columns) plus linked OS order summary fields needed for follow-up.

---

### User Story 3 - Pending waybills list hides delivery-completed orders (Priority: P1)

Staff open a **pending waybills** view on the Waybill Lookup area. The default list shows only waybills that still need attention: unmatched rows, and matched rows whose OS order is **not** delivery-complete. Waybills for delivery-completed orders no longer clutter the list but remain findable via the existing invoice/waybill search.

**Why this priority**: Operators need a working queue of open deliveries, not a dump of every historical courier row including finished ones.

**Independent Test**: Seed one pending matched waybill, one unmatched waybill, and one matched waybill whose order is delivery-complete; open the pending list and confirm only the first two appear; search still finds the completed one.

**Acceptance Scenarios**:

1. **Given** a user with waybill lookup read permission, **When** they open the pending waybills list, **Then** they see pending rows with at least: waybill number, invoice/reference, courier, match status (matched/unmatched), linked order id when matched, upload file name (or upload date), and enough detail to open a details view.
2. **Given** a matched waybill whose OS order is marked delivery-complete, **When** the pending list loads with default filters, **Then** that waybill does **not** appear in the list.
3. **Given** a matched waybill whose OS order is not delivery-complete (or has no delivery-complete marker), **When** the pending list loads, **Then** the waybill appears as pending.
4. **Given** an unmatched waybill, **When** the pending list loads, **Then** it appears as pending until matched and the linked order becomes delivery-complete (or until staff remove it per edge-case rules if supported).
5. **Given** a delivery-completed matched waybill is hidden from the pending list, **When** a user searches by invoice or waybill number, **Then** search still returns that waybill and order details.
6. **Given** an order transitions to delivery-complete after the list was open, **When** the list is refreshed, **Then** that waybill disappears from the pending list without requiring a re-upload.

---

### User Story 4 - Review waybill details from the pending list (Priority: P2)

From a pending row, staff open a details view/popup that shows the full courier row fields (non-empty columns from the uploaded file) plus mapped OS order context when available, so they can answer customer delivery questions without reopening the spreadsheet.

**Why this priority**: Lookup search already supports details; the pending queue must expose the same detail depth so the list is actionable.

**Independent Test**: Click a pending row with raw courier fields; confirm details show those fields and, if matched, order identity and delivery status.

**Acceptance Scenarios**:

1. **Given** a pending waybill has stored courier row data, **When** the user opens details, **Then** all non-empty uploaded fields are shown.
2. **Given** the waybill is matched, **When** details open, **Then** OS order identity and whether delivery is complete are visible.
3. **Given** the waybill is unmatched, **When** details open, **Then** the UI clearly states no OS order match was found.

---

### Edge Cases

- Second upload contains a mix of new and previously imported waybill numbers → new rows are added; overlapping waybill numbers update to the newer courier details; non-overlapping prior rows remain.
- Upload file is empty, wrong type, or exceeds the existing per-file row limit → import is rejected with a clear message; prior uploads and waybills are untouched.
- Upload succeeds but every row is invalid (missing invoice/reference or waybill) → upload history still records the attempt with zero imported rows; pending list unchanged.
- Same invoice appears with two different waybill numbers across uploads → both waybills can exist; pending list shows each waybill row separately when still pending.
- Matched order is cancelled or returned rather than delivery-complete → treated as **not** delivery-complete for pending-list purposes unless the business already marks such orders delivery-complete; cancelled/returned handling follows existing order status (see Assumptions).
- Very large cumulative pending set after many uploads → list supports pagination (or equivalent) so staff can still work the queue; search remains available for direct lookup.
- User without read permission → pending list and search denied; without import permission → upload denied.
- Delivery-complete status later cleared on an order (if that can happen operationally) → related waybills reappear on the pending list after refresh.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authorized users to upload multiple courier waybill files over time without deleting or discarding waybills that only existed in earlier successful uploads.
- **FR-002**: System MUST retain an upload history entry per successful (or attempted-with-summary) import including file name, total/imported/invalid counts, uploader, and timestamp.
- **FR-003**: When a newly uploaded file includes a waybill number already stored for the company, system MUST update that waybill’s courier details from the newer file (latest wins) without removing unrelated waybills from prior uploads.
- **FR-004**: System MUST map imported waybills to company OS orders using the invoice / order reference from the courier file, consistent with existing waybill lookup matching rules.
- **FR-005**: System MUST support re-mapping previously unmatched waybills when a matching OS order becomes available, without requiring re-upload of the original file.
- **FR-006**: System MUST provide a **pending waybills** list (default view for working the queue) that includes:
  - unmatched waybills, and
  - matched waybills whose linked OS order is **not** delivery-complete.
- **FR-007**: System MUST exclude from the default pending list any matched waybill whose linked OS order is delivery-complete.
- **FR-008**: System MUST NOT permanently destroy delivery-completed waybill records solely because they left the pending list; those records MUST remain available via invoice/waybill search.
- **FR-009**: Pending list rows MUST show actionable details at minimum: waybill number, invoice/reference, courier name (when present), match status, linked OS order identifier when matched, and source upload identity (file name and/or upload time).
- **FR-010**: Users MUST be able to open full courier-row details (non-empty uploaded fields) from a pending list row, including OS order summary when matched.
- **FR-011**: Existing invoice/waybill search MUST continue to work across all stored waybills (pending and delivery-complete).
- **FR-012**: Upload and pending-list/search access MUST respect existing waybill lookup permissions (read vs import); unauthorized actions MUST be blocked server-side.
- **FR-013**: Import MUST continue to accept the same courier file types already supported (CSV, XLSX, XLS) and enforce the existing per-file row limit and required invoice + waybill fields per row.

### Key Entities

- **Waybill upload**: One imported courier file batch for a company — file name, uploader, timestamps, row summary counts, status.
- **Waybill record**: One courier tracking row (waybill number, invoice/reference, courier, raw row fields, link to upload, optional link to OS order).
- **OS order link**: Association between a waybill record and a company order used to determine pending vs delivery-complete.
- **Pending waybill**: A waybill record that should appear in the working queue — unmatched, or matched to an order that is not delivery-complete.
- **Delivery-complete order**: An OS order that staff have marked as delivery complete; its matched waybills drop out of the pending queue but stay searchable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After two sequential uploads of different files (non-overlapping waybill numbers), 100% of waybills from the first file remain searchable and, if still pending, visible in the pending list.
- **SC-002**: Authorized users can open the pending waybills list and see the first page of results within 5 seconds under normal load for queues up to 2,000 pending rows.
- **SC-003**: In verification testing, 100% of matched waybills whose orders are delivery-complete are absent from the default pending list while still returned by direct search.
- **SC-004**: In verification testing, 100% of unmatched waybills and matched non–delivery-complete waybills appear in the default pending list.
- **SC-005**: Staff can identify match status and open courier details for a pending row in under 30 seconds without leaving the Waybill Lookup area.
- **SC-006**: Unauthorized users are denied upload and pending-list/search access in 100% of verification attempts.
- **SC-007**: After a walkthrough of under 5 minutes, at least 80% of pilot fulfillment users correctly understand that new uploads add to (or update) the queue rather than replace the previous file wholesale.

## Assumptions

- “Older file is gone” is addressed by **cumulative retention** of waybill records across uploads plus visible **upload history**, not by storing multiple conflicting copies of the same waybill number as separate active rows (same company + waybill number → latest courier details win).
- Order mapping uses the same invoice/order reference normalization already used by Waybill Lookup search.
- “Pending” means: unmatched **or** matched to an OS order that does **not** have delivery complete set. Cancelled/returned orders remain pending unless they are also marked delivery-complete in OS.
- Delivery-completed waybills are **hidden** from the pending queue, not hard-deleted.
- The pending list lives in the existing Waybill Lookup fulfillment area (same permissions: read / import); no new sidebar module is required for v1.
- Manual single-waybill entry already on Waybill Lookup remains available and participates in the same pending/search rules when stored.
- Per-file import limits (file types, 10,000 rows, required invoice + waybill columns) stay as today unless product later asks to change them.
- Multi-courier files in one company are in scope as long as they use the existing column recognition; no new courier-specific parsers are required for this feature.
- Soft-delete / archive of individual pending waybills by staff is out of scope for v1 unless needed after pilot feedback; completion via delivery-complete on the order is the primary way rows leave the queue.
