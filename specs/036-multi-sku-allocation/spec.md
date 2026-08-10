# Feature Specification: Multi-SKU Location Allocation

**Feature Branch**: `036-multi-sku-allocation`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "we built location allocation feature no? now i want improve it more, this time we can use only one barcode or sku only, i want use multiple barcodes or skus,"

## Clarifications

### Session 2026-08-10

- Q: Default take qty when an item is added → A: **Blank/zero until user enters take qty** (same as today’s single-SKU tool; no prefill with TOTAL ORDER QTY or unmet-need sum).
- Q: How to show location splits for many SKUs → A: **Not all locations on one long page.** After scanning several items and entering each take qty, the user walks **one location at a time** (popup/step): for the current location, see how much of **each scanned item** that location should get; move to the next/previous location with **arrow keys** until all locations are covered.
- Q: Locations with zero qty for every scanned item → A: **Skip all-zero locations** in the walkthrough (only stop where at least one item has qty &gt; 0).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a multi-item allocation list (Priority: P1)

A store-support user opens the existing store location allocation tool and adds **more than one** product by SKU or barcode (including barcode scanner keyboard-wedge input). Each successful lookup appends the item to a working **allocation list** (cart). The user can remove an item from the list. Single-item use remains possible (a list of one).

**Why this priority**: The requested improvement is specifically multi-SKU/barcode; without a list, nothing else of this feature exists.

**Independent Test**: Scan/search three different known SKUs/barcodes in sequence; verify all three appear in the list with identity fields; remove one; verify two remain; unknown code does not add a row.

**Acceptance Scenarios**:

1. **Given** the allocation tool is open with an empty list, **When** the user searches or scans a valid SKU/barcode, **Then** that item is added to the allocation list showing priority, SKU, barcode, description, and company reorder qty (OSF TOTAL ORDER QTY), with take qty blank/zero (not prefilled).
2. **Given** one or more items already in the list, **When** the user searches or scans another valid item, **Then** the new item is appended without replacing the existing list.
3. **Given** an item already in the list, **When** the same SKU/barcode is scanned or searched again, **Then** the system does not create a duplicate row; it highlights/focuses the existing row and tells the user the item is already on the list.
4. **Given** items on the list, **When** the user removes one, **Then** that item and its take qty / location edits are removed and remaining items stay intact.
5. **Given** a code that matches no active item, **When** searched/scanned, **Then** a clear not-found message appears and the list is unchanged.

---

### User Story 2 - Enter take qtys, then walk locations one at a time (Priority: P1)

The user scans several items (e.g. five) into the list and enters **take qty for each item** on the list screen (how much we take now per SKU). The system calculates each SKU’s location split independently using the same short-shipment rules as today’s tool. The primary review UI is **not** a single page of all SKUs × all locations. Instead, the user opens a **location walkthrough**: one location (or popup/step) at a time showing **all list items and the qty for that location**; they move **next/previous location with arrow keys** until every active OSF ROP location has been visited.

**Why this priority**: Floor packing is location-oriented (“what does Location A get from this scanned set?”), not “stare at every SKU’s full table at once.”

**Independent Test**: Add three SKUs with take qtys; start walkthrough; verify first location shows all three item qtys for that location; press right arrow → next location; left arrow → previous; last location is reachable; totals per SKU across the walkthrough still match each take qty.

**Acceptance Scenarios**:

1. **Given** multiple items on the list, **When** the user enters a take qty for SKU A, **Then** SKU A’s location plan updates and SKU B’s take qty / plan are unchanged.
2. **Given** each list item that will be allocated has a take qty &gt; 0, **When** the user starts the location walkthrough, **Then** the first location step shows every allocated list item with that location’s suggested (or edited) qty.
3. **Given** the walkthrough is open on a location, **When** the user presses the right arrow key (or Next), **Then** the next **non-empty** location’s step is shown (locations where every item qty is 0 are skipped).
4. **Given** the walkthrough is open, **When** the user presses the left arrow key (or Back), **Then** the previous **non-empty** location’s step is shown.
5. **Given** take qty is blank or zero for an item, **When** the walkthrough runs, **Then** that item is omitted from location steps (or shown as not included) until a take qty is entered.
6. **Given** take qty is below that item’s company TOTAL ORDER QTY, **When** calculated, **Then** short-shipment weighting applies for that item alone (same business rules as today’s single-SKU allocation).
7. **Given** take qty exceeds that item’s company TOTAL ORDER QTY, **When** entered, **Then** the system still computes a split for that item and shows a clear above-reorder warning for that item.
8. **Given** a location where every included item’s qty is 0, **When** the walkthrough builds its sequence, **Then** that location is not shown as a step.

