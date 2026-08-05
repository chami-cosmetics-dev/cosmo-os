# Feature Specification: Merchant Customer Insight

**Feature Branch**: `032-merchant-customer-insight`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "also we have total of customer placed orders, we have customer groups 100000-250000 gold group(loyalcs), and above 250000 platinum(loyalcs2) also i want create UI for merchents can search numbers and details of that customer, what is his customer group, list down all invoices history, merchants no access for all contact list cant export or import any thing , view only, for serched contact should show what ite he or she bught, how often buy from us, like wise clean UI ful explanation of that customer history use graphs, charts anything for give better view"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search a customer by phone (Priority: P1)

A merchant needs to look up a specific customer by phone number and immediately see who they are, their loyalty group (Gold / Platinum / Standard), and lifetime order value — without browsing or downloading any full contact list.

**Why this priority**: Search-and-identify is the core merchant need; without it, invoice history and insights have no entry point. Restricting merchants to search-only also enforces the privacy boundary.

**Independent Test**: Log in as a merchant, enter a known customer phone number, and verify the matching customer summary (name, phone, group, lifetime total) appears; verify entering an unknown number shows a clear empty/not-found state; verify there is no way to list all contacts.

**Acceptance Scenarios**:

1. **Given** a merchant is on the Customer Insight screen, **When** they enter a phone number that matches an existing customer, **Then** the system shows that customer's identity summary including display name, phone, customer group badge, and lifetime placed-order total.
2. **Given** a merchant searches a phone number with no matching customer, **When** results load, **Then** the system shows a clear not-found message and does not expose any other customers.
3. **Given** a merchant is on the Customer Insight screen, **When** they attempt to browse, paginate, or otherwise load a full contact directory, **Then** no such capability is available (search-only access).
4. **Given** multiple contacts could match a partial or normalized phone input, **When** the merchant searches, **Then** the system returns only matches for that search and never a full directory dump.

---

### User Story 2 - View invoice history for the searched customer (Priority: P1)

After finding a customer, the merchant reviews the full invoice/order history to understand past purchases and support the customer accurately.

**Why this priority**: Invoice history is explicitly required and is the primary factual record behind any loyalty status or buying pattern.

**Independent Test**: Open a searched customer who has multiple invoices; verify every invoice for that customer is listed with date, invoice/order reference, status, and amount; verify a customer with no invoices shows an empty history state.

**Acceptance Scenarios**:

1. **Given** a searched customer has one or more invoices, **When** the merchant views Customer Insight, **Then** a chronological invoice history lists each invoice with date, reference, status, and total amount.
2. **Given** a searched customer has many invoices, **When** the merchant scrolls or pages the history, **Then** they can review the full history without leaving the customer context.
3. **Given** a searched customer has no invoices, **When** the merchant views history, **Then** an empty-state message explains there is no purchase history yet.

---

### User Story 3 - Understand what they buy and how often (Priority: P2)

The merchant wants a clear explanation of the customer's buying behavior: which items they purchase most, how frequently they order, and how that activity trends over time — presented with charts and readable summaries, not raw tables alone.

**Why this priority**: Behavioral insight is the differentiator that makes the screen useful beyond a plain invoice dump; it depends on P1 search + history data.

**Independent Test**: Open a customer with repeated purchases across multiple dates; verify item purchase summaries, order-frequency indicators, and at least one chart/visualization that clarifies recency and volume; verify a thin-history customer still shows honest, non-misleading summaries.

**Acceptance Scenarios**:

1. **Given** a searched customer has purchased multiple distinct items, **When** the merchant views insight, **Then** they see a clear summary of items bought (at least top items by quantity or spend) derived from invoice lines.
2. **Given** a searched customer has ordered on multiple dates, **When** the merchant views insight, **Then** they see how often the customer buys (e.g., order count, average gap between orders, and/or orders over time).
3. **Given** a searched customer has enough history to chart, **When** the merchant views insight, **Then** charts/graphs visualize spend and/or order frequency over time in a clean, readable layout.
4. **Given** a searched customer has very little history, **When** charts would be misleading, **Then** the UI still shows available facts clearly and avoids implying patterns that do not exist.

