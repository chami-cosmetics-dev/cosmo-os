# Feature Specification: Insight Filters, Merchant Dash & Loyalty Contact Flow

**Feature Branch**: `039-insight-loyalty-contact-flow`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "i have cahnges for customer insight and merchant wise dashboard..." (full text retained in feature intake; see session clarifications for permission model).

## Clarifications

### Session 2026-08-12

- Q: New Contact Manager / Contact Master roles, or reuse existing Contacts permissions? → A: **No new roles.** Use the existing Contacts permission set (`contacts.*`). Add any missing keys (e.g. merge) and assign them on user/role permission screens. Loyalty assignment continues to gate on existing `contacts.master.manage` / `contacts.master.read`. Contact updates use `contacts.updates.*`. Merge uses a new explicit permission such as `contacts.merge` (or equivalent under the Contacts group).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Insight list filters that match merchant targeting (Priority: P1)

On Customer Insight list/search results, merchants and permitted staff apply filters that return the right allocated customers: birthday within a chosen date range; minimum lifetime total alone (all customers at or above that amount when max is empty); last-contacted within a date range; brand and item (item list works alone with all items, or only items under a selected brand, both with search); loyalty registration date range; and no-purchase within a free date range (not only fixed 3/6 month presets). Push-to-Gold, Push-to-Platinum, and loyalty-tier quick filters are removed. Brand names appear in ascending order with a search box. Filter combinations are verified so results stay correct and ordered by highest purchase total first (existing list ordering rule).

**Why this priority**: Filters are the daily work surface for insight; wrong or missing filters block targeting.

**Independent Test**: Apply each filter alone and in common pairs (e.g. min total + brand, brand + item, birthday range + last contacted); confirm counts and membership match expectations; confirm removed push/loyalty filters are gone; confirm brand A–Z + search; confirm item list unconstrained without brand and constrained with brand.

**Acceptance Scenarios**:

1. **Given** allocated customers with birthdays on different calendar days, **When** the user sets a birthday date range, **Then** only customers whose birthday (month-day, ignoring year) falls in that range appear.
2. **Given** a minimum total is set and maximum total is empty, **When** results load, **Then** all allocated customers with lifetime total ≥ min appear (no implicit upper cap).
3. **Given** both min and max total are set, **When** results load, **Then** only customers with lifetime total in that inclusive band appear.
4. **Given** the user opens brand filter, **When** brands load, **Then** they are ascending alphabetical and searchable by name.
5. **Given** no brand is selected, **When** the user opens item filter, **Then** all items are listed and searchable; selecting an item filters customers who purchased that item.
6. **Given** one brand is selected, **When** the user opens item filter, **Then** only items under that brand appear (searchable) and item filter still works.
7. **Given** the user sets a last-contacted date range, **When** results load, **Then** only customers whose latest contact event falls in that range appear.
8. **Given** the user sets a loyalty registration date range, **When** results load, **Then** only customers whose loyalty assignment (Gold/Platinum registration) falls in that range appear.
9. **Given** the user sets a no-purchase date range, **When** results load, **Then** customers with no purchase in that range appear (fixed “3 months / 6 months only” presets are not the sole option; free range is available).
10. **Given** the insight filter bar, **When** the page loads, **Then** Push to Gold, Push to Platinum, and loyalty-tier quick filters are not available.
11. **Given** multiple filters applied together, **When** results load, **Then** customers must satisfy all active filters and remain sorted by highest lifetime total first.

---

### User Story 2 - Permission-gated merge contact (Priority: P1)

Merge Contact on the insight page is available only to users who hold the new Contacts permission (e.g. `contacts.merge`). Users without that permission never see or invoke merge. Admins grant it on the existing Contacts permission screen alongside `contacts.manage`, `contacts.insight.read`, etc. — **no new role**.

**Why this priority**: Merge changes customer identity; accidental or unauthorized merges are high-risk.

**Independent Test**: User with `contacts.merge` sees and completes merge; user without it has no merge control and cannot call the action.

**Acceptance Scenarios**:

1. **Given** a user with `contacts.merge`, **When** they open insight for eligible contacts, **Then** Merge Contact is available and succeeds under existing merge rules.
2. **Given** a user without `contacts.merge` (even if they have `contacts.read` / `contacts.insight.read`), **When** they open the same page, **Then** Merge Contact is hidden and any direct attempt is denied.
3. **Given** a successful merge, **When** audit trail is opened for Customer Insight, **Then** the merge is logged with actor, time, and before/after identity summary.

---

### User Story 3 - Contact history with remarks (no overwrite) (Priority: P1)