---

### User Story 3 - Adjust, validate, and export the multi-SKU plan (Priority: P1)

Users can manually override qtys (on the list or during the location walkthrough). When every list item that has a take qty &gt; 0 has location qtys summing to its take qty, the user can **download or print one allocation plan covering all items**. No automatic ERP stock transfers are created.

**Why this priority**: Floor use needs one printable/downloadable pack for the whole receiving session.

**Independent Test**: Two SKUs with valid edited plans; export/print; verify both SKUs and their location qtys appear; break one SKU’s sum and confirm export is blocked with a clear message.

**Acceptance Scenarios**:

1. **Given** suggestions for an item, **When** the user edits a location qty for that item, **Then** the edit is kept and the UI shows whether that item’s location qtys still sum to its take qty.
2. **Given** any list item with take qty &gt; 0 whose location qtys do not sum to take qty, **When** the user tries to export/print the multi-item plan, **Then** export is blocked until that item is fixed (or take qty cleared/removed).
3. **Given** all in-scope list items have valid plans, **When** the user exports or prints, **Then** the output includes each SKU’s identity fields and per-location qtys (and location-oriented summary).
4. **Given** a successful export/print, **When** checked in ERP/operations systems, **Then** no automatic stock transfer was created solely by this action.

---

### User Story 4 - Location walkthrough as the packing view (Priority: P1)

The location-at-a-time walkthrough is the main way to review “for this location, how much of each scanned item.” A compact location progress indicator (e.g. location name + position in the sequence) helps the user know where they are. Users may still adjust qtys for the current location’s items before moving on, as long as each SKU’s qtys across all locations continue to sum to that SKU’s take qty.

**Why this priority**: This is the user’s stated packing workflow; without it, multi-SKU is only a list of separate single-SKU screens.

**Independent Test**: Five SKUs with plans; walk all locations with arrow keys; edit one qty on a middle location; verify validation still enforces per-SKU sums; complete walkthrough to the last location.

**Acceptance Scenarios**:

1. **Given** two or more items with location qtys, **When** a location step is shown, **Then** that step lists each included item and the qty for **that location only**.
2. **Given** the user changes a qty on the current location step, **When** they move to another location and return, **Then** the edited value is still shown (session plan updated).
3. **Given** export/print of a valid multi-item plan, **When** the output is produced, **Then** it includes per-SKU location detail and a location-oriented summary consistent with the walkthrough.

---

### Edge Cases

