# Feature Specification: Customer Insight Allocation & Loyalty

**Feature Branch**: `033-insight-allocation-loyalty`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "for customer insight page i have to do some changes, i want add some filters, filter for total value, loyalty wise, birth day wise,also want add customer details card like customer profile name email, phone number, allocated merchant top of customer, date of birth also add edit option can edit that details only alocated merchant, that details only show for allocated merchant also, any merchant can search every customers by exact phone number, but the can see only his total purchesed value, sale invoices only, also display allocated merchant, we are planing allocate contact details to merchants after that allocation i want show some target details of that contact only for allocated merchant, if we do filter its only result allocated customers, also want to double check when we get item details from erp and shopify cuz i want brand of that item, then we can performe brand wise filter, when we apply any filter it should show high purchesed result, also want add purchesing performance progress bar for customer wise, it show two millestones for loyalcs,and loyalcs2(gold and platinum) iside bar should show customer current total value. like uploaded bar not percentage mark with total, also have two filters, push to Gold(total 75000 or more) , push to platinum(total 200000 or more) allocated customer only result for this filters, when new customer came that customer allocate to (if he not allocate to any merchant) then that customer allocate for recently make purchesed merchant. also sometimes we have to allocate customer to merchant by manually, or ful allocated merchant list to another merchant for that process want make path to fulfill that, it have permssion and who get permission can performe that process, we have to mark customer contacted function, its also update in dashboard merchant wise, for allocated contacts show contacted buton and it ark as contacted and it update dshboard also, that button display only allocated merchants only, asmin and super admin have permission for all,"

## Clarifications

### Session 2026-08-07

- Q: Do Push to Gold and Push to Platinum overlap (Gold ≥ 75k including Platinum vs Gold band only)? → A: Push to Gold = ≥ 75,000 and &lt; 200,000; Push to Platinum = ≥ 200,000
- Q: What does the birthday filter mean? → A: Birthday falls in the current calendar month
- Q: What “target details” / full insight mean for allocated vs non-allocated merchants? → A: Allocated merchant sees full Customer Insight (profile + edit, progress bar, contacted, item-wise sales, month-wise spend); non-allocated sees only lifetime total, sale invoices, and allocated merchant name
- Q: How does Mark Contacted behave, and is last contacted shown? → A: Can mark contacted again anytime; each mark updates last contacted and dashboard counts; last-contacted details are shown to the allocated merchant
- Q: What do non-allocated merchants see for sale invoices? → A: Invoice headers only (date, reference, total, status) — no item lines
- Q: Are Top items and Spend over time visible to non-allocated merchants? → A: No — Top items and Spend over time are allocated-merchant (and admin/super admin) only

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exact phone search with visibility rules (Priority: P1)

Any merchant can look up any customer by exact phone number. **Non-allocated** merchants see only: lifetime purchase total, sale invoices, and the allocated merchant’s name. **Allocated** merchants (and admin / super admin) see the full Customer Insight experience: customer profile card with edit, purchasing progress bar, contacted control, item-wise sales, month-wise spend, and the rest of the insight page.

**Why this priority**: Search remains the entry point; privacy between merchants is the core access rule for this release.

**Independent Test**: As merchant A (not allocated), search a phone owned by merchant B’s customer → see total, invoices, allocated-merchant label only — no profile edit, progress bar, contacted, item breakdown, or monthly spend. As merchant B (allocated) or admin → see full page including those controls.

**Acceptance Scenarios**:

1. **Given** a merchant enters a complete phone that matches one customer, **When** they search, **Then** they see that customer only (exact match), never other numbers sharing digits.
2. **Given** the viewing merchant is not the allocated merchant and is not admin/super admin, **When** insight loads, **Then** they see only lifetime total spent, sale invoice headers (date, reference, total, status — no line items), and allocated merchant name.
3. **Given** the viewing merchant is the allocated merchant (or admin/super admin), **When** insight loads, **Then** they see the full insight page: profile details with edit, progress bar, contacted button (with last contacted), **Top items**, **Spend over time** (month-wise), item-wise sales on invoices, and other owner tools.
4. **Given** a phone has no match, **When** they search, **Then** a clear not-found state appears with no other customers exposed.

---

