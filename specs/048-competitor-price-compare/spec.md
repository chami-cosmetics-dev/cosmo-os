# Feature Specification: Competitor Price Compare

**Feature Branch**: `048-competitor-price-compare`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "Compare our product prices with main Sri Lanka online cosmetics competitors — Angels Beauty, Essentials, Liberty Store, Kiki Beauty, Dreams of Ceylonese, and Watsans.lk — so purchasing can see where we are cheaper or more expensive and act on pricing, promotions, and stock decisions. Complements Item Trends movement intelligence; v1 uses staff-maintained competitor price data rather than automated scraping."

## Clarifications

### Session 2026-09-02

- Q: Which Cosmo price should we compare against competitors? → A: **All three retail price layers** — **MRP** (list/compare-at price), **PROMO** (current discounted web/catalog price when active), and **OGF** (OGF price list selling price). The compare view MUST show gap analysis for each layer side by side; user can filter or sort by any layer. Competitors typically publish one headline price; that figure is compared against each of our three prices independently.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View market price gap for our products (Priority: P1)

A purchasing team member opens **Market Price Compare** under Purchasing. They see a list of Cosmo products that have at least one linked competitor price. For each SKU the row shows **three Cosmo prices** — **MRP**, **PROMO** (discounted price when set; blank or same as MRP when no promo), and **OGF** — alongside competitor summary (lowest, median, highest listed price) and **gap % for each layer**. A **price-layer toggle** (MRP / PROMO / OGF) controls which layer drives default sort, filters, and row color-coding (cheapest = green, within 5% of median = amber, materially above = red). Each row shows **as-of date** for competitor data so stale prices are obvious.

**Why this priority**: The core value is answering "are we priced right vs the market?" in one screen — without this, the feature delivers nothing.

**Independent Test**: Link three SKUs to competitor prices manually; open the compare page; confirm gap math and ranking match the uploaded figures.

**Acceptance Scenarios**:

1. **Given** a user with market-price read permission and at least one product with competitor prices, **When** they open Market Price Compare, **Then** they see MRP, PROMO, and OGF for each SKU, competitor summary (min / median / max), gap % per layer, and data-as-of date.
2. **Given** a product where our **OGF** is lower than all linked competitors, **When** displayed with OGF layer selected, **Then** it shows a **cheapest in market** indicator for OGF (independent indicators per layer when applicable).
3. **Given** a product where our **PROMO** is more than 10% above the median competitor price, **When** PROMO layer is selected, **Then** it shows **above market** alert styling for that layer.
4. **Given** a SKU with active promo (discounted price below MRP), **When** the row is shown, **Then** all three layers display distinct values and each has its own gap % vs market median.
5. **Given** competitor data older than 14 days, **When** the row is shown, **Then** a **stale data** warning appears on that product or competitor link.
6. **Given** a user without permission, **When** they open the page or API, **Then** access is denied.

---

### User Story 2 - Link our SKU to competitor products (Priority: P1)

A purchasing coordinator searches for a Cosmo SKU (by name, SKU code, or barcode). They add one or more competitor links: pick competitor (from the fixed v1 list), paste product URL, enter competitor title and listed LKR price, stock status (in stock / out of stock), and check date. The system stores the link so future price updates apply to the same match. Matching prefers barcode when both sides have it; otherwise normalized brand + product name + pack size.

**Why this priority**: Accurate product matching is prerequisite for meaningful comparison; bad matches would erode trust immediately.

**Independent Test**: Link "CeraVe Moisturising Lotion 236ml" on Liberty Store and Kiki Beauty; confirm both appear under one Cosmo SKU with separate competitor rows.

**Acceptance Scenarios**:

1. **Given** a Cosmo product, **When** the user adds a competitor link with URL, title, price, and date, **Then** the link is saved and appears on the compare list for that SKU.
2. **Given** an existing competitor link, **When** the user updates price and check date, **Then** history is retained (previous snapshot visible or overwritten with audit — see FR-012) and the compare view reflects the latest price.
3. **Given** two competitor listings with different pack sizes (e.g., 236ml vs 562ml), **When** the user tries to link both to one SKU, **Then** the system warns that pack size differs unless the user explicitly confirms the match.
4. **Given** a duplicate link (same SKU + same competitor), **When** the user saves, **Then** the existing link is updated rather than creating a duplicate row.

