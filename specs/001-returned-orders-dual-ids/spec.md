# Feature Specification: Returned Orders Dual ID + Waybill Single ID

**Feature Branch**: `001-returned-orders-dual-ids`

**Created**: 2026-07-10

**Updated**: 2026-07-10

**Status**: Draft

**Input**: User description: "In the returned orders list, when an order has both a Shopify reference and an ERP invoice number, show both IDs stacked (Shopify on top, ERP below in smaller text). Search should match both IDs. No schema changes."

**Clarifications (2026-07-10)**:
- **Returned orders list**: show **dual IDs** when both exist (Shopify on top, ERP below in smaller text). This is required.
- **Waybill**: show **one ID only** based on order source — Shopify-origin → Shopify order number; ERP-origin → ERP Sales Invoice (SI). No dual IDs on waybill.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See both order references in the returned orders list (Priority: P1)

Operations and finance staff reviewing returned orders need to identify orders that exist in both Shopify and ERP without opening each order separately. When a returned order has both a Shopify order reference and an ERP invoice number, the returned orders list must show both references in a single row using a stacked layout: Shopify reference on the primary line and ERP invoice number on a secondary, visually de-emphasized line below.

**Why this priority**: Staff currently see only one ID and cannot quickly match returns across both systems.

**Independent Test**: Open the returned orders list, locate an order known to have both references, and confirm both IDs appear stacked with Shopify above ERP.

**Acceptance Scenarios**:

1. **Given** a returned order with a distinct ERP invoice number and Shopify reference, **When** the user views the returned orders list, **Then** the invoice/reference column shows the Shopify reference on the top line and the ERP number on a smaller secondary line below.
2. **Given** a returned order with only a Shopify reference (no ERP invoice number), **When** the user views the returned orders list, **Then** only the Shopify reference is shown once with no empty secondary line.
3. **Given** a returned order with only an ERP invoice number (no Shopify reference), **When** the user views the returned orders list, **Then** only the ERP number is shown once with no empty secondary line.
4. **Given** a returned order where both references resolve to the same display value, **When** the user views the returned orders list, **Then** the reference is shown only once (no duplicate stacked lines).

---

### User Story 2 - Single order ID on waybills (Priority: P1)

Staff creating or viewing waybills need one clear order ID matching the order’s origin system. Shopify-origin orders show the Shopify order number; ERP-origin orders show the ERP SI. Waybills must not show both IDs.

**Why this priority**: Waybills should stay simple for packing/dispatch; dual labels belong on returned-orders reconciliation, not on the waybill.

**Independent Test**: Create or open a waybill for a Shopify-origin order and an ERP-origin order; confirm each shows only the source-appropriate single ID.

**Acceptance Scenarios**:

1. **Given** a Shopify-origin order with both Shopify and ERP identifiers stored, **When** a waybill is created or printed/viewed, **Then** only the Shopify order number appears as the order reference.
2. **Given** an ERP-origin order with both identifiers stored, **When** a waybill is created or printed/viewed, **Then** only the ERP SI number appears as the order reference.
3. **Given** an order with only one source-appropriate reference, **When** a waybill is created or viewed, **Then** that single reference is shown.

---

### User Story 3 - Search returned orders by either reference (Priority: P2)

Staff often know one system’s ID but not the other when looking up a return. The returned orders list search must find a row when the user types either the Shopify reference or the ERP invoice number (or partial match), in addition to existing searchable fields.

**Why this priority**: Displaying both IDs is only useful if staff can also find orders using either identifier.

**Independent Test**: Search the returned orders list using only the ERP invoice number for an order that previously appeared under its Shopify name only; the correct row appears.

**Acceptance Scenarios**:

1. **Given** a returned order with both Shopify and ERP references, **When** the user searches using the ERP invoice number, **Then** that order appears in the filtered results.
2. **Given** a returned order with both Shopify and ERP references, **When** the user searches using the Shopify reference, **Then** that order appears in the filtered results.
3. **Given** a returned order with only one reference type, **When** the user searches using that reference, **Then** the order still appears as today.

---

### User Story 4 - Consistent dual-ID display when a return is selected (Priority: P3)

