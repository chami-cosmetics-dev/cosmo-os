# Feature Specification: Stock Compare Redesign

**Feature Branch**: `060-stock-compare-redesign`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "redesign stock compare page, two tabs (main stock availability + brand ERP violations), Cosmetics main vs other warehouses online first then shops, threshold focused on 0 stock plus 90-day sales critical badge, keep tab-specific exports"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find Cosmetics-main shortages and stock elsewhere (Priority: P1)

An authorized purchasing or inventory user opens **Stock Comparer**, stays on the **main tab**, and runs the report. They see items whose **Cosmetics main** quantity is at or below the stock threshold (default **0**, out of stock). For each flagged item they see whether units exist at **other warehouses**, shown in this order: **online warehouses first**, then **shops**. The point of the view is to protect Cosmetics.lk / Shopify sales: Cosmetics main feeds that channel, so a drop there hits online sales hard. The report exists so staff can pull stock from elsewhere before the online channel goes empty.

**Why this priority**: This is the core job of Stock Comparer. Brand checks and exports do not help if operators cannot see Cosmetics-main risk versus surplus elsewhere.

**Independent Test**: With Cosmetics main at 0, an online warehouse at 8, and a shop at 3 for the same SKU, that SKU appears on the main tab with online stock listed before shop stock. A SKU with Cosmetics main at 5 does not appear when the threshold is 0.

**Acceptance Scenarios**:

1. **Given** the user has Stock Comparer access, **When** they open the page, **Then** they see a two-tab layout with the main stock-availability tab selected by default.
2. **Given** the stock threshold is left at the default **0**, **When** they run the report, **Then** only items whose Cosmetics main quantity is **0 or less** appear on the main tab.
3. **Given** an item has Cosmetics main quantity 0, online warehouse A has 8, and shop B has 3, **When** the row is shown, **Then** A appears in the online group before B in the shop group, each with its quantity.
4. **Given** an item has Cosmetics main quantity above the current threshold, **When** the report runs, **Then** that item is not listed on the main tab.
5. **Given** an item meets the threshold but no other online warehouse or shop has positive stock, **When** the row is shown, **Then** the user sees a clear “no stock elsewhere” state (not a blank row that looks unfinished).
6. **Given** a user without Stock Comparer access, **When** they try to open the page, **Then** access is denied and the navigation entry is not offered.

---

### User Story 2 - Raise threshold without losing Critical bestsellers (Priority: P1)

The user can raise the stock threshold above 0 to include near-empty Cosmetics-main items. Last **90 days** of Cosmetics.lk / Shopify-facing sales still rank items. **Top sellers** in that window show a **Critical** badge even when the threshold is not 0, so a bestseller sitting at 2 units is not treated the same as a dead SKU sitting at 2 units.

**Why this priority**: Threshold alone hides demand. Cosmetics main going low on a fast seller is the sales-risk case this redesign must surface.

**Independent Test**: Threshold 3. Item A has Cosmetics main 2 and is a top 90-day seller. Item B has Cosmetics main 2 and almost no 90-day sales. Both appear (both ≤ 3). Only A shows Critical.

**Acceptance Scenarios**:

1. **Given** the user sets threshold to a number greater than 0, **When** they run the report, **Then** items with Cosmetics main quantity at or below that threshold appear (including 0).
2. **Given** last-90-day Cosmetics.lk / Shopify-facing sales exist, **When** the main tab results render, **Then** each listed item shows its 90-day sales figure so staff can judge urgency.
3. **Given** a listed item ranks as a **top seller** in the last 90 days, **When** the row is shown at any valid threshold, **Then** it displays a **Critical** badge.
4. **Given** a listed item is not a top seller in the last 90 days, **When** the row is shown, **Then** it does not receive the Critical badge, even if Cosmetics main is 0.
5. **Given** 90-day sales cannot be loaded, **When** the report still has stock rows, **Then** stock comparison still appears and Critical badges are omitted with a clear “sales ranking unavailable” note—not invented ranks.

---

