# Feature Specification: ROP Warehouse Compare

**Feature Branch**: `063-rop-warehouse-compare`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Watch Cosmetics main warehouse and other warehouses. Out of stock in the main warehouse means out of stock on the cosmetics.lk website. Add a percentage-of-ROP filter (example: 30 lists items at 30% of reorder point or below). First watch the main warehouse and both other-company warehouses on ERP2. Add a tab comparing main warehouse stock with shop warehouse stock. Add filters for common SKU, variant SKU, priority status, and VAT status. Add a way to pick any warehouse and compare it with the others. Reuse existing stock, ROP, and catalog data. Do not duplicate functions already built."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flag warehouses that have fallen to a share of their reorder point (Priority: P1)

An authorized purchasing user opens the existing **Stock Comparer** and sets a **percent of reorder point** (for example **30**). The report lists items whose **stock in hand is at or below that percent of that warehouse’s reorder point**.

The first watch covers:

- **Cosmetics main warehouse** — empty here means the item is out of stock for the **cosmetics.lk** website.
- **Both non-shop warehouses of the other company (ERP2)** — the same percent rule, each using that warehouse’s own reorder point and its own stock in hand.

Example: reorder point **100**, percent **30** → the item is listed for that warehouse when stock in hand is **30 or less**.

**Why this priority**: Absolute “zero units” already exists. Staff still miss items that are not empty but have already dropped through a dangerous share of the reorder point, on the website warehouse and on the other company.

**Independent Test**: Item A, Cosmetics main reorder point 100, stock 30 → listed at percent 30. Item B, same reorder point, stock 31 → not listed. Item C, ERP2 warehouse reorder point 100, stock 20 → listed on that warehouse. Item D, Cosmetics main stock 0 → listed, and the row states that cosmetics.lk is out of stock for that item.

**Acceptance Scenarios**:

1. **Given** the user has Stock Comparer access, **When** they open the page, **Then** they can enter a reorder-point percent and run the report on the existing Stock Comparer (same access as today).
2. **Given** percent **30** and a watched warehouse whose reorder point is **100**, **When** stock in hand at that warehouse is **30**, **Then** the item is listed for that warehouse.
3. **Given** the same reorder point and percent, **When** stock in hand is **31**, **Then** the item is not listed for that warehouse under the percent rule.
4. **Given** Cosmetics main stock in hand is **0**, **When** the row is shown, **Then** the user can see that the item is out of stock for cosmetics.lk.
5. **Given** an item is healthy at Cosmetics main but at or below the percent at one ERP2 company warehouse, **When** the report runs, **Then** that ERP2 warehouse still appears as a hit, using that warehouse’s own reorder point.
6. **Given** a watched warehouse has no reorder point, or the reorder point is **0**, **When** the percent rule runs, **Then** that warehouse is not treated as a percent hit and the user can see that the reorder point is missing (the system does not invent one).
7. **Given** a user without Stock Comparer access, **When** they try to open the page, **Then** access is denied.

---

### User Story 2 - Compare Cosmetics main with shop warehouses (Priority: P1)

The user opens a **shops** tab and sees **Cosmetics main** stock beside **shop warehouse** stock for the same item. Shops are the physical shop floors already used for stock comparison. This tab is for moving or judging shop stock against the website warehouse, separate from the other-company warehouse watch.

**Why this priority**: The main watch mixes company warehouses and shops. Shop replenishment is a different job and needs its own list.

**Independent Test**: Cosmetics main has 0 and Shop A has 12 for the same item. The shops tab shows main 0 and Shop A 12. A non-shop ERP2 warehouse does not appear as a shop on this tab.

**Acceptance Scenarios**:

1. **Given** a successful run, **When** the user opens the shops tab, **Then** each listed item shows Cosmetics main quantity and each shop warehouse quantity.
2. **Given** a shop has stock and Cosmetics main does not, **When** the shops tab is viewed, **Then** the shop quantity is visible so staff can see stock that could cover the website warehouse.
3. **Given** a location is a company warehouse and not a shop, **When** the shops tab is viewed, **Then** that location is not labeled as a shop.
4. **Given** the same shop is named two ways, or has both a shop floor and a back room, **When** the shops tab is viewed, **Then** that shop is shown once, using the shop-floor quantity.

