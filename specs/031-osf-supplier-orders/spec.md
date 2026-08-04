# Feature Specification: OSF Supplier Orders

**Feature Branch**: `031-osf-supplier-orders`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "new feature adding in OSF items should filter top priority, priority, newly added, vat wise, i want add feature to user can filter items brand wise and search by sku and select it add to table show sku,(when search items all list should list down without any input and when start type filtering start and list down items should show sku and description) in table should show sku, description, reorder qty(according to osf) also we can place order for multiple suppliers,(re order qty = 20, sup1=5, sup2=10, sup3=5 we can list down suppliers and recently suplier top of list) keep data in table we can any time change brand name and filter items and add it to table, and we can add generate button and it generate excel files supplier wise, it includes sku,description,orderqty"

## Clarifications

### Session 2026-08-04

- Q: Must every table row be fully allocated across suppliers before Generate? → A: **No** — users do not need to enter qty for every supplier; empty/zero suppliers are skipped. Generate uses only positive supplier quantities (partial allocation allowed; sum need not equal reorder qty).
- Q: Can the buyer edit reorder qty in the working table? → A: **No (read-only)** — reorder qty is displayed from OSF only; buyers allocate supplier quantities against that fixed value.
- Q: Is brand filter required before searching? → A: **Optional** — default is all brands; brand narrows the list when chosen and combines with existing priority / VAT / newly added filters.
- Q: How long should the working table be kept? → A: **Same browser / device** — survives refresh and return to the page until the user clears; not a multi-device server draft.
- Q: How should multiple supplier Excels be downloaded? → A: **Single zip** — one Excel file per supplier inside one zip download.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find OSF items by brand and SKU search (Priority: P1)

A purchasing user works in OSF item selection with the existing item filters (top priority, priority, newly added, VAT-wise) and can optionally filter by brand (default: all brands). They open the item search control: the full filtered list appears immediately (SKU + description) with no typing required. As they type, the list narrows. Selecting an item adds it to the working order table.

**Why this priority**: Finding and selecting the right SKUs is the entry point for every supplier order built from OSF.

**Independent Test**: Apply brand (and optional existing filters), open search with empty input and see a non-empty list of matching SKUs with descriptions; type part of a SKU or description and confirm the list filters; select a row and see it appear in the order table.

**Acceptance Scenarios**:

1. **Given** OSF items and brands exist, **When** the user chooses a brand filter, **Then** only items for that brand remain available for search/selection (combined with any active priority / newly added / VAT filters).
2. **Given** no brand is selected (all brands), **When** the user opens item search, **Then** items from any brand matching the other active filters are listed.
3. **Given** filters are active, **When** the user opens item search without typing, **Then** the dropdown/list shows all items matching the current filters, each row showing SKU and description.
4. **Given** the full filtered list is visible, **When** the user types text, **Then** the list filters by SKU and/or description match as they type.
5. **Given** an item is listed, **When** the user selects it, **Then** it is added to the working order table (without removing other rows already in the table).
6. **Given** an item is already in the table, **When** the user selects it again, **Then** the system does not create a duplicate row (existing row is kept or briefly highlighted).

---

### User Story 2 - Working order table with OSF reorder qty (Priority: P1)

Selected items appear in a persistent working table showing SKU, description, and **read-only** reorder quantity taken from the OSF order quantity for that item. Changing brand or other filters to find more items does **not** clear the table; the user can keep adding rows from different brand/filter passes.

**Why this priority**: The table is the draft purchase plan; losing rows when filters change would break the workflow.

**Independent Test**: Add items under brand A, switch to brand B, add more items; verify all rows remain with correct SKU, description, and OSF reorder qty.

**Acceptance Scenarios**:

1. **Given** a selected OSF item with a known reorder quantity, **When** it appears in the table, **Then** columns show SKU, description, and that OSF reorder quantity as a non-editable value.
2. **Given** rows already in the table, **When** the user changes brand or other item filters, **Then** table rows remain unchanged while the search list updates to the new filter set.
3. **Given** rows in the table, **When** the user refreshes the page or navigates away and returns on the same browser/device, **Then** the working table and allocations are restored.
4. **Given** a row in the table, **When** the user removes it, **Then** only that row is removed; other rows stay.
5. **Given** an item whose OSF reorder quantity is zero or blank, **When** added, **Then** it still appears with reorder quantity shown as zero (or blank), and the user can still enter supplier quantities (subject to over-allocation rules when reorder qty is known and greater than zero).
6. **Given** a row in the table, **When** the user attempts to change the reorder quantity cell, **Then** it cannot be edited (value remains the OSF-captured amount).
7. **Given** rows in the table, **When** the user clears the table, **Then** all rows and allocations are removed.