Each contact update creates a new history row with date/time, actor, optional remark, and outcome fields as applicable. Re-contacting a customer must not erase prior contact rows; “last contacted” is derived from the newest row while full history remains visible to permitted users.

**Why this priority**: Merchants already lose earlier contact context when only last-contacted is overwritten; history is required for accountability.

**Independent Test**: Contact the same customer twice with different remarks; both rows remain; last contacted shows the newer event.

**Acceptance Scenarios**:

1. **Given** an allocated merchant (or a user with `contacts.updates.manage`) marks a contact with a remark, **When** they save, **Then** a history row stores remark, actor, and timestamp.
2. **Given** the same customer is contacted again, **When** the new mark is saved, **Then** a second history row is added and the previous row is unchanged.
3. **Given** contact history exists, **When** a permitted user views the customer, **Then** they can see the history list (not only the latest stamp).

---

### User Story 4 - Loyalty outreach on merchant dashboard (Priority: P1)

When a customer becomes eligible for the loyalty outreach queue (lifetime total reaches Gold threshold and they are not yet assigned Gold/Platinum), that customer appears on the allocated merchant’s dashboard in a card similar to nearest birthdays. The merchant can mark that they contacted the customer to inform them they were selected for loyalty, with remark support. Later the merchant records **Responded** or **Not responded**. Responded customers enter a queue for users who have **`contacts.master.manage`** (existing Contacts permission), who assign Gold or Platinum based on lifetime totals from ERP and Shopify. After assignment, the insight customer detail card shows loyalty Gold or Platinum with who assigned it and when. Audit trail records insight and merchant-dashboard contact/loyalty actions under new modules.

**Why this priority**: End-to-end loyalty enrollment is the new business process tying dashboard and insight together.

**Independent Test**: Eligible customer appears on merchant card → merchant marks contacted → marks Responded → user with `contacts.master.manage` assigns Platinum → insight card shows Platinum + actor + time; Not responded stays out of assignment queue; history and audit rows exist.

**Acceptance Scenarios**:

1. **Given** a customer allocated to Merchant A crosses the Gold eligibility threshold and has no master loyalty assignment yet, **When** Merchant A opens merchant dashboard, **Then** the customer appears in the loyalty-outreach card (nearest-birthdays style).
2. **Given** that card, **When** the merchant marks contacted (informed of loyalty selection) with optional remark, **Then** a contact history row is created and the card reflects contacted state.
3. **Given** a contacted loyalty-outreach customer, **When** the merchant chooses Responded, **Then** the customer appears in the master assignment queue; **When** they choose Not responded, **Then** the customer does not enter that queue (and remains visible for follow-up per Assumptions).
4. **Given** a Responded customer in the queue, **When** a user with `contacts.master.manage` assigns Gold or Platinum consistent with ERP+Shopify lifetime total rules, **Then** assignment succeeds and the insight detail card shows the tier plus assignee name and timestamp.
5. **Given** an assignment attempt that does not match the customer’s total band, **When** the master user saves, **Then** the system blocks or clearly warns per the Gold/Platinum threshold rules (Gold band vs Platinum band) and does not silently mis-label.
6. **Given** contact or loyalty actions on insight or merchant dashboard, **When** an authorized user opens Audit Trail, **Then** entries appear under Customer Insight and Merchant Dashboard modules with actor, action, time, and relevant customer identity.

---

### User Story 5 - Extend existing Contacts permissions (no new roles) (Priority: P1)

Access is controlled only through the existing Contacts permission group. Admins add **`contacts.merge`** (new) for Merge Contact, reuse **`contacts.updates.manage` / `contacts.updates.read`** for contact history writes and reads, and reuse **`contacts.master.manage` / `contacts.master.read`** for loyalty assignment queue and tier set. Users receive these by checking boxes on the same Contacts permission UI — **no Contact Manager / Contact Master roles are created**.

**Why this priority**: Product already ships Contacts permissions; duplicating them as roles would confuse admins and drift from the live permission screen.

**Independent Test**: Toggle only `contacts.merge` → merge appears/disappears; toggle only `contacts.master.manage` → assignment queue available without granting merge; user with neither cannot merge or assign.

**Acceptance Scenarios**:

1. **Given** a user without `contacts.master.manage`, **When** they open the Responded assignment queue or try to set Gold/Platinum, **Then** they are denied.
2. **Given** a user with `contacts.master.manage` but without `contacts.merge`, **When** they work the assignment queue, **Then** they can set Gold/Platinum and still cannot merge contacts.
3. **Given** an admin enables `contacts.merge` (and/or updates/master flags) on an existing user or role template, **When** that user signs in, **Then** only those checked Contacts permissions apply — no new named role is required.