---

### User Story 4 - Loyalty group visibility (Gold / Platinum) (Priority: P2)

Merchants immediately see whether the customer is Gold (`loyalcs`), Platinum (`loyalcs2`), or below the loyalty thresholds, based on lifetime placed-order totals.

**Why this priority**: Group membership is a stated business rule and helps merchants tailor service; it is secondary to being able to find the customer and see history.

**Independent Test**: Open customers whose lifetime totals fall below 100,000, between 100,000–250,000 inclusive of the Gold band, and above 250,000; verify the displayed group matches the rules below.

**Acceptance Scenarios**:

1. **Given** a customer's lifetime placed-order total is at least 100,000 and at most 250,000, **When** the merchant views that customer, **Then** the customer group is shown as Gold (loyalcs).
2. **Given** a customer's lifetime placed-order total is above 250,000, **When** the merchant views that customer, **Then** the customer group is shown as Platinum (loyalcs2).
3. **Given** a customer's lifetime placed-order total is below 100,000, **When** the merchant views that customer, **Then** the customer is shown as Standard (no Gold/Platinum loyalty group).
4. **Given** the merchant views the group badge, **When** they need context, **Then** the UI briefly explains the threshold rules in plain language.

---

### User Story 5 - View-only merchant access (no list, export, or import) (Priority: P1)

Merchants may only view insight for customers they search. They must not access a full contact list and must not export or import any customer or invoice data from this feature.

**Why this priority**: Privacy and abuse prevention are non-negotiable constraints stated by the business; they bound the entire feature.

**Independent Test**: As a merchant, confirm absence of contact directory, export, and import controls on this feature; attempt restricted actions (if any API/UI paths exist) and verify they are denied; as an admin (if applicable), confirm merchants remain restricted even if admins have broader contact tools elsewhere.

**Acceptance Scenarios**:

1. **Given** a merchant user, **When** they use Customer Insight, **Then** they can search and view results only — no bulk contact list, no export, and no import controls.
2. **Given** a merchant user, **When** they try to obtain all contacts or download customer/invoice data via this feature, **Then** the system denies the action and does not provide the data.
3. **Given** a non-merchant staff member with broader contact permissions elsewhere in the product, **When** they use other existing admin tools, **Then** those separate tools are unchanged by this feature (this feature remains merchant search/view-only).

---

### Edge Cases

- Phone number entered with spaces, leading zeros, or country-code variations — system should normalize search reasonably and still find the customer when the number refers to the same person.
- Customer exists but has zero placed orders — show Standard group, empty invoice history, and honest empty insights (no fabricated charts).
- Customer total sits exactly on a threshold boundary (100,000 or 250,000) — Gold includes 100,000 through 250,000 inclusive; totals above 250,000 are Platinum.
- Search returns multiple contacts for the same/similar number — show a short disambiguation list of matches only (still not a directory); merchant selects one to open full insight.
- Very large invoice histories — UI remains usable (scroll/page) without crashing or exposing export.
- Merchant with no permission for Customer Insight — feature is hidden or access is denied with a clear message.
- Cancelled or voided invoices — history still lists them with status visible so merchants are not misled; lifetime loyalty total uses placed-order rules defined in Assumptions (completed/placed value, not cancelled).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a merchant-facing Customer Insight screen that accepts customer phone-number search as the primary lookup method.
- **FR-002**: System MUST return customer identity details for a successful search, including at least display name, phone number, customer group, and lifetime placed-order total.
- **FR-003**: System MUST classify customer groups from lifetime placed-order totals as: below 100,000 → Standard; 100,000–250,000 inclusive → Gold (`loyalcs`); above 250,000 → Platinum (`loyalcs2`).
- **FR-004**: System MUST display the customer group name clearly (Gold / Platinum / Standard) and associate Gold with `loyalcs` and Platinum with `loyalcs2` for business recognition.
- **FR-005**: System MUST list the full invoice/order history for the searched customer, including date, reference, status, and amount for each invoice.
- **FR-006**: System MUST summarize items the customer has purchased (what they buy) from invoice line history.
- **FR-007**: System MUST present buying-frequency insight (how often they buy), including at least order count and a time-based frequency or recency indicator.
- **FR-008**: System MUST present customer history using a clean layout that includes charts/graphs (e.g., spend over time and/or order frequency) when sufficient data exists.
- **FR-009**: Merchants MUST NOT be able to browse or download a full contact list through this feature.
- **FR-010**: Merchants MUST NOT be able to export or import customer, invoice, or insight data through this feature.
- **FR-011**: Merchant access to this feature MUST be view-only (search + read); no create, update, delete, assign-group, or bulk-edit actions on contacts or invoices.
- **FR-012**: System MUST show clear empty and not-found states for unknown numbers, customers without invoices, and insufficient history for charts.
- **FR-013**: System MUST restrict Customer Insight search/view capabilities to authorized merchant (or equivalent) roles; unauthorized users MUST be denied.
- **FR-014**: Amounts and thresholds MUST be shown in the business currency already used for customer order totals (assumed LKR), with thresholds labeled so merchants understand the Gold/Platinum bands.
- **FR-015**: When multiple contacts match a search, the system MUST allow the merchant to pick from that match set only — never from an unfiltered contact directory.