---

### User Story 3 - Narrow the list by identity and status (Priority: P2)

On the watch results, the shops tab, and the any-warehouse compare, the user can narrow rows by:

- **Common SKU** — the shared parent code of variants (example: `CAN07` covers `CAN07_1` and `CAN07_2`).
- **Variant SKU** — one exact sellable code (example: `CAN07_1` only).
- **Priority status** — the product priority already stored for the item (match if either company priority equals the chosen value).
- **VAT status** — the tax status already stored for the item (Vat, Non Vat, or the combined label when the two companies differ).

Filters combine: a row must match every filter that the user set. Clearing a filter widens the list again. Filters do not change the underlying stock or reorder figures.

**Why this priority**: Purchasing already works by parent code, variant, priority, and VAT. Without these filters the new lists are too wide to use.

**Independent Test**: Two variants share common SKU `CAN07`. Filtering common SKU `CAN07` shows both. Filtering variant SKU `CAN07_1` shows only that variant. Choosing priority “Top Priority” hides items that are not that priority on either company. Choosing VAT “Vat” hides non-VAT items.

**Acceptance Scenarios**:

1. **Given** variants `CAN07_1` and `CAN07_2`, **When** the user filters common SKU `CAN07`, **Then** both variants that meet the stock rule are shown.
2. **Given** the same items, **When** the user filters variant SKU `CAN07_1`, **Then** only `CAN07_1` is shown.
3. **Given** a priority value is selected, **When** the list refreshes, **Then** only items whose product priority on company 1 or company 2 equals that value remain.
4. **Given** a VAT status is selected, **When** the list refreshes, **Then** only items with that VAT status remain.
5. **Given** common SKU and VAT status are both set, **When** the list refreshes, **Then** a row must satisfy both.
6. **Given** the user clears the filters, **When** the list refreshes, **Then** the full result set for that tab returns.

---

### User Story 4 - Compare any chosen warehouse with the others (Priority: P2)

The user picks **any one configured stock warehouse** as the focus and sees that warehouse’s stock beside stock at the **other** warehouses for the same items. The same percent-of-reorder-point control can limit the list to items that are low **at the chosen warehouse**. Other warehouses are context (where stock still exists), not a second low-stock rule unless the user is on the primary watch in User Story 1.

**Why this priority**: Main, ERP2, and shops cover the daily cases. Staff still need a one-off compare when the problem warehouse is neither Cosmetics main nor a shop.

**Independent Test**: User selects Warehouse X. Item has 4 at X and 20 at Warehouse Y. With percent 30 and X reorder point 100, the item is listed because 4 is at or below 30% of 100, and Y is shown with 20. Warehouse X is not listed as “elsewhere.”

**Acceptance Scenarios**:

1. **Given** configured stock warehouses, **When** the user opens any-warehouse compare, **Then** they can choose one warehouse as the focus.
2. **Given** a focus warehouse and a percent, **When** the report runs, **Then** only items at or below that percent of **the focus warehouse’s** reorder point are listed.
3. **Given** a listed item has stock at other warehouses, **When** the row is shown, **Then** those other warehouses and quantities are visible and the focus warehouse is not repeated as an “other” location.
4. **Given** the user changes the focus warehouse and runs again, **When** results return, **Then** the list follows the new focus warehouse.
5. **Given** the focus warehouse has no reorder point, **When** the percent rule runs, **Then** that item is not a percent hit for that focus and the missing reorder point is visible.

---

### Edge Cases