---

### User Story 3 - Split reorder qty across multiple suppliers (Priority: P1)

For each table row, the user can allocate quantities to one or more suppliers (e.g. reorder 20 → Supplier A 5, Supplier B 10, leave others empty). Empty suppliers are skipped. The supplier picker lists available suppliers with the most recently used supplier(s) at the top of the list.

**Why this priority**: Multi-supplier split is the core purchasing decision this feature enables.

**Independent Test**: On a row with reorder qty 20, assign 5 and 10 to two suppliers and leave others empty; verify generate includes only those two; verify recently used suppliers appear above less recent ones in the picker.

**Acceptance Scenarios**:

1. **Given** a table row with reorder qty R, **When** the user opens supplier allocation, **Then** they can enter quantities for multiple suppliers for that SKU.
2. **Given** suppliers with purchase history for the company (and allowlisted suppliers where that rule already applies), **When** the picker opens, **Then** suppliers are listed with recently used suppliers sorted to the top.
3. **Given** allocations on a row (e.g. reorder 20 with only Sup1=5 and Sup2=10 filled), **When** other suppliers are left empty, **Then** those empty suppliers are ignored and the row is still eligible for generate.
4. **Given** one or more rows with at least one positive supplier quantity, **When** the user generates, **Then** generate succeeds without requiring supplier quantities to sum to the reorder qty.
5. **Given** a supplier allocation of zero or blank, **When** generate runs, **Then** that supplier does not receive a line for that SKU.
6. **Given** supplier quantities on a row that sum to more than the row’s reorder qty, **When** the user tries to generate, **Then** the system blocks generate for that row and shows a clear over-allocation message.

---

### User Story 4 - Generate supplier-wise Excel order files (Priority: P1)

The user clicks Generate. The system produces one Excel file per supplier that has at least one positive allocated quantity across the table, packaged as a **single zip download**. Each Excel contains SKU, description, and order quantity for that supplier’s lines only.

**Why this priority**: Export is the deliverable buyers send or use for placing orders.

**Independent Test**: Build a table with two suppliers receiving quantities; generate; confirm one zip containing two Excel files, each with only that supplier’s SKUs and quantities, columns SKU / description / order qty.

**Acceptance Scenarios**:

1. **Given** a table with positive quantities for suppliers A and B (other suppliers empty; sums may be less than reorder qty), **When** the user generates, **Then** a single zip download is produced containing separate Excel files for A and for B only.
2. **Given** a supplier file inside the zip, **When** opened, **Then** each row has SKU, description, and that supplier’s order quantity (not the full reorder qty unless they were allocated the full amount).
3. **Given** no positive allocations, **When** the user generates, **Then** generation is refused with a clear message.
4. **Given** successful generate, **When** files are delivered, **Then** each Excel filename inside the zip clearly identifies the supplier (and optionally date) so files are distinguishable.
5. **Given** only one supplier has positive quantities, **When** the user generates, **Then** a zip is still produced containing that single Excel file.

---

### Edge Cases

