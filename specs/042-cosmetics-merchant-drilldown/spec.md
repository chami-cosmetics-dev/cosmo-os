# Feature Specification: Cosmetics.lk Merchant Drill-down

**Feature Branch**: `042-cosmetics-merchant-drilldown`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "in main dashboard we have cosmetics card no, when we click it i want to show all merchant how placed orders in cosmetics.lk through website also through erp1 howmany orders, payment type wise, vat items, discounts, like wise"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Cosmetics.lk detail from the main dashboard card (Priority: P1)

A sales, finance, or operations user on the company main dashboard sees the Cosmetics.lk location card (headline total and top-merchant donut). They click that card and a Cosmetics.lk detail view opens for the **same date range and sales filter** already selected on the dashboard. They can return to the dashboard grid without losing those filters.

**Why this priority**: Click-to-open is the entry point. Without it, the rest of the breakdowns have no home.

**Independent Test**: With a known Cosmetics.lk total on the card, click the card; the detail view opens showing that same location and period; closing/back returns to the dashboard with filters unchanged.

**Acceptance Scenarios**:

1. **Given** the main dashboard Merchant Performance grid is visible, **When** the user clicks the Cosmetics.lk card, **Then** a Cosmetics.lk merchant drill-down opens for that location.
2. **Given** the dashboard has a selected From–To range and a sales filter (for example All orders or Not delivered), **When** the drill-down opens, **Then** it uses that same range and filter — it does not reset to a different period.
3. **Given** the drill-down is open, **When** the user closes or goes back, **Then** they return to the main dashboard with the same range and filter still applied.
4. **Given** other location cards (DTD, Pevi, AJS, and similar) are visible, **When** the user clicks one of those cards, **Then** this Cosmetics.lk drill-down does **not** open (v1 is Cosmetics.lk only).

---

### User Story 2 - See every merchant who placed Cosmetics.lk orders (Priority: P1)

In the drill-down, the user sees **every sales merchant** who has at least one qualifying Cosmetics.lk order in the current filter — not only the “top merchant” shown inside the card donut. Each merchant row shows order count and sales amount. Orders with no attributed merchant still appear under the same unassigned / general merchant label the dashboard already uses.

**Why this priority**: The stated need is “show all merchants who placed orders,” which the card donut currently hides behind a single top-merchant highlight.

**Independent Test**: Pick a day where several merchants have Cosmetics.lk orders plus some unassigned orders; open the drill-down and confirm every attributed merchant appears with matching count and amount; unassigned orders appear under the existing general label.

**Acceptance Scenarios**:

1. **Given** three merchants each have Cosmetics.lk orders in the selected filter, **When** the drill-down loads, **Then** all three merchants are listed with their Cosmetics.lk order count and amount.
2. **Given** the Cosmetics.lk card donut highlights only the top merchant at 100% or a majority share, **When** the user opens the drill-down, **Then** lower-share merchants with orders still appear (the list is not limited to the top merchant).
3. **Given** Cosmetics.lk orders exist with no attributed merchant, **When** the drill-down loads, **Then** those orders are grouped under the dashboard’s existing unassigned / general merchant label, not dropped.
4. **Given** a merchant has orders at other locations but none at Cosmetics.lk in this filter, **When** the drill-down loads, **Then** that merchant is not listed.
5. **Given** the listed merchant amounts are summed, **When** compared with the Cosmetics.lk card headline total for the same filter, **Then** the sums match.

---

### User Story 3 - Split Cosmetics.lk orders by website vs ERP1 (Priority: P1)

For the location as a whole and for each merchant, the user can see how many orders and how much amount came **through the cosmetics.lk website** versus **through ERP1** (the Cosmetics.lk ERP company: counter / POS and ERP sales invoices). If Cosmo-created manual orders exist in the same filter, they appear as a separate third channel so they are not mixed into website or ERP1.

**Why this priority**: Channel mix is the explicit ask after “who placed orders.” Website vs ERP1 is how ops judge shop vs walk-in / ERP billing.

**Independent Test**: Use a sample with website orders, ERP1 orders, and (if present) manual orders; confirm location totals and per-merchant rows split the same way; a merchant who only sold on the website shows zero ERP1.

