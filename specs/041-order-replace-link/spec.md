# Feature Specification: Order Cancel Replace Link

**Feature Branch**: `041-order-replace-link`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "now we are doing different process when shopify order came some times we cancel that order and replace with another order, at this stage no place we have to connect old order and replaced order, i want make that Connection after cancel order i want field for that order replace new order id, when we search by order i want show new replaced order also"

## Clarifications

### Session 2026-08-14

- Q: What identifier do staff enter for the replacement order? → A: Visible order number (same as order search today)
- Q: When/where do staff enter the replacement link? → A: Only after cancel, on cancelled order detail/edit (not on cancel confirmation). Replacement order is created on the ERP side (not a new Shopify order).
- Q: Show reverse link on replacement order detail? → A: Yes — replacement detail shows linked cancelled order number(s), read-only
- Q: Must cancelled and replacement share the same customer/contact? → A: No — any existing Cosmo order allowed (no same-customer hard block for v1)
- Q: Cosmo only vs Vault too? → A: Cosmo OS only (v1)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record replacement order on cancelled order (Priority: P1)

When staff cancel a Shopify-originated order because it will be replaced, they later record the ERP-created replacement **order number** on the cancelled order’s detail/edit view so the two orders stay connected in Cosmo OS. The link is not collected on the cancel confirmation screen.

**Why this priority**: Without this link, ops and support cannot tell which live order supersedes a cancelled one. This is the core capability.

**Independent Test**: After an order is already cancelled, open its detail, enter a valid Cosmo-visible replacement order number (ERP-originated order already present in Cosmo), save, and confirm the cancelled order shows the linked replacement order number.

**Acceptance Scenarios**:

1. **Given** a cancelled order with no replacement recorded, **When** an authorized user enters a valid existing **order number** (same format as order search) as the replacement and saves, **Then** the cancelled order stores and displays that replacement order number (and resolves to the matching order).
2. **Given** a cancelled order, **When** the user tries to save a replacement order number that does not match any order in Cosmo OS, **Then** the save is blocked with a clear error and no link is stored.
3. **Given** a cancelled order that already has a replacement order number, **When** an authorized user updates it to a different valid order number, **Then** the new link replaces the previous one and both the cancelled order and search behavior reflect the updated link.
4. **Given** an order that is not cancelled, **When** a user views order details, **Then** the replacement-order field is not offered for recording (replacement applies only after cancel).
5. **Given** a user is completing the cancel confirmation for an order, **When** they finish cancel, **Then** no replacement-order field is required or shown on that cancel confirmation; linking happens afterward on the cancelled order detail.

---

### User Story 2 - Search surfaces cancelled order and its replacement (Priority: P1)

When a user searches by order number (or order id used in existing order search), if that order is part of a cancel→replace link, search results also show the linked counterpart so staff can jump to the live replacement (or back to the cancelled original). Opening either order’s detail also shows the counterpart (editable only on the cancelled side).

**Why this priority**: Recording the link is useless if search still only returns the cancelled order; this is how day-to-day ops find the replacement.

**Independent Test**: Link cancelled order A to replacement B; search for A and confirm B appears as related; search for B and confirm A appears as related.

**Acceptance Scenarios**:

1. **Given** cancelled order A linked to replacement order B, **When** the user searches for A’s order number, **Then** results include A and clearly show B as the replacement order (and B is selectable).
2. **Given** cancelled order A linked to replacement order B, **When** the user searches for B’s order number, **Then** results include B and clearly show A as the cancelled order this replacement superseded (and A is selectable).
3. **Given** an order with no cancel→replace link, **When** the user searches for it, **Then** search behaves as today with no extra related-order row or badge.
4. **Given** cancelled order A linked to B, **When** the user opens A’s detail view, **Then** the replacement order number is visible and can be used to navigate to B.
5. **Given** cancelled order A linked to B, **When** the user opens B’s detail view, **Then** A’s cancelled order number is shown as the superseded predecessor (read-only) and can be used to navigate to A.
6. **Given** two cancelled orders both linked to the same replacement B, **When** the user opens B’s detail view, **Then** both cancelled predecessors are listed (read-only).

---

### User Story 3 - Clear or correct a mistaken replacement link (Priority: P2)

Authorized staff can clear a wrong replacement link on a cancelled order when the link was entered in error or the replacement order changed again.

**Why this priority**: Mistakes happen; wrong links confuse ops more than no link. Secondary to create/search.

**Independent Test**: On a cancelled order with a replacement set, clear the field, save, and confirm search no longer pairs the two orders.

**Acceptance Scenarios**:

1. **Given** a cancelled order with a replacement order number set, **When** an authorized user clears the replacement field and saves, **Then** the link is removed and search for either order no longer shows the other as related.
2. **Given** a user without permission to edit order operational fields, **When** they view a cancelled order, **Then** they can see the replacement link (if any) but cannot change or clear it.

---

### Edge Cases