- Brand filter with no matching items → empty search list with a clear empty state; table unchanged.
- Search text matches description but not SKU → item still appears.
- Very large catalog under “show all with empty search” → list remains usable (scrollable / progressively loaded) without requiring the user to type first.
- Supplier never purchased before but known to the business → still selectable if present in the company’s supplier list; recent-sort places unused suppliers after recently used ones.
- Same SKU selected after removal → can be added again as a new row.
- User leaves the OSF page and returns later (same browser/device) → working table is restored until the user clears it.
- User refreshes the page → working table is restored (same browser/device retention).
- User clears the working table → all rows and allocations are removed and retention is reset for a fresh build.
- Reorder qty changes in OSF after a row was added → row keeps the reorder qty captured at add time unless the user refreshes/re-adds the item (documented in Assumptions).
- Rows with only empty supplier slots and no positive qty → included in table for planning but do not contribute lines on generate; generate still succeeds if other rows have positive allocations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide optional brand-wise filtering of OSF items in addition to existing item filters (top priority, priority, newly added, VAT-wise). Default MUST be all brands (no brand required to search or add).
- **FR-002**: System MUST allow searching/selecting items from the filtered set; with empty search input, MUST list all items matching current filters.
- **FR-003**: As the user types in search, the system MUST filter the list by SKU and description.
- **FR-004**: Each search result row MUST display SKU and description.
- **FR-005**: Selecting a search result MUST add the item to a working order table without clearing existing rows.
- **FR-006**: The working table MUST show at least SKU, description, and OSF reorder quantity for each row. Reorder quantity MUST be read-only (not editable by the user).
- **FR-007**: Changing brand or other item filters MUST NOT clear the working table.
- **FR-008**: Users MUST be able to remove individual rows from the working table and MUST be able to clear the entire working table in one action.
- **FR-009**: Users MUST be able to allocate each row’s reorder quantity across one or more suppliers as non-negative quantities (empty/zero suppliers allowed and skipped on generate).
- **FR-010**: Supplier lists for allocation MUST show recently used suppliers above less recently used suppliers.
- **FR-011**: Generate MUST include only suppliers with positive allocated quantity (empty/zero suppliers skipped). Generate MUST NOT require allocating every supplier or that allocations sum to reorder qty. Generate MUST be blocked when there are no positive allocations anywhere in the table, or when any row’s supplier quantities sum to more than that row’s read-only OSF reorder quantity (when reorder qty is greater than zero).
- **FR-012**: Generate MUST produce one Excel file per supplier that has at least one positive allocated quantity, packaged as a single zip download (including when only one supplier file exists).
- **FR-013**: Each supplier Excel MUST include columns SKU, description, and order quantity (that supplier’s allocated qty only).
- **FR-014**: Duplicate selection of an already-present SKU MUST NOT create a second table row.
- **FR-015**: Only users who can use OSF purchasing features MAY use this supplier-order builder and generate exports (same access class as OSF generate / purchasing).
- **FR-016**: Over-allocation checks MUST use the fixed OSF reorder quantity captured when the item was added (not a user-edited value).
- **FR-017**: The working table and its supplier allocations MUST persist on the same browser/device across page refresh and navigation away/return, until the user explicitly clears the table. Multi-device server-saved drafts are out of scope for v1.

### Key Entities

- **OSF item (catalog row)**: Product available for ordering, with SKU, description, brand, and OSF-derived reorder quantity; subject to priority / VAT / newly added / brand filters.
- **Working order row**: User-selected SKU held in the draft table with captured **read-only** OSF reorder quantity and optional multi-supplier allocations.
- **Supplier allocation**: Quantity assigned to one supplier for one working order row; many allocations per row optional; empty/zero allocations are skipped on generate; sum may be less than reorder qty but must not exceed it.
- **Supplier**: Purchasing counterparty; ordered in pickers with recent-use preference.
- **Supplier order file**: Excel export for one supplier containing that supplier’s allocated lines (SKU, description, order qty); packaged with other suppliers’ files in one zip per generate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A buyer can filter by brand, open search with no typing, select an item, and see it in the table with SKU, description, and reorder qty in under 1 minute for a familiar catalog.
- **SC-002**: After adding items under two different brands without clearing the table, 100% of previously added rows remain visible with correct SKUs.
- **SC-003**: For a row with reorder qty 20, a buyer can allocate 5 and 10 to two suppliers (third left empty) and generate a zip with two supplier Excel files whose order qtys for that SKU are 5 and 10; empty suppliers produce no files.
- **SC-004**: Generate refuses over-allocation (supplier qtys summing above reorder qty) 100% of the time in acceptance testing; under-allocation and empty suppliers are allowed and skipped.
- **SC-005**: In usability checks, at least 9 of 10 purchasing users correctly identify that empty search lists all currently filtered items and that typing narrows by SKU/description.

## Assumptions

- This feature lives in the OSF purchasing experience as an addition to existing item filtering (priority / newly added / VAT), not a replacement of OSF workbook generate.
- “Reorder qty according to OSF” means the same TOTAL ORDER QTY (or equivalent OSF order quantity) the buyer would see for that SKU in the OSF workflow at the time the item is added to the table; it is display-only in the working table.
- Existing item filters (top priority, priority, newly added, VAT-wise) remain available and combine with an optional brand filter (AND logic when a brand is selected).
- Supplier universe follows existing company purchasing / allowlist rules already used elsewhere in purchasing/OSF.
- “Recently used” suppliers are ordered by most recent purchase activity known to the system (per company; prefer per-SKU recency when history exists for that SKU, otherwise company-wide recent suppliers).
- Working table persistence for v1 is **same browser/device** (survives refresh and return) until explicit clear; durable multi-device server drafts are out of scope.
- Generate delivers a **single zip** containing one Excel file per supplier with positive allocations (required packaging, including a one-file zip when only one supplier has qty).
- Quantities are non-negative; under-allocation is allowed (empty suppliers skipped); over-allocation (sum above reorder qty) blocks generate until corrected.
- Scope excludes placing the actual ERP purchase order automatically — Excel export only.
