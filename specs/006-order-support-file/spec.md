# Feature Specification: Order Support File (OSF) Generator

**Feature Branch**: `006-order-support-file`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Order Support File (OSF Excel for Cosmetics company) — build a proper method in Cosmo OS to create/update this file. Document every spreadsheet field and where the data comes from (ERP vs Cosmo OS) and how it is obtained. Also plan to add monthly sales-per-item columns."

**Reference workbook**: `OSF 17.06.2026 (7).xlsx` (sheets: **Main**, **Randil**, **Inoka**)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate the Main OSF workbook (Priority: P1)

A purchase / inventory coordinator opens Cosmo OS, chooses an as-of date (and optionally a sales month), and downloads a complete Order Support File in the same business shape as today’s Excel **Main** sheet: one row per sellable variant with identity, multi-location stock, ROP, reorder guidance, pricing, and the new monthly sales columns.

**Why this priority**: Replacing the manual OSF spreadsheet is the core business need; Main is the full working file used for ordering decisions.

**Independent Test**: Generate OSF for a known date and verify that a sample of SKUs matches hand-checked Cosmo and ERP values for identity, stock, ROP (where configured), calculated reorder columns, and monthly sales.

**Acceptance Scenarios**:

1. **Given** the user has permission to generate OSF, **When** they request Main file generation for today, **Then** they receive a downloadable workbook with one data row per included product variant and the agreed column set (including monthly sales).
2. **Given** stock or ROP is missing for a location on a SKU, **When** the file is generated, **Then** that cell is blank or explicitly marked unavailable (not a fabricated number), and calculated columns degrade safely (e.g. “No ROP”).
3. **Given** generation completes, **When** the user opens the Summary / header totals row (stock totals and reorder amounts as in today’s file), **Then** header aggregates match the sum of the detail rows for that snapshot.

---

### User Story 2 - Field source clarity for ops and product owners (Priority: P1)

Ops and product owners can see, for every OSF column, whether Cosmo OS, ERPNext, Shopify (via Cosmo), calculation, or manual/configured reference data supplies it — so nobody mistreats Excel as the system of record.

**Why this priority**: The user explicitly needs lineage clarity before/alongside automation; wrong sources would produce dangerous order quantities.

**Independent Test**: Review the field catalog in this spec (and later in-product help or export notes) and confirm each Main-sheet column is listed with source and retrieval method.

**Acceptance Scenarios**:

1. **Given** the OSF feature documentation / in-app legend, **When** a column such as “Latest Cost” or “Cosmetics.lk” stock is inspected, **Then** the documented source (ERP vs Cosmo vs calculated) matches actual generation behavior.
2. **Given** a field that is not yet automated (gap), **When** generation runs, **Then** the column is either omitted with notice, left blank, or filled only from an approved temporary manual table — never silently invented.

---

### User Story 3 - Monthly sales per item (Priority: P2)

Buyers see units sold (and optionally revenue) per variant for a selected calendar month next to stock/ROP so reorder decisions use recent demand, not only static ROP.

**Why this priority**: Explicit planned enhancement to the existing OSF shape; valuable once the Main generator exists.

**Independent Test**: Pick a SKU with known completed sales in a month; OSF sales column for that month equals that quantity (after agreed exclusions).

**Acceptance Scenarios**:

1. **Given** the user selects June 2026 as the sales month, **When** OSF is generated, **Then** each row includes month sales quantity for that variant.
2. **Given** an order is voided / cancelled / returned per agreed rules, **When** sales are aggregated, **Then** those quantities are excluded (or netted) according to the published business rule.

---

### User Story 4 - Assignee / filtered sheets (Randil, Inoka) (Priority: P3)

Staff who today maintain filtered OSF sheets can download a Main-equivalent file limited to their SKU set (by brand assignment, status category, or saved filter) without maintaining parallel Excel masters.

**Why this priority**: Useful parity with current workbook tabs, but Main automation delivers most value first.

**Independent Test**: Generate a filtered OSF for a known brand set and confirm only those SKUs appear while columns match Main.

**Acceptance Scenarios**:

1. **Given** a saved filter (or assignee brand list), **When** the user exports that view, **Then** the sheet structure matches Main columns and row count matches the filter.

---

### Edge Cases

