# Feature Specification: OSF Zip Clear & Priority Cascade Filters

**Feature Branch**: `034-osf-zip-clear-cascade`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "in OSF part after we generate this zip this list should remove, also when we select priority level then brand list should show according to that selected priority level brands, also products, got it?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clear working table after successful zip generate (Priority: P1)

A purchasing user builds a supplier-order working table in OSF Supplier Orders, allocates suppliers, and clicks **Generate zip**. After the zip downloads successfully, the working table is emptied automatically so they start fresh for the next order batch. Failed generates leave the table intact so they can fix allocations and retry.

**Why this priority**: Leaving completed rows in the table after generate causes accidental re-orders and forces a manual **Clear table** step every time.

**Independent Test**: Add rows with valid allocations, generate zip successfully, confirm the table is empty and draft storage is cleared; force a generate failure and confirm rows remain.

**Acceptance Scenarios**:

1. **Given** one or more rows in the working table with valid allocations, **When** the user successfully completes **Generate zip** and receives the download, **Then** the working table is cleared of all rows and supplier allocations.
2. **Given** a successful generate that cleared the table, **When** the user refreshes or returns to the page on the same browser/device, **Then** the working table remains empty (cleared draft is not restored).
3. **Given** rows in the working table, **When** generate fails or is cancelled before success, **Then** the working table and allocations are unchanged.
4. **Given** an empty working table, **When** the user views the page after a prior successful generate, **Then** **Clear table** is unnecessary because there is nothing left to clear.
5. **Given** the user has not generated yet, **When** they use **Clear table**, **Then** behavior remains as today (manual clear still available and works independently of generate).

---

### User Story 2 - Brand options cascade from selected priority (Priority: P1)

When the user selects a priority level (e.g. Top Priority, Priority, Newly Added, VAT-wise), the **Brand** dropdown only lists brands that have at least one OSF-searchable item matching that priority. Choosing **All priorities** restores the full brand list. If the currently selected brand is not valid for the new priority, brand resets to **All brands**.

**Why this priority**: Showing every brand while a priority is active makes buyers hunt through empty brand choices and slows item selection.

**Independent Test**: Select a priority known to cover only a subset of brands; open Brand and confirm only those brands appear; switch priority and confirm the brand list updates; select a brand then change priority so that brand no longer applies and confirm brand resets.

**Acceptance Scenarios**:

1. **Given** priority is **All priorities**, **When** the user opens the Brand dropdown, **Then** all available brands are listed (same scope as today’s full brand list).
2. **Given** the user selects a specific priority level, **When** the Brand dropdown is shown, **Then** only brands that have at least one item matching that priority appear.
3. **Given** a brand is selected and the user changes priority to one that still includes that brand, **When** filters refresh, **Then** the brand selection is kept.
4. **Given** a brand is selected and the user changes priority to one that does **not** include that brand, **When** filters refresh, **Then** brand resets to **All brands**.
5. **Given** a priority with no matching brands, **When** the user opens Brand, **Then** the list is empty (or only shows that no brands match) and item search reflects no brand-scoped items for that priority.

---

### User Story 3 - Product/item list follows priority (and brand) (Priority: P1)

Item search / product listing always respects the active priority filter: only SKUs that match the selected priority are offered. When a brand is also selected, items must match both priority and brand. Changing priority immediately updates which products are available in search (the working table itself is not cleared by filter changes).

**Why this priority**: Priority without product filtering is incomplete; buyers expect the SKU list to match the priority they just chose.

**Independent Test**: With priority A selected, open item search and verify only priority-A items; change to priority B and verify the list refreshes; combine priority + brand and verify intersection.

**Acceptance Scenarios**:

1. **Given** a specific priority is selected and brand is **All brands**, **When** the user opens item search (empty query lists all filtered items), **Then** only products matching that priority are listed (SKU and description).
2. **Given** a priority and a brand are both selected, **When** the user opens item search, **Then** only products matching **both** filters are listed.
3. **Given** the user changes priority while item search is open or about to open, **When** the filtered set refreshes, **Then** the product list updates to the new priority (and current brand, if still valid).
4. **Given** rows already in the working table, **When** the user changes priority or brand filters, **Then** working-table rows remain (filter changes do not clear the table; only successful generate or Clear table does).
5. **Given** priority is **All priorities**, **When** the user searches items, **Then** products are not restricted by priority (brand and text search still apply as usual).