---

### User Story 3 - Bulk import competitor prices via spreadsheet (Priority: P1)

Purchasing exports a CSV template, fills competitor prices offline (weekly workflow), and uploads it. The import validates rows (required columns, known competitor names, numeric prices, valid dates) and previews changes before commit. Valid rows update or create links; invalid rows are reported with line numbers without blocking valid rows.

**Why this priority**: Manual one-by-one entry does not scale; the user's intended v1 workflow is periodic bulk refresh by the purchasing team.

**Independent Test**: Upload a 20-row CSV with 2 invalid rows; confirm 18 apply, 2 errors listed, no partial corruption.

**Acceptance Scenarios**:

1. **Given** a valid CSV matching the published template, **When** the user uploads and confirms, **Then** competitor prices are applied and the compare dashboard refreshes.
2. **Given** a row with an unknown competitor name, **When** imported, **Then** that row fails validation with a clear error; other rows still process.
3. **Given** a row referencing an unknown Cosmo SKU, **When** imported, **Then** that row fails with "SKU not found" unless optional create-link-by-barcode flow is used.
4. **Given** import preview, **When** shown, **Then** the user sees counts of new links, updated prices, and skipped rows before confirming.

---

### User Story 4 - Drill into competitor detail for one SKU (Priority: P2)

From a product row, the user opens detail to see all six competitors side by side: competitor name, their listed price, **gap vs our MRP / PROMO / OGF** (three columns or grouped), in-stock flag, product URL (clickable), last checked date, and optional notes (e.g., "pre-order price", "bundle only", "competitor sale price"). They can sort by competitor price or gap on any layer.

**Why this priority**: Summary gaps drive decisions; detail view supports verification and supplier conversations.

**Independent Test**: Open detail for a SKU linked to 4 competitors; confirm all fields and sort order work.

**Acceptance Scenarios**:

1. **Given** a SKU with multiple competitor links, **When** the user opens detail, **Then** all linked competitors appear in a comparison table with gap % vs MRP, PROMO, and OGF per competitor.
2. **Given** a competitor with no link yet, **When** detail is viewed, **Then** that competitor appears as **not tracked** with an action to add a link.
3. **Given** a competitor product URL, **When** the user clicks it, **Then** it opens in a new browser tab.

---

### User Story 5 - Filter and prioritize by business impact (Priority: P2)

The purchasing lead filters the compare list: above market only, cheapest only, stale data only, by brand, by competitor, or by movement tier (when Item Trends data is available). They export the filtered view to CSV for weekly pricing meetings.

**Why this priority**: A flat list of thousands of SKUs is unusable; filters connect price intelligence to action.

**Independent Test**: Apply "above market + Top Priority" filter; export CSV; confirm row count matches on-screen filter.

**Acceptance Scenarios**:

1. **Given** products with mixed gap signals, **When** the user filters to "above market" on the **OGF** layer, **Then** only products whose OGF is more than 5% above median competitor price appear (filter applies to the active price layer).
2. **Given** a filtered view, **When** the user exports CSV, **Then** the file contains the same rows and columns visible in the table.
3. **Given** Item Trends integration is enabled for the company, **When** the user filters by "fast movers", **Then** only SKUs with fast-mover signal in the current trends window appear (optional P2 dependency).

---

### User Story 6 - See market gap on Item Trends movement rows (Priority: P3)

While reviewing fast movers or slowdowns on the Item Trends dashboard, the user sees a compact **market gap** badge on rows where competitor data exists (e.g., "OGF +8% vs median" or "PROMO cheapest"). Badge reflects the **active price layer** from Item Trends context or defaults to OGF. Clicking opens Market Price Compare detail for that SKU with all three layers visible.

**Why this priority**: Combines movement + pricing — the user's original vision — but depends on core compare data existing first.

**Independent Test**: SKU with competitor data appears on Item Trends with gap badge; SKU without data shows no badge.

**Acceptance Scenarios**:

1. **Given** a fast-moving SKU with competitor prices on file, **When** shown on Item Trends, **Then** a market gap indicator appears without requiring a separate page visit.
2. **Given** no competitor data for a SKU, **When** shown on Item Trends, **Then** no market badge is shown (no error state).

---

### Edge Cases

- What happens when a competitor lists installment-only pricing (e.g., "3 × Rs X") without a single list price? → User enters the **cash/list price** shown on the product page; installment breakdown is ignored for comparison.
- What happens when a competitor product is on pre-order vs in-stock (Angels Beauty)? → User records price type in notes; compare uses the entered price but flags **pre-order** in the UI.
- What happens when our product is on promotion but competitor is at full price? → **PROMO layer** shows gap vs competitor using discounted price; **MRP layer** shows list-price positioning; **OGF layer** shows OGF list positioning — purchasing sees all three without manual override.
- What happens when PROMO is not set (no discount)? → PROMO column shows MRP or is marked **no promo**; gap for PROMO layer equals MRP gap for that SKU.
- What happens when OGF is missing for a SKU? → OGF gap is blank with "not set" indicator; MRP and PROMO gaps still compute.
- What happens when competitor shows "was" and "now" sale pricing? → Staff record the **current selling price** (the price a customer pays today); optional note if competitor is on sale vs list.
- What happens when the same product title appears on multiple competitor URLs? → One link per competitor per SKU; user picks the canonical product page URL.
- What happens when competitor site is down during weekly check? → Previous snapshot remains; stale warning after 14 days; user can skip update for that row.
- What happens when pack size cannot be determined from titles? → Link requires explicit confirmation; system stores normalized size field when provided.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a **Market Price Compare** area under Purchasing, separate from the existing supplier cost calculator (which compares supplier quotes, not market retail).
- **FR-002**: System MUST restrict access to users with a dedicated permission (e.g., `purchasing.market_prices.read` for view, `purchasing.market_prices.manage` for edit/import) plus existing purchasing-admin and company-admin bypass patterns used elsewhere in Cosmo OS.
- **FR-003**: System MUST support exactly six v1 competitors, pre-seeded: **Angels Beauty**, **Essentials**, **Liberty Store**, **Kiki Beauty**, **Dreams of Ceylonese**, **Watsans** — each with display name and canonical website domain for validation.
- **FR-004**: System MUST load three Cosmo price layers per SKU from the existing catalog: **MRP** (compare-at / list price), **PROMO** (current discounted catalog price when active), and **OGF** (OGF price list price).
- **FR-005**: System MUST compute gap % independently for each layer: `(our layer price − competitor median) / competitor median`, with blank gap when our layer price or competitor median is missing.
- **FR-006**: System MUST store per-SKU competitor links with: competitor id, product URL, competitor title, listed price (LKR), in-stock flag, check date, optional notes, and optional normalized pack size.
- **FR-007**: System MUST compute and display per SKU: minimum competitor price, maximum, median, **gap % vs median for MRP, PROMO, and OGF**, count of competitors tracked, and whether we are cheapest among tracked competitors **for each layer**.
- **FR-008**: System MUST provide a **price-layer selector** (MRP / PROMO / OGF) that controls default sort, above-market / cheapest filters, and row highlight styling; all three layers remain visible in list and detail views regardless of selection.
- **FR-009**: System MUST flag competitor data as **stale** when the check date is older than 14 days.
- **FR-010**: System MUST warn when linking competitor products whose normalized pack size differs from the Cosmo SKU's pack size unless the user confirms the match.
- **FR-011**: System MUST provide CSV template download, upload validation, preview, and commit for bulk competitor price updates (competitor prices only — MRP/PROMO/OGF come from catalog automatically).
- **FR-012**: System MUST validate CSV rows: required fields (our SKU or barcode, competitor name, price, check date), known competitor names, positive numeric prices, and ISO or DD/MM/YYYY dates.
- **FR-013**: System MUST provide product detail view listing all six competitors with gap % vs MRP, PROMO, and OGF, URLs, stock status, and last checked date.
- **FR-014**: System MUST retain price change history per competitor link (at minimum: previous price, new price, changed by, changed at) so purchasing can see trends over time.
- **FR-015**: System MUST support search and filters: above market and cheapest **per price layer**, stale, by brand, by competitor, and text search on product name/SKU.
- **FR-016**: System MUST support CSV export of the current filtered compare list including MRP, PROMO, OGF, competitor median, and all three gap columns.
- **FR-017**: System MUST NOT perform automated web scraping of competitor sites in v1; all competitor prices are entered or imported by authorized staff.
- **FR-018**: System SHOULD expose a compact market-gap indicator on Item Trends movement rows when competitor data exists (P3; may ship after core compare is stable); badge labels which layer (MRP / PROMO / OGF) is shown.