- SKU present in Shopify/Cosmo but missing in ERP (or vice versa): still emit the row; stock/cost/supplier cells show gap markers.
- Same base product with multiple variants (`CAN07_1` vs `CAN07_2`): each variant is its own row; “Common SKU” totals (if still required) follow an explicit grouping rule or are deferred.
- Multiple ERP warehouses mapped to one Cosmo location: stock for that OSF column is the sum of configured warehouses for that location.
- Product inactive / archived: include or exclude per export option (default: include Active + items with stock or ROP).
- Huge catalog (1,000+ rows): generation completes within an acceptable wait or via async download without browser crash.
- Cost or supplier changes mid-month: “Latest” means as-of generation time from ERP, not historical month average (unless later specified).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authorized Cosmetics users to generate an Order Support File export whose Main sheet columns cover today’s OSF identity, stock, ROP, 70% guidance, order-qty, and pricing groups, plus monthly sales columns.
- **FR-002**: System MUST document and follow the Field Source Catalog below for every exported column (source system + meaning).
- **FR-003**: System MUST map OSF location/warehouse column headers to configured Cosmo company locations and their ERP warehouse bindings (no hard-coded spreadsheet abbreviations without admin-maintainable mapping).
- **FR-004**: System MUST obtain multi-location on-hand stock for OSF primarily from ERP warehouse stock (authoritative for ordering), not from Shopify-only snapshots, unless an admin explicitly chooses a Shopify fallback mode.
- **FR-005**: System MUST support reorder-point (ROP) values per location/channel used in the OSF; until ROP is stored in Cosmo or reliably read from ERP, generation MUST treat ROP as configured reference data and clearly flag rows with no ROP.
- **FR-006**: System MUST compute derived columns consistently with today’s OSF intent:
  - Total stock and Common SKU stock (if retained)
  - `%` of stock vs Total/Common ROP
  - `70% OF TOTAL ROP` and availability label (“Stock above 70% ROP”, “Stock below 70% ROP”, “No ROP”)
  - Per-location and total suggested order quantities from stock vs ROP
- **FR-007**: System MUST fill product identity fields from Cosmo product catalog (SKU, description, brand, barcode, image, site status, item status) where available.
- **FR-008**: System MUST fill pricing fields from the best available source per catalog (Shopify/Cosmo sell & compare-at for retail/MRP-like prices; ERP for latest purchase cost and supplier); margins MUST be calculated from those sell and cost inputs.
- **FR-009**: System MUST add monthly sales-per-item columns (at minimum: units sold in the selected calendar month; revenue optional) sourced from Cosmo order line history with published inclusion/exclusion rules.
- **FR-010**: System MUST allow the user to choose as-of date for the snapshot header and the sales month independently when both are relevant.
- **FR-011**: System MUST NOT silently invent cost, supplier, ROP, or stock figures when source systems return no data.
- **FR-012**: Users MUST be able to regenerate OSF on demand so the file reflects current ERP stock/cost and Cosmo catalog/sales without hand-merging multiple exports.
- **FR-013**: Generation MUST be restricted to users with an explicit OSF / purchasing permission (finance/admin/purchasing roles as decided at plan time).

### Key Entities

- **OSF Snapshot**: A dated export run (who, when, sales month, location mapping version).
- **OSF Product Row**: One variant SKU with identity, stock vector, ROP vector, calculated guidance, pricing, margins, monthly sales.
- **Location Column Mapping**: Links an OSF column label (e.g. LMJ, Cosmetics.lk) to Cosmo location(s) and ERP warehouse(s).
- **ROP Profile**: Per SKU × location/channel reorder point values (config store or ERP-backed).
- **Monthly Sales Fact**: Aggregated sold units (and optional revenue) for a SKU in a calendar month from Cosmo orders.

### Field Source Catalog *(from reference workbook Main sheet)*

Legend: **Cosmo** = Cosmo OS database / Shopify-synced catalog & orders · **ERP** = ERPNext · **Calc** = derived in OSF generation · **Config** = admin mapping or maintained reference · **Gap** = not reliably in Cosmo today

