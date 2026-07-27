# Feature Specification: Order Number, Search, Rider Performance & Cash Tender

**Feature Branch**: `025-order-search-rider-incentives`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "every place orders display should show order number, also add search bar to main page, also i want add dashboard to follow riders their performance, also want show their incentive it count on shipping cost of the order, when order complete its shipping cost add their incentive, when customer gave 5000 if the order 3500 balance should show in order, rider add customer gave money and show balance"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Order number visible everywhere (Priority: P1)

Staff and riders looking at any order list, card, detail, or summary must always see the human-readable order number so they can match paper invoices, phone calls, and warehouse labels without opening the full record.

**Why this priority**: Misidentification of orders is a daily operational risk; this is a low-risk, high-frequency fix across Cosmo OS web and the rider app.

**Independent Test**: Open every primary order surface (orders list, fulfillment queues, rider route list, order detail, approvals). Confirm each row/card shows the order number prominently without drilling in.

**Acceptance Scenarios**:

1. **Given** an order appears in any order list or card, **When** a user views that list, **Then** the order number is visible without opening the detail screen.
2. **Given** an order detail or invoice-related view is open, **When** the user scans the header, **Then** the order number is shown as a primary identifier (not only internal IDs or phone numbers).
3. **Given** rider mobile lists (route, completed, cash-related order rows), **When** the rider views them, **Then** each delivery shows the same order number used in Cosmo OS.

---

### User Story 2 - Search on the main operations page (Priority: P1)

A user on the main Cosmo OS operations landing page can type an order number, phone, or customer name into a search bar and jump quickly to matching orders instead of hunting through filters or stages.

**Why this priority**: Finding a specific order is the most common interrupt during support and warehouse work.

**Independent Test**: From the main page, search by a known order number and by a customer phone; confirm matching results appear and open the correct order.

**Acceptance Scenarios**:

1. **Given** the user is on the main Cosmo OS page, **When** they enter a full or partial order number in the search bar, **Then** matching orders are listed and selectable.
2. **Given** the user searches by customer phone or name, **When** results exist, **Then** those orders appear with order number visible on each result.
3. **Given** no orders match, **When** search completes, **Then** the user sees a clear empty state (not an error).

---

### User Story 3 - Rider records cash received and sees balance (Priority: P1)

At delivery, when the customer pays with cash (or cash as part of a split), the rider enters how much money the customer handed over. If that amount is higher than the amount due, the screen shows the balance (change) to return. That tendered amount and balance are also visible on the order in Cosmo OS.

**Why this priority**: Stores already need this for real cash handovers; it prevents disputes about change and improves cash reconciliation.

**Independent Test**: Complete a COD delivery where order due is 3,500 and rider enters customer gave 5,000; confirm balance 1,500 appears on mobile and on the Cosmo OS order view.

**Acceptance Scenarios**:

1. **Given** a delivery with an amount due of 3,500, **When** the rider enters customer gave 5,000, **Then** the app shows balance (change) of 1,500 before completion is allowed.
2. **Given** the rider enters customer gave equal to the amount due, **When** they review the screen, **Then** balance is 0 (or shown as no change due).
3. **Given** the rider enters customer gave less than the amount due for a full-cash collection, **When** they try to complete, **Then** they are blocked or warned that the tendered amount is insufficient (unless another approved payment method covers the remainder in a split).
4. **Given** a delivery is completed with tendered amount and balance recorded, **When** staff open the order in Cosmo OS, **Then** they can see amount due, customer gave, and balance.

---

### User Story 4 - Rider performance dashboard with incentives (Priority: P2)

Operations managers open a rider performance dashboard to see each rider’s completed deliveries and incentive earned. Incentive for a completed order equals that order’s shipping cost, added when the order is completed by the rider.

**Why this priority**: Needed for ops visibility and rider pay follow-up, but depends on reliable completion events and shipping amounts already on the order.

**Independent Test**: Complete two deliveries for rider A with shipping costs 200 and 350; confirm dashboard shows 2 completions and incentive total 550 for the selected period.

**Acceptance Scenarios**:

1. **Given** an authorized ops/admin user, **When** they open the rider performance dashboard, **Then** they see a list of riders with completed delivery counts and incentive totals for a selectable date range.
2. **Given** a rider completes an order that has shipping cost 400, **When** completion is recorded, **Then** 400 is added to that rider’s incentive for the completion day.
3. **Given** an order has zero or missing shipping cost, **When** it is completed, **Then** incentive added is 0 and the completion still counts toward delivery volume.
4. **Given** a delivery fails (not completed), **When** the dashboard is viewed, **Then** that order does not add incentive.

---

### Edge Cases

- Order number missing on old/manual records: show the best available label (order number, then name/reference) and never leave the field blank without a fallback.
- Search with very short queries: require a minimum length before searching to avoid flooding results.
- Split payments with cash portion: “customer gave” applies to the cash portion; balance = customer gave − cash amount due (not necessarily full order total when card covers the rest).
- Order completed then later voided/returned: incentive for that order is reversed or excluded from active totals for the period (ops must not keep earning on voided work).
- Multiple riders historically assigned: incentive accrues to the rider who completed the delivery.
- Currency formatting: amounts display in the order’s currency consistently on web and mobile.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the order number on every primary order-facing list, card, and detail surface in Cosmo OS web and the rider mobile app.
- **FR-002**: Where only a secondary identifier (phone, internal id) was previously shown as the title, the order number MUST appear as a primary or co-primary label.
- **FR-003**: The Cosmo OS main page MUST include a search bar that finds orders by order number, customer phone, and customer name.
- **FR-004**: Search results MUST show order number on each hit and allow opening the order detail.
- **FR-005**: Riders MUST be able to enter “customer gave” (cash tendered) when collecting cash on delivery (including cash part of a split payment).
- **FR-006**: System MUST calculate and display balance as customer gave minus the cash amount due for that collection.
- **FR-007**: Cosmo OS order views MUST show amount due (cash portion when split), customer gave, and balance after the rider records them.
- **FR-008**: System MUST provide a rider performance dashboard for authorized users showing, per rider and date range: completed delivery count and incentive total.
- **FR-009**: When a rider successfully completes a delivery, system MUST add that order’s shipping cost to the completing rider’s incentive.
- **FR-010**: Failed or incomplete deliveries MUST NOT add incentive.
- **FR-011**: Dashboard users MUST be able to filter performance by date range (at least today / custom range).
- **FR-012**: Only users with appropriate operations/admin access MUST see the rider performance dashboard and incentive totals.

### Key Entities

- **Order**: Business document identified by order number; has total due, shipping cost, and optional cash tender fields (customer gave, balance).
- **Delivery completion**: Event that marks a rider finished a delivery; triggers incentive accrual.
- **Rider incentive entry**: Credit tied to a completed order, amount equal to that order’s shipping cost, attributed to the completing rider and completion date.
- **Rider performance summary**: Aggregated completed count and incentive total for a rider over a period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a sample of 10 primary order screens (web + mobile), 100% show an order number or documented fallback label without opening detail.
- **SC-002**: Staff can find a known order from the main page search in under 30 seconds in normal use.
- **SC-003**: For a COD delivery with tendered amount greater than amount due, riders see the correct balance before completion in 100% of test runs.
- **SC-004**: After completion, Cosmo OS order detail shows the same customer-gave and balance values the rider entered.
- **SC-005**: For a test set of completed orders, dashboard incentive totals match the sum of those orders’ shipping costs within 1 currency unit.
- **SC-006**: Ops users can open the rider dashboard and read per-rider completed count and incentive for a chosen day without leaving Cosmo OS.

## Assumptions

- “Main page” means the Cosmo OS web dashboard / home operations landing page (not the rider app home), unless clarified otherwise.
- “Order number” means the business-facing number staff already use on invoices and stickers (existing order number field), not a new numbering scheme.
- Rider incentive for v1 equals **100% of the order’s shipping cost** at completion time (no percentage table or tiered rates yet).
- “Balance” means **change to return to the customer** (customer gave − cash amount due), not an account credit stored for future orders.
- For split payments, cash tender / balance applies only to the cash portion; card/bank parts keep their own references as today.
- Incentive accrues on successful delivery completion by the assigned rider; voided/cancelled completed orders are excluded or reversed in dashboard totals.
- Existing role/permission model is reused: ops/admin for dashboard; riders only see their own collection UI, not other riders’ incentive totals.
- Shipping cost already stored on the order is the source of truth for incentive; if shipping is 0, incentive for that order is 0.
