# Feature Specification: Order Support File (OSF) Generator

**Feature Branch**: `006-order-support-file`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Order Support File (OSF Excel for Cosmetics company) — build a proper method in Cosmo OS to create/update this file. Document every spreadsheet field and where the data comes from (ERP vs Cosmo OS) and how it is obtained. Also plan to add monthly sales-per-item columns."

**Reference workbook**: `OSF 17.06.2026 (7).xlsx` (sheets: **Main**, **Randil**, **Inoka**)

## Clarifications

### Session 2026-07-16

- Q: Where should ROP values come from in v1? → A: Maintain ROP in Cosmo via **proper OS UI** (edit per product/location); Excel sheet import is **not required** for v1
- Q: Where should OGF Price come from in v1? → A: **OGF is independent of LWK** — do not map OGF↔LWK. Keep Excel behavior: OGF Price is its own value; OGF Margin = (OGF Price − Latest Cost) / OGF Price. In Cosmo, maintain OGF Price via OS UI (separate field), or leave blank when unset.
- Q: Which Cosmo orders count toward monthly sales per item? → A: Units from non-voided orders at delivery_complete or invoice_complete in that month (by deliver/invoice date)
- Q: How should Shop Availability (Allowed / Not Allowed) be handled in v1? → A: Maintain in Cosmo via **proper OS UI**; Excel sheet import is **not required** for v1
- Q: How should Common SKU columns work in v1? → A: Group by base SKU (strip variant suffix `_N` / `-N`); sum stock/ROP/reorder across variants
- Q: Must v1 include Excel import for ROP / Shop Availability? → A: No — Cosmo OS screens only; optional bulk import may be added later if needed
- Q: What does OGF mean / match to LWK? → A: **No matching** — keep OGF columns as in the uploaded Excel (standalone OGF Price + formula OGF Margin). Do not treat OGF as LWK catalog price.
- Q: Which columns may the generator emit? → A: **Only the Main-sheet headers from the reference uploaded Excel** (same labels/order). No extra invented columns except the planned monthly-sales addition if still required.

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

### User Story 2 - Maintain ROP and Shop Availability in Cosmo UI (Priority: P1)

A purchasing coordinator opens product / OSF settings in Cosmo OS and sets **Shop Availability** and per-location **ROP** for variants using normal screens (search product, edit values, save)—without uploading Excel sheets. Generated OSF then reads those Cosmo values.

**Why this priority**: ROP and Shop Availability are Cosmo-owned inputs for correct order-qty math; UI maintenance replaces the spreadsheet as the system of record.

**Independent Test**: Set ROP and Shop Availability for a SKU in the UI, generate OSF, confirm the export matches the saved values.

**Acceptance Scenarios**:

1. **Given** an authorized user opens a product variant in Cosmo, **When** they set Shop Availability to Allowed/Not Allowed and save, **Then** the value persists and appears on the next OSF generation.
2. **Given** an authorized user edits ROP for one or more OSF locations on a variant and saves, **When** OSF is generated, **Then** those ROP cells match the UI values (blank/“No ROP” where unset).
3. **Given** no Excel import feature is used, **When** the user maintains ROP and Shop Availability only via OS screens, **Then** OSF generation still works end-to-end.

---

### User Story 3 - Field source clarity for ops and product owners (Priority: P1)

Ops and product owners can see, for every OSF column, whether Cosmo OS, ERPNext, Shopify (via Cosmo), calculation, or manual/configured reference data supplies it — so nobody mistreats Excel as the system of record.

**Why this priority**: The user explicitly needs lineage clarity before/alongside automation; wrong sources would produce dangerous order quantities.

**Independent Test**: Review the field catalog in this spec (and later in-product help or export notes) and confirm each Main-sheet column is listed with source and retrieval method.

**Acceptance Scenarios**:

1. **Given** the OSF feature documentation / in-app legend, **When** a column such as “Latest Cost” or “Cosmetics.lk” stock is inspected, **Then** the documented source (ERP vs Cosmo vs calculated) matches actual generation behavior.
2. **Given** a field that is not yet automated (gap), **When** generation runs, **Then** the column is either omitted with notice, left blank, or filled only from an approved temporary manual table — never silently invented.

---

### User Story 4 - Monthly sales per item (Priority: P2)

Buyers see units sold (and optionally revenue) per variant for a selected calendar month next to stock/ROP so reorder decisions use recent demand, not only static ROP.

**Why this priority**: Explicit planned enhancement to the existing OSF shape; valuable once the Main generator exists.

**Independent Test**: Pick a SKU with known completed sales in a month; OSF sales column for that month equals that quantity (after agreed exclusions).

**Acceptance Scenarios**:

1. **Given** the user selects June 2026 as the sales month, **When** OSF is generated, **Then** each row includes month sales quantity for that variant.
2. **Given** an order is voided or still in early fulfillment, **When** sales are aggregated for a month, **Then** those quantities are excluded; only non-voided delivery_complete / invoice_complete orders attributed by deliver/invoice date count.

---

### User Story 5 - Assignee / filtered sheets (Randil, Inoka) (Priority: P3) — **Implemented**

Staff who today maintain filtered OSF sheets can download a Main-equivalent file limited to their SKU set (by brand assignment) without maintaining parallel Excel masters.

**Why this priority**: Useful parity with current workbook tabs, but Main automation delivers most value first.

**Independent Test**: Generate a filtered OSF for a known brand set and confirm only those SKUs appear while columns match Main.

**Implementation**: Buyers are configured under OSF settings ("Buyer sheets"): each buyer has a name (→ sheet name) and a list of assigned brands (empty = full catalog). The generator emits one sheet per active buyer, using the Main column model **minus the pricing/purchasing columns**, filtered to rows whose brand is in the buyer's list. Model: `OsfBuyer`; API: `GET/PUT /api/admin/osf/buyers`.

**Acceptance Scenarios**:

1. **Given** a buyer with an assigned brand list, **When** the user generates the OSF, **Then** that buyer's sheet contains only those brands' SKUs with the Main column structure (no pricing columns).
2. **Given** a buyer with no assigned brands, **When** the user generates the OSF, **Then** that buyer's sheet contains the full catalog.

---

### Edge Cases

- SKU present in Shopify/Cosmo but missing in ERP (or vice versa): still emit the row; stock/cost/supplier cells show gap markers.
- Same base product with multiple variants (`CAN07_1` vs `CAN07_2`): each variant is its own row; Common SKU Stock / Common ROP / Common SKU Reorder aggregate siblings that share the same **base SKU** after stripping trailing `_N` / `-N` variant suffixes.
- Multiple ERP warehouses mapped to one Cosmo location: stock for that OSF column is the sum of configured warehouses for that location.
- Product inactive / archived: include or exclude per export option (default: include Active + items with stock or ROP).
- Huge catalog (1,000+ rows): generation completes within an acceptable wait or via async download without browser crash.
- Cost or supplier changes mid-month: “Latest” means as-of generation time from ERP, not historical month average (unless later specified).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authorized Cosmetics users to generate an Order Support File export whose Main sheet columns match the **reference uploaded Excel** headers (identity, stock, ROP, 70% guidance, order-qty, pricing including existing **OGF Price / OGF Margin** columns, etc.). Column set MUST NOT invent headers that are not on that workbook (monthly sales may be appended only if still in scope as an agreed addition).
- **FR-001a**: **OGF Price** and **OGF Margin** are existing Excel columns — not new OS-only headers. Generator MUST emit them under those Excel names. **Do not map OGF to LWK**. OGF Price is an independent value (Cosmo OSF UI or blank); OGF Margin MUST follow Excel `(OGF Price − Latest Cost) / OGF Price` when both exist.
- **FR-002**: System MUST document and follow the Field Source Catalog below for every exported column (source system + meaning).
- **FR-003**: System MUST map OSF location/warehouse column headers to configured Cosmo company locations and their ERP warehouse bindings (no hard-coded spreadsheet abbreviations without admin-maintainable mapping).
- **FR-004**: System MUST obtain multi-location on-hand stock for OSF primarily from ERP warehouse stock (authoritative for ordering), not from Shopify-only snapshots, unless an admin explicitly chooses a Shopify fallback mode.
- **FR-005**: System MUST support reorder-point (ROP) values per location/channel used in the OSF. For v1, ROP is **owned in Cosmo** and maintained through **Cosmo OS UI** (search/edit/save per variant and location). OSF generation MUST read Cosmo ROP. Rows with no Cosmo ROP MUST be clearly flagged (e.g. “No ROP”).
- **FR-005a**: Excel/sheet import of ROP is **out of scope for v1** (may be added later as an optional bulk aid). v1 MUST NOT depend on spreadsheet upload to set ROP.
- **FR-006**: System MUST compute derived columns consistently with today’s OSF intent:
  - Total stock and Common SKU stock
  - `%` of stock vs Total/Common ROP
  - `70% OF TOTAL ROP` and availability label (“Stock above 70% ROP”, “Stock below 70% ROP”, “No ROP”)
  - Per-location and total suggested order quantities from stock vs ROP