- Percent is blank, not a number, below 0, or above 100: the percent report does not run; the user is told the value must be a number from 0 through 100.
- Percent **0**: only warehouses whose stock in hand is **0 or less** relative to a positive reorder point (0% of reorder point).
- Percent **100**: items whose stock in hand is at or below the full reorder point.
- Stock in hand is negative: treated as below any percent from 0 through 100 when a positive reorder point exists.
- Reorder point missing or 0: that warehouse is skipped for the percent rule; stock may still appear as context on a compare row when another warehouse qualified the item.
- Cosmetics main warehouse missing for a SKU: that SKU is not a cosmetics.lk out-of-stock hit (nothing to judge).
- Company-wide “all warehouses” totals are ignored so a total is not treated as a real warehouse.
- Same physical shop named two ways, or shop floor plus back room: one shop, shop-floor quantity.
- Other locations at 0 or less are omitted from “stock elsewhere.”
- Priority or VAT blank on an item: the item does not match a specific priority or VAT filter; it still appears when that filter is cleared.
- Common SKU filter with no parent match: empty list with a clear empty state, not an error.
- Live stock or saved reorder points cannot be loaded: clear failure; previous results are cleared or marked invalid.
- Very large catalogs: on-screen tables may preview the first working rows; export includes the full filtered set for the active view.
- Existing absolute stock threshold (default 0) and the brand-violation tab stay available. The percent rule does not erase them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extend the existing Stock Comparer for users who already have Stock Comparer access. It MUST NOT add a second stock-compare page or a new permission.
- **FR-002**: Users MUST be able to enter a **reorder-point percent** from **0** through **100** and run a report. The match is **inclusive**: stock in hand **≤** (percent ÷ 100) × that warehouse’s reorder point.
- **FR-003**: The primary watch MUST apply that percent rule separately to **Cosmetics main warehouse** and to **both non-shop warehouses of the other company (ERP2)**, each using **that warehouse’s own** stock in hand and **that warehouse’s own** reorder point.
- **FR-004**: When Cosmetics main stock in hand is **0 or less**, the row MUST state that the item is **out of stock for cosmetics.lk**.
- **FR-005**: System MUST NOT invent stock or reorder points. A missing or zero reorder point MUST NOT count as a percent hit.
- **FR-006**: System MUST offer a **shops** tab that compares **Cosmetics main** quantity with **shop warehouse** quantities for the same item.
- **FR-007**: Shop rows MUST use one quantity per physical shop (shop floor when both floor and back room exist) and MUST NOT list non-shop company warehouses as shops.
- **FR-008**: Users MUST be able to filter the primary watch, the shops tab, and any-warehouse compare by **common SKU**, **variant SKU**, **priority status**, and **VAT status**. Set filters combine (all must match). Cleared filters show the full set for that view.
- **FR-009**: Common SKU MUST mean the shared parent code of variant SKUs (the same parent rule purchasing already uses). Variant SKU MUST mean one exact item code.
- **FR-010**: Priority status MUST use the product priority already stored per company. A selected priority matches when **either** company’s priority equals it.
- **FR-011**: VAT status MUST use the tax status already stored for the item (including the combined label when the two companies differ).
- **FR-012**: Users MUST be able to select **any one configured stock warehouse**, then see items at or below the percent of **that** warehouse’s reorder point, with quantities at the **other** warehouses alongside.
- **FR-013**: The focus warehouse MUST NOT be listed again as an “other” location.
- **FR-014**: Users MUST be able to export the active view’s filtered rows (primary watch, shops, or any-warehouse compare) after a successful run.
- **FR-015**: Company-wide “all warehouses” totals MUST NOT be treated as a real warehouse.
- **FR-016**: This feature MUST NOT replace Shopify Stock Showdown, Item Trends, Store Stock Count, the OSF workbook, or store allocation. It MUST NOT create stock transfers.
- **FR-017**: The existing absolute stock threshold and the existing brand-violation review MUST remain available on Stock Comparer.

### Key Entities