**Acceptance Scenarios**:

1. **Given** Cosmetics.lk has both website and ERP1 orders in the filter, **When** the drill-down loads, **Then** location-level website order count + amount and ERP1 order count + amount are both visible.
2. **Given** Merchant A has website orders and Merchant B has only ERP1 orders, **When** the user reads the merchant list, **Then** A’s website figures are non-zero and ERP1 is zero (or omitted as zero); B’s ERP1 figures are non-zero and website is zero (or omitted as zero).
3. **Given** a Cosmo-created manual Cosmetics.lk order exists in the filter, **When** the drill-down loads, **Then** it is counted in a distinct Manual (or equivalent) channel, not folded into website or ERP1.
4. **Given** website + ERP1 + any other shown channel amounts are summed for a merchant, **When** compared with that merchant’s Cosmetics.lk total, **Then** the sums match.

---

### User Story 4 - Payment type breakdown (Priority: P2)

The user can see Cosmetics.lk sales **by payment type** (for example Cash / COD, Card, Bank Transfer, KOKO, Mintpay, and other types already used on orders) — at location level and per merchant. Each payment type shows order count and amount.

**Why this priority**: Payment mix is explicitly requested; it explains how Cosmetics.lk was paid, not only who sold.

**Independent Test**: Open a period with mixed payment types; location payment totals equal the Cosmetics.lk headline; a merchant’s payment-type amounts equal that merchant’s Cosmetics.lk total.

**Acceptance Scenarios**:

1. **Given** Cosmetics.lk orders in the filter used more than one payment type, **When** the drill-down loads, **Then** each used payment type is listed with order count and amount.
2. **Given** the user inspects a merchant row (or merchant detail inside the drill-down), **When** payment types are shown, **Then** they reflect only that merchant’s Cosmetics.lk orders in the current filter.
3. **Given** an order has no recognizable payment type, **When** it is included, **Then** it appears under an Unspecified (or equivalent) bucket instead of being omitted.
4. **Given** payment-type amounts at location level are summed, **When** compared with the Cosmetics.lk card total for the same filter, **Then** the sums match.

---

### User Story 5 - VAT items vs other items (Priority: P2)

The user can see how much of Cosmetics.lk sales (location and per merchant) came from **VAT items** versus **other items**, using the same VAT-item meaning already used on the merchant personal dashboard for Cosmetics.lk. Figures are based on line items, with order count of orders that contain at least one VAT line where that is shown.

**Why this priority**: VAT mix is explicitly requested and is a distinct Cosmetics.lk catalog concern.

**Independent Test**: Pick orders that contain VAT-tagged lines and orders that do not; confirm VAT vs other amounts split correctly at location and merchant level.

**Acceptance Scenarios**:

1. **Given** Cosmetics.lk orders include both VAT-tagged lines and other lines, **When** the drill-down loads, **Then** VAT item amount and other-item amount are both visible.
2. **Given** a merchant’s Cosmetics.lk orders include VAT lines, **When** the user views that merchant in the drill-down, **Then** that merchant’s VAT vs other split is shown for those orders only.
3. **Given** an order has no VAT-tagged lines, **When** VAT vs other is calculated, **Then** its line value is counted as other items, not as VAT.

---

### User Story 6 - Discount visibility (Priority: P2)

The user can see Cosmetics.lk **discount** activity for the filter: total discount amount at location level, and per merchant the discount amount plus which discount / coupon codes were used (count of orders using each code). Orders with no discount are not treated as discounted.

**Why this priority**: Discounts were explicitly requested alongside payment type and VAT; they explain net vs promotional Cosmetics.lk sales.

**Independent Test**: Include orders with known discount amounts and coupon codes plus orders with none; confirm location discount total and per-merchant discount amount / codes match those orders.

**Acceptance Scenarios**:

1. **Given** Cosmetics.lk orders in the filter have discounts, **When** the drill-down loads, **Then** the location shows a total discount amount for that filter.
2. **Given** Merchant A’s Cosmetics.lk orders used one or more discount / coupon codes, **When** the user views Merchant A in the drill-down, **Then** they see that merchant’s discount amount and the codes used (with how many of that merchant’s orders used each code).
3. **Given** an order has no discount amount and no discount code, **When** discount totals are calculated, **Then** it contributes zero discount and does not invent a code.
4. **Given** the same Cosmetics.lk order is counted for merchant, channel, payment type, and discount, **When** the user compares views, **Then** it is the same order (no double-counting across merchants).

---

### Edge Cases

- Cosmetics.lk card total is zero for the filter: drill-down still opens and shows an empty state (no merchants, zeros for channel / payment / VAT / discount), not an error.
- Cosmetics.lk location is missing or renamed in company setup: clicking is unavailable or a clear “Cosmetics.lk location not found” message; other dashboard cards keep working.
- Many merchants (dozens): the list remains usable (scroll or equivalent); no merchant with qualifying orders is silently dropped.
- Mixed-channel merchant: one merchant can have both website and ERP1 rows/columns; totals still add to that merchant’s Cosmetics.lk total.
- Mixed-location order attribution: only orders belonging to the Cosmetics.lk location are included; other shops’ orders never appear in this drill-down.
- Dashboard filter with no Cosmetics.lk orders but other locations have sales: Cosmetics.lk card stays clickable; drill-down empty state as above.
- User changes From–To or sales filter while the drill-down is open (if the dashboard allows filter changes without closing): drill-down figures refresh to the new filter; if filters cannot change until the drill-down is closed, closing and reopening with new filters is acceptable.
- Voided / cancelled finance orders: excluded using the same eligibility rules as the main dashboard card total.
- POS / counter sales: included or excluded exactly as the active dashboard sales filter already treats them (drill-down does not invent a second eligibility rule).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST make the Cosmetics.lk Merchant Performance card on the main dashboard an explicit click target that opens the Cosmetics.lk merchant drill-down.
- **FR-002**: System MUST apply the dashboard’s current date range and sales-filter definition to every figure in the drill-down (merchants, channels, payment types, VAT, discounts).
- **FR-003**: System MUST list every sales merchant who has at least one eligible Cosmetics.lk order in that filter, with order count and sales amount.
- **FR-004**: System MUST include Cosmetics.lk orders with no attributed merchant under the same unassigned / general merchant label the main dashboard already uses.
- **FR-005**: System MUST exclude merchants who have no eligible Cosmetics.lk orders in the current filter.
- **FR-006**: The sum of merchant sales amounts in the drill-down MUST equal the Cosmetics.lk card headline total for the same filter.
- **FR-007**: System MUST show location-level and per-merchant split of Cosmetics.lk orders into **Website** (cosmetics.lk website) and **ERP1** (Cosmetics.lk ERP: counter / POS and ERP sales invoices), each with order count and amount.
- **FR-008**: System MUST show Cosmo-created **Manual** Cosmetics.lk orders as their own channel when any exist in the filter, and MUST NOT mix them into Website or ERP1.
- **FR-009**: For each merchant, Website + ERP1 + Manual (if shown) amounts MUST equal that merchant’s Cosmetics.lk sales amount.
- **FR-010**: System MUST show Cosmetics.lk sales by **payment type** at location level and per merchant, with order count and amount for each type used.
- **FR-011**: Orders with no recognizable payment type MUST appear under an Unspecified (or equivalent) payment bucket.
- **FR-012**: Location-level payment-type amounts MUST sum to the Cosmetics.lk card headline total for the same filter.
- **FR-013**: System MUST show Cosmetics.lk **VAT items** vs **other items** at location level and per merchant, using the same VAT-item meaning already shown on the merchant personal Cosmetics.lk breakdown.
- **FR-014**: System MUST show Cosmetics.lk **discount amount** at location level and per merchant for the current filter.
- **FR-015**: System MUST show, per merchant, which discount / coupon codes were used on that merchant’s Cosmetics.lk orders and how many of those orders used each code.
- **FR-016**: Users who can see the main dashboard Merchant Performance cards MUST be able to open this drill-down; users who cannot see those cards MUST NOT gain Cosmetics.lk merchant figures through this view.
- **FR-017**: System MUST provide a clear way to leave the drill-down and return to the main dashboard without changing the user’s date range or sales filter.
- **FR-018**: System MUST present an empty state when Cosmetics.lk has no eligible orders in the current filter (zeros / “no merchants”), not a failure.
- **FR-019**: Channel, payment-type, VAT, and discount views MUST be labeled so a non-technical user can tell location totals apart from a single merchant’s figures.