- Replacement order number equals the cancelled order’s own order number → save blocked; order cannot replace itself.
- Replacement order is itself cancelled and later linked to a further replacement → search for the original cancelled order shows its direct replacement only (one hop); staff can follow the chain by opening the replacement and reading its own link if present.
- Replacement order does not yet exist in Cosmo OS (ERP replacement not yet created or not yet visible in Cosmo) → save blocked until the order exists in Cosmo; user can retry after it appears.
- Two different cancelled orders both point at the same replacement → allowed; search for the replacement surfaces each linked cancelled predecessor.
- Order cancelled without a replacement (true cancel, not replace) → replacement field stays empty; no related order in search.
- Historical cancelled orders created before this feature → no link until staff optionally backfill the field.
- Soft-deleted / inaccessible replacement order → show stored order number with a clear “not found / unavailable” state; do not silently drop the stored value.
- Ambiguous order number (multiple matches) → save blocked until the user enters a number that resolves to exactly one order.
- Cancelled and replacement have different customers/contacts → allowed; no same-customer validation for v1.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After an order is cancelled, authorized users MUST be able to record a replacement **order number** on that cancelled order’s detail/edit surface (same visible order number staff use in order search today — not an internal-only id). The cancel confirmation screen MUST NOT collect the replacement link.
- **FR-002**: The system MUST resolve the entered order number to exactly one existing Cosmo OS order other than the cancelled order before saving; unresolved or ambiguous numbers MUST be rejected with a clear error. The system MUST NOT require the replacement order to share the same customer/contact as the cancelled order.
- **FR-003**: The cancelled order’s detail/operational view MUST display the recorded replacement order number when present, including a way to open the replacement order. The replacement order’s detail/operational view MUST display the linked cancelled predecessor order number(s) when present (read-only on the replacement side), including a way to open each cancelled predecessor.
- **FR-004**: Authorized users MUST be able to update or clear the replacement order number **only from the cancelled order**; the replacement order detail MUST NOT allow editing or clearing the reverse link.
- **FR-005**: When order search matches an order that has a replacement link (as cancelled→replacement or as the replacement of a cancelled order), the system MUST also present the linked counterpart in the search outcome so staff can navigate to either order.
- **FR-006**: Orders that are not cancelled MUST NOT accept a replacement-order link via this feature.
- **FR-007**: Cancel without replacement MUST remain supported; the replacement field is optional and is entered only after cancel when a replacement exists.
- **FR-008**: Visibility of the replacement link MUST follow existing order-view authorization; editing/clearing MUST follow existing rules for editing operational order fields (same staff who can manage cancel-related order data).
- **FR-009**: The link is a single direct replacement on the cancelled order (one stored replacement order number / resolved order per cancelled order). Chains are followed by reading each order’s own link, not by auto-expanding all hops in one search result.
- **FR-010**: This feature MUST NOT create the replacement order; replacement orders are created on the ERP side and MUST already exist as Cosmo OS orders before linking. Linking MUST NOT create or modify Shopify orders.
- **FR-011**: This feature is **Cosmo OS only** for v1; Vault OS MUST NOT receive the replacement-link field or related search/detail behavior as part of this feature.

### Key Entities

- **Order (cancelled)**: Typically a Shopify-originated order that was cancelled and may optionally reference one replacement order.
- **Order (replacement)**: An ERP-created order that already exists in Cosmo OS and supersedes a cancelled order; linked by order number from the cancelled order.
- **Replacement Order Link**: The association from a cancelled order to the order that supersedes it; attributes include the replacement **order number** (search-visible) used to resolve the target order, and that the source order is cancelled.
- **Order Search Result**: Existing search outcome enriched, when a link exists, with the related cancelled or replacement order for navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a cancelled order with a known ERP replacement already in Cosmo, staff can open the cancelled order detail, record the replacement order number, and confirm it in under 1 minute.
- **SC-002**: After a link is saved, searching by either the cancelled or the replacement order number surfaces the counterpart in the same search session (under 30 seconds in normal use).
- **SC-003**: 100% of newly cancelled-and-replaced orders that staff process through this flow can carry a stored link once the ERP replacement exists in Cosmo (field available on cancelled order detail after cancel).
- **SC-004**: Mistaken links can be corrected or cleared without creating a duplicate cancelled order or breaking unrelated search for unlinked orders.
- **SC-005**: Unlinked cancelled orders and ordinary non-cancelled order search continue to behave as they do today (no false related-order signals).

## Assumptions

- Original cancelled orders are typically Shopify-originated; the **replacement** order is created on the **ERP** side (not a new Shopify order) and must already be visible in Cosmo OS before staff can link it.
- This feature only records the Cosmo OS connection; it does not create ERP or Shopify documents and does not change Shopify cancel API behavior.
- Staff enter the replacement **order number** manually on the cancelled order detail/edit view after cancel; auto-detecting the ERP replacement is out of scope for v1.
- “Order number” means the same human-visible order number used by existing Cosmo OS order search (the number staff already quote for that Cosmo order), not the internal database id.
- “Search by order” means the existing Cosmo OS order search / quick-find by order number (and equivalent entry points staff already use), not a new standalone search product.
- One stored replacement per cancelled order is enough for v1; multi-replacement or merge graphs are out of scope.
- Bidirectional discovery is required in **search** and on **both order detail views** (cancelled shows replacement; replacement shows cancelled predecessor(s) read-only), even though the editable link is stored only on the cancelled order.
- Backfilling historical cancelled orders is optional manual work, not a bulk migration requirement for launch.
- Scope is **Cosmo OS only** for v1. Vault OS is explicitly out of scope for this feature.
- Same customer/contact between cancelled and replacement is **not** required for v1; any resolvable Cosmo OS order number may be linked.
