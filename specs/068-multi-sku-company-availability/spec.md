# Feature Specification: Multi-SKU Company Availability & Order Placement Suggestion

**Feature Branch**: `feature/multi-sku-company-availability`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Add one more tab (next to VAT Status and Gift Vouchers) for merchants. They want a place to add multiple SKUs and see every item's availability across the ERP2 main warehouses, with the most availability on top. We have a company cap of 5 million that we can't hit, so consider that too. We have to suggest which company warehouse to use for their order. We have multiple companies and some items are not available in some companies. When a merchant adds 5 SKUs and one company has 3 of them while other warehouses have the other two, show 'Company 1 has SKU1, SKU3, SKU4'; clicking that result shows where the other two SKUs are available, so the merchant can transfer those two items to Company 1's warehouse and place the whole 5-item order in one place. The suggestion must also consider the 5 million cap."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check availability of a basket of SKUs across companies (Priority: P1)

A merchant is about to place an order that has several items. On the products page that already has the VAT Status and Gift Vouchers tabs, they open a new **Order Availability** tab. They enter several SKUs at once, for example by pasting a list or adding them one by one, with an optional quantity for each. They run the check. The page shows, for each company, which of the entered SKUs its ERP2 main warehouse(s) can supply and which it cannot. The companies that cover the most SKUs appear at the top.

**Why this priority**: Today a merchant has to look up each SKU separately and work out by hand which company holds most of the order. This view alone removes that work and is useful even without the cap logic or the transfer view.

**Independent Test**: Enter 5 SKUs whose stock is known to sit in different companies and check that each company row lists the correct covered and missing SKUs, and that the rows are ordered by how many SKUs each company covers.

**Acceptance Scenarios**:

1. **Given** the merchant has entered SKU1–SKU5, **When** they run the check, **Then** they see one result per company, showing the count of covered SKUs (e.g. "3 of 5") and naming the covered SKUs (SKU1, SKU3, SKU4) and the missing SKUs (SKU2, SKU5).
2. **Given** Company 1 covers 3 SKUs and Company 2 covers 2, **When** results are shown, **Then** Company 1 is listed above Company 2.
3. **Given** two companies cover the same number of SKUs, **When** results are shown, **Then** the company with the larger total available quantity for the entered SKUs is listed first.
4. **Given** the merchant entered a quantity of 4 for SKU1 and a company's main warehouses hold only 2, **When** results are shown, **Then** that company counts SKU1 as "short" (partial), not covered, and shows the available quantity.
5. **Given** a SKU that does not exist in ERP2, **When** the check runs, **Then** the SKU is flagged as "not found" and the check still runs for the other SKUs.

---

### User Story 2 - Suggest ranked company options that respect the 5 million cap (Priority: P1)

Each company has a cap of LKR 5,000,000 of sales invoiced in the current calendar month, which it must not exceed. When the merchant runs a check, the page shows each company's month-to-date position against its cap and the order value that would be added to it. Instead of one fixed answer, the page offers up to three ranked suggestions, **Option A**, **Option B** and **Option C**. Each is a company that can take this order without going over its cap, best coverage first. The merchant compares them and **selects** the one they want to use.

**Why this priority**: Exceeding the cap has business and compliance consequences. A suggestion that ignores the cap is unsafe, so the cap rule must ship with the suggestions. Showing several options leaves the final choice with the merchant, who may know things the system doesn't (customer location, courier, urgency).

**Independent Test**: Set up four companies with different coverage, one of them near its cap. Run a check and confirm that Options A–C are the three best-covering companies within the cap, in order, and that the near-cap company is not offered as an option.

**Acceptance Scenarios**:

1. **Given** Companies 1, 2, 3 and 4 cover 4, 3, 3 and 1 of 5 SKUs and all are within their cap, **When** results are shown, **Then** Company 1 is Option A, and Companies 2 and 3 are Options B and C (tie broken by total available quantity). Company 4 appears under "Other companies".
2. **Given** Company 1 covers the most SKUs but adding this order would take it above 5,000,000 for the month, **When** results are shown, **Then** Company 1 is marked "would exceed cap", is not labelled as an option, and Option A goes to the next-best company that stays under its cap.
3. **Given** a company has already invoiced 5,000,000 or more this month, **When** results are shown, **Then** it is marked "cap reached" and is never offered as an option.
4. **Given** only one company can take the order within its cap, **When** results are shown, **Then** only Option A is shown and the merchant is told that no other company has headroom.
5. **Given** every company would exceed its cap with this order, **When** results are shown, **Then** no options are shown and the merchant sees a clear warning that the order cannot be placed under any company without exceeding the cap.
6. **Given** results are shown, **When** the merchant views an option, **Then** they see its coverage ("3 of 5"), month-to-date cap usage, the estimated value of this order, and the headroom remaining after the order.
7. **Given** Options A–C are shown, **When** the merchant selects Option B, **Then** Option B is marked as the selected company and its detail view opens (User Story 3). Selecting a different option switches the selection.

