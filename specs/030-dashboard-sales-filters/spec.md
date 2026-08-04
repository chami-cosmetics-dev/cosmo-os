# Feature Specification: Dashboard Sales Filter Views

**Feature Branch**: `030-dashboard-sales-filters`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "dashboard details showing logic should change bit, when we select range of date we could filter all invoices placed on that range, all invoices placed that range and invoice complete that range, all invoices placed that range but deliverpending(some finance approval requested orders mark as invoice complete when they go approval but those orders are not delivered yet), all invoices placed that range invoice pending(orders placed on that range and delivered to customer but not invoice complete yet), all invoices placed that range from that range deliver complete, all invoices placed that range also deliver pending(dispached but still not delivered), also there are another process order placed in out of selected date range but invoice complete on that date range, also deliver complete on that range, another process, defaultly show today data no, when it today we have to filter all invoices placed on today, all invoices placed on today but invoice pending, all invoices placed on today but delivery pending, all invoices placed on today also delivery completed today, all invoices placed on today also invoice completed today, another process is we want see anyday placed order but still invoice pending, anyday placed order but still delivery pending, total amount of htese filter i want show users"

## Clarifications

### Session 2026-08-04

- Q: What adds up to “Placed – all” / All orders? → A: Only current-status partitions sum to All orders; dual-date “complete in range” and earlier-placed event views are separate overlapping scoreboards (Option B).
- Q: Where do paid / invoice-complete but not-yet-delivered orders show? → A: Under delivery-pending / “Bill done early” (invoice complete, not delivered)—not under Delivered. Delivered means physically delivered to the customer.
- Q: How to show not-delivered vs bill-done-early? → A: Two separate filters/totals — Not delivered (all not arrived) and Bill done early (invoice complete, not delivered) (Option A).
- Q: When adding to All orders, count Bill done early once or twice? → A: Count once (Not delivered for add-up excludes Bill done early so the partition does not double-count) (Option A).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See today’s sales breakdown at a glance (Priority: P1)

A sales or finance user opens the dashboard. By default they see **today’s** data. They immediately see clear totals for: all orders placed today; placed today and still invoice-pending; placed today and still delivery-pending; placed today and also delivery-completed today; placed today and also invoice-completed today. Each view shows a total amount they can trust.

**Why this priority**: Daily operations start with “what happened today.” Default today + visible totals is the primary daily workflow.

**Independent Test**: Open dashboard with no date change; confirm default range is today and each today-bucket total is shown and selectable.

**Acceptance Scenarios**:

1. **Given** the user opens the dashboard, **When** no custom range is chosen, **Then** the active date range is today (company local day) and today-focused filter totals are visible.
2. **Given** today has a mix of open and completed orders, **When** the user selects “placed today – invoice pending,” **Then** the grand total and charts only include orders placed today that are delivered but not invoice-complete.
3. **Given** an order was placed today and delivery completed today, **When** the user selects “placed today – delivery completed today,” **Then** that order’s amount is included in that total.

---

### User Story 2 - Break down a chosen date range by place / delivery / invoice status (Priority: P1)

The user picks a From–To range. They can switch among range-based views and always see the **total amount** for each view:

1. All invoices **placed** in the range  
2. Placed in the range **and** invoice-completed in the range  
3. Placed in the range, invoice marked complete via finance approval, but **not delivered yet** (early invoice-complete / deliver-pending exception)  
4. Placed in the range, **delivered**, invoice still pending  
5. Placed in the range and **delivery completed** in the range  
6. Placed in the range and still **delivery pending** (dispatched / in transit, not delivered)

**Why this priority**: This replaces the confusing mixed-clock filters with place-date primary buckets that operations can reconcile.

**Independent Test**: Pick a known month; verify each range filter’s total matches a hand-checked sample of orders for that definition.

**Acceptance Scenarios**:

1. **Given** a selected date range, **When** the user chooses “all placed in range,” **Then** the total includes every eligible order created in that range (paid or pending payment), regardless of later stage.
2. **Given** an order created in range and invoice-completed in range, **When** the user chooses “placed and invoice complete in range,” **Then** that order is included.
3. **Given** an order created in range, invoice-completed after finance approval, but not yet delivered, **When** the user chooses the early-invoice / deliver-pending view, **Then** that order is included and it is **not** counted as normal “invoice pending after delivery.”
4. **Given** an order created in range, delivered to the customer, invoice not complete, **When** the user chooses “placed – invoice pending,” **Then** that order is included.
5. **Given** an order created in range and still dispatched / not delivered, **When** the user chooses “placed – delivery pending,” **Then** that order is included.

---

### User Story 3 - See work completed in the range for orders placed earlier (Priority: P2)

The user needs a second process: orders **placed outside** the selected range, but an event happened **inside** the range:

- Invoice completed in the selected range (created earlier)  
- Delivery completed in the selected range (created earlier)

**Why this priority**: Finance and ops track “what closed / delivered this period” even when the order was placed earlier; this is a separate scoreboard from placed-in-range.

