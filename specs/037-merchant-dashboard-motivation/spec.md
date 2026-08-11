# Feature Specification: Merchant Dashboard Motivation & Sales Tracking

**Feature Branch**: `037-merchant-dashboard-motivation`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "now merchant can see their dashboard, but i have dout, our main dashboard have lot of data graphs no? pie charts, there are many data representer for merchant wise, i wanna know is all of that merchant wise representers now show i merchant wise dashboard their details? (is anything in main dashboard it show all merchants details at one place no? i want take one by one for their merchant wise dashboard, ) also they use main dashboard as motivator they can see other merchants performance no? i want build that kind of UI in their personalized dashboard, comparision with other merchants, clean motivative attractive UI for them, also, now they can se their MTD sale in their dashboard they want track their daily sale also they want track thei history sales also, we have to plan that,"

## Clarifications

### Session 2026-08-11

- Q: On personal peer comparison, how much peer detail should a merchant see? → A: Named peers with sales amounts (not rank-only/anonymized); both MTD and daily (Today) comparison among all merchants. (Board length finalized in Q5.)
- Q: How deep should sales history go in v1? → A: Current month day-by-day only + last 3 calendar months of monthly history.
- Q: For location share on the personal dashboard, what should merchants see? → A: Self amount/% of each location plus compact named peer amounts for that same location.
- Q: Which period(s) should location share + location peer breakdown use? → A: Both MTD and Today (toggle or side-by-side).
- Q: For company-wide peer boards (Today + MTD), full cohort or short top list? → A: Top 10 for the period + always include viewed merchant if outside top 10.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Personal mirror of company merchant visuals (Priority: P1)

A merchant opens their personalized dashboard and sees the same kinds of merchant-wise story the company Overview tells—but only for **their** performance: contribution by location, share of shops they sell into, and clear “where I stand” numbers. Admins can still open any merchant’s view.

**Why this priority**: Today the company Overview mixes all merchants in many charts. Merchants are unsure whether their personal page already covers those stories. Closing that gap is the core of “take one by one into merchant dashboard.”

**Independent Test**: Open merchant dashboard as Merchant A; confirm personal location/share visuals match A’s attributed sales only (not company totals). Switch admin to Merchant B; visuals change to B.

**Acceptance Scenarios**:

1. **Given** Merchant A has attributed sales in multiple locations this month, **When** they open Merchant Dashboard, **Then** they see personal location contribution (charts and totals) for A only.
2. **Given** company Overview shows a multi-merchant mix for a location, **When** Merchant A views their dashboard, **Then** they see their own amount and share (%) of that location plus a compact named peer breakdown for that location (peer amounts in the same location)—not the full company Overview wall as the primary personal view.
3. **Given** an admin selects Merchant B from the merchant switcher, **When** the page reloads, **Then** all personal visuals and KPIs update to Merchant B.

---

### User Story 2 - Motivational peer comparison on the personal dashboard (Priority: P1)

Merchants currently open the company Overview to compare themselves with peers. On the personalized dashboard they get a **clean, motivating comparison** (rank, progress vs peers, encouraging messaging) without needing the full company analytics wall.

**Why this priority**: Comparison is already how merchants use Overview as a motivator; bringing it into their home page is the stated product goal.

**Independent Test**: As Merchant A, view peer comparison for MTD and for Today showing A’s rank, named peers with amounts, and relative progress; messaging changes when A is behind vs ahead of the median/top.

**Acceptance Scenarios**:

1. **Given** at least three merchants with MTD sales, **When** Merchant A opens their dashboard, **Then** they see their MTD rank among merchants, a named top-10 peer board for MTD (always including A if outside top 10), and how far they are from the leader (amount and/or percentage).
2. **Given** at least three merchants with attributed sales today, **When** Merchant A views daily peer comparison, **Then** they see today’s rank and a named top-10 peer board for Today (always including A if outside top 10).
3. **Given** Merchant A is below monthly target and behind the top merchant, **When** they view comparison, **Then** they see motivational copy encouraging catch-up (not shaming language).
4. **Given** Merchant A is #1 for MTD among merchants, **When** they view comparison, **Then** they see celebratory/lead-retention messaging.
5. **Given** a merchant views peer comparison, **When** peer names are shown, **Then** only merchants in the same company merchant cohort appear (same merchant-role population used for targets/overview today).

---

### User Story 3 - Daily sales tracking (Priority: P1)