---

### Edge Cases

- Generate succeeds for download but the browser blocks the file: still treat as success for clearing if the system completed generate; if generate itself errors, do not clear.
- User generates with an empty table: generate remains blocked/unavailable as today; nothing to clear.
- Priority changes while a brand that remains valid is selected: keep brand; product list still re-filters.
- Priority changes while typed search text is present: re-apply text filter against the new priority/brand item set.
- Brand list under a priority has one brand: that brand is selectable; products still require matching that priority (and brand if chosen).
- Manual **Clear table** after partial work still clears without requiring generate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a **successful** Generate zip (download package produced), the system MUST clear the entire working order table, including all rows and supplier allocations, and MUST clear the persisted same-browser draft so refresh does not restore those rows.
- **FR-002**: If Generate zip fails or does not complete successfully, the system MUST leave the working table and draft unchanged.
- **FR-003**: Manual **Clear table** MUST continue to clear the working table and draft independently of generate.
- **FR-004**: When a specific priority level is selected, the Brand control MUST only offer brands that have at least one OSF-searchable item matching that priority.
- **FR-005**: When priority is **All priorities** (or equivalent unset), the Brand control MUST offer the full brand list as today.
- **FR-006**: When the user changes priority and the currently selected brand is not in the new priority-scoped brand set, the system MUST reset brand to **All brands**.
- **FR-007**: Item/product search and listing MUST include only items that match the active priority filter (when a specific priority is selected).
- **FR-008**: When both priority and brand are set, item/product search MUST include only items matching both.
- **FR-009**: Changing priority or brand MUST update the available product/item list without clearing the working table.
- **FR-010**: Existing supplier-orders behaviors outside this scope (multi-supplier allocation, zip contents, reorder qty read-only, draft persistence until clear/generate success) MUST remain unchanged unless superseded by FR-001.

### Key Entities

- **Working order table**: In-progress list of selected OSF items with supplier allocations; cleared on successful generate or manual clear.
- **Priority level**: Existing OSF priority filter values (including all-priorities).
- **Brand**: Vendor/brand used to narrow item search; options depend on selected priority.
- **OSF searchable item / product**: SKU with description and reorder qty; visible in search only when it matches active priority (and brand if set).
- **Generate zip result**: Success produces supplier Excels in one zip and triggers table clear; failure does not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After every successful Generate zip in acceptance testing, the working table shows zero rows and a refresh does not restore the previous draft.
- **SC-002**: After a failed generate in acceptance testing, 100% of previously present rows and allocations remain.
- **SC-003**: For any selected specific priority, 100% of brands shown in the Brand control have at least one matching item under that priority, and no brand that only has items outside that priority appears.
- **SC-004**: For any selected specific priority (and optional brand), 100% of products shown in item search match the active filters; buyers can confirm with spot-checks against known SKUs.
- **SC-005**: Buyers can complete “filter by priority → pick brand → add items → allocate → generate → start next batch” without using **Clear table** after a successful generate, in under the same number of steps as today minus the manual clear.

## Assumptions

- This enhances the existing OSF Supplier Orders screen (feature 031); it does not replace allocation or zip generation rules.
- “List should remove” means the **working order table** (selected SKUs), not the Brand dropdown or priority options.
- “Brand list according to selected priority” means brands that currently have matching OSF-searchable items for that priority, not a separate static brand–priority mapping table.
- “Also products” means the item search / selectable product list filters by the same priority (and brand when set).
- Clearing after generate happens only on **success**, so users can retry after errors without re-adding every SKU.
- Filter changes still do **not** clear the working table (consistent with 031); only successful generate and **Clear table** clear it.
- Priority option labels and values remain the existing ERP/OSF priority set already used on this screen.
- No new user roles or permissions; same users who can generate supplier-order zips today get this behavior.
- Out of scope: changing zip file contents, supplier ranking, reorder-qty editing, or multi-device draft sync.
