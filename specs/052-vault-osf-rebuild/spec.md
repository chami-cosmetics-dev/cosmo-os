# Feature Specification: Supplement Vault Order Support File (OSF)

**Feature Branch**: `052-vault-osf-rebuild`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "OSF for Supplement Vault. Catalog data from ERP1, drop column E. Keep ROP for SV/AE/Origins as the sample file shows; remove New Malinda, New USA and Buffer stock. Sales must run April 01 (until April/May history is uploaded) through month-to-date, per month, not one company-wide total. Current MRP and discounted price from ERP1. Column BA not needed. Max sale = maximum monthly sale for the generated period. Column BC avg = total stock / maximum sale. Keep reorder quantity. Latest price and latest price supplier from both ERPs. April/May rows stay empty until we add that history. Two more columns: purchase value and purchase quantity per month. Never count internal transfers — recent supplier data must be supplier purchases only. No percentage split for ROP; it is uploaded manually afterwards and managed from Vault OS or via the ROP template."

## Overview

Vault OS today generates an Order Support File built for the Cosmo tenant: one
company-wide sales column, Cosmo-specific pricing and threshold columns, and
stock columns seeded from Cosmo locations. The purchasing team for Supplement
Vault maintains the real report by hand in Excel (the "order supporting report"
workbook), because the generated file does not match the three-business
structure they actually buy against.

This feature replaces the Vault OSF output with a workbook that mirrors the
manual sheet: three business columns (SupplementVault.lk, Origins, AE), a
month-by-month sales and purchase history from April onward, and pricing pulled
from the supplement ERPs — so the buyer can open one generated file and place
orders without rebuilding it by hand.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate the Vault OSF with correct stock, sales and reorder figures (Priority: P1)

A Supplement Vault purchasing officer opens the OSF page, picks the as-of date,
and downloads the workbook. Every SKU in the supplement catalog appears as one
row showing current stock for SupplementVault.lk, Origins and AE; the sale count
for each month from April through the current month-to-date, broken out by those
same three businesses plus a monthly total; the maximum monthly sale; months of
cover; and the reorder quantity per business.

**Why this priority**: This is the report itself. Without it the team keeps
maintaining the workbook manually, which is the problem being solved.

**Independent Test**: Generate the file for a date where ERP data exists (June
onward) and reconcile SV/Origins/AE stock and monthly sale counts against the
ERP stock balance and sales register reports for the same period.

**Acceptance Scenarios**:

1. **Given** a SKU with stock in all three businesses, **When** the file is
   generated, **Then** the SV, ORI and AE stock columns show each business's
   current balance and the Total column equals their sum.
2. **Given** a generated file for September, **When** the buyer reads the sales
   block, **Then** there is one group of four columns (SV, ORI, AE, Total) for
   each month April through September, and the September group counts only
   1 September through the as-of date.
3. **Given** a SKU whose monthly totals are 27, 32, 46, 20, 18 and 1, **When**
   the file is generated, **Then** Max sale shows 46.
4. **Given** a SKU with total stock 19 and max sale 46, **When** the file is
   generated, **Then** the AVE column shows 0.41.
5. **Given** a SKU with an SV reorder point of 9 and SV stock of 6, **When** the
   file is generated, **Then** the SV reorder quantity shows 3.
6. **Given** a SKU with no reorder point uploaded yet, **When** the file is
   generated, **Then** its ROP cells are blank rather than zero, and the
   reorder-quantity cells are blank too.

---

### User Story 2 - See live selling prices and the real last supplier price (Priority: P2)

The buyer needs to know what the product currently sells for and what it last
cost, so they can judge margin before ordering. The workbook shows the current
MRP, the discounted price after any active item-level promotion, and the most
recent purchase price with the supplier who charged it — drawn from whichever
supplement ERP recorded that purchase most recently.

**Why this priority**: Prices change weekly with promotions; a stale or missing
price sends the buyer back to the ERP and defeats the point of the file.

**Independent Test**: Pick a SKU that is part of an active percentage promotion
and one that is not; confirm the discounted price reflects the promotion for the
first and is blank for the second, and confirm the latest supplier price matches
the newest purchase document across both ERPs.

**Acceptance Scenarios**:

1. **Given** a SKU selling at 9,500 that is included in an active 10% item-level
   promotion, **When** the file is generated, **Then** MRP shows 9,500 and
   Discounted Price shows 8,550.
2. **Given** a SKU with no active item-level promotion, **When** the file is
   generated, **Then** Discounted Price is blank.
3. **Given** a promotion that applies to a whole order rather than to specific
   items (cash discount, loyalty tier, staff discount, coupon), **When** the
   file is generated, **Then** it does not affect Discounted Price for any SKU.
4. **Given** a SKU last purchased in ERP1 on 20 August and in ERP2 on 3
   September, **When** the file is generated, **Then** Latest price and Latest
   price supplier come from the 3 September purchase.

---

### User Story 3 - See purchase quantity and value per month (Priority: P2)

Alongside the monthly sales history, the buyer sees how much of each SKU was
bought in each month and what it cost, so they can spot over-buying and compare
buying pace to selling pace.

**Why this priority**: New capability the manual sheet does not have; valuable
but the report is still usable without it.

**Independent Test**: Compare the monthly purchase quantity and value for a
sample of SKUs against the item-wise purchase history report in the ERPs for the
same month, with intercompany documents excluded.

**Acceptance Scenarios**:

1. **Given** a SKU purchased twice in July, **When** the file is generated,
   **Then** the July purchase quantity is the sum of both quantities and the
   July purchase value is the sum of both net line amounts, excluding tax.
2. **Given** a SKU received in July only through a transfer between Supplement
   Vault group companies, **When** the file is generated, **Then** July purchase
   quantity and value are blank.
3. **Given** a SKU not purchased in a given month, **When** the file is
   generated, **Then** that month's purchase quantity and value are blank.

---

### User Story 4 - Upload reorder points and back-fill April/May sales (Priority: P3)

Reorder points are decided by the team, not calculated by the system. The buyer
downloads a reorder-point template listing every SKU with an SV, ORI and AE
column, fills it in, and uploads it; the next generated file shows those values.
The same pattern applies to the missing April and May sales history: the team
uploads a sales-history file for those months, after which those columns stop
being blank.

**Why this priority**: The report is useful before either upload happens — ROP
cells and April/May cells simply stay blank — so this can follow the first
release.

**Independent Test**: Download the reorder-point template, fill three SKUs,
upload it, regenerate, and confirm only those three SKUs show reorder points and
reorder quantities.

**Acceptance Scenarios**:

1. **Given** no reorder points have been uploaded, **When** the file is
   generated, **Then** all ROP and reorder-quantity cells are blank and no
   default or percentage-derived value is invented.
2. **Given** a reorder-point file is uploaded, **When** the file is regenerated,
   **Then** the uploaded values appear and Total ROP is their sum.
3. **Given** no April or May sales history exists, **When** the file is
   generated, **Then** the April and May sales columns are present but empty,
   and Max sale is computed from the months that do have data.
4. **Given** April and May history is later uploaded, **When** the file is
   regenerated, **Then** those columns are populated and Max sale accounts for
   them.

---

### Edge Cases

- A SKU exists in ERP1 but has never been stocked or sold by Origins or AE: it
  still appears as a row, with blank rather than zero ORI/AE figures where no
  document exists.
- Max sale is zero or blank for a SKU with no sales in any month: months of
  cover cannot be divided and must be blank, not an error or infinity.
- A sales invoice is cancelled or is a credit note / return: it must not inflate
  the month's sale count.
- The as-of date falls on the first of a month: that month's group exists and
  reads zero or blank rather than being omitted.
- A purchase document exists but its supplier is not in the Vault OS supplier
  list: the line is ignored entirely, on the assumption it is an internal or
  non-stock transaction.
- The same item code exists in both ERPs with different selling prices: pricing
  follows ERP1, which is the pricing master.
- One ERP is unreachable during generation: the file must not be silently
  produced with missing columns presented as zeros — the user is told which
  business's data could not be retrieved.

## Requirements *(mandatory)*

### Functional Requirements

#### Scope and rows

- **FR-001**: The workbook MUST contain one row per enabled item in ERP1 (the
  SupplementVault.lk ERP), which is the catalog master for this report.