---

### User Story 6 - Merchant dashboard card cleanup and optional filters (Priority: P2)

Daily Customer and Top Lifetime Customers cards are removed from the default merchant dashboard. Merchants can opt in via filters/controls when they need those lists. Call Center Performance for that merchant appears on the merchant-wise dashboard. Main dashboard and merchant-wise dashboard graphs that need a period support an explicit date range for both.

**Why this priority**: Reduces clutter and aligns personal dash with call-center and period analysis needs.

**Independent Test**: Default merchant dash has no Daily Customer / Top Lifetime cards; enabling the filter restores those lists; call-center block shows that merchant’s metrics; changing date range updates both graph contexts.

**Acceptance Scenarios**:

1. **Given** a merchant opens their dashboard with default filters, **When** the page loads, **Then** Daily Customer and Top Lifetime Customers cards are not shown.
2. **Given** the merchant enables the control/filter for those lists, **When** they apply it, **Then** the corresponding customer lists appear for their scope.
3. **Given** Merchant A has call-center activity, **When** they open merchant dashboard, **Then** call-center performance for A is visible (not company-wide as the primary view).
4. **Given** date range controls on main dashboard graphs and on merchant-wise dashboard graphs, **When** the user sets a range, **Then** both graph sets refresh to that range for the viewer’s scope (company vs single merchant).

---

### Edge Cases

- Birthday range that wraps year-end (e.g. Dec 20–Jan 5) still matches month-day birthdays in that wrap.
- Min total set extremely high → empty result, not an error.
- Brand selected with zero items → empty item list with clear empty state.
- Customer eligible for loyalty card but allocated merchant missing → card does not show under another merchant; admins may still process via insight/queue tools.
- Double-submit on Responded / loyalty assign → single queue entry and single assignment (idempotent).
- Contact without remark → allowed; remark optional unless product later requires it for loyalty outreach (default: optional).
- User has `contacts.updates.manage` but not `contacts.merge` — merge stays hidden; contact updates still work.
- User has `contacts.master.read` but not `contacts.master.manage` — may view master queue context if product already treats read that way, but cannot assign tiers.
- Audit module filters must distinguish Insight vs Merchant Dashboard even when the same customer is touched in both places.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Customer Insight MUST support birthday filtering by a user-chosen date range (month-day matching), not only “current month.”
- **FR-002**: When minimum lifetime total is set and maximum is unset, results MUST include all customers with total ≥ minimum; when both are set, results MUST be within the inclusive band.
- **FR-003**: Push to Gold, Push to Platinum, and loyalty-tier quick filters MUST be removed from the insight filter UI.
- **FR-004**: Insight MUST support last-contacted filtering by date range using the latest contact history timestamp.
- **FR-005**: Insight MUST support brand filter with brands sorted ascending A–Z and a brand search box.
- **FR-006**: Insight MUST support item-wise filter with search; with no brand selected, all items are available; with a brand selected, only that brand’s items are available.
- **FR-007**: Insight MUST support loyalty registration date-range filter (date the `contacts.master.manage` assignment was recorded).
- **FR-008**: Insight MUST support no-purchase filtering by free date range (not limited to fixed 3- or 6-month-only options).
- **FR-009**: Merge Contact MUST require a new Contacts permission `contacts.merge` (shown in the existing Contacts permission UI); users without it MUST NOT see or execute merge. General `contacts.manage` alone MUST NOT imply merge.
- **FR-010**: Each contact update MUST append a history record with timestamp, actor, optional remark, and outcome (e.g. general contact, loyalty informed, responded, not responded); prior records MUST remain. Writing updates MUST respect `contacts.updates.manage` (or allocated-merchant exception already product-standard); reading history MUST respect `contacts.updates.read` where that gate applies.
- **FR-011**: Merchant dashboard MUST remove Daily Customer and Top Lifetime Customers from the default view and expose them only when the merchant opts in via filter/control.
- **FR-012**: Merchant dashboard MUST show a loyalty-outreach card (nearest-birthdays style) for allocated customers who are loyalty-eligible but not yet master-assigned.
- **FR-013**: Merchants MUST be able to mark loyalty-outreach customers as contacted (informed of selection), then later as Responded or Not responded, with optional remark.
- **FR-014**: Responded customers MUST enter a queue for users with `contacts.master.manage` to assign Gold or Platinum using lifetime totals reconciled from ERP and Shopify against existing Gold/Platinum thresholds.
- **FR-015**: After master assignment, the insight customer detail card MUST show loyalty Gold or Platinum with assignee identity and assignment timestamp.
- **FR-016**: System MUST NOT create new Contact Manager / Contact Master roles. Access MUST use the existing Contacts permission set, extended with `contacts.merge`, and reuse `contacts.master.*`, `contacts.updates.*`, `contacts.insight.read`, `contacts.allocation.*`, `contacts.read`, and `contacts.manage` as already defined.
- **FR-017**: Call Center Performance for the viewing merchant MUST appear on the merchant-wise dashboard.
- **FR-018**: Main dashboard and merchant-wise dashboard graphs that use periods MUST accept a user-selected date range affecting both graph contexts appropriately (company-wide vs merchant-scoped).
- **FR-019**: Audit Trail MUST add modules (or equivalent categorizations) for Customer Insight and Merchant Dashboard and MUST log filter-significant mutations: merges, contact history writes, respond/not respond, and loyalty assignments (actor, time, customer, action summary).
- **FR-020**: Combined insight filters MUST be validated so intersections behave correctly (AND semantics) and list ordering by highest purchase total is preserved when filters apply.
- **FR-021**: Loyalty Gold/Platinum assignment MUST use the same threshold bands already established for the product (Gold ≥ 75,000 and &lt; 200,000; Platinum ≥ 200,000) unless a later clarification changes them.
- **FR-022**: Non-allocated merchants MUST NOT gain new insight visibility beyond existing allocation rules when using these filters and cards.