### User Story 2 - Customer details card with edit for allocated merchant (Priority: P1)

Allocated merchants (and admins) see a customer profile card at the top: name, email, phone, allocated merchant, date of birth — with an edit option for those profile fields. Non-allocated merchants do not see that profile card (or edit); they only see the limited fields listed in User Story 1.

**Why this priority**: Profile and ownership context are required before filters, contacted actions, and full insight analytics make sense.

**Independent Test**: Allocated merchant edits DOB/email/name/phone and saves; values persist on reload. Non-allocated merchant has no edit control and does not see the full profile card.

**Acceptance Scenarios**:

1. **Given** an allocated merchant views a customer, **When** the page loads, **Then** the card shows name, email, phone, allocated merchant (prominently), and date of birth.
2. **Given** an allocated merchant clicks edit, **When** they change allowed profile fields and save, **Then** updates persist and are visible on next view.
3. **Given** a non-allocated merchant views the same customer via phone search, **When** the page loads, **Then** the full profile card and edit control are unavailable.
4. **Given** an admin or super admin views any customer, **When** the page loads, **Then** they can view and edit profile details like an allocated merchant.

---

### User Story 3 - Loyalty milestones & purchasing performance bar (Priority: P1)

Loyalty bands update to Gold (`loyalcs`) at **75,000** and Platinum (`loyalcs2`) at **200,000** (and above). For allocated merchants (and admin/super admin), each customer insight shows a purchasing performance progress bar with those two milestones marked; the bar displays the customer’s **current lifetime total** (not a percentage label), matching the provided milestone-bar concept. Non-allocated merchants do not see this bar.

**Why this priority**: Thresholds and the progress bar drive “push to Gold/Platinum” work and merchant targeting.

**Independent Test**: Customers below 75k, between 75k–200k, and at/above 200k show correct tier labels; the bar marks Gold and Platinum milestones and shows the numeric lifetime total on/near the bar.

**Acceptance Scenarios**:

1. **Given** lifetime total &lt; 75,000, **When** insight loads, **Then** tier is Standard and the bar shows progress toward Gold with current total labeled.
2. **Given** lifetime total ≥ 75,000 and &lt; 200,000, **When** insight loads, **Then** tier is Gold (`loyalcs`) and the Platinum milestone remains ahead on the bar.
3. **Given** lifetime total ≥ 200,000, **When** insight loads, **Then** tier is Platinum (`loyalcs2`) and the bar reflects that total at/past the Platinum milestone.
4. **Given** the progress bar is shown, **When** a merchant reads it, **Then** they see the current total value (currency amount), not a percentage as the primary marker.

---

### User Story 4 - Filters for allocated customers (Priority: P2)

Merchants can filter their **allocated** customers by total value, loyalty tier, birthday (current calendar month), brand, “Push to Gold” (≥ 75,000 and &lt; 200,000), and “Push to Platinum” (≥ 200,000). Filter results include only customers allocated to them (admins/super admins may see all). Results are ordered with **highest purchase totals first**.

**Why this priority**: Targeting tools depend on allocation and correct totals; builds on P1 visibility and loyalty rules.

**Independent Test**: As allocated merchant, apply Push to Gold → only own allocated customers with total ≥ 75,000 and &lt; 200,000, highest totals first. Another merchant’s allocated customers never appear. Birthday and brand filters narrow the same allocated set correctly.

**Acceptance Scenarios**:

1. **Given** a merchant opens filters, **When** they apply any filter, **Then** results contain only customers allocated to that merchant (unless admin/super admin).
2. **Given** Push to Gold is applied, **When** results load, **Then** only allocated customers with lifetime total ≥ 75,000 and &lt; 200,000 appear, highest totals first.
3. **Given** Push to Platinum is applied, **When** results load, **Then** only allocated customers with lifetime total ≥ 200,000 appear, highest totals first.
4. **Given** loyalty, total-value range, birthday (current month), and/or brand filters are applied, **When** results load, **Then** matches satisfy all selected criteria and remain sorted by highest purchase total.
5. **Given** no customers match, **When** filters apply, **Then** an empty state explains no allocated matches.

---

### User Story 5 - Brand on purchase lines for brand filter (Priority: P2)