**Independent Test**: Find an order created before the range with invoice complete (or delivery complete) inside the range; confirm it appears only in the corresponding “outside place, event in range” view—not in “all placed in range.”

**Acceptance Scenarios**:

1. **Given** an order placed before the range and invoice-completed inside the range, **When** the user selects “invoice complete in range (placed earlier),” **Then** that order’s amount is included and it is excluded from “all placed in range” for that same range.
2. **Given** an order placed before the range and delivery-completed inside the range, **When** the user selects “delivery complete in range (placed earlier),” **Then** that order’s amount is included.

---

### User Story 4 - See open backlog regardless of place date (Priority: P2)

The user wants to see everything still stuck, no matter when it was placed:

- Any-day placed, still **invoice pending** (delivered, not invoice-complete)  
- Any-day placed, still **delivery pending** (not yet delivered, in the delivery pipeline)

**Why this priority**: Backlog clears aging work; date range does not limit these two views (or range is ignored for them).

**Independent Test**: With any From–To selected, open backlog invoice-pending and confirm an old delivered-but-unclosed order appears; same for an old undelivered order in delivery-pending.

**Acceptance Scenarios**:

1. **Given** orders from many past days still invoice-pending after delivery, **When** the user opens “any day – still invoice pending,” **Then** the total includes all such open orders (eligible, non-voided), not only the selected range.
2. **Given** orders still delivery-pending from any place date, **When** the user opens “any day – still delivery pending,” **Then** the total includes all such open pipeline orders.

---

### User Story 5 - See every filter’s total amount without guessing (Priority: P1)

Whatever process the user is in (today, range, event-in-range, backlog), the UI shows the **total amount for each available filter** so they can compare buckets without exporting.

**Why this priority**: The user’s explicit ask is to show totals for these filters; without visible totals the new logic stays opaque.

**Independent Test**: Confirm each filter chip/card shows a numeric total; switching filters updates the detailed grand total/charts consistently with that chip’s amount.

**Acceptance Scenarios**:

1. **Given** the dashboard has loaded for a range (or today), **When** the user views the filter summary, **Then** each listed filter shows its total amount.
2. **Given** the mutually exclusive **current-status** partitions of All orders (not delivered / bill done early not delivered / bill open after delivery / otherwise still open or already closed after delivery as documented), **When** the user adds those partition totals, **Then** the sum equals **All orders** for the same range; dual-date filters such as “Delivered in dates” or “Bill done in dates” are shown separately and are **not** required to sum into All orders.

---

### Edge Cases

- Empty day/range: all filter totals show zero; charts show empty state, not an error.
- Voided / cancelled finance orders: excluded from sales totals.
- POS / counter sales: excluded from delivery-pipeline and delivery-complete views; included in placed and invoice-complete views unless a view is delivery-focused.
- Order invoice-completed before delivery (finance approval / paid path): counted in **Bill done early** (invoice complete, not delivered / still delivery pending), not in **Delivered** and not in **Bill open** (delivered, bill not finished).
- “Delivered” always means physically delivered to the customer; invoice-complete alone is not delivery.
- Order placed in range, delivery completed outside range: included in “all placed”; included in range delivery-complete view only if delivery completion falls in range.
- Backlog views with a selected range: range does not shrink backlog (backlog is open-work, any place date).
- Invalid From > To: show validation; do not load misleading totals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST default the dashboard date range to **today** (company business timezone day) on first load.
- **FR-002**: System MUST let the user select a custom From–To date range and recalculate all shown filter totals for that range where the filter is range-scoped.
- **FR-003**: System MUST provide a **Placed in range – all** view: eligible orders whose place/create date falls in the selected range, and MUST show its total amount.
- **FR-004**: System MUST provide a **Placed in range – invoice complete in range** view: place date in range and invoice-complete date in range, and MUST show its total amount.
- **FR-005**: System MUST provide a **Bill done early** view (placed in range, invoice complete, **not delivered yet**), including paid orders that become invoice-complete via finance approval before delivery, and MUST show its total amount. These orders MUST appear here (delivery still pending), **not** under Delivered.
- **FR-006**: System MUST provide a **Bill open** view: place date in range, **delivered** to customer, invoice not complete, and MUST show its total amount.
- **FR-007**: System MUST provide a **Delivered in dates** view: place date in range, delivery-complete date in range, and order was **physically delivered**. Invoice-complete-but-not-delivered orders MUST NOT appear here.
- **FR-008**: System MUST provide a **Not delivered** view: place date in range, not yet delivered, **excluding** Bill done early orders, and MUST show its total amount. System MUST also provide **Bill done early** as its own filter/total (FR-005). Both totals MUST be visible. For the All orders add-up, Not delivered + Bill done early counts each order **once** (Bill done early is not also inside the Not delivered add-up total).
- **FR-009**: System MUST provide an **Invoice complete in range (placed earlier)** view: invoice-complete date in range and place date **before** the range start, and MUST show its total amount.
- **FR-010**: System MUST provide a **Delivery complete in range (placed earlier)** view: delivery-complete date in range and place date **before** the range start, and MUST show its total amount.
- **FR-011**: When the selected range is today (or on default today), System MUST expose today-specific labels/views covering: placed today – all; placed today – invoice pending; placed today – delivery pending; placed today and delivery completed today; placed today and invoice completed today — each with a total amount (these MAY reuse the same definitions as FR-003–FR-008 constrained to today).
- **FR-012**: System MUST provide **Any day – still invoice pending** (open backlog after delivery) and **Any day – still delivery pending** (open delivery pipeline), each with a total amount, independent of the selected place-date range.
- **FR-013**: System MUST display the total amount for every available filter in the current process group so users can compare buckets without opening each one first.
- **FR-014**: Selecting a filter MUST update the dashboard detail charts / grand total to match that filter’s definition and amount.
- **FR-015**: Filter groups MUST be visually separated so users understand: (A) placed-in-range **current-status** views that can add to All orders, (B) dual-date / earlier-placed event views that do **not** add into All orders, (C) open backlog any day — and MUST NOT be presented as if all groups add into one single total.
- **FR-016**: Voided orders MUST be excluded from all sales filter totals.
- **FR-017**: Delivery-focused filters (delivery pending, delivery complete, backlog delivery pending) MUST exclude POS / counter sales.
- **FR-018**: System MUST define mutually exclusive **current-status** partitions of **All orders** (placed in range), including at least: **Not delivered** (excluding Bill done early), **Bill done early**, **Bill open** (delivered, invoice not complete), and remaining placed-in-range statuses as documented in planning so the partition sums to All orders. System MUST show a clear tally hint for that add-up. Dual-date and earlier-placed event views MUST be labeled as separate scoreboards that do **not** add into All orders.
- **FR-019**: UI labels SHOULD prefer plain names for stakeholders (e.g. All orders, Not delivered, Bill open, Bill done early, Delivered in dates, Bill done in dates, Bill done (old orders), Delivered (old orders), Still bill open, Still not delivered), with short helper text under each group explaining the clock used.