- **Watched warehouse hit**: An item whose stock in hand at one watched warehouse is at or below the chosen percent of that warehouse’s reorder point. Attributes: item code, title, warehouse, stock in hand, reorder point, percent of reorder point, cosmetics.lk out-of-stock flag when the warehouse is Cosmetics main.
- **Shop comparison row**: Same item at Cosmetics main and at each shop warehouse. Attributes: item code, title, main quantity, shop name, shop quantity.
- **Focus comparison**: One user-selected warehouse versus the other warehouses. Attributes: focus warehouse, focus stock, focus reorder point, other warehouse names and quantities.
- **Catalog identity**: Common SKU, variant SKU, priority status (per company), VAT status. Used only to filter; not recalculated by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can set percent **30**, run the report, and see Cosmetics-main and ERP2 warehouse hits in **under 60 seconds** on a typical working catalog.
- **SC-002**: In review sampling, **100%** of percent-rule rows have stock in hand at or below the entered percent of that row’s warehouse reorder point, and **0** rows appear for a warehouse with a missing or zero reorder point.
- **SC-003**: For the example reorder point **100** and percent **30**, items at stock **30** are included and items at stock **31** are excluded for that warehouse.
- **SC-004**: When Cosmetics main is **0**, reviewers can tell the item is out of stock for cosmetics.lk **without opening the website**.
- **SC-005**: On the shops tab, reviewers can read Cosmetics main and shop quantities for a sampled item in **one view**, with each physical shop shown **once**.
- **SC-006**: Applying common SKU, variant SKU, priority, and VAT together returns only rows that match **all** set filters; clearing them restores the unfiltered result for that view.
- **SC-007**: After choosing a focus warehouse, **100%** of listed items are low against **that** warehouse’s reorder point, and the focus warehouse does not appear again as an other location.
- **SC-008**: Users without Stock Comparer access have **0** successful page loads or exports.
- **SC-009**: In a pilot with purchasing staff, **80%** can answer “which watched warehouse is at or below the percent, and where else stock sits” without opening a second stock tool.

## Assumptions

- This **extends the existing Cosmetics Stock Comparer**. It is not a new dashboard. Same audience, same access. The absolute threshold (default 0) and the brand-violation tab stay.
- **Cosmetics main** is the warehouse that feeds cosmetics.lk. Stock in hand **0 or less** there means the website is out of stock for that item. Live website quantity is not a second number in this feature.
- **Other company, both warehouses** means the **two non-shop warehouses on ERP2** (the other company). Shops, even if they sit on ERP2, belong on the shops tab, not in that pair.
- Each warehouse’s **reorder point** is the reorder quantity purchasing already saves for that item at that location (the same figures the order-support workbook uses, including its existing “percent of reorder point” idea). This feature reads those figures. It does not create a new reorder-point store.
- **Stock in hand** is the live warehouse balance already used by Stock Comparer for configured stock warehouses on both companies. No second stock file and no upload.
- **Common SKU** uses the existing parent-code rule (`CAN07_1` and `CAN07-1` share parent `CAN07`). **Variant SKU** is the catalog item code as sold.
- **Priority status** is the existing product priority on company 1 and company 2. **VAT status** is the existing tax status (Vat, Non Vat, or both when they differ). Filter choices come from values already on the catalog.
- Shop identification reuses the existing shop-versus-warehouse distinction (shop floors, not website, transit, or all-warehouses totals).
- “Any warehouse” means any stock warehouse already configured for Stock Comparer, not a free-typed name.
- Percent filter and identity filters **add** to the current tool. They do not remove 90-day sales or Critical badges already on the main shortage view.
- No automatic warehouse transfers. Staff decide movements outside this screen.
- Shopify Stock Showdown (website quantity at or below 3, plus transfer suggestions), Item Trends, and store allocation stay separate. Do not rebuild them here.

## Out of Scope

- A new page, new permission, or a copied stock report.
- Editing reorder points, priority, or VAT status from this screen.
- Auto-creating transfers or purchase orders.
- Using website storefront quantity as a second stock figure.
- Rebuilding the order-support workbook, Item Trends, store allocation, or Shopify Stock Showdown.
- Changing which brands belong on which company (existing brand-violation tab stays as it is).

## Already available (do not rebuild)

These outcomes already exist. This feature only **adds** the percent rule, the shops tab, the identity filters, and any-warehouse compare on top of them.

- Stock Comparer already lists items whose **Cosmetics main** quantity is at or below an **absolute** threshold (default **0**) and shows **other warehouses first, then shops**, plus last-90-day website sales and a Critical badge.
- Stock Comparer already has a **brand-violation** tab and **exports**.
- Live stock for configured warehouses on **both companies** is already loaded for that report.
- Reorder points per location, and stock as a **percent of reorder point**, already exist on the order-support workbook. They are **not** yet a filter on Stock Comparer.
- Common (parent) SKU, variant SKU, product priority, and VAT status already exist on the purchasing catalog and workbook. They are **not** yet filters on Stock Comparer.
- Shop-versus-warehouse naming is already defined for stock reports and item trends.