- **FR-002**: The report MUST apply to the Supplement Vault tenant only and MUST
  NOT change the Order Support File produced for the Cosmo tenant.

#### Column layout

- **FR-003**: The workbook MUST emit exactly these column blocks, in order:
  identity (Variant SKU, SKU, Barcode, Priority Status, Country, Category,
  Brand, Item); reorder point (SV, ORI, AE, Total ROP); stock (SV, ORI, AE,
  Total); manual notes (remark, AK1, AK2); one sales group per month (SV, ORI,
  AE, month Total); one purchase pair per month (Quantity, Value); pricing (MRP,
  Discounted Price); derived (Max sale, AVE); reorder quantity (SV, ORI, AE,
  Total); supplier (Latest price, Latest price supplier).
- **FR-004**: The workbook MUST NOT contain the New Malinda, New USA, Buffer
  stock, five-month-average, or blank spacer columns present in the manual
  sheet.
- **FR-005**: The workbook MUST NOT contain the Cosmo-only columns carried by
  the current generator: percentage of reorder point, 70% of total ROP, 70%
  availability, OGF price, margin percentages, days since last purchase, and
  purchased-in-last-30-days.
- **FR-006**: The reorder-point column headers MUST NOT carry a percentage share
  (no "SV 16%", "OR 34%", "AE 50%"), because shares are no longer applied by the
  system.
- **FR-007**: The remark, AK1 and AK2 columns MUST be emitted empty for the team
  to annotate after download.

#### Business-to-source mapping

- **FR-008**: The SV figures MUST come from the SupplementVault.lk company in
  ERP1, using its main warehouse only and excluding the retail shop and website
  warehouses.
- **FR-009**: The ORI figures MUST come from the Origins (PVT) LTD company in
  ERP2. The separate Origins Online company was created in error and MUST be
  excluded from every column, including its warehouse stock.
- **FR-010**: The AE figures MUST come from the AE (PVT) LTD company in ERP2.
- **FR-011**: Country, Category, Brand and Item description MUST come from ERP1.

#### Sales history

- **FR-012**: Sales MUST be reported as separate month groups covering 1 April
  of the reporting year through the month containing the as-of date.
- **FR-013**: The final month group MUST cover only 1st-of-month through the
  as-of date, not the whole calendar month.
- **FR-014**: Each month group MUST break the count down by SV, ORI and AE and
  show their sum, rather than a single company-wide figure.
- **FR-015**: Sale counts MUST be taken from confirmed sales documents in the
  ERPs — ERP1 for SV, ERP2 per company for ORI and AE — excluding cancelled or
  draft documents.
- **FR-016**: Returns and credit notes MUST reduce the month's count.
- **FR-017**: Months with no available history MUST render as empty cells, not
  zeros, so the buyer can tell "no data yet" from "no sales".
- **FR-018**: Users MUST be able to upload April and May sale counts per SKU and
  per business through an import file, after which those months populate like
  any other.

#### Purchases

- **FR-019**: Each month in the reporting window MUST have a purchase quantity
  and a purchase value column.
- **FR-020**: Purchase value MUST be the net line amount, excluding tax.
- **FR-021**: Purchase figures MUST only count documents whose supplier appears
  in the Vault OS supplier list; every other document, including intercompany
  and group-internal movements, MUST be ignored.
- **FR-022**: Stock transfers between Supplement Vault group companies MUST NOT
  appear as purchases, and MUST NOT influence the latest price or latest
  supplier.

#### Pricing

- **FR-023**: MRP MUST be the current selling price for the item in ERP1.
- **FR-024**: Discounted Price MUST be the MRP reduced by the active item-level
  promotion in ERP1 that applies to that item on the as-of date.
- **FR-025**: Promotions that apply to a whole transaction rather than to named
  items — cash discounts, loyalty tiers, staff discounts, coupon-based rules —
  MUST be ignored.
- **FR-026**: Disabled promotions, and promotions outside their validity dates
  on the as-of date, MUST be ignored.
- **FR-027**: When no item-level promotion applies, Discounted Price MUST be
  blank.
- **FR-028**: Latest price and Latest price supplier MUST be read from both
  ERPs, with the most recent qualifying purchase document winning.

#### Reorder points and reorder quantity

- **FR-029**: Reorder points MUST be read from values stored in Vault OS, never
  derived from a percentage share of a total.