### Key Entities

- **Contact History Entry**: Append-only record of a contact attempt or outcome; attributes include customer, actor, timestamp, remark, outcome type, and optional link to loyalty-outreach context.
- **Loyalty Outreach Queue Item**: Allocated eligible customer awaiting merchant contact and/or response; states include eligible, contacted, responded, not responded, assigned.
- **Loyalty Assignment**: Decision of Gold or Platinum by a user with `contacts.master.manage`; stores assignee, timestamp, tier, and total snapshot used for the decision.
- **Contacts Permission**: Existing capability keys under the Contacts group (`contacts.*`), including new `contacts.merge` for Merge Contact.
- **Audit Trail Entry**: Existing audit mechanism extended with Insight and Merchant Dashboard module labels.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In spot checks of 20 filter combinations (including birthday range, min-only total, brand+item, last contacted, no-purchase range, loyalty registration range), 100% of result sets match the documented filter rules with no false inclusions.
- **SC-002**: Users without merge permission cannot discover or complete Merge Contact in usability testing (0 unauthorized merges in the test cohort).
- **SC-003**: After two successive contacts with different remarks, both history rows remain visible and last-contacted reflects only the newer event in 100% of tested cases.
- **SC-004**: A loyalty-eligible customer can move from merchant card → contacted → Responded → `contacts.master.manage` assignment → insight badge with who/when in under 5 minutes for a trained user in a happy-path drill.
- **SC-005**: Default merchant dashboard no longer shows Daily Customer or Top Lifetime cards; opted-in filter restores them within one interaction.
- **SC-006**: Authorized reviewers can find Insight and Merchant Dashboard audit rows for merge, contact, respond, and loyalty assign within the existing Audit Trail UI without leaving the product.
- **SC-007**: Merchant-wise call-center performance and date-ranged graphs update to the selected merchant and date range so merchants no longer need the company Overview solely for those two needs in the personal view.

## Assumptions

- Existing allocation and non-allocated visibility rules from prior Customer Insight specs remain in force; this feature extends filters and contact/loyalty process for allocated owners, users with relevant `contacts.*` permissions, and admins.
- Gold / Platinum monetary thresholds remain 75,000 and 200,000 as in `033-insight-allocation-loyalty` clarifications.
- “Become loyalty customer” for the merchant card means lifetime total reaches at least the Gold threshold and no master loyalty assignment exists yet (eligible queue), not that the tier badge is already final.
- No new roles: permissions already visible under Contacts (`contacts.allocation.*`, `contacts.insight.read`, `contacts.manage`, `contacts.master.*`, `contacts.read`, `contacts.updates.*`) are reused; only missing keys such as `contacts.merge` are added to that same group.
- Remark is optional on contact updates.
- Not responded customers remain on the merchant loyalty card for follow-up; they do not enter the `contacts.master.manage` assignment queue.
- ERP and Shopify totals are combined (or already reconciled into the existing lifetime total used by insight) for assignment checks — same total the progress bar uses.
- Audit Trail page already exists; work is additive modules/categories and new event types, not a new audit product.
- Date ranges use company business timezone already used by dashboards (Asia/Colombo) unless product standard differs.
- Filter “double check” is a QA/acceptance obligation covered by SC-001 and FR-020, not a separate permanent admin tool.