---

### User Story 3 - See where the missing items are so they can be moved (Priority: P2)

The merchant selects one of the options (or any other company result), for example "Option A – Company 1 – SKU1, SKU3, SKU4". A detail view opens. For each SKU that company is missing (SKU2, SKU5), it lists the other companies and warehouses that hold it, with quantities, largest stock first. The merchant then knows where to transfer those items from so that the whole order can be placed under Company 1.

**Why this priority**: This finishes the "place everything in one place" workflow. It depends on Story 1 and is worth less without it.

**Independent Test**: Click a company with 2 missing SKUs and confirm that each missing SKU lists every other warehouse holding it, with correct quantities.

**Acceptance Scenarios**:

1. **Given** Company 1 is missing SKU2 and SKU5, **When** the merchant opens Company 1's detail, **Then** they see SKU2 and SKU5, each with the source companies and warehouses that hold stock, ordered by available quantity (largest first).
2. **Given** a missing SKU is not held by any ERP2 main warehouse, **When** the detail is shown, **Then** the SKU is marked "not available anywhere" so the merchant knows the order cannot be completed in one place.
3. **Given** the detail view is open, **When** the merchant reviews it, **Then** the items already covered by Company 1 are also shown, with Company 1's own warehouse and quantity, so the whole order is visible on one screen.
4. **Given** moving the missing items would make Company 1 the full-coverage choice, **When** the detail is shown, **Then** the order value used for the cap check covers all entered items, so the cap warning reflects the complete order.

---

**Out of scope**: The tab does not create transfer requests. The merchant uses the information in the detail view to raise transfers through the existing stock-transfer process.

---

### Edge Cases

- The same SKU is entered twice: entries are merged into one line and their quantities added together.
- Blank lines, extra spaces, or differing letter case in pasted SKUs: these are ignored or normalised. "sku1" and "SKU1" are treated as the same SKU.
- A very large paste (more than 50 SKUs): the merchant is told the limit and asked to split the order.
- ERP2 is unreachable, or one company's data fails to load: the merchant sees which company could not be checked. Results for the others are still shown and are marked incomplete, and options built from partial data are clearly labelled as incomplete.
- Zero or negative stock: treated as not available.
- A SKU has no price, so its order value cannot be estimated: the SKU is flagged, and the cap check states that the order value is a lower bound.
- The cap figures cannot be loaded: no options are offered and the merchant is warned that the cap could not be checked.
- One company covers all SKUs: it is shown as "Full coverage" and, if within the cap, ranked as Option A. Other options are still shown so the merchant can choose.

## Requirements *(mandatory)*

### Functional Requirements

**Access and entry**

- **FR-001**: The system MUST add a new tab, "Order Availability", to the existing products page alongside VAT Status and Gift Vouchers. Only users with a dedicated permission can see it.
- **FR-002**: Users MUST be able to enter multiple SKUs in one action, by pasting a list (one per line, or comma/space separated) or adding rows one by one, each with an optional quantity that defaults to 1.
- **FR-003**: The system MUST de-duplicate and normalise entered SKUs, and MUST reject an entry of more than 50 distinct SKUs with a clear message.
- **FR-004**: The system MUST flag any entered SKU that does not exist in ERP2 and continue the check for the rest.

**Availability**

- **FR-005**: The system MUST read live stock for the entered SKUs from the ERP2 main warehouses of every company.
- **FR-006**: For each company, the system MUST classify every entered SKU as covered (available quantity ≥ requested), short (0 < available < requested), or missing (none available).
- **FR-007**: The system MUST list companies ordered by number of covered SKUs (highest first), then by total available quantity across the entered SKUs.
- **FR-008**: Each company result MUST show the coverage count (e.g. "3 of 5") and name the covered, short, and missing SKUs.

**Cap and suggested options**