Merchants can see **today’s** sales (Asia/Colombo day) in addition to MTD, with enough detail to know if they are having a strong day.

**Why this priority**: Explicitly requested; MTD alone is not enough for day-to-day coaching.

**Independent Test**: Confirm “today” KPI matches attributed sales for the current Colombo calendar day; after midnight Colombo the counter resets for the new day.

**Acceptance Scenarios**:

1. **Given** Merchant A has orders attributed today, **When** they open Merchant Dashboard, **Then** they see today’s sales total and today’s order count.
2. **Given** no attributed orders today, **When** they open the dashboard, **Then** today’s sales show zero (not blank/error) and MTD still shows correctly.
3. **Given** Merchant A views today vs MTD, **When** both are visible, **Then** labels clearly distinguish “Today” from “This month (MTD).”

---

### User Story 4 - Sales history tracking (Priority: P2)

Merchants can review past sales by day and by month (history), so they can see trends and recall prior performance—not only the current month.

**Why this priority**: Needed for planning and accountability; builds on daily/MTD once those are solid.

**Independent Test**: Pick a past day and a past month for Merchant A; totals match attributed sales for that window.

**Acceptance Scenarios**:

1. **Given** Merchant A had sales on a prior Colombo day this month, **When** they open sales history (daily), **Then** they see that day’s total and order count in a chronological list or chart for the **current Colombo month only** (v1 does not include prior months’ days).
2. **Given** Merchant A had sales in a prior calendar month within the last 3 months, **When** they open monthly history, **Then** they see that month’s total, order count, and target status if a target existed (v1 covers the **last 3 calendar months**, including the current month).
3. **Given** Merchant A selects a history range with no sales, **When** results load, **Then** they see an empty state, not an error.

---

### User Story 5 - Attractive motivational presentation (Priority: P3)

The merchant home feels intentional and motivating: hierarchy (today → MTD → target → peers), progress cues, and clear visual anchors—not a dump of company Overview widgets.

**Why this priority**: Improves adoption; depends on the data stories in P1–P2.

**Independent Test**: Review the first viewport of Merchant Dashboard; a merchant can answer “How am I doing today?”, “Am I on target this month?”, and “Where do I rank?” without scrolling into admin-only tools.

**Acceptance Scenarios**:

1. **Given** Merchant A opens the dashboard on desktop or mobile, **When** the first screen loads, **Then** Today, MTD, target progress, and peer rank are visible without hunting.
2. **Given** cheer/motivation messages exist for target bands, **When** peer comparison is shown, **Then** tone stays consistent (encourage, celebrate, nudge)—never punitive.

---

### Edge Cases

- Merchant with no attributed sales this month: personal charts empty with clear copy; peer comparison still shows rank (e.g. last) or “no sales yet.”
- Merchant with sales but no location on some orders: those amounts still count in totals; location charts omit or bucket as “Unassigned” consistently with company sales rules.
- Only one merchant in the cohort: comparison shows solo-leader state (no fake peers).
- Timezone: all “today,” “day,” and “month” boundaries use Asia/Colombo business calendar (same as existing sales dashboards).
- Admin viewing another merchant: comparison and history are for the **selected** merchant, not the admin’s own identity.
- Company Overview remains available for users with company dashboard access; this feature does not remove Overview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present on Merchant Dashboard a **personal** view of attributed sales for the viewed merchant (self for merchants; selected merchant for admins).
- **FR-002**: System MUST include personal equivalents of the company Overview’s merchant-wise stories that matter for one merchant: at minimum (a) sales by location for that merchant, (b) that merchant’s share of each location they appear in for the period, (c) company merchant ranking / mix context centered on that merchant, and (d) for each such location a **compact named peer breakdown** (peer amounts in that location) alongside the viewed merchant’s amount and %. Location share + location peer breakdown MUST support **both MTD and Today** (toggle or side-by-side).
- **FR-002a**: Location peer breakdown MUST remain compact (location-scoped peers), not a full dump of every company Overview widget.
- **FR-003**: System MUST NOT require a merchant to open company Overview to answer “my MTD,” “my today,” “my rank vs peers,” or “my location mix.”
- **FR-004**: System MUST show **Today’s sales** (total and order count) for the viewed merchant using the Asia/Colombo calendar day.
- **FR-005**: System MUST continue to show **MTD sales** for the current Colombo calendar month alongside Today.
- **FR-006**: System MUST provide **sales history** for the viewed merchant: **daily** history for the **current Colombo calendar month only** (day-by-day), and **monthly** history for the **last 3 calendar months** (including the current month), with target vs achieved when a target exists.
- **FR-007**: System MUST provide a **peer comparison** section for the viewed merchant against the company’s merchant cohort (same population used for merchant targets / merchant-role users), including rank and distance-to-leader (or equivalent motivational metric), for **both MTD and Today (daily)**.
- **FR-007a**: Company-wide peer boards (Today and MTD) MUST show **named peers with sales amounts** as the **top 10** for that period, and MUST **always include the viewed merchant** (with true rank and amount) if they fall outside the top 10. Anonymized or rank-only boards are out of scope.
- **FR-008**: Peer comparison MUST use a motivational presentation (progress cues + encouraging copy bands), suitable as a replacement for “browsing Overview to spy peers.”
- **FR-009**: Personal totals MUST use the same merchant attribution rules already used for merchant dashboard MTD (so numbers stay consistent with existing merchant KPIs).
- **FR-010**: Admins MUST retain merchant switcher; all new personal/comparison/history views follow the selected merchant.
- **FR-011**: Company Overview merchant-mix charts for managers/admins remain unchanged by this feature unless explicitly scoped later.
- **FR-012**: System MUST clearly label periods (Today / MTD / history day / history month) so users do not confuse them.