When a user selects a returned order to view return actions or details, the order reference shown in the selection summary must use the same dual-ID display rules as the list so staff are not confused by inconsistent labeling.

**Why this priority**: Prevents mismatch between what users see in the table and what they see in the detail/action panel for the same order.

**Independent Test**: Select a dual-reference order from the list and confirm the summary header shows the same stacked Shopify-over-ERP layout.

**Acceptance Scenarios**:

1. **Given** a returned order with both references selected in the list, **When** the user opens the return action/detail area for that order, **Then** the order reference summary shows Shopify on top and ERP below in smaller text, matching the list row.

---

### Edge Cases

- Order has both IDs but ERP is in a pending/placeholder state — treat as single-reference display on returned orders (no false second line); waybill uses source-primary fallback rules.
- Order synced from ERP-only source with no Shopify customer-facing name — returned orders show ERP only; waybill shows ERP SI.
- Very long reference strings — display must remain readable without breaking layout.
- Exported returned-orders data — list display/search is in scope; export column format out of scope unless already tied to the same display field.
- Bulk “add dispatched order” picker for bulk returns — out of scope unless extended later.
- Other fulfillment screens that share waybill reference helpers inherit **single-ID** waybill behavior; returned-orders dual display is specific to the returned-orders UI (and its summary).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The returned orders list MUST display both ERP invoice number and Shopify order reference when both are present and distinct for the same returned order.
- **FR-002**: When both references are shown on returned orders, the Shopify reference MUST appear on the primary (top) line and the ERP invoice number MUST appear on a secondary line with visually smaller or de-emphasized text.
- **FR-003**: When only one reference type exists on a returned order, the list MUST show that single reference without an empty secondary line.
- **FR-004**: When both returned-order references resolve to the same display value, the list MUST show the value once only.
- **FR-005**: The returned orders list search MUST match rows when the user enters either the Shopify reference or the ERP invoice number (partial, case-insensitive matching consistent with existing list search behavior).
- **FR-006**: The selected-order summary in the return action/detail area MUST follow the same dual-ID display rules as the returned orders list row.
- **FR-007**: This feature MUST NOT require database schema changes; it uses existing order reference and source data.
- **FR-008**: Existing returned-orders list behavior (status filters, sorting, return actions, pagination/limits) MUST remain unchanged except for reference display and search coverage.
- **FR-009**: Waybill creation, print, and waybill-related order reference display MUST show exactly one source-based primary ID (Shopify order number for Shopify-origin; ERP SI for ERP-origin) and MUST NOT show dual IDs.
- **FR-010**: Waybill single-ID resolution MUST reuse shared source-primary helper logic; returned-orders dual display MUST NOT force waybills back to dual IDs.

### Key Entities

- **Returned order (list row)**: May display both Shopify and ERP references when both exist.
- **Waybill**: Dispatch/shipping document or UI; displays one source-based primary ID only.
- **Order source**: Shopify vs ERP (including ERP POS); used for waybill primary ID selection.
- **Shopify order reference**: Customer-facing Shopify order identifier.
- **ERP Sales Invoice (SI) number**: ERPNext sales invoice identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of returned orders that have both distinct Shopify and ERP references display both IDs in the list without opening another screen.
- **SC-002**: Users can locate a dual-reference returned order by searching with either identifier in a single search attempt (sample of at least 5 dual-reference orders).
- **SC-003**: 100% of UAT waybills for Shopify-origin orders show only the Shopify order number; ERP-origin waybills show only the ERP SI.
- **SC-004**: Zero regression in returned-orders list load/filter responsiveness (subjective UAT: same workflow speed as before).
- **SC-005**: Ops/finance UAT confirms returned orders show dual IDs when applicable, and waybills show a single ID (qualitative sign-off from at least one finance/ops user).

## Assumptions

- Order reference and source fields already exist without new database columns.
- “Shopify-origin” / “ERP-origin” follow existing product `sourceName` rules (`erpnext`, `erpnext-pos`).
- Returned-orders dual display is a UI concern for that list/summary; waybill uses a separate single-ID formatting path (or a mode on the shared helper).
- Existing dual-ID helpers may be reused for returned orders; waybill must call source-primary single-ID formatting.
- Bulk-return picker remains out of scope unless added later.
- No new permissions required.