### Key Entities

- **Competitor**: A tracked external retailer (fixed v1 set of six); attributes include name, website domain, active flag.
- **Product Competitor Link**: Association between a Cosmo catalog product and a competitor's listing; holds URL, title, latest price, stock status, check date, notes, normalized size.
- **Price Snapshot / History**: Point-in-time record of a competitor price change for audit and trend-over-time.
- **Market Compare Summary** (derived): Per-SKU computed view — our MRP, PROMO, OGF, min/median/max competitor price, gap % per layer, stale flags, cheapest-in-market flag per layer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A purchasing user with manage permission can add or update a competitor link for one SKU in under 2 minutes.
- **SC-002**: A weekly CSV import of up to 500 rows completes with validation feedback in under 3 minutes end-to-end (upload through confirm).
- **SC-003**: For SKUs with competitor data, 100% of displayed gap calculations for **MRP, PROMO, and OGF** match manual spreadsheet verification (median and % gap per layer) in acceptance testing.
- **SC-004**: Within 4 weeks of launch, purchasing tracks competitor prices for at least 50 high-movement SKUs (operational adoption metric).
- **SC-005**: Purchasing users report they can identify "priced above market" Top Priority items in a single session without leaving Cosmo OS (qualitative UAT: task completion in under 5 minutes for a filtered above-market list).
- **SC-006**: Zero unauthorized users can view or edit competitor price data in permission testing.

## Assumptions

- **Our price layers**: **MRP**, **PROMO** (discounted catalog price), and **OGF** are all in scope and sourced from the existing product catalog / OSF profile — not entered manually on the compare screen. Supplier cost and purchasing calculator quotes remain out of scope.
- **Default layer**: **OGF** is the default sort/filter layer because it reflects day-to-day selling price; purchasing can switch to MRP or PROMO for list-position or promotion analysis.
- **Competitor set**: The six named competitors are sufficient for v1; adding or removing competitors is a future admin task, not v1 scope.
- **Data entry**: Purchasing team performs weekly price checks manually on competitor websites and records results via CSV or inline edit — approximately 30–60 minutes per week for top SKUs.
- **Matching**: Barcode match is used when available; otherwise staff visually confirm brand + product + size when linking.
- **Installment display**: Competitor installment breakdowns (Koko, Mintpay, etc.) are not used for comparison — staff record the headline list price.
- **Legal**: v1 avoids automated scraping to reduce terms-of-service and reliability risk; manual/CSV entry is acceptable for the pilot scale.
- **Item Trends integration**: P3 optional badge depends on Item Trends (047) being deployed; core compare works standalone.
- **Catalog source**: Cosmo products come from the existing company product catalog (same SKUs used in OSF and web store).

## Dependencies

- Existing Cosmo product catalog with SKU, name, barcode, MRP (compare-at), discounted/promo price, and OGF price fields (same sources as OSF workbook).
- Existing RBAC / permission pattern (dedicated purchasing permissions, admin bypass).
- Item Trends dashboard (047) for optional P3 market-gap badge — not required for MVP.

## Out of Scope (v1)

- Automated scraping or scheduled fetch jobs from competitor websites.
- AI-based product matching across catalogs.
- Price change alerts / email notifications.
- Automatic price adjustment on the web store or OSF.
- Tracking competitors beyond the six named retailers.
- Physical retail (not online) competitor pricing.
- Supplier-cost or margin comparison (covered by existing purchasing SKU calculator and OSF margin columns).
