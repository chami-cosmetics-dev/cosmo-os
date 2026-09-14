# Feature Specification: Abandoned Cart Deduplication & Abandonment Reason

**Feature Branch**: `054-abandoned-cart-dedupe`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Handle duplicate abandoned carts: (1) exact duplicate carts (same customer, same products) linked so status updates apply to all; (2) partial/overlapping carts — older subset cart deleted when a newer more complete cart appears; (3) same phone, multiple different carts same day — no auto status sync, badge on most recent with links to siblings; (4) new remarks field for why cart was abandoned with options: Koko payment issue, City not available, No need of the product(s) — separate from existing customer response remarks."

## Clarifications

### Session 2026-09-14 (recommended defaults accepted)

- Q1 Exact match: Same product/variant identities **and** same quantities.
- Q2 Status sync on exact duplicates: Sync follow-up status, customer response, abandonment reason, and free-text remark together (one call outcome for identical carts).
- Q3 Subset handling: Soft-hide superseded older subset carts (hidden from default list, not permanently destroyed). If a later cart is smaller or not a superset of an earlier cart, keep both.
- Q4 Same-day siblings: All carts remain visible as their own rows; badge/count appears only on the most recent cart for that phone on that calendar day, with links to the other same-day carts.
- Q5 Abandonment reason: Optional at all times; not required to close follow-up.
- Q6 Timing: Rules run on each abandoned-checkout sync ingest, plus a backfill pass over existing company rows when the feature ships.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exact duplicate carts share follow-up updates (Priority: P1)

A customer abandons the same cart (same products and quantities) more than once. The merchant opens one of those abandoned-order rows, updates follow-up status (and related outcome fields), and saves. Every linked exact duplicate updates to the same outcome so the merchant does not update each copy by hand.

**Why this priority**: Duplicate identical carts are the most common noise; without linking, merchants waste time and risk inconsistent statuses.

**Independent Test**: Create or sync two abandoned checkouts for the same phone with identical line items and quantities; update status on one to Closed with a customer response; confirm the other shows the same status, response, abandonment reason, and remark without a second edit.

**Acceptance Scenarios**:

1. **Given** two open abandoned checkouts for the same customer phone with the same product/variant set and quantities, **When** the system processes linking, **Then** those checkouts are treated as one exact-duplicate group.
2. **Given** an exact-duplicate group, **When** a user with manage permission saves follow-up status, customer response, abandonment reason, or remark on any member, **Then** all other members in the group receive the same saved values.
3. **Given** a user views an exact-duplicate row, **When** linked duplicates exist, **Then** the UI indicates that other exact duplicates are linked (so the merchant understands why status may change together).
4. **Given** two checkouts that differ in quantity for the same product, or differ in product set, **When** linking runs, **Then** they are **not** placed in the same exact-duplicate group.

---

### User Story 2 - Older subset carts are superseded by fuller carts (Priority: P1)

A customer first abandons a cart with Product A, then later abandons a cart with Product A plus Product B. The older, less complete cart is removed from the working list so merchants only follow up on the fuller, later intent. Carts with completely different products both stay.

**Why this priority**: Stale subset carts create double calls for the same customer journey; keeping only the fuller cart reflects latest intent.

**Independent Test**: Ingest checkout with product A, then later ingest checkout with A+B for the same phone; confirm the A-only row is hidden from the default list and the A+B row remains. Ingest two checkouts with disjoint products; confirm both remain visible.

**Acceptance Scenarios**:

1. **Given** an older abandoned checkout whose product/variant set (with quantities) is a proper subset of a newer abandoned checkout for the same phone, **When** linking/dedupe runs, **Then** the older checkout is soft-hidden from the default Abandoned Orders list and the newer fuller checkout remains visible.
2. **Given** two abandoned checkouts for the same phone with completely different products, **When** dedupe runs, **Then** both remain visible and neither is soft-hidden as a subset.
3. **Given** an older cart with A+B and a newer cart with only A (newer is not a superset), **When** dedupe runs, **Then** both remain visible.
4. **Given** a soft-hidden superseded cart had follow-up data, **When** staff need historical review, **Then** that data is retained (not permanently destroyed) even though the row is absent from the default working list.