| # | OSF column / group | Source | How obtained (business view) |
|---|-------------------|--------|------------------------------|
| 1 | Variant SKU (primary) | Cosmo | Product catalog SKU from Shopify product sync |
| 2 | Variant SKU variants (underscore / hyphen / base) | Calc | Normalized forms of the primary SKU for matching legacy sheets |
| 3 | Item Status | Cosmo | Product item status labels already maintained/imported in Cosmo (priority brand/product categories) |
| 4 | Shop Availability (Allowed / Not Allowed) | Gap / Config | Not a first-class Cosmo field today; must be imported or newly maintained if kept |
| 5 | Description | Cosmo | Product title (+ variant title when needed) from catalog |
| 6 | Brand | Cosmo | Catalog vendor/brand linked to the product |
| 7 | Variant Barcode | Cosmo (+ ERP fallback) | Cosmo barcode from Shopify; if empty, look up ERP Item barcode |
| 8 | Country | Gap / Calc | Not stored as its own field; sometimes parseable from title or must be maintained |
| 9 | Image Src | Cosmo | Catalog image URL from Shopify |
| 10 | Site Status | Cosmo | Catalog product status (e.g. active) |
| 11 | Stock: Cosmetics.lk, LMJ, LWK, MNK, AJS, Chami, DRO, SPK, Pevi, Thewan | ERP (via location mapping) | On-hand qty per mapped ERP warehouse(s) for that Item; Cosmo Shopify qty is snapshot only / fallback |
| 12 | Total stock | Calc | Sum of location stock columns (or ERP total across mapped warehouses) |
| 13 | Common SKU Stock | Gap / Calc | Only if a common-SKU grouping rule is defined; else defer or omit |
| 14 | ROP columns (COS ROP, Online site, shops, Cosmetics New, Common ROP, etc.) | Config / ERP Gap | Not managed in Cosmo product UI today; requires ROP store or confirmed ERP field read |
| 15 | % of ROP | Calc | Stock vs applicable Total/Common ROP |
| 16 | 70% OF TOTAL ROP | Calc | 70% × total ROP |
| 17 | 70% OF TOTAL ROP AVAILABILITY | Calc | Label from comparing stock to 70% ROP threshold |
| 18 | Per-location ORDER QTY + TOTAL / Common SKU Reorder | Calc | Suggested order = f(ROP, stock) per location, same spirit as current Excel |
| 19 | Cosmetics MRP | Cosmo | Compare-at / list price from catalog (MRP-like) |
| 20 | Discounted Price | Cosmo | Current selling price from catalog |
| 21 | OGF Price | Gap / Config | Not stored as catalog price in Cosmo (OGF integration is sales sync, not price list); needs price source decision |
| 22 | Latest Cost | ERP | Latest purchase / valuation cost for the Item |
| 23 | Latest supplier | ERP | Supplier on the latest relevant purchase for the Item |
| 24 | Cosmetics Margin / OGF Margin | Calc | (Sell − cost) / sell using Cosmetics and OGF sell prices when available |
| 25 | **Monthly sales (new)** | Cosmo | Sum of order line quantities for the SKU in the selected month (completed/non-voided rules TBD at plan) |
| 26 | Header date + stock totals + ROP totals + reorder amount totals | Calc | Snapshot metadata and column sums as in today’s header rows |

**Sheet roles (reference workbook)**

| Sheet | Role (assumed) |
|-------|----------------|
| Main | Full catalog OSF + pricing |
| Randil / Inoka | Filtered subsets for individual owners (same columns as Main without pricing extras in those tabs) |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can produce a Main OSF download in one action (no multi-system copy/paste) for ordinary catalog size within 5 minutes end-to-end.
- **SC-002**: For a sample of at least 20 SKUs, ERP on-hand stock cells match ERP warehouse balances used for those locations at generation time (±0 rounding).
- **SC-003**: For SKUs with Cosmo item status, exported Item Status matches Cosmo for ≥99% of rows.
- **SC-004**: Monthly sales column for a held-out month matches independently counted Cosmo order units for ≥95% of sampled SKUs under the published inclusion rules.
- **SC-005**: Every Main-sheet column in the Field Source Catalog is either implemented with the stated source or explicitly listed as deferred with a gap — zero undocumented columns.
- **SC-006**: Purchasing users report that weekly OSF preparation time drops by at least 50% versus today’s manual Excel process (survey after two weeks of use).

## Assumptions

- Scope for v1 is **Cosmetics (Cosmo OS)** Order Support File based on the attached workbook; Vault OS is out of scope unless mappings are later mirrored.
- **Main** sheet is the primary deliverable; Randil/Inoka are filtered views of the same column model.
- Ordering decisions need **ERP warehouse stock** as the authoritative stock source.
- ROP values currently live mainly in the Excel itself (or elsewhere outside Cosmo); v1 may start from an importable ROP table and later move ROP into Cosmo/ERP sync.
- “Sales per item for a month” means **units sold** in a user-selected calendar month; revenue is optional follow-on.
- OGF Price may remain blank or config-driven until a stable price source is chosen.
- Common SKU grouping may be deferred if the business cannot define a single grouping rule in planning.
- Location abbreviations in the sheet map to Cosmo locations / ERP warehouses via admin configuration, not fixed code constants.
- Shopify remains the source of truth for catalog identity and retail prices; ERP remains the source of truth for stock, cost, and supplier.