### User Story 3 - Review brand-on-wrong-company violations (Priority: P1)

The user opens the **brand tab** and sees items that have **positive stock** in the **wrong company**:

- **Company 1 only brands** (must not appear with stock on Company 2): Keune, Jovees, Savol, Palmers, Olay, Melano, Acnes, Hada Labo, Lipice, Wella, ZGTS.
- **Company 2 only brands** (must not appear with stock on Company 1): Sanford, Golden Rose, Maybeline, Revlon, The Elf, Biovene, Flamingo.

Each violation names the SKU, product title, brand, which company it was found on, the warehouse, quantity, and the rule that failed.

**Why this priority**: Brand-company mix-ups are a separate operational problem from Cosmetics-main shortages. A dedicated tab keeps that work from cluttering replenishment.

**Independent Test**: Acnes with stock on Company 2 appears as a Company 1-only violation. Revlon with stock on Company 1 appears as a Company 2-only violation. Revlon with stock only on Company 2 does not appear.

**Acceptance Scenarios**:

1. **Given** the report has been run, **When** the user opens the brand tab, **Then** they see only brand-company violations (not the Cosmetics-main shortage list).
2. **Given** a Company 1-only brand has positive stock on Company 2, **When** the brand tab is viewed, **Then** that warehouse row is listed with the rule that the brand should only appear on Company 1.
3. **Given** a Company 2-only brand has positive stock on Company 1, **When** the brand tab is viewed, **Then** that warehouse row is listed with the rule that the brand should only appear on Company 2.
4. **Given** a restricted brand has positive stock only on its allowed company, **When** the brand tab is viewed, **Then** that stock is not listed as a violation.
5. **Given** a restricted brand has zero or negative stock on the wrong company, **When** the brand tab is viewed, **Then** that row is not listed as a violation.
6. **Given** no violations exist after a successful run, **When** the brand tab is viewed, **Then** the user sees an explicit empty state, not a broken or leftover main-tab table.

---

### User Story 4 - Export the active tab’s report (Priority: P1)

After a successful run, the user exports from the tab they are working on: **stock report** from the main tab, **brand report** from the brand tab. Each export contains that tab’s working set so it can be shared or processed offline.

**Why this priority**: Existing Stock Comparer value is the downloadable working file. Redesign must not drop that.

**Independent Test**: Run a report that produces both shortage rows and brand violations. Export from the main tab and confirm only stock-availability columns. Export from the brand tab and confirm only violation columns.

**Acceptance Scenarios**:

1. **Given** the main tab has one or more shortage rows, **When** the user exports the stock report, **Then** they receive a file covering those rows (SKU, title, Cosmetics main qty, online warehouses and qtys, shops and qtys, stock-elsewhere flag, 90-day sales, Critical where applicable).
2. **Given** the brand tab has one or more violations, **When** the user exports the brand report, **Then** they receive a file covering those violations (SKU, title, brand, company, warehouse, qty, rule).
3. **Given** the main tab has no shortage rows, **When** the user looks at export stock report, **Then** it is unavailable or clearly disabled.
4. **Given** the brand tab has no violations, **When** the user looks at export brand report, **Then** it is unavailable or clearly disabled.
5. **Given** the user is on the main tab, **When** they export, **Then** they do not receive a brand-violations file as the primary export (and the reverse on the brand tab).

---

### User Story 5 - Switch tabs without losing a finished run (Priority: P2)

After one run, the user can move between the main tab and the brand tab without running the report again. Changing the threshold requires a new run to refresh both tabs.

**Why this priority**: Operators bounce between replenishment and brand cleanup in the same session; a second fetch for a tab switch is waste.

**Independent Test**: Run once, switch to brand tab, switch back; same rows remain. Change threshold without running; previous results stay until the next run.

**Acceptance Scenarios**:

1. **Given** a successful run, **When** the user switches from the main tab to the brand tab and back, **Then** both result sets remain from that run.
2. **Given** the user changes the threshold after a run but does not run again, **When** they view either tab, **Then** they still see the last run’s results, labeled with that run’s threshold.
3. **Given** a new run completes, **When** either tab is viewed, **Then** both tabs reflect the new run (no stale mix of old brand rows and new stock rows).