### Key Entities

- **Viewed merchant**: The merchant whose personalized dashboard is shown (logged-in merchant or admin-selected).
- **Attributed sale**: An order counted toward a merchant under existing attribution rules.
- **Merchant cohort**: Set of users treated as merchants for ranking and targets (merchant-level roles).
- **Daily sales snapshot**: Attributed total and order count for one Colombo calendar day for one merchant.
- **Monthly sales snapshot**: Attributed total and order count for one Colombo calendar month for one merchant, optionally joined to monthly target.
- **Peer comparison state**: Rank, named peer amounts, viewed merchant total, leader total, and motivational band for a period (**MTD and Today**).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a guided walkthrough, 9/10 merchants can answer “What did I sell today?” and “What is my MTD?” from Merchant Dashboard alone within 30 seconds.
- **SC-002**: In the same walkthrough, 9/10 merchants can state their MTD rank and today’s rank among merchants (with named peer amounts visible) without opening company Overview.
- **SC-003**: Spot-check of 10 merchant/day pairs: Today and history day totals match independently recomputed attributed sales for that Colombo day (± rounding to currency display).
- **SC-004**: Spot-check of 10 merchant/month pairs: MTD/history month totals match attributed sales for that month; when a target exists, achieved vs target status matches existing target rules.
- **SC-005**: After release, merchants report (survey or stand-up) that they no longer need Overview solely to compare with peers—target: majority of merchant-role respondents within two weeks.
- **SC-006**: First viewport of Merchant Dashboard on a typical phone shows Today, MTD, target progress, and peer rank without horizontal overflow or missing labels.

## Assumptions

- Merchant attribution for this feature reuses the rules already used on Merchant Dashboard MTD (not a new attribution model).
- “Merchant cohort” for peer comparison is the same set of users already listed on admin merchant overview / merchant-level roles.
- Peer names **and amounts** are shown for comparison (merchants already see named peers on company Overview today); anonymized ranks are out of scope unless privacy policy changes later.
- Location share view (v1): for each location the viewed merchant sells into, show **self amount + % of location** and a **compact named peer amount breakdown** for that location, for **both MTD and Today** (toggle or side-by-side)—not the full Overview wall.
- Gateway analysis, call-center charts, and non-merchant brand config editing stay on company Overview—not required on merchant home in this feature.
- Peer comparison periods in v1 are **both MTD and Today (daily)**. Company-wide boards show **top 10 + viewed merchant if outside top 10** (named amounts)—not a mandatory full-cohort list.
- History depth (v1): **current month days only** + **last 3 calendar months** of monthly totals; deeper archive / export is out of scope.
- Company Overview remains the analytics wall for managers; this feature complements it for merchants.

## Gap note (current vs desired)

**Already on Merchant Dashboard today (baseline):** personal MTD, location pie for self, targets/cheer, admin all-merchants overview, customers, birthdays, returns rate.

**Still missing relative to company Overview merchant-wise stories + this request:** personal share-of-location / rank-within-location stories, merchant-centered company mix/rank for **non-admin** merchants, motivational peer UI on the personal home, **Today** sales KPI, and **day/month sales history**.