---

### User Story 3 - Same-day different carts show a sibling badge (Priority: P1)

The same phone abandons multiple carts on the same calendar day with different products. Updating status on one does **not** change the others. The most recent cart that day shows a badge/count of how many other same-day abandoned carts exist for that phone, with links so the merchant can open each sibling and update status without calling the customer repeatedly for context.

**Why this priority**: Merchants need same-day multi-cart awareness without incorrect auto-status sync across different intents.

**Independent Test**: Same phone, two different product carts abandoned on the same day; change status on one — other unchanged; most recent row shows badge “+1” (or equivalent) with a working link/jump to the sibling.

**Acceptance Scenarios**:

1. **Given** two or more abandoned checkouts for the same phone on the same calendar day with different product sets, **When** the list loads, **Then** each checkout remains its own visible row and status changes on one do **not** auto-update the others.
2. **Given** those same-day siblings, **When** the merchant views the most recent checkout for that phone that day, **Then** they see a count/badge of how many other same-day carts exist for that phone.
3. **Given** the badge is shown, **When** the merchant uses the linked sibling affordance, **Then** they can navigate directly to each other same-day cart for that phone.
4. **Given** exact-duplicate carts on the same day, **When** rules are applied, **Then** exact-duplicate linking and status sync (User Story 1) take precedence for those identical carts; the same-day badge still helps surface other *non-exact* carts that day when present.
5. **Given** two different-product carts for the same phone on different calendar days, **When** the list loads, **Then** no same-day sibling badge links them solely for sharing a phone.

---

### User Story 4 - Record abandonment reason separately (Priority: P2)

While following up, the merchant records why the customer abandoned the cart using a dedicated field, separate from existing customer-response remarks. Initial options: Koko payment issue; City not available; No need of the product(s).

**Why this priority**: Teams need structured abandonment causes for reporting without overloading the customer-response / remark fields used for call outcomes.

**Independent Test**: Open follow-up on a row, set abandonment reason to “City not available”, leave customer response/remark as before, save; reload and confirm the reason persists and appears in list/detail and CSV export.

**Acceptance Scenarios**:

1. **Given** a user with manage permission, **When** they edit follow-up, **Then** they can set abandonment reason to one of: **Koko payment issue**, **City not available**, **No need of the product(s)**, or leave it empty.
2. **Given** abandonment reason is empty, **When** they close follow-up (status Closed) with a valid customer response, **Then** save succeeds — abandonment reason is not required.
3. **Given** an abandonment reason is saved, **When** the list, detail, and CSV export are viewed, **Then** the reason is visible as its own field, distinct from customer response and free-text remark.
4. **Given** an exact-duplicate group, **When** abandonment reason is saved on one member, **Then** linked exact duplicates receive the same abandonment reason (per Clarifications Q2).

---

### Edge Cases