- Empty list → no plans, export disabled with guidance to add items.
- Partial list: some items have take qty, others don’t → export includes only items with take qty &gt; 0 and valid sums; items with zero/blank take qty are omitted from export (and shown as incomplete on screen).
- Duplicate scan of an item already on the list → no second row; focus existing row.
- Rapid successive scanner inputs → debounce so each completed scan adds at most one successful lookup.
- Arrow keys while typing in a take-qty or location-qty field → do not steal focus for location navigation until the walkthrough chrome is focused (or Esc returns focus to navigation).
- Location with all item qtys 0 → omitted from the walkthrough sequence.
- List grows large → enforce a clear maximum number of items per session (see Assumptions); block adding beyond the max with a message.
- One SKU fails stock/sales lookup while others succeed → show that SKU’s missing/zero inputs clearly; other SKUs still calculable.
- Removing an item mid-edit → discards that item’s overrides only.
- User without store allocation permission → cannot use the tool (same gate as today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authorized store users to add multiple catalog items to one allocation session by SKU or barcode (including keyboard-wedge scanners).
- **FR-002**: System MUST prevent duplicate SKU rows in the same session; repeat lookup of an existing list item focuses that row instead of duplicating it.
- **FR-003**: System MUST allow removing any item from the session list.
- **FR-004**: Each list item MUST show priority, SKU, barcode, description, and company-wide reorder quantity (OSF TOTAL ORDER QTY) using the same meaning as the current single-SKU tool.
- **FR-005**: Users MUST be able to enter an independent take qty per list item; when an item is first added, take qty MUST start blank/zero (not prefilled from TOTAL ORDER QTY or unmet need).
- **FR-006**: For each list item with a valid take qty, the system MUST compute location suggestions across all active OSF ROP locations using the same allocation rules as the existing store location allocation feature (weight `need × (1 + sales)`, unmet need caps, whole numbers summing to that item’s take qty).
- **FR-007**: Location sales used in weighting MUST be Cosmo completed sales for that SKU at that location over the **last 90 days** (3 months), consistent with the current allocation lookback.
- **FR-008**: Editing take qty or location qtys for one item MUST NOT change another item’s take qty or location qtys.
- **FR-009**: Users MUST be able to manually adjust per-item location quantities (including on the current location walkthrough step); multi-item export/print MUST require every exported item’s location qtys to sum to that item’s take qty.
- **FR-010**: System MUST support download and/or print of one plan covering all exportable items in the session (per-SKU detail plus location-oriented summary).
- **FR-011**: After take qtys are entered, the system MUST provide a **location walkthrough**: one location step/popup at a time listing each allocated list item and that location’s qty; users MUST be able to move to the next and previous **non-empty** location using **arrow keys** (and equivalent on-screen controls). Locations where every included item’s qty is 0 MUST be skipped in the walkthrough sequence.
- **FR-012**: Export/print MUST NOT by itself create ERP stock transfers or equivalent automated stock moves.
- **FR-013**: Only users with the existing store allocation permission MAY use multi-SKU allocation.
- **FR-014**: System MUST enforce a maximum list size per session and show a clear message when the limit is reached.
- **FR-015**: System MUST NOT invent stock, sales, ROP, or priority; missing inputs follow the same missing/zero presentation rules as the current single-SKU tool.
- **FR-016**: The multi-item UI MUST NOT require viewing every SKU’s full location table on one page as the primary packing flow; the location walkthrough is the primary review path.

### Key Entities

- **Allocation session list**: Ordered set of distinct catalog items the user is allocating in one working session.
- **List item**: One SKU/barcode entry with identity fields, company TOTAL ORDER QTY, take qty, suggested location qtys, and optional manual overrides.
- **Per-SKU allocation plan**: Location quantities for one list item summing to that item’s take qty.
- **Location rollup / walkthrough step**: For one location, the set of list-item quantities destined to that location; sequence of steps covers all active OSF ROP locations.
- **Multi-item export package**: Downloadable/printable output with per-SKU plans plus location-oriented summary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A store user can add at least 5 different SKUs/barcodes to one allocation list in under 2 minutes using search or scanner under normal conditions.
- **SC-002**: For a fixed two-SKU fixture, 100% of runs produce whole-number location qtys per SKU that each sum exactly to that SKU’s take qty.
- **SC-003**: Changing take qty on SKU A never changes SKU B’s take qty or location qtys in acceptance tests (100% isolation).
- **SC-004**: From a valid multi-item plan (2+ SKUs), a store user can walk all locations with arrow keys and produce one printable/downloadable plan in under 3 minutes without creating stock transfers.
- **SC-005**: Duplicate scan of an in-list SKU never creates a second row (100% of negative duplicate tests).
- **SC-006**: At least 9 of 10 store-support users in a usability check understand: scan several items → enter take qtys → walk locations one at a time with arrows, with only on-screen guidance.
- **SC-007**: In acceptance tests, right/left arrow navigation visits every location that has at least one item qty &gt; 0 and skips locations where all item qtys are 0.

## Assumptions

- This feature **extends** the existing Store Location Allocation advisor (single-SKU today); it does not replace OSF purchasing or create ERP transfers.
- **Take qty is per SKU**, not one shared take qty across the whole list (matches how mixed lots are counted). Newly added items start with **blank/zero take qty** until the user enters a value.
- Allocation math, location set (all active OSF ROP columns), company reorder definition (TOTAL ORDER QTY), permission, and export-without-transfer behavior are **unchanged** from the current tool except for multi-item UX and the documented **90-day** sales lookback already used for weighting.
- Items are added by **repeated search/scan into a session list** (cart). Bulk paste of a multi-line SKU/barcode file is out of scope for this iteration unless added later.
- After take qtys are set, packing review is a **location walkthrough** (one location popup/step showing all items’ qtys for that location), navigable with **arrow keys** — not a single page of all locations for all SKUs. **All-zero locations are skipped.**
- Maximum items per session defaults to **50** (enough for a receiving wave; keeps plans readable).
- Single-SKU workflow remains supported as a list of one item (walkthrough still works with one item per location step).
- Durable multi-device saved drafts / allocation history remain out of scope (same as current tool).
- Location walkthrough and export use each item’s **current** plan qtys (after edits), not only original suggestions.