### Key Entities

- **Sales order (invoice)**: A sellable order with place/create date, financial status, fulfillment/delivery stage, delivery-complete moment, invoice-complete moment, and amount.
- **Date range**: Inclusive From–To business dates used for place-date and/or event-date constraints.
- **Filter view**: A named sales slice with a definition, total amount, and optional chart breakdown (e.g. by location / merchant).
- **Early invoice-complete order**: Order marked invoice-complete (often via finance approval) before physical delivery is finished.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On first open, 100% of sessions land on today’s range without the user manually setting dates.
- **SC-002**: For a fixed sample day, users can read totals for all today filters within 10 seconds of page load (totals visible without export).
- **SC-003**: For a known test set, **All orders** equals the sum of its documented mutually exclusive **current-status** partitions within 0.01 currency units (or exact integer cents). Dual-date and earlier-placed event totals are validated separately and are not part of that sum.
- **SC-004**: An order placed before the range and invoice-completed inside the range appears in the “invoice complete in range (placed earlier)” total and does not appear in “placed – all” for that range.
- **SC-005**: Backlog “still invoice pending” / “still delivery pending” totals include eligible open orders older than the selected range (verified with at least one order older than 7 days).
- **SC-006**: After switching filters, the displayed grand total matches the selected filter’s summary total 100% of the time (no mismatched headline vs chip).
- **SC-007**: Finance/ops users can reconcile dashboard “delivery complete still at delivery-complete stage” style views against their delivery-complete report for the same day without needing a third spreadsheet for definition mismatch (same inclusion rules).

## Assumptions

- “Placed” means the order’s create / invoice date (same business meaning as today’s “invoice date” / placed clock).
- Eligible placed sales continue to mean paid or pending payment; voided are out.
- Company business timezone remains Asia/Colombo for day boundaries (existing dashboard convention).
- POS / counter sales stay out of delivery pipeline and delivery-complete filters; they may appear in placed and invoice-complete filters.
- “Delivery pending” means not yet delivery-complete (typically dispatched / in transit), not “awaiting dispatch from warehouse print” unless already in the delivery pipeline—warehouse-only stages before dispatch are treated as not-yet-delivery-pending for this feature unless already labeled as such in current ops language; default = dispatched but not delivered.
- “Invoice pending” after place means delivered (or delivery-complete) and invoice not complete — except the dedicated early-invoice-complete-not-delivered bucket.
- Today views are the range views with From=To=today, presented with clearer today labels when applicable.
- Showing totals for all filters means summary amounts for the active process group; loading every backlog total on every page view is acceptable if performance stays interactive.
- Existing merchant / gateway / location chart breakdowns remain; this feature changes which orders feed them and how filters are labeled/grouped.
- Replacing the prior mixed Date Type list is in scope; keeping old labels as aliases is optional and not required for stakeholder acceptance.
- Tally / display (clarified): **Not delivered** and **Bill done early** are both shown as separate totals. Bill done early is invoice-complete + not delivered; it is not listed under Delivered. In the All orders add-up, Bill done early is counted once (Not delivered add-up excludes those orders).
- Plain UI naming is preferred so non-technical users can understand each filter without finance jargon.