Item details from Shopify and ERP must carry a reliable **brand** so merchants can filter allocated customers by brand of products purchased. Brand mapping is verified/corrected when ingesting or displaying line items.

**Why this priority**: Brand filter is explicitly required; without trustworthy brand on lines, filter results are wrong.

**Independent Test**: Customers who bought Brand X appear under brand filter Brand X; items missing brand are handled without inventing false brands (excluded or labeled unknown per assumptions).

**Acceptance Scenarios**:

1. **Given** purchase lines have brand from Shopify/ERP mapping, **When** a merchant filters by that brand, **Then** only allocated customers who purchased that brand appear (highest totals first).
2. **Given** a line lacks brand after mapping checks, **When** brand filter is used, **Then** that purchase does not falsely attribute a brand.
3. **Given** admins review item brand quality, **When** they inspect sample Shopify and ERP-sourced lines, **Then** brand is present for items where source data provides it.

---

### User Story 6 - Auto- and manual allocation (Priority: P1)

Unallocated new customers are automatically assigned to the merchant of their most recent purchase. Authorized users can manually allocate a customer to a merchant, or transfer **all** customers currently allocated to one merchant over to another merchant. Allocation actions require a dedicated permission; admins and super admins may always perform them.

**Why this priority**: Allocation unlocks private profile, targets, filters, and contacted — without it the rest of the feature cannot operate correctly.

**Independent Test**: New unallocated customer’s first/recent purchase merchant becomes allocated merchant. Permissioned user reassigns one contact and bulk-transfers merchant A’s list to merchant B; user without permission is denied.

**Acceptance Scenarios**:

1. **Given** a customer has no allocated merchant and completes a purchase tied to a merchant, **When** allocation runs, **Then** that recent-purchase merchant becomes the allocated merchant.
2. **Given** a user with allocation permission, **When** they manually assign a customer to a merchant, **Then** the allocation updates and is visible on Customer Insight.
3. **Given** a user with allocation permission, **When** they transfer all of merchant A’s allocated customers to merchant B, **Then** those customers show merchant B as allocated and A’s list for those contacts is empty.
4. **Given** a user without allocation permission (and not admin/super admin), **When** they attempt allocation or bulk transfer, **Then** the action is denied.
5. **Given** a customer is already allocated, **When** a new purchase occurs, **Then** automatic reassignment does not override the existing allocation (manual/bulk tools remain the path to change).

---

### User Story 7 - Mark contacted & merchant dashboard update (Priority: P2)

Allocated merchants see a **Contacted** button on their allocated customers. Marking contacted may be done **more than once**; each mark records an event, updates **last contacted** details shown on the owner insight view, and updates merchant-wise dashboard / call-center performance views. The button is hidden for non-allocated merchants; admins and super admins can mark contacted for any customer.

**Why this priority**: Operational follow-up depends on allocation; dashboard feedback closes the loop.

**Independent Test**: Allocated merchant marks contacted twice → last contacted updates; dashboard merchant metrics update. Non-allocated merchant does not see the button or last-contacted details. Admin can mark any customer.

**Acceptance Scenarios**:

1. **Given** an allocated merchant views their customer, **When** they click Contacted, **Then** the contact is marked contacted, last-contacted details update on the page, and merchant-wise dashboard/call-center performance reflects the update.
2. **Given** the customer was already contacted, **When** the allocated merchant clicks Contacted again, **Then** a new contacted event is recorded and last contacted updates (button remains available).
3. **Given** a non-allocated merchant views the same customer via phone search, **When** the page loads, **Then** the Contacted button and last-contacted details are not shown.
4. **Given** an admin or super admin, **When** they mark contacted on any customer, **Then** the mark succeeds, last contacted updates for owners, and dashboard data updates.
5. **Given** an allocated merchant views a previously contacted customer, **When** the page loads, **Then** last-contacted details are visible so they know outreach already happened.

---

### Edge Cases

