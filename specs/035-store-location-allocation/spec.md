# Feature Specification: Store Location Allocation

**Feature Branch**: `035-store-location-allocation`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "i hsve new requirement, for stores user store support part, now we have OSF we can get total ROP for main company, after thtat we have to devide that quantity for companies(locations) i want UI store user can serach itemm by SKU,barcode,(i want make barcode reader machine work for this) when search that item it should show priority level, sku, barcode, description, reorder qty for whole company,cus suppliers bring lot of goods we have to choose how much wee need to take for us, by building this we can identify which amount we should get, and also we can show location wise how that products devide, also i have deeper logic, some times we order low qtty than reorder quantity, for this scenarion i want make logic we have to devide those goods for locations based on sale of that item on that location, current stock of that item on that location, (ex- if item ROP is 50 and location wise rops are A-10,B-10,C-15,D-15 but supplier bring us only 30, we have to devide that to locations, )"

## Clarifications

### Session 2026-08-08

- Q: What should the tool produce when the user finishes? → A: **Advisor + export/print** — on-screen location split plus download/print of the plan; no automatic ERP stock transfers and no required server-saved history in v1.
- Q: How should short shipments (take < need) be split? → A: **Need × sales** — weight `need × (1 + sales)` where need = max(0, location ROP − stock); cap at need while other locations still have unmet need; whole numbers sum to take qty.
- Q: Which locations should appear in the split? → A: **All active OSF ROP locations** (columns marked for ROP in OSF configuration).
- Q: What number is “company reorder qty” on the item screen? → A: **TOTAL ORDER QTY** from OSF (same company order need as purchasing OSF).
- Q: What counts as “sales” for each location? → A: **Cosmo completed sales, last 30 days, per location** (delivery/invoice-complete style attribution mapped to that OSF ROP location’s shops/warehouses).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find an item by SKU or barcode (Priority: P1)

A store-support user opens the store allocation tool and searches for a product by SKU or barcode. Barcode scanner hardware that types into the search field works the same as keyboard entry (scan focuses/fills search and resolves the item). When an item is found, the screen shows priority level, SKU, barcode, description, and company-wide reorder quantity (**OSF TOTAL ORDER QTY**).

**Why this priority**: Nothing else works until the user can reliably identify the item, including with a barcode reader on the receiving floor.

**Independent Test**: Search by known SKU and by barcode (including a simulated scanner paste/enter); verify the item card shows priority, SKU, barcode, description, and company reorder qty; unknown code shows a clear not-found state.

**Acceptance Scenarios**:

1. **Given** a catalog item with SKU and barcode, **When** the user types the SKU and confirms search, **Then** that item’s priority, SKU, barcode, description, and OSF TOTAL ORDER QTY are shown.
2. **Given** the same item, **When** the user enters or scans the barcode (including scanner “keyboard wedge” input ending with Enter), **Then** the same item detail is shown without requiring a separate SKU lookup.
3. **Given** a code that matches no active item, **When** searched/scanned, **Then** the user sees a clear “not found” message and no fabricated item data.
4. **Given** multiple matches for a partial SKU, **When** the user searches, **Then** a selectable result list appears; selecting one loads that item’s detail.

---

### User Story 2 - Enter how much we take and see location split (Priority: P1)

After selecting an item, the user enters how many units the store will take from the supplier shipment (received / take qty). The system shows a location-wise breakdown across **all active OSF ROP locations** (same location columns purchasing uses for ROP), so store support can see how much each location should get.

**Why this priority**: The core job is deciding “how much we take” and “where it goes” when suppliers bring large lots.

**Independent Test**: For an item with known company reorder qty and location ROPs, enter a take qty; verify each location’s suggested share is shown and the shares sum to the take qty (within rounding rules).

**Acceptance Scenarios**:

1. **Given** an item is selected, **When** the user enters a take qty greater than zero, **Then** a location table shows each location with its suggested allocation qty.
2. **Given** location allocations are shown, **When** take qty is Q, **Then** the sum of location suggested qtys equals Q (after integer rounding rules below).
3. **Given** take qty is blank or zero, **When** viewed, **Then** location suggestions are empty or zero with guidance to enter take qty.
4. **Given** take qty exceeds a sensible upper bound (e.g. far above company reorder need), **When** entered, **Then** the system still computes a split but shows a clear warning that take qty is above company reorder qty.

---

### User Story 3 - Split short shipments using sales and stock (Priority: P1)