- **FR-030**: Users MUST be able to download a reorder-point template listing
  every SKU with an SV, ORI and AE column, and upload the completed file to set
  those values.
- **FR-031**: Users MUST be able to view and edit reorder points inside Vault OS
  without re-uploading a file.
- **FR-032**: Reorder quantity per business MUST be that business's reorder
  point minus its current stock, and Total reorder quantity MUST be the sum of
  the three.
- **FR-033**: When a business's reorder point is not set, its reorder quantity
  MUST be blank rather than showing negative stock.

#### Derived figures

- **FR-034**: Max sale MUST be the largest monthly total across the month groups
  that have data.
- **FR-035**: AVE MUST be total stock divided by Max sale, and MUST be blank
  when Max sale is zero or unavailable.

#### Reliability

- **FR-036**: If either ERP cannot be reached during generation, the user MUST
  be told which business's figures are unavailable rather than receiving a file
  where missing data reads as zero.

### Key Entities

- **Supplement item**: A product line in the Vault catalog, identified by
  variant SKU and barcode, carrying country of origin, category, brand,
  description and a purchasing priority status.
- **Business unit**: One of SupplementVault.lk, Origins or AE — the three
  entities whose stock, sales, reorder points and reorder quantities are tracked
  side by side. Each maps to one company in one of the two supplement ERPs.
- **Monthly sales figure**: Units sold of one item, by one business unit, in one
  calendar month. May be absent (not yet loaded) as distinct from zero.
- **Monthly purchase figure**: Quantity and net value of one item bought from an
  external supplier in one calendar month, across the group.
- **Reorder point**: A team-decided stock threshold for one item and one
  business unit, maintained in Vault OS and set by upload or direct edit.
- **Supplier purchase record**: The most recent external purchase of an item,
  giving its price and supplier name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The buyer produces a ready-to-use order support file in a single
  download, with no manual copy-paste between the ERPs and the workbook.
- **SC-002**: Stock, monthly sale counts and monthly purchase figures in the
  generated file reconcile to the corresponding ERP reports for the same period
  for 100% of sampled SKUs.
- **SC-003**: Zero intercompany or group-internal movements are counted as
  purchases or reflected in the latest supplier price.
- **SC-004**: The discounted price matches the price a customer would actually
  be charged for every SKU covered by an active item-level promotion.
- **SC-005**: A month with no loaded history is visually distinguishable from a
  month with genuinely zero sales in 100% of cases.
- **SC-006**: The team can change reorder points and see the effect in a
  regenerated file without developer involvement.
- **SC-007**: The Cosmo tenant's order support file is byte-for-byte unchanged
  by this work.

## Assumptions

- The reporting window always starts on 1 April; the manual sheet is built on an
  April-to-date financial year and the team confirmed this start point.
- ERP1 is `supplement-vault-lk-01` (company SupplementVault.lk) and ERP2 is
  `supplement-vault-lk-02` (companies Origins (PVT) LTD, AE (PVT) LTD, Origins
  Online). Both are already configured for the Vault tenant.
- Origins Online (SV-2) in ERP2 is a company created by mistake. It is not a
  business unit and will never become a column. Any stock, sales or purchase
  documents sitting under it are treated as noise and excluded, so the group
  totals in this report may not tie to an ERP-wide "all companies" report.
- Sales invoices exist in both ERPs only from 1 June 2026 onward, so April and
  May will render empty until the team uploads that history.
- ERP1 holds a single selling price list; the discount is expressed only through
  item-level promotion rules, so there is no second price list to read.
- Only one item-level promotion is expected to apply to a given item on a given
  day. If several do, the largest discount is used and this is treated as a data
  hygiene issue for the team to resolve in the ERP.
- Suppliers maintained in Vault OS are the authoritative list of external
  suppliers; anything outside it is internal or non-stock.
- Priority status continues to come from the existing Vault OS product record,
  not from the ERPs.
- The existing reorder-point template and import flow are reused rather than
  rebuilt; only the column set changes to SV / ORI / AE.
- The workbook is consumed in Excel by a small internal purchasing team; no
  concurrent-user or large-scale performance target applies beyond the file
  generating in a reasonable time for the full catalog.