- **FR-006a**: Common SKU Stock, Common ROP, and Common SKU Reorder MUST group variants by **base SKU** (strip trailing `_N` / `-N` suffixes, e.g. `CAN07_1` and `CAN07_2` → `CAN07`) and sum across that group.
- **FR-007**: System MUST fill product identity fields from Cosmo product catalog (SKU, description, brand, barcode, image, site status, item status) where available.
- **FR-007a**: System MUST maintain **Shop Availability** (Allowed / Not Allowed) in Cosmo via **OS UI**; OSF generation MUST read Cosmo Shop Availability for each variant. Excel import of Shop Availability is **out of scope for v1**.
- **FR-008**: System MUST fill pricing fields from the best available source per catalog (Shopify/Cosmo sell & compare-at for Cosmetics MRP / Discounted Price; ERP for latest purchase cost and supplier). Cosmetics Margin MUST follow Excel `(Cosmetics MRP − Latest Cost) / Cosmetics MRP` when both exist. **OGF Price is independent of LWK** (optional Cosmo OSF UI field). OGF Margin MUST be `(OGF Price − Latest Cost) / OGF Price` when both exist; blank if OGF Price is missing.
- **FR-009**: System MUST add monthly sales-per-item columns (at minimum: units sold in the selected calendar month). Units MUST come from Cosmo order lines on **non-voided** orders whose fulfillment stage is **delivery_complete** or **invoice_complete**, attributed to the month by **deliveryCompleteAt** or **invoiceCompleteAt** (prefer delivery date when both exist). Revenue is optional follow-on.
- **FR-009a**: Voided / cancelled orders MUST be excluded from monthly sales. Returned quantities are **not** netted out in v1 (gross completed units only).
- **FR-010**: System MUST allow the user to choose as-of date for the snapshot header and the sales month independently when both are relevant.
- **FR-011**: System MUST NOT silently invent cost, supplier, ROP, or stock figures when source systems return no data.
- **FR-012**: Users MUST be able to regenerate OSF on demand so the file reflects current ERP stock/cost and Cosmo catalog/sales without hand-merging multiple exports.
- **FR-013**: Generation MUST be restricted to users with an explicit OSF / purchasing permission (finance/admin/purchasing roles as decided at plan time).

### Key Entities

- **OSF Snapshot**: A dated export run (who, when, sales month, location mapping version).
- **OSF Product Row**: One variant SKU with identity, stock vector, ROP vector, calculated guidance, pricing, margins, monthly sales.
- **Location Column Mapping**: Links an OSF column label (e.g. LMJ, Cosmetics.lk) to Cosmo location(s) and ERP warehouse(s).
- **ROP Profile**: Per SKU × location/channel reorder point values stored and edited in Cosmo OS UI.
- **Shop Availability**: Allowed / Not Allowed per variant, edited in Cosmo OS UI.
- **OGF Price**: Optional independent price on OSF profile (not LWK); OGF Margin calculated like Excel.
- **Monthly Sales Fact**: Aggregated sold units (and optional revenue) for a SKU in a calendar month from Cosmo orders.

### Field Source Catalog *(from reference workbook Main sheet)*

Legend: **Cosmo** = Cosmo OS database / Shopify-synced catalog & orders · **ERP** = ERPNext · **Calc** = derived in OSF generation · **Config** = admin mapping or maintained reference · **Gap** = not reliably in Cosmo today