When the take qty is **less than** the company reorder quantity (short shipment / we take less than full need), the system divides units across locations using each location’s **sales** for that item and **current stock** for that item (together with location ROP as the target need), not a naive equal split.

**Example intent**: Company ROP/reorder need 50; location ROPs A=10, B=10, C=15, D=15; supplier/take only 30 → allocate 30 across A–D using sales + stock awareness so hungrier / higher-selling locations get more of the shortfall share.

**Why this priority**: This is the business rule that makes short receipts fair and operationally useful.

**Independent Test**: Fixture item with known location ROP, stock, and sales; take qty 30 vs company need 50; verify allocations favor locations with higher unmet need and/or higher sales, sum to 30, and never exceed each location’s remaining need unless all needs are filled.

**Acceptance Scenarios**:

1. **Given** take qty is less than company reorder qty, **When** allocation is calculated, **Then** each location’s share uses weight `need × (1 + sales)` with `need = max(0, locationROP − stock)`.
2. **Given** a location has stock already at or above its ROP (unmet need 0), **When** short-shipment allocation runs, **Then** that location receives 0 unless every location has zero unmet need (then fall back to sales-weighted split of remaining units).
3. **Given** take qty equals or exceeds the sum of unmet needs across locations, **When** calculated, **Then** each location is filled up to unmet need first; any leftover (if take still higher) is distributed by sales weight or left unallocated with a clear “excess vs need” note.
4. **Given** take qty equals company reorder qty and location ROPs sum consistently, **When** calculated, **Then** suggestions align with filling location needs (ROP − stock) rather than inventing different totals.
5. **Given** integer units only, **When** proportional math produces fractions, **Then** quantities are whole numbers summing exactly to take qty (largest-remainder / highest-weight residual method).

---

### User Story 4 - Adjust suggested shares and export the plan (Priority: P2)

Store users can manually override a location’s suggested qty (within validation) so floor judgment can adjust the model, while still seeing the system suggestion and company totals. When the plan is valid (location qtys sum to take qty), the user can **download or print** the allocation plan for receiving/dispatch use. The tool does **not** create ERP stock transfers automatically in v1.

**Why this priority**: Operations often need a human tweak and a physical/list copy; secondary to auto-split.

**Independent Test**: Change one location’s qty until totals match take qty; export/print and verify location names and qtys; confirm no stock-transfer document is created by export alone.

**Acceptance Scenarios**:

1. **Given** suggestions are shown, **When** the user edits a location qty, **Then** the edited value is kept and the UI shows whether location qtys still sum to take qty.
2. **Given** edited location qtys do not sum to take qty, **When** the user tries to export/print the allocation plan, **Then** the system blocks with a clear message until totals match (or user reverts to suggestion).
3. **Given** location qtys sum to take qty, **When** the user exports or prints, **Then** the output lists each location and its qty (plus item identity fields needed on the floor).
4. **Given** a successful export/print, **When** checked in ERP/operations systems, **Then** no automatic stock transfer or similar move was created solely by this action.
---

### Edge Cases

- Item has company reorder qty but some locations missing ROP → treat missing location ROP as 0 need for that location; still list the active ROP location column with 0.
- Item has no sales history at a location → sales weight 0 for that location; if all sales are 0, weight by unmet need only (Cosmo completed sales last 30 days).
- Item has no stock data for a location → treat stock as 0 for need calculation (and show stock as unknown/0 clearly).
- Barcode scans rapidly / duplicate Enter → debounce so one scan yields one lookup.
- User without store-support access → cannot use the tool.
- Inactive/archived SKU → not found or clearly marked unavailable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a store-support allocation UI where authorized store users can look up items by SKU or barcode.
- **FR-002**: Barcode input MUST work with standard barcode scanners that emulate keyboard entry into the search field (including typical Enter suffix).
- **FR-003**: After a successful lookup, the system MUST display priority level, SKU, barcode, description, and company-wide reorder quantity for the item.
- **FR-004**: Users MUST be able to enter a take qty (how many units to take from the supplier lot for the company).
- **FR-005**: System MUST show a location-wise suggested division of the take qty across **all active OSF location columns that include ROP** for the company.
- **FR-006**: When take qty is less than company reorder need, allocation MUST use weight `need_i × (1 + S_i)` where `need_i = max(0, locationROP_i − stock_i)` and `S_i` is Cosmo completed sales units for that SKU at that location over the last 30 days; MUST prefer unmet-need locations and MUST NOT give units to zero-need locations while other locations still have unmet need (except the all-zero-need fallback in Assumptions).
- **FR-007**: Location suggested quantities MUST be non-negative whole numbers that sum exactly to the take qty (when take qty is a valid whole number).
- **FR-008**: System MUST NOT invent stock, sales, ROP, or priority; missing inputs are shown as missing/zero per edge cases and do not fabricate ERP values.
- **FR-009**: Users MUST be able to manually adjust location quantities; exporting or printing a plan MUST require location qtys to sum to take qty.
- **FR-010**: Only users authorized for store support (or an equivalent store-operations permission) MAY use this tool.
- **FR-011**: Company reorder qty shown MUST be the OSF **TOTAL ORDER QTY** for that SKU (same company-level order need as the purchasing OSF workbook).
- **FR-012**: System MUST allow the user to download and/or print the allocation plan (item identity + per-location qty) when the plan is valid.
- **FR-013**: Export/print MUST NOT by itself create ERP stock transfers or equivalent automated stock moves in v1.
- **FR-014**: Location sales factor `S_i` MUST be Cosmo completed sales units for that SKU over the last 30 days attributable to that OSF ROP location’s mapped shops/warehouses (0 when none).