---

### Edge Cases

- Cosmetics main warehouse is missing for a SKU: that SKU is not treated as a Cosmetics-main shortage (cannot compare what is not there).
- Company-wide “all warehouses” totals appear in source stock: they are ignored so totals are not mistaken for a real location.
- A shop has both a shop-floor location and a back-room / shop-main location: the shop-floor quantity is the one used for that shop.
- The same physical shop is named two ways: it is shown once under one shop name, not double-counted.
- Online warehouses and shops with quantity 0 or less are omitted from “available elsewhere.”
- Product title contains no brand from either restricted list: it never appears on the brand tab.
- Product title contains a restricted brand plus other words: brand match is by brand name appearing in the title (case-insensitive).
- Last-90-day sales are zero: the item can still appear on the main tab if it meets the threshold; it does not get Critical.
- Threshold is not a number: the report does not run; the user is told the threshold must be a number.
- Live stock cannot be loaded (company systems unavailable or no warehouses configured): the user sees a clear failure; previous results are cleared or marked invalid so they do not act on stale stock.
- Very large catalogs: the on-screen main table may show a preview of the first working rows, but the export includes the full result set for that tab.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present Stock Comparer as a two-tab page: **main** (Cosmetics-main shortages vs other locations) and **brand** (brand-on-wrong-company violations).
- **FR-002**: The main tab MUST be the default tab on first open.
- **FR-003**: Users MUST be able to set a numeric **stock threshold** and run the report. Default threshold is **0**.
- **FR-004**: The main tab MUST list only items whose **Cosmetics main** quantity is less than or equal to the threshold used for that run.
- **FR-005**: For each listed main-tab item, the system MUST compare Cosmetics main against **all other configured stock locations**, grouped as **online warehouses first**, then **shops**.
- **FR-006**: Online-warehouse and shop groups MUST show location names and quantities for locations with positive stock only.
- **FR-007**: The main tab MUST state whether stock is available elsewhere (**yes** / **no**) for each listed item.
- **FR-008**: The main tab MUST show each listed item’s **last 90 days** Cosmetics.lk / Shopify-facing unit sales when that sales data is available.
- **FR-009**: The main tab MUST mark **top sellers** in that 90-day window with a **Critical** badge, including when the threshold is greater than 0.
- **FR-010**: Critical ranking MUST NOT hide or exclude non-top sellers that still meet the stock threshold.
- **FR-011**: The brand tab MUST list a violation when a **Company 1-only** brand has positive stock on Company 2: Keune, Jovees, Savol, Palmers, Olay, Melano, Acnes, Hada Labo, Lipice, Wella, ZGTS.
- **FR-012**: The brand tab MUST list a violation when a **Company 2-only** brand has positive stock on Company 1: Sanford, Golden Rose, Maybeline, Revlon, The Elf, Biovene, Flamingo.
- **FR-013**: Brand violations MUST include SKU, product title, matched brand, company found on, warehouse, quantity, and the failed rule.
- **FR-014**: Users MUST be able to **export the stock report** from the main tab when that tab has rows, and MUST be able to **export the brand report** from the brand tab when that tab has rows.
- **FR-015**: Only users who already have Stock Comparer access MUST open the page, run the report, or export either file.
- **FR-016**: Company-wide aggregate “all warehouses” stock lines MUST NOT be treated as a real online warehouse or shop.
- **FR-017**: This redesign MUST NOT replace or remove Shopify Stock Showdown, Item Trends, or Store Stock Count.

### Key Entities