- Exact phone search with formatting variants (`0…`, `94…`, `+94…`) still resolves to one customer when it is the same number.
- Customer with zero lifetime total: Standard tier; bar shows 0 toward Gold; Push filters exclude them.
- Totals exactly 75,000 count as Gold / Push to Gold eligible; totals exactly 200,000 count as Platinum / Push to Platinum (and are excluded from Push to Gold).
- Push to Gold never includes Platinum-tier customers (≥ 200,000).
- Birthday filter with missing DOB: those customers excluded from birthday-matched results.
- Birthday filter matches allocated customers whose birth month equals the current calendar month (year of birth ignored).
- Brand filter when customer has mixed branded/unbranded lines: match if any loyalty-eligible purchase line has the selected brand.
- Bulk transfer of a merchant with zero allocated customers: clear empty success/empty state.
- Concurrent manual allocation vs auto-allocate: existing allocation wins; auto only fills empty allocation.
- Merchant filters while also searching by phone: phone search remains available for any customer under limited visibility; filter result lists stay allocation-scoped.
- Non-allocated merchant must not see progress bar, contacted button, last contacted, profile edit, Top items, Spend over time, item-wise sales / invoice line items, or month-wise spend even if those sections exist on the page for owners.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow merchants to search customers by exact phone number (full number match across normal format variants).
- **FR-002**: Non-allocated merchants MUST see only lifetime purchase total, sale invoice headers (date, reference, amount, status — without line items / product breakdown), and allocated merchant identity for a searched customer — not profile card/edit, progress bar, contacted/last contacted, **Top items**, **Spend over time**, item-wise sales, or month-wise spend.
- **FR-002a**: Allocated merchants and admin/super admin MUST see full invoice detail including line items / item-wise sales; non-allocated merchants MUST NOT.
- **FR-002b**: The **Top items** and **Spend over time** sections MUST be visible only to the allocated merchant and admin/super admin; non-allocated merchants MUST NOT see these sections.
- **FR-003**: Allocated merchants and admin/super admin MUST see the full Customer Insight page for that customer: profile card (name, email, phone, allocated merchant, date of birth) with edit, purchasing progress bar, contacted control (with last contacted), Top items, Spend over time, item-wise sales, and other owner insight tools.
- **FR-003a**: “Target details” for allocated merchants means the full owner insight suite in FR-003 (not a separate editable sales-target form in v1).
- **FR-004**: Only allocated merchants and admin/super admin MUST be able to edit customer profile fields on the details card (name, email, phone, date of birth as supported).
- **FR-005**: Loyalty MUST classify as: below 75,000 → Standard; ≥ 75,000 and &lt; 200,000 → Gold (`loyalcs`); ≥ 200,000 → Platinum (`loyalcs2`).
- **FR-006**: System MUST show a purchasing performance progress bar per customer with Gold and Platinum milestones; the bar MUST show the customer’s current lifetime total value (currency amount), not a percentage as the primary readout.
- **FR-007**: Allocated-customer filters MUST support total value, loyalty tier, birthday (current calendar month), brand, Push to Gold (≥ 75,000 and &lt; 200,000), and Push to Platinum (≥ 200,000).
- **FR-007a**: Birthday filter MUST include only allocated customers whose recorded birth month matches the current calendar month; customers without birth month MUST be excluded from that filter.
- **FR-008**: Filter result sets MUST include only customers allocated to the current merchant, except admin/super admin who may see all.
- **FR-009**: Filter results MUST sort by highest lifetime purchase total first.
- **FR-010**: System MUST ensure purchase line brand is taken from Shopify/ERP item data where available so brand filters are accurate.
- **FR-011**: When a customer has no allocated merchant, the system MUST allocate them to the merchant associated with their most recent purchase.
- **FR-012**: Users with allocation permission (and admin/super admin) MUST be able to manually allocate a customer to a merchant.
- **FR-013**: Users with allocation permission (and admin/super admin) MUST be able to transfer all customers allocated to one merchant to another merchant.
- **FR-014**: Allocated merchants (and admin/super admin) MUST be able to mark a customer as contacted repeatedly; each mark MUST record an event, update last-contacted details, and update merchant-wise dashboard / call-center performance views.
- **FR-014a**: Allocated merchants and admin/super admin MUST see last-contacted details on the customer insight view when available.
- **FR-015**: Contacted control and last-contacted details MUST NOT appear for merchants who are not allocated to that customer (except admin/super admin).
- **FR-016**: Admin and super admin MUST have full access to view, edit, allocate, filter across all customers, and mark contacted.

