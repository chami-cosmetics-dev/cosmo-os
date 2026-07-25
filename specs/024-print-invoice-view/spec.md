# Feature Specification: Print Invoice Without Marking Printed

**Feature Branch**: `024-print-invoice-view`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "i want add print invoice function to order details page, when someone print invoice use it, it should not mark that order as printed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Print invoice without advancing workflow (Priority: P1)

A staff member opens an order’s details view (invoice timeline / order details panel) and needs a paper or PDF copy of the invoice for reference, packing, or customer support. They use a dedicated **Print Invoice** action. The invoice prints (or opens in a print-ready view), and the order’s **Print** workflow step remains unchanged — the order is not marked as printed.

**Why this priority**: This is the core value of the feature. Staff already have a formal Print workflow step that advances order status; they need a separate, safe way to print without side effects.

**Independent Test**: On an order that has not been printed (Print step still incomplete), use Print Invoice, complete the print dialog or open the print view, then confirm the Print timeline step is still incomplete and no “printed” timestamp appears.

**Acceptance Scenarios**:

1. **Given** a user is viewing an order that has not been marked printed, **When** they choose Print Invoice and complete printing (or open the print-ready view), **Then** they can see/print the invoice content and the order’s Print workflow status remains not printed.
2. **Given** a user is viewing an order that is already marked printed, **When** they choose Print Invoice, **Then** they can print the invoice again and the existing Print status/timestamp is unchanged.
3. **Given** a user is viewing a cancelled order, **When** they choose Print Invoice, **Then** they can print the invoice and the cancelled state (and any other workflow statuses) remain unchanged.

---

### User Story 2 - Find Print Invoice from order details (Priority: P2)

A staff member looking at the order details panel can discover and use Print Invoice without leaving the current order view or confusing it with the formal Print workflow step on the invoice timeline.

**Why this priority**: Discoverability and clarity prevent accidental use of the status-changing Print path when the user only wants a copy.

**Independent Test**: Open any order details view, locate Print Invoice near order details (or equivalent obvious controls), and confirm its label/placement does not imply it advances the Print timeline step.

**Acceptance Scenarios**:

1. **Given** a user has the order details view open, **When** they look for a way to print a copy of the invoice, **Then** a clearly labeled Print Invoice action is available without navigating away.
2. **Given** a user sees both the formal Print timeline step and the Print Invoice action, **When** they use Print Invoice, **Then** only a printable invoice is produced — the timeline Print step does not complete.

---

### Edge Cases

- What happens when invoice/order data is incomplete or unavailable? User sees a clear message that the invoice cannot be printed; order status is not changed.
- What happens when the user cancels the browser/system print dialog? No status change; order remains as before.
- What happens when the order is cancelled, on hold, or otherwise non-active? Print Invoice still works if the order can be viewed; no workflow status is updated.
- What happens when the user lacks permission to view order details? Print Invoice is not available (same access as viewing the order).
- How does this interact with the existing formal Print workflow action (if any) that *does* mark the order printed? That action remains separate and continues to mark printed; Print Invoice never does.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users who can view an order’s details MUST be able to start a Print Invoice action from the order details page/panel.
- **FR-002**: Print Invoice MUST present the order’s invoice in a form suitable for printing (print dialog or print-ready view containing the invoice content).
- **FR-003**: Completing or starting Print Invoice MUST NOT mark the order as printed, MUST NOT complete the Print step on the invoice timeline, and MUST NOT write any printed timestamp or equivalent printed status.
- **FR-004**: Print Invoice MUST leave all other order/invoice workflow statuses unchanged (including cancelled, sample/free issue, package ready, dispatched, delivered, invoice completed).
- **FR-005**: Print Invoice MUST remain available for orders that are already printed and for cancelled orders, as long as the user can view the order.
- **FR-006**: If invoice content cannot be produced, the system MUST show a clear error and MUST NOT change order status.
- **FR-007**: The Print Invoice action MUST be visually and behaviorally distinct from any existing action that advances the formal Print workflow step.
- **FR-008**: Any existing formal “mark as printed” / Print workflow action MUST continue to mark the order printed when used; this feature MUST NOT remove or replace that behavior.

### Key Entities

- **Order / Invoice**: The sales order shown in the order details / invoice timeline view; has workflow stages including Print.
- **Print workflow status**: Whether the order has been formally marked printed (timeline Print step completed with timestamp).
- **Print Invoice action**: A view-only print convenience that produces a printable invoice without changing Print workflow status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of Print Invoice uses on unprinted orders under normal conditions, the Print workflow step remains incomplete after printing.
- **SC-002**: Staff can locate and start Print Invoice from the order details view in under 10 seconds without training beyond a short label.
- **SC-003**: After Print Invoice, a second viewer of the same order sees the same Print (and overall) status as before the print — zero unintended status changes.
- **SC-004**: At least 90% of first-time users in a spot check correctly understand that Print Invoice does not mark the order printed (e.g., via label clarity or brief confirmation in UI copy if needed).
- **SC-005**: Cancelled and already-printed orders can be printed via Print Invoice without changing their recorded workflow state.

## Assumptions

- Target users are staff who already use the order details / invoice timeline panel (same audience as today’s “Invoice timeline - view only” and Order Details section).
- Access control matches existing order-details viewing permissions; no new special permission is required for v1.
- “Mark as printed” continues to mean completing the formal Print workflow step on the invoice timeline (with timestamp), which is intentionally separate from this feature.
- Print Invoice produces a standard invoice representation already understood by the business (same core fields staff expect on an invoice copy); redesign of invoice layout is out of scope unless needed for basic readability.
- Browser or device print capability is available to staff; if they cancel the print dialog, that is a no-op for status.
- Mobile/rider app printing is out of scope for v1; this is for the web order details experience shown in Cosmo OS admin/ops UI.
- No new audit requirement to log every Print Invoice use for compliance in v1, beyond not updating print status; if audit logging already exists for views, reusing it is acceptable as long as it does not mark printed.