| # | OSF column / group | Source | How obtained (business view) |
|---|-------------------|--------|------------------------------|
| 1 | Variant SKU (primary) | Cosmo | Product catalog SKU from Shopify product sync |
| 2 | Variant SKU variants (underscore / hyphen / base) | Calc | Normalized forms of the primary SKU for matching legacy sheets |
| 3 | Item Status | Cosmo | Product item status labels already maintained/imported in Cosmo (priority brand/product categories) |
| 4 | Shop Availability (Allowed / Not Allowed) | Cosmo (UI) | Edited in Cosmo product/OSF screens; OSF reads Cosmo |
| 5 | Description | Cosmo | Product title (+ variant title when needed) from catalog |
| 6 | Brand | Cosmo | Catalog vendor/brand linked to the product |
| 7 | Variant Barcode | Cosmo (+ ERP fallback) | Cosmo barcode from Shopify; if empty, look up ERP Item barcode |
| 8 | Country | Gap / Calc | Not stored as its own field; sometimes parseable from title or must be maintained |
| 9 | Image Src | Cosmo | Catalog image URL from Shopify |
| 10 | Site Status | Cosmo | Catalog product status (e.g. active) |
| 11 | Stock: Cosmetics.lk, LMJ, LWK, MNK, AJS, Chami, DRO, SPK, Pevi, Thewan | ERP (via location mapping) | On-hand qty per mapped ERP warehouse(s) for that Item; Cosmo Shopify qty is snapshot only / fallback |
| 12 | Total stock | Calc | Sum of location stock columns (or ERP total across mapped warehouses) |
| 13 | Common SKU Stock | Calc | Sum stock for variants sharing the same base SKU (strip `_N` / `-N`) |
| 14 | ROP columns (COS ROP, Online site, shops, Cosmetics New, Common ROP, etc.) | Cosmo (UI) | Edited in Cosmo OS screens per location; OSF reads Cosmo ROP (not live ERP for v1); Common ROP = sum of group ROPs (or configured common ROP when present) |
| 15 | % of ROP | Calc | Stock vs applicable Total/Common ROP |
| 16 | 70% OF TOTAL ROP | Calc | 70% × total ROP |
| 17 | 70% OF TOTAL ROP AVAILABILITY | Calc | Label from comparing stock to 70% ROP threshold |
| 18 | Per-location ORDER QTY + TOTAL / Common SKU Reorder | Calc | Suggested order = f(ROP, stock) per location; Common SKU Reorder aggregates the base-SKU group |
| 19 | Cosmetics MRP | Cosmo | Compare-at / list price from catalog (MRP-like) |
| 20 | Discounted Price | Cosmo | Current selling price from catalog |
| 21 | OGF Price | Cosmo (UI) | **Already on Excel Main**. Independent value (not LWK catalog). Maintain in Cosmo OSF UI or blank if unset |
| 22 | Latest Cost | ERP | Latest purchase / valuation cost for the Item |
| 23 | Latest supplier | ERP | Supplier on the latest submitted Purchase Receipt for the Item (supplier_name preferred) |
| 23a | **Last Purchase Qty (new)** | ERP | Quantity received on that latest Purchase Receipt (summed across its lines for the Item) |
| 23b | **Last Purchase Date (new)** | ERP | posting_date of that latest Purchase Receipt |
| 23c | **Days Since Last Purchase (new)** | Calc | Whole days between Last Purchase Date and the as-of date; blank when never purchased |
| 23d | **Purchased (last 30d) (new)** | ERP | Total qty received across Purchase Receipts in the 30 days before the as-of date; helps avoid double-ordering a just-restocked item. 0 when purchased but not recently; blank when never purchased |
| 24 | Cosmetics Margin | Calc | Excel: (Cosmetics MRP − Latest Cost) / Cosmetics MRP |
| 24b | OGF Margin | Calc | Excel: (OGF Price − Latest Cost) / OGF Price — blank if no OGF Price |
| 25 | **Monthly sales (new)** | Cosmo | Units from non-voided delivery_complete / invoice_complete orders in the selected month (by deliver/invoice date); no return netting in v1 |
| 26 | Header date + stock totals + ROP totals + reorder amount totals | Calc | Snapshot metadata and column sums as in today’s header rows |

**Sheet roles (reference workbook)**

| Sheet | Role (assumed) |
|-------|----------------|
| Main | Full catalog OSF + pricing |
| Randil / Inoka | Filtered subsets for individual owners (same columns as Main without pricing extras in those tabs) |

**Header band (all sheets)** — each sheet reproduces the reference's 3-row header band before the data:
1. **Row 1 — totals**: SUM of each numeric quantity column (stock, ROP, 70% ROP, order-qty, totals) over the sheet's rows.
2. **Row 2 — section labels**: `dd.mm.yyyy` as-of date over the first stock column, then `ROP`, `REORDER Amount`, and (Main only) `price` / `Purchasing Cost`.
3. **Row 3 — headers**: the actual column names. Data begins on row 4.

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
- ROP values for v1 are **maintained in Cosmo OS UI** (no Excel import required); OSF generation reads Cosmo ROP. Live ERP reorder fields are out of scope for v1 unless later clarified.
- “Sales per item for a month” means **units sold** in a user-selected calendar month from non-voided orders at **delivery_complete** or **invoice_complete**, dated by delivery/invoice completion (not order createdAt). Returns are not netted in v1; revenue is optional follow-on.
- Generated OSF Main sheet MUST use **only column headers from the reference uploaded Excel**. **OGF ≠ LWK** — keep OGF Price / OGF Margin as in Excel (standalone price + margin formula). Do not match OGF to LWK stock or LWK catalog price.
- Shop Availability (Allowed / Not Allowed) is **maintained in Cosmo OS UI** (no Excel import required); OSF reads Cosmo values.
- Excel/sheet import for seeding ROP or Shop Availability is **out of scope for v1**; optional bulk import may be added later if ops need it.
- Common SKU columns group variants by **base SKU** (strip trailing `_N` / `-N`); no separate manual common-SKU map in v1.
- Location abbreviations in the sheet map to Cosmo locations / ERP warehouses via admin configuration, not fixed code constants.
- Shopify remains the source of truth for catalog identity and retail prices; ERP remains the source of truth for stock, cost, and supplier.