### Key Entities

- **Catalog item**: SKU, barcode, description, priority; company reorder qty = OSF TOTAL ORDER QTY.
- **Location**: An active OSF location column with ROP enabled; used for store division of take qty.
- **Location need**: Location ROP, location stock, unmet need = max(0, ROP − stock), location sales = Cosmo completed units last 30 days for that SKU at that location.
- **Take qty**: User-entered units taken from the supplier shipment for this company.
- **Allocation plan**: Suggested (and optionally edited) per-location quantities summing to take qty.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A store user can scan or type a barcode/SKU and see item detail (priority, SKU, barcode, description, company reorder qty) in under 5 seconds for a known item under normal conditions.
- **SC-002**: For the short-shipment example pattern (company need 50, take 30, multiple locations with ROP/stock/sales), allocation suggestions always sum to 30 and never leave a location with stock ≥ ROP holding units while another location still has unmet need (unless all unmet needs are already zero).
- **SC-003**: In acceptance tests with fixed fixtures, 100% of short-shipment runs produce whole-number location qtys summing to take qty.
- **SC-004**: At least 9 of 10 store-support users in a usability check correctly identify take qty as “how much we take now” and can read each location’s suggested share without training beyond a one-line hint on screen.
- **SC-005**: Unknown barcode/SKU returns a clear not-found result with no incorrect item shown, in 100% of negative test cases.
- **SC-006**: From a valid on-screen plan, a store user can produce a printable or downloadable location allocation list in under 1 minute without creating stock transfers.

## Assumptions

- “Companies (locations)” means **all active OSF location columns with ROP enabled** for the company (not separate legal entities; not a manual pick-list per session in v1).
- This feature is a **store support allocation advisor** for receiving/dividing goods: on-screen suggestions plus **download/print** of the plan. It does **not** place ERP purchase orders or automatically create stock transfers in v1. Durable multi-device saved allocation history in Cosmo is out of scope for v1 unless added later.
- **Company reorder qty** = OSF **TOTAL ORDER QTY** for that SKU (not raw sum of location ROPs alone). Short-shipment comparison (take &lt; need) uses this same TOTAL ORDER QTY as the company need threshold.
- **Short-shipment weighting (confirmed)**:
  1. Compute unmet need per location: `need_i = max(0, locationROP_i − stock_i)`.
  2. Let `S_i` = Cosmo **completed** sales units for the item at that location over the **last 30 days** (delivery/invoice-complete style, attributed via the location’s mapped shops/warehouses). If a location has no attributable sales, `S_i = 0`.
  3. Weight `w_i = need_i × (1 + S_i)` (sales amplify need; zero sales still allows pure need-based share).
  4. Allocate `take qty` proportionally to `w_i` among locations with `w_i > 0`, as whole numbers summing to take qty (largest remainder). Cap each location at `need_i` while any other location still has unmet need; redistribute overflow by remaining weights.
  5. If all `need_i` are 0 but take qty > 0, fall back to sales-only weights `S_i` (or equal split if all sales are 0) and label as “above need.”
- Barcode scanners are treated as keyboard input into the search box (no proprietary scanner SDK required for v1).
- Priority shown is the item’s existing ERP/OSF priority field(s) already used elsewhere in purchasing/OSF.
- Manual overrides apply to the current on-screen plan used for export/print; durable multi-device saved drafts are out of scope for v1.