### Key Entities

- **Customer (Contact)**: Profile (name, email, phones, DOB parts), allocated merchant, lifetime purchase total, loyalty tier, contacted state.
- **Allocated Merchant**: The merchant responsible for the customer; gates private details, edit, filters ownership, contacted.
- **Loyalty Milestone**: Gold at 75,000 (`loyalcs`), Platinum at 200,000 (`loyalcs2`).
- **Purchase / Invoice**: Historical sales used for totals, invoice list, and brand-bearing line items.
- **Purchase Line Brand**: Brand attributed to an item from Shopify/ERP for filtering.
- **Allocation Transfer**: Bulk move of all customers from one merchant to another.
- **Contacted Event**: Record that a merchant contacted a customer (may occur multiple times); latest event drives last-contacted display and feeds merchant dashboard metrics.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Merchants can complete an exact-phone lookup and understand limited vs full visibility in under 30 seconds in normal use.
- **SC-002**: 100% of sampled non-allocated merchant views show only total spent, invoice headers (no line items), and allocated merchant name — and hide profile edit, progress bar, contacted/last contacted, Top items, Spend over time, item-wise sales, and month-wise spend.
- **SC-003**: Loyalty tier and progress-bar milestones match 75,000 / 200,000 rules for at least 95% of sampled customers in acceptance review (boundary totals verified).
- **SC-004**: Push to Gold returns only the acting merchant’s allocated customers with total ≥ 75,000 and &lt; 200,000; Push to Platinum returns only those with total ≥ 200,000; both sorted highest total first, in pilot testing.
- **SC-005**: Brand filter returns only allocated customers with a matching branded purchase in at least 90% of spot-checks against known Brand X buyers.
- **SC-006**: Unallocated new purchasers are auto-assigned to the recent-purchase merchant in ≥ 95% of new-allocation test cases.
- **SC-007**: Authorized users can bulk-transfer one merchant’s full allocated list to another in one guided flow; unauthorized users are blocked in 100% of permission tests.
- **SC-008**: Marking contacted updates last-contacted on the owner view and the merchant-wise dashboard/call-center view within the same business day session (visible after refresh) for the allocated merchant; a second mark updates last contacted again.

## Assumptions

- Lifetime total continues to use loyalty-eligible placed-order totals (non-cancelled Cosmo + Adapt history) consistent with Customer Insight, unless product later redefines it.
- Gold threshold is inclusive at 75,000; Platinum inclusive at 200,000; previous 100,000 / 250,000 bands are replaced by these values for this feature going forward.
- Push to Gold targets the Gold band only (≥ 75,000 and &lt; 200,000); Push to Platinum targets ≥ 200,000 — the filters do not overlap.
- “Allocated merchant” maps to the existing contact allocation field used in Contact Master (`assignedMerchant` / equivalent display name merchants already know).
- Date of birth uses existing contact birth year/month/day fields; edit updates those parts.
- Birthday filter means “birthday in the current calendar month” (match on birth month; day optional for display only unless later refined).
- Auto-allocate runs when allocation is empty at purchase/allocation sync time; it does not steal already-allocated customers.
- “Recently make purchased merchant” means the merchant associated with the customer’s most recent qualifying purchase (same identity merchants use elsewhere in Cosmo).
- Brand comes from product/vendor/brand fields on Shopify and ERP item data after a verification pass; unknown brand does not satisfy a specific brand filter.
- Filter UI for allocated lists is separate from one-off exact phone search: filters never dump the full company contact directory to merchants.
- Contacted integrates with existing allocation-update / call-center performance surfaces where “No allocation updates recorded yet” appears today.
- Contacted may be marked multiple times; last-contacted timestamp/details are shown only to the allocated merchant (and admin/super admin).
- Non-allocated phone-search view is strictly limited to: lifetime total, sale invoice headers (no line items), allocated merchant name. Full insight (profile/edit, progress bar, contacted/last contacted, Top items, Spend over time, item-wise sales, month-wise spend) is allocated-merchant (or admin/super admin) only.
- No separate per-customer editable sales-target form in v1; owner “targets” are the loyalty progress bar and related insight analytics (including Top items and Spend over time).