- **Cosmetics main item**: A catalog SKU judged against Cosmetics main quantity; attributes: SKU, title, Cosmetics main qty, 90-day Cosmetics.lk / Shopify-facing sales units, Critical flag, stock-elsewhere flag.
- **Online warehouse stock**: A non-shop Cosmetics / company warehouse (not Cosmetics main) holding the same SKU; attributes: warehouse name, quantity.
- **Shop stock**: A physical shop location holding the same SKU; attributes: shop name, quantity (shop-floor preferred over that shop’s back-room).
- **Brand violation**: A positive-stock finding of a restricted brand on the disallowed company; attributes: SKU, title, brand, company, warehouse, quantity, rule.
- **Report run**: One user-triggered refresh using the current threshold; produces both the main-tab set and the brand-tab set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can open Stock Comparer, run the default (threshold 0) report, and see Cosmetics-main out-of-stock items with online-then-shop availability in **under 60 seconds** on a typical working catalog.
- **SC-002**: In review sampling, **100%** of main-tab rows have Cosmetics main quantity at or below the threshold used for that run.
- **SC-003**: For items that have surplus both online and in shops, reviewers can identify the online locations **before** shop locations on the row or export **without scrolling past shops first**.
- **SC-004**: When 90-day sales are available, **100%** of listed top sellers show a Critical badge at both threshold 0 and a raised threshold (for example 3).
- **SC-005**: Brand-tab sampling finds **0** false positives for allowed-company stock and **0** missed positives for restricted brands with stock on the wrong company (using the stated brand lists).
- **SC-006**: Users can produce a stock-only export from the main tab and a brand-only export from the brand tab in **one action each** after a successful run.
- **SC-007**: In a pilot with purchasing staff, **80%** report they can decide whether Cosmetics main can be topped up from elsewhere without opening a second stock tool.
- **SC-008**: Users without Stock Comparer access have **0** successful page loads or exports.

## Assumptions

- This is a **redesign of the existing Cosmetics Stock Comparer** (same audience and access). It is not a new dashboard and not Shopify Stock Showdown.
- **Cosmetics main** is the Cosmetics.lk / Cosmo main warehouse that feeds Shopify. The main-tab figure is that warehouse’s live on-hand quantity. Live Shopify storefront quantity is not a second filter in this feature; the business risk is that Cosmetics main going empty starves Shopify.
- **Company 1** and **Company 2** are the two Cosmetics ERP companies already used for brand rules (today labeled ERP1 / ERP2). Brand lists keep the current spellings, including **Maybeline**.
- **Online warehouses** are configured Cosmetics / company stock locations that are not shop floors and are not Cosmetics main. **Shops** are physical retail shop locations.
- “Compare with all warehouses” means every configured stock location of those two types, not only a short priority-shop list. Former shop priority groups (Pevi / SPK / DTD first, then Pepiliyana / Kiribathgoda, then others) are **not** the primary grouping in this redesign; grouping is **online, then shops**.
- When a shop has both shop-floor and shop-main / back-room stock, **shop-floor** is the quantity used for that shop.
- Last-90-day sales are **Cosmetics.lk / Shopify-facing completed sales units** for the SKU (the channel Cosmetics main serves), not shop-counter sales.
- **Top seller** means the SKU is in the **top 20%** of catalog SKUs that sold at least one unit in the last 90 days on that channel. Ties at the cutoff all receive Critical. SKUs with zero 90-day sales are never Critical.
- Default threshold **0** is the daily working set. Raising the threshold only widens “how empty is Cosmetics main”; it does not change the Critical rule.
- Brand match is **brand name contained in the product title**, case-insensitive. Restricted brands not in the two lists are out of scope.
- Zero or negative quantity on the wrong company is not a brand violation.
- Existing Stock Comparer permission is reused; no new permission.
- Exports remain spreadsheet downloads the user already relies on; this feature does not create stock transfers.
- Matching SKUs across Cosmetics main, other warehouses, shops, and sales uses existing catalog identity.

## Out of Scope

- Auto-creating warehouse or shop transfers.
- Replacing Shopify Stock Showdown, Item Trends, or Store Stock Count.
- Changing the two restricted brand lists from the lists in this spec (including adding other brands).
- Using shop-counter sales as the Critical ranking basis.
- File-upload stock files as a substitute for live stock (this page stays live-stock only).