- **FR-009**: The system MUST track each company's position against a cap of LKR 5,000,000, measured as the total value of sales invoiced by that company in the current calendar month (month-to-date). The cap resets on the 1st of each month.
- **FR-010**: The system MUST estimate the order value of the entered items (requested quantity × current selling price) and show, per company, month-to-date cap used, this order's value, and headroom remaining after the order.
- **FR-011**: The system MUST mark a company "would exceed cap" when month-to-date cap used plus order value is greater than the cap, and "cap reached" when month-to-date cap used is already at or above the cap.
- **FR-012**: The system MUST offer up to three ranked suggestions labelled **Option A**, **Option B** and **Option C**. These are the highest-ranked companies per FR-007 that would not exceed their cap, in that order. A company marked per FR-011 MUST NOT be labelled as an option.
- **FR-012a**: All companies that are not options, including those marked per FR-011, MUST still be listed below the options under "Other companies", with their coverage and cap status, so the merchant sees the full picture.
- **FR-012b**: The merchant MUST be able to select any one option as the company for the order. The selection MUST be visibly marked and can be changed. The tab does not place the order; the selection guides the merchant's next step.
- **FR-013**: When fewer than three companies can take the order within their cap, the system MUST show only the options available. When none can, it MUST show a clear warning and offer no options.
- **FR-014**: The system MUST warn when a company would be within 10% of its cap after the order (headroom less than LKR 500,000), even if it is still offered as an option.

**Missing-item sources**

- **FR-015**: Selecting an option or any other company result MUST open a detail view that lists, for each short or missing SKU, every other company's main warehouse holding stock, with available quantity, largest first.
- **FR-016**: The detail view MUST also list the SKUs the selected company already covers, with its own warehouse and quantity, so the whole order is visible together.
- **FR-017**: The detail view MUST mark any SKU that no ERP2 main warehouse can supply as "not available anywhere".

**Reliability**

- **FR-018**: If stock or cap data for any company cannot be loaded, the system MUST say which company is affected and MUST NOT present the options as complete.
- **FR-019**: The system MUST show the time at which the availability and cap figures were read.
- **FR-020**: This tab MUST be read-only: running a check or selecting an option MUST NOT change stock, orders, transfers, or any ERP data.

### Key Entities

- **SKU Request Line**: A SKU the merchant entered, with requested quantity and status (found / not found).
- **Company**: A legal trading entity that has its own ERP2 main warehouse(s) and its own cap position.
- **Main Warehouse**: An ERP2 warehouse designated as a company's primary stock-holding location for orders. It belongs to exactly one company.
- **Company Availability Result**: For one company, the covered, short, and missing SKUs, coverage count, total available quantity, and cap status.
- **Cap Position**: For one company, the cap limit (LKR 5,000,000), the sales invoiced month-to-date, this order's estimated value, and the remaining headroom.
- **Suggested Option**: One of up to three ranked companies (A, B, C) that can take the order within the cap. At most one is marked as selected by the merchant.
- **Missing-Item Source**: For one SKU missing at the selected company, another company/warehouse that holds it and the quantity available.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merchant can enter 5 SKUs and see which company to use in under 1 minute, compared with checking each SKU separately today.
- **SC-002**: Results for a check of up to 20 SKUs appear within 5 seconds in 95% of checks.
- **SC-003**: No order placed using a suggested option takes that company over its 5,000,000 monthly cap: zero cap breaches traced to a suggestion.
- **SC-004**: In spot checks against ERP2, 100% of displayed per-warehouse quantities match ERP2 at the displayed read time.
- **SC-005**: Within one month of launch, merchants use this tab for most multi-item orders and report fewer split orders across companies.

## Assumptions

- "Merchants" are internal Cosmo OS users (sales/merchandising staff) who place orders on behalf of customers, not external sellers.
- Only ERP2 main warehouses are considered. ERP1 and non-main warehouses (outlets, transit, damaged) are excluded. Which warehouses count as "main" for each company comes from a maintained list.
- "Available" means the quantity that can actually be sold or transferred (actual stock less reserved stock where ERP2 provides it), not gross on-hand.
- The 5,000,000 cap is the same for every company and is in LKR. An administrator can change the figure later without a code change.
- Order value for the cap check uses the current selling price from the same source the order would be invoiced at.
- "Sales invoiced" for the cap means submitted sales invoices in ERP2 for that company, net of returns/credit notes, dated within the current calendar month.
- Ranking puts SKU coverage first and quantity second. Cap status is a hard filter for Options A–C (not a ranking factor), so merchants still see high-coverage companies that are blocked by the cap, under "Other companies".
- Three options is the default; the number can be changed later without a code change.
- Results and the merchant's selected option are not saved. Each check is a fresh live read.
- Raising stock transfers stays in the existing transfer process; this tab only shows where stock is.
- The tab sits on the same products page as VAT Status, and permissions follow the existing role-based access model.