- Customer identified for linking by normalized phone; rows without a usable phone are not auto-linked to other rows.
- Calendar “day” for same-day siblings uses the company’s operating timezone (default Asia/Colombo if company timezone is unset).
- Soft-hidden subset carts do not appear in the default list or default CSV export; an optional “include superseded” control is out of scope for v1 unless already trivial — v1 simply excludes them from working list/export.
- If a newer cart supersedes an older subset that was already Closed, the older row stays soft-hidden; its historical follow-up values are retained.
- Quantity-aware exact match: `{SKU1 qty 2}` is not an exact duplicate of `{SKU1 qty 1}`.
- Proper subset for soft-hide: every line on the older cart appears on the newer with at least the older quantity; newer may have extra products or higher quantities.
- Concurrent sync ingest of multiple checkouts for one phone: rules are deterministic by abandoned timestamp (newer wins for subset supersession; most recent shows same-day badge).
- View-only users can see badge, links, abandonment reason, and linked-duplicate indicators but cannot change fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect exact-duplicate abandoned checkouts for the same company when normalized phone matches and the multiset of product/variant + quantity lines is identical.
- **FR-002**: System MUST link exact duplicates into a group and, on follow-up save to any member, apply the same follow-up status, customer response, abandonment reason, and remark to all group members.
- **FR-003**: System MUST soft-hide an older abandoned checkout when a newer checkout for the same phone is a proper superset of its product/variant+quantity lines, and MUST keep the newer checkout visible.
- **FR-004**: System MUST leave both checkouts visible when product sets are disjoint or when the newer checkout is not a proper superset of the older one.
- **FR-005**: System MUST NOT auto-propagate follow-up status across same-day different-product carts that are not exact duplicates.
- **FR-006**: System MUST show on the most recent same-day cart for a phone a badge/count of other abandoned carts for that phone on that calendar day, with navigation to each sibling.
- **FR-007**: System MUST keep all non-superseded same-day sibling carts visible as separate list rows.
- **FR-008**: System MUST provide an optional abandonment-reason field with values: Koko payment issue; City not available; No need of the product(s); empty allowed.
- **FR-009**: Abandonment reason MUST be stored and displayed separately from customer response and free-text remark, and MUST be included in CSV export.
- **FR-010**: Deduplication and linking rules MUST run during abandoned-checkout sync ingest and MUST be backfilled across existing rows when the feature is deployed.
- **FR-011**: Soft-hidden superseded carts MUST be excluded from the default Abandoned Orders list and default CSV export while retaining stored data.
- **FR-012**: Exact-duplicate linking MUST take precedence over same-day sibling behavior for status propagation; same-day badge MAY still reference other non-exact carts that day.
- **FR-013**: Only users with abandoned-orders manage permission may change abandonment reason or trigger synced follow-up updates; read permission is enough to view links, badge, and reason.

### Key Entities

- **Abandoned checkout**: Existing Shopify-sourced abandoned cart row with customer phone, line items (product/variant + quantity), abandoned time, follow-up fields.
- **Exact-duplicate group**: Set of abandoned checkouts sharing phone + identical line multiset; share follow-up outcome fields.
- **Superseded (soft-hidden) checkout**: Older checkout hidden because a newer proper-superset checkout exists for the same phone.
- **Same-day sibling set**: Abandoned checkouts sharing phone and calendar day that are not exact duplicates; no shared status sync; badge on most recent.
- **Abandonment reason**: Optional structured cause of abandonment (Koko payment issue / City not available / No need of the product(s)).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Merchants update follow-up once for an exact-duplicate group and see all linked copies reflect the same outcome within one list refresh (no per-copy manual edits).
- **SC-002**: After a fuller cart arrives, merchants no longer see the older subset cart in the default working list in ≥95% of proper-subset cases in test fixtures.
- **SC-003**: For a phone with 3 different-product carts on one day, merchants see a badge on the newest row showing 2 siblings and can open each sibling in under 30 seconds without searching by phone.
- **SC-004**: Staff can record and later filter/report abandonment reason as its own field without overwriting customer response or free-text remark.
- **SC-005**: Zero incorrect auto-status updates between same-day different-product (non-exact) carts in acceptance testing.

## Assumptions

- Builds on existing Abandoned Orders follow-up page, permissions (`abandoned_orders.read` / `abandoned_orders.manage`), sync, and CSV export from feature `015-abandoned-orders-followup`.
- “Same customer” for these rules means same company + normalized phone number from the abandoned checkout.
- Product identity for matching uses the stable product/variant identifiers already stored on abandoned checkout line items; if only title is available for a line, matching falls back to normalized title + quantity for that line.
- Soft-hide is sufficient for v1; no dedicated “show superseded” list UI required.
- Abandonment reason remains a fixed three-option list for v1 (plus empty); free-text abandonment reason is out of scope.
- Same-day badge counts other carts that day for that phone excluding soft-hidden superseded rows and excluding other members of the same exact-duplicate group (count unique sibling intents, not every identical copy).
- Existing customer-response remark templates and Close validation rules remain unchanged aside from adding the new optional abandonment-reason field.