### Key Entities

- **Cosmetics.lk location**: The company shop/location whose Merchant Performance card is the Cosmetics.lk card on the main dashboard.
- **Sales merchant**: A person (or unassigned / general bucket) to whom Cosmetics.lk orders are attributed on the main dashboard.
- **Eligible order**: A Cosmetics.lk order that counts toward the current dashboard date range and sales filter (same inclusion as the card total).
- **Order channel**: How the order was placed — Website, ERP1, or Manual.
- **Payment type**: The customer-facing payment method on the order (Cash / COD, Card, Bank Transfer, KOKO, and other types already used).
- **VAT item vs other item**: Line-level catalog classification already used for Cosmetics.lk VAT reporting on the merchant personal dashboard.
- **Discount**: Order-level discount amount and any discount / coupon code recorded on the order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the main dashboard, a user can open the Cosmetics.lk merchant list in one click and see the first merchant figures within 10 seconds of the click on a typical business day.
- **SC-002**: For a known sample period, 100% of merchants with eligible Cosmetics.lk orders appear in the drill-down (none omitted relative to a hand-checked list).
- **SC-003**: For that same sample, the sum of merchant amounts equals the Cosmetics.lk card total within 0.01 currency units.
- **SC-004**: For a sample that includes both website and ERP1 orders, users can read both channel order counts and amounts at location level without exporting.
- **SC-005**: For a sample with at least three payment types, users can read payment-type order counts and amounts and they sum to the Cosmetics.lk card total within 0.01 currency units.
- **SC-006**: For a sample with VAT and non-VAT lines plus discounted and non-discounted orders, users can see VAT vs other amounts and discount totals at location and merchant level without a spreadsheet.
- **SC-007**: At least 90% of target users (sales/finance/ops who already use the main dashboard) can answer “which merchants sold on Cosmetics.lk website vs ERP1 in this period?” on the first attempt using only the drill-down.

## Assumptions

- v1 applies only to the **Cosmetics.lk** location card on the **company main dashboard**, not to other location cards and not to the merchant personal dashboard (that page already has a per-merchant Cosmetics.lk source / payment / VAT breakdown).
- “Merchants who placed orders” means **sales merchants attributed to Cosmetics.lk orders**, using the same attribution rules as the main dashboard location donut (including the unassigned / general bucket). It does not mean a new directory of trading companies or customers.
- Date range, sales filter, and order eligibility (paid/pending, voided excluded, how POS is treated in delivery-focused filters) stay exactly as the main dashboard already defines them.
- **Website** means orders placed on the cosmetics.lk website. **ERP1** means orders billed through the Cosmetics.lk ERP company (counter / POS and ERP sales invoices). **Manual** means orders created inside Cosmo OS rather than website or ERP1.
- Payment types reuse the labels staff already see on orders (not a new payment taxonomy).
- VAT items reuse the existing Cosmetics.lk VAT-item classification used on the merchant personal dashboard.
- Discount amount is the order’s recorded discount total; codes are the discount / coupon codes stored on the order (including merchant coupons when those are how attribution is tracked).
- Audience is the same as the main dashboard Merchant Performance grid (company analytics users). Merchants who only have the personal dashboard do not get this all-merchant Cosmetics.lk list unless they already see the company main dashboard.
- Layout may be a panel, overlay, or dedicated view reached from the card; stakeholder success is “click card → see all merchants and breakdowns,” not a particular layout.
- Export, print, and drill-through from a merchant row into full order search are out of scope for v1 unless they already exist elsewhere; the drill-down itself is the deliverable.
- Other location cards remain non-clickable for this feature in v1.
- Headline card totals and donut math on the dashboard grid are unchanged; this feature adds the click-through detail, it does not redefine the card number.