### Key Entities

- **Customer (Contact)**: A person merchants look up by phone; has display name, phone, lifetime placed-order total, and derived loyalty group.
- **Customer Group**: Loyalty tier derived from lifetime total — Standard, Gold (`loyalcs`), or Platinum (`loyalcs2`).
- **Invoice / Order**: A historical purchase record for the customer (date, reference, status, amount).
- **Invoice Line / Purchased Item**: An item on an invoice used to explain what the customer buys.
- **Customer Insight Summary**: Aggregated view for one searched customer — identity, group, totals, frequency metrics, item summaries, and chart-ready series.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Merchants can find a known customer by phone and see identity + loyalty group in under 30 seconds under normal conditions.
- **SC-002**: For a customer with history, merchants can view invoice list, top purchased items, and buying-frequency summary without leaving the customer insight view.
- **SC-003**: 100% of merchant sessions on this feature have no access path to a full contact list, export, or import (verified by role-based acceptance testing).
- **SC-004**: Loyalty group display matches the defined thresholds for at least 95% of sampled customers in acceptance review (edge totals at 100,000 and 250,000 verified explicitly).
- **SC-005**: At least 80% of merchants in a pilot can correctly answer “what group is this customer?” and “what do they buy most?” from the UI alone on the first attempt.
- **SC-006**: Insight charts/summaries render in a readable form for customers with 3+ orders; customers with fewer orders still show clear factual summaries without broken or empty confusing charts.

## Assumptions

- Currency for totals and thresholds is LKR (Sri Lankan Rupees), consistent with existing Cosmo order totals; labels may show the currency symbol/code already used in the product.
- “Lifetime placed-order total” means the sum of the customer’s placed (non-cancelled) order/invoice values used today for loyalty eligibility; cancelled/voided documents appear in history with status but do not inflate the loyalty total.
- Gold band is inclusive on both ends: total ≥ 100,000 and ≤ 250,000 → Gold; total > 250,000 → Platinum; total < 100,000 → Standard.
- Primary merchant lookup is by phone number; optional secondary filters (name) are out of scope for v1 unless already trivial to include without enabling directory browsing.
- Merchants are existing authenticated users with a merchant-appropriate role; admins may keep separate full contact tools elsewhere — this feature does not replace admin contact management.
- Visualizations in v1 include at least: (1) spend or orders over time, and (2) a top-items breakdown; additional chart types are optional enhancements.
- This feature does not automatically sync or rewrite external CRM group tags; it displays groups according to the Cosmo total-based rules above (aligned with business names `loyalcs` / `loyalcs2`).
- No SMS, calling, or messaging actions are required on the insight screen for v1.
- Mobile-responsive web layout is in scope; a separate native merchant mobile app is out of scope.
