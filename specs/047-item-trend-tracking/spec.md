# Feature Specification: Item Trends Super Dashboard

**Feature Branch**: `047-item-trend-tracking`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "Track item trends to improve sales — focus on how fast items move priority-wise, newly added items, day-specific fast-move patterns that can repeat, and priority items slowing down so teams can investigate and act. Dedicated super dashboard for purchasing admins and admins with permission—not a flat table dashboard; rich KPIs and charts; intelligent trend engine when rules are insufficient. Show which districts lead demand and where to open the next physical location; cover every area for sales growth. **Across outlets**: visualize same item slow at one outlet with heavy stock but fast at another—so teams can move stock to fast-moving locations. **ROP assist**: today ROP is manual; suggest ROP from item sales over 2–3 months (default), optional manual month range, **double** that for next month’s ROP; recommend increase when movement improves and decrease when slow—for purchasing and supplier admin. Primary users: **purchasing department and store/outlet teams** to see how items move across the company."

## Clarifications

### Session 2026-09-02

- Q: Who can access this dashboard? → A: **Purchasing admins** (users with purchasing admin/manager permissions) and **company admins** who hold a dedicated **`purchasing.item_trends.read`** permission (or equivalent admin bypass). All other users are denied—same pattern as OSF and Rider performance pages.
- Q: What kind of UI is expected? → A: A **super dashboard**—summary KPI cards, trend charts, heatmaps or sparklines, priority-tier breakdowns, and signal badges—not a plain table-only page like basic operational lists. Detail tables remain available beneath visuals.
- Q: How should trends be detected when simple rules miss patterns? → A: **Layered approach**: v1 ships rule-based signals (speed rank, period compare, day-of-week spikes, slowdown thresholds). The product MUST also support an **intelligent trend engine** (statistical analysis, trained model, or AI agent) that can surface non-obvious emerging trends, repeat spikes, and slowdowns when rules alone are insufficient. Plan phase decides which engine fits; spec requires the capability and user-visible outcomes, not a specific technology.
- Q: How does geography fit in? → A: Orders grouped by **customer district** (shipping address). Dashboard shows district leaderboard, item trends per district, and expansion opportunities for new outlets.
- Q: Who is the dashboard for beyond purchasing admins? → A: **Purchasing department** (buyers, supplier coordinators) **and store/outlet teams**—anyone granted `purchasing.item_trends.read` or purchasing-admin bypass. Store users may see outlet-scoped views where applicable.
- Q: How does ROP suggestion work on this dashboard vs OSF today? → A: Dashboard proposes **next-month ROP** using purchasing’s established rule: **highest calendar-month units in the sales window × 2** (not window total × 2). Example: months 4000 / 1000 / 8000 → ROP = 8000 × 2. Default window = **last 3 calendar months** (2 months selectable). User may pick a **custom month range** manually. Current saved ROP is shown alongside suggestion. **Movement overlay**: accelerating/fast items get an **increase** recommendation; slow-moving items get a **decrease** recommendation—supplier admin reviews; never silent overwrite. Applying ROP uses existing OSF/item ROP save flow (`purchasing.osf.manage`).
- Q: What is the outlet stock imbalance scenario? → A: For the same SKU, compare **movement speed and on-hand stock at each outlet/location**. Flag **transfer candidates**: high stock + slow movement at outlet A, fast movement (and optionally low stock) at outlet B—visualize side-by-side so teams can move units to where they sell faster.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Permission-gated super dashboard for purchasing admins (Priority: P1)

A purchasing admin or permitted company admin opens **Item Trends** from the dashboard navigation. They land on a dedicated analytics page—not the general company sales dashboard—with an at-a-glance layout: headline KPIs (fast movers count, new-item traction, slowdown alerts, pattern hits, **top districts by demand**), visual trend summaries, district coverage snapshot, and drill-down sections. Users without `purchasing.item_trends.read` (and without purchasing-admin or admin bypass) see a standard permission-denied experience and cannot load trend data.

**Why this priority**: Access control and a distinct premium dashboard are foundational; without them the feature is either exposed to the wrong audience or feels like another generic report.

**Independent Test**: Open Item Trends as a purchasing admin → full dashboard loads. Open as a user without permission → denied. Grant `purchasing.item_trends.read` to a non-purchasing admin → dashboard loads.

**Acceptance Scenarios**:

1. **Given** a user with purchasing admin access or `purchasing.item_trends.read`, **When** they navigate to Item Trends, **Then** the super dashboard loads with KPI cards and at least one chart section visible above the fold.
2. **Given** a user without the permission and without admin bypass, **When** they try to open Item Trends, **Then** access is denied and no trend API data is returned.
3. **Given** a company admin role that bypasses permission checks on other staff pages, **When** they open Item Trends, **Then** they see the full dashboard (consistent with existing admin bypass behavior).
4. **Given** the dashboard loads, **When** the user compares it to the general company Overview dashboard, **Then** Item Trends is clearly a separate page focused on item movement intelligence—not a duplicate of merchant or order dashboards.

---

### User Story 2 - Attractive visual analytics for movement signals (Priority: P1)

A purchasing leader uses the super dashboard to understand item movement and **geographic demand** at a glance. The page shows: priority-tier breakdown, movement leaderboard with sparklines, new-items panel, slowdown alerts, **district leaderboard**, **outlet balance / transfer candidates**, **ROP suggestion strip**, item × district matrix, and day-of-week pattern visuals when history allows. Changing the date range updates all visuals together.

**Why this priority**: User explicitly wants a motivating, attractive analytics experience—not a normal table dashboard. Visual clarity drives daily adoption.

**Independent Test**: Open dashboard for a 7-day range with known data; confirm KPI cards, at least two chart types, and signal badges update when the range changes; table detail still available for exact numbers.

**Acceptance Scenarios**:

1. **Given** permitted access and sales data in range, **When** the user opens Item Trends, **Then** they see summary KPI cards (minimum: fast movers, new-item signals, slowdown count, **top district by demand**, total units tracked) plus chart visualizations—not a table-only layout.
2. **Given** a selected date range, **When** the user changes From/To, **Then** KPIs, charts, and ranked sections refresh to the new range within one interaction cycle.
3. **Given** Top Priority items dominate fast movers, **When** the user views the priority breakdown visual, **Then** Top Priority contribution is visually emphasized (segment size, color, or dedicated panel).
4. **Given** an item on any leaderboard row, **When** the user views it, **Then** a compact trend indicator (sparkline or direction arrow with percent change) shows movement vs the prior equal period without opening detail.
5. **Given** insufficient data for charts (empty range), **When** the dashboard loads, **Then** empty states are informative and visually consistent—not broken layouts.

---

### User Story 3 - See what is moving fastest by priority (Priority: P1)

From the super dashboard movement section, the purchasing admin immediately sees which products are selling fastest, ranked with **Top Priority** items surfaced first. They switch date range (today, last 7 days, last 30 days) and see speed vs the prior equivalent period so they know where to focus promotions, stock, and outreach.

**Why this priority**: Fast movers are the quickest path to revenue; priority-tier focus matches existing OSF product classification.

**Independent Test**: Pick a known hot Top Priority SKU; confirm it appears near the top of the fast-mover section with speed indicator vs prior period.

**Acceptance Scenarios**:

1. **Given** the movement section with default range (last 7 days), **When** it loads, **Then** items are ranked by movement speed with Top Priority emphasized by default sort or filter.
2. **Given** a selected date range, **When** the user views an item row, **Then** they see units sold, average daily rate, and change vs the immediately preceding equal-length period.
3. **Given** multiple priority tiers, **When** the user filters to "Top Priority only," **Then** only Top Priority items appear while preserving speed ranking within that set.
4. **Given** zero sales in both current and comparison periods, **When** the list loads, **Then** that item is excluded from fast-mover rankings or shown in a separate "no movement" area.

---

### User Story 4 - Spot newly added items gaining traction (Priority: P1)

From the new-items panel on the super dashboard, the purchasing admin catches **Newly Added** products early. Items flagged by existing product priority show movement relative to other new items and their first days in catalog, with clear **accelerating** vs **stalling** badges.

**Why this priority**: New items are high-opportunity and high-risk; early traction signals drive listing focus and supplier conversations.

**Independent Test**: Identify a Newly Added SKU with rising sales; confirm it appears in the new-items panel with rising trend and days-since-added context.

**Acceptance Scenarios**:

1. **Given** items classified as Newly Added, **When** the user views the new-items panel, **Then** those items appear with movement metrics for the selected range.
2. **Given** a newly added item with accelerating sales over the last 7 days, **When** displayed, **Then** it shows an **accelerating** badge or visual signal.
3. **Given** a newly added item with flat or declining sales, **When** displayed, **Then** it shows a **stalling** signal for investigation.
4. **Given** reclassification from Newly Added to another tier, **When** trends refresh, **Then** the item leaves the new-items panel but remains in the general movement list.

---

### User Story 5 - See which districts lead demand (Priority: P1)

A purchasing or expansion lead opens the **district zone** on the super dashboard and immediately sees which **areas (districts) rank at the top** for the selected period—by total sales, units sold, movement speed, and growth vs the prior period. They can scan all districts with data (covering the full country footprint) and spot which areas are accelerating vs cooling, so they know where customer demand is strongest geographically.

**Why this priority**: User wants to know which district tops the list and how to grow sales in every area; district ranking is the foundation for expansion and regional focus.

**Independent Test**: For a range where Colombo and Gampaha have known high volume, confirm they appear at the top of the district leaderboard with correct totals and period-over-period change.

**Acceptance Scenarios**:

1. **Given** orders with resolvable shipping districts in the selected range, **When** the district zone loads, **Then** districts are ranked by demand (default: total units, toggle to sales amount or movement speed).
2. **Given** the district leaderboard, **When** the user views a district row, **Then** they see units, sales amount, share of company total (%), and change vs the prior equal period.
3. **Given** multiple districts with sales, **When** the user opens the geographic visual, **Then** all districts with qualifying volume appear—not only the top five—so **every area is visible** (lower-volume districts may appear in a scrollable or grouped “all districts” view).
4. **Given** orders where district cannot be resolved from the address, **When** totals are computed, **Then** those orders appear under an **Unmapped** bucket so totals reconcile and admins know data quality gaps.

---

### User Story 6 - See item trends by district (Priority: P1)

From the district zone, the purchasing admin drills into a district (e.g., Kandy) and sees **which items trend there**—fast movers, new-item traction, and slowdowns **for that area only**. They can also view an **item × district matrix** (heatmap or ranked grid) showing where each hot SKU sells strongest, so stock, promotions, and purchasing focus can be tailored per area.

**Why this priority**: National item trends hide regional taste; same SKU may be hot in one district and slow in another.

**Independent Test**: Pick a SKU that sells mostly in one district; confirm it ranks high in that district’s item list and lower nationally or in other districts.

**Acceptance Scenarios**:

1. **Given** a selected district, **When** the user opens district detail, **Then** they see that district’s fast movers, new-item signals, and slowdowns scoped to orders delivered/shipped to that district.
2. **Given** the item × district view, **When** the user selects a Top Priority SKU, **Then** they see its relative strength across districts (rank or heat intensity per district).
3. **Given** a district filter active, **When** the user changes date range, **Then** district-scoped item trends refresh with the new range.
4. **Given** two districts, **When** the user compares them, **Then** they see side-by-side top items and growth metrics to spot regional differences.

---

### User Story 7 - Target where to open the next physical location (Priority: P1)

Leadership plans a **new physical outlet** and uses the **expansion opportunity** panel to see districts (or towns within districts) with **high demand but low physical coverage**—strong online/delivery sales, rising movement, trending items, and little or no attributed sales from an existing nearby physical store. The panel recommends **candidate areas** ranked by opportunity score with plain reasons (e.g., “High units, no shop within district, 3 Top Priority fast movers”).

**Why this priority**: Directly answers “if we open another physical location, which area should we target?”—core user goal for geographic growth.

**Independent Test**: Identify a district with strong delivery demand and no physical store location mapped to it; confirm it appears in expansion opportunities with supporting metrics.

**Acceptance Scenarios**:

1. **Given** district demand data and known **physical store locations** (company outlets), **When** the expansion panel loads, **Then** districts with high demand and weak/no physical presence rank above districts already well served by stores.
2. **Given** a recommended expansion district, **When** the user opens detail, **Then** they see supporting evidence: total demand, growth trend, top trending SKUs in that district, and which existing stores (if any) are nearest or currently serve that area.
3. **Given** a district already has a physical store with strong attributed shop sales, **When** opportunities are ranked, **Then** that district is deprioritized unless delivery demand still exceeds shop capacity (shown as secondary “saturation” signal).
4. **Given** leadership selects a candidate district, **When** they add it to a focus list or export, **Then** the export includes district name, opportunity score, top items, and period metrics for site-selection meetings.

---

### User Story 8 - Grow sales across every area (Priority: P2)

A purchasing admin opens the **area growth** view to see a **coverage map of all districts**: which areas are growing, which are flat, which are declining, and **action hints** per area (e.g., “push Top Priority SKU X,” “investigate slowdown in district Y,” “expansion candidate Z”). The goal is one place to answer “how do we increase sales everywhere?”—not only in top districts.

**Why this priority**: User wants to cover every area; leaderboard alone misses tail districts that need campaigns or investigation.

**Independent Test**: Open area growth view; confirm all districts with data appear with a status (growing / stable / declining / opportunity) and at least one suggested action per non-stable district.

**Acceptance Scenarios**:

1. **Given** sales across districts, **When** the area growth view loads, **Then** each district with data shows growth status vs prior period and contribution share.
2. **Given** a declining district, **When** displayed, **Then** the view links to that district’s slowdown items and top lost movers (if any) for investigation.
3. **Given** a low-volume district with rising trend, **When** displayed, **Then** it is flagged as **emerging market** even if absolute rank is not top 5.
4. **Given** intelligent analysis is enabled, **When** an unusual regional pattern is detected (e.g., repeat weekend spike in one district only), **Then** the area growth view surfaces it with district context.

---

### User Story 9 - Visualize outlet stock imbalance and transfer opportunities (Priority: P1)

A **store manager or purchasing user** opens the **outlet balance** zone and sees items where the **same SKU behaves differently across outlets**: at Outlet A the item moves slowly but **stock weight is high** (lots of units sitting); at Outlet B the same item shows **fast movement** (and may be low on stock). The dashboard visualizes this mismatch—side-by-side outlet bars, stock-vs-speed matrix, or ranked transfer list—so the team can **move stock from slow outlets to fast-moving outlets** instead of reordering blindly.

**Why this priority**: Directly addresses dead stock at one shop while another shop sells the same SKU fast; immediate operational win for stores and purchasing.

**Independent Test**: SKU X has 50 units and slow sales at Shop A, fast sales and 5 units at Shop B; confirm it appears as a transfer candidate with both outlets named and metrics shown.

**Acceptance Scenarios**:

1. **Given** a SKU with stock and sales at multiple outlets, **When** the outlet balance zone loads, **Then** each outlet row shows on-hand quantity, movement speed for the selected range, and a combined **stock pressure** indicator (high stock + slow speed vs low stock + fast speed).
2. **Given** outlet A has high stock and bottom-quartile movement while outlet B has above-median movement for the same SKU, **When** transfer logic runs, **Then** the pair appears as a **transfer candidate** with plain text: “Move stock from [A] to [B].”
3. **Given** a transfer candidate, **When** the user opens detail, **Then** they see both outlets’ stock, units sold in range, speed, and suggested transfer direction (not auto-executed—human decides).
4. **Given** a store user with outlet-scoped access, **When** they open outlet balance, **Then** they see their outlet’s imbalances and relevant partner outlets (fast movers for the same SKUs)—not unrelated locations unless they have company-wide permission.
5. **Given** company-wide view, **When** the user sorts transfer candidates, **Then** ranking considers both speed gap between outlets and stock weight at the slow outlet.

---

### User Story 10 - Suggest next-month ROP from sales window (Priority: P1)

A **purchasing or supplier admin** uses the **ROP suggestion** panel to replace manual spreadsheet math. For each item (or filtered set), the system shows: **current saved ROP**, **units sold in the sales window** (split by calendar month), **suggested next-month ROP = highest month in that window × 2**, and whether **movement trend** says increase, hold, or decrease vs the current ROP. Default sales window is **last 3 calendar months**; the user can switch to **2 months** or pick a **custom month range**. They review suggestions and apply via existing ROP save (OSF or item editor)—nothing updates without explicit save.

**Why this priority**: User’s core ROP logic today is manual; dashboard should encode “take 2–3 months sales, double it for next month” plus movement-based nudges.

**Independent Test**: SKU sold 4000 / 1000 / 8000 units across three months; suggested ROP = **16000** (peak 8000 × 2); movement accelerating → “increase” badge; manager saves via OSF flow; stored ROP updates only after save.

**Acceptance Scenarios**:

1. **Given** default ROP window (3 calendar months) with monthly units 4000, 1000, and 8000, **When** suggestions compute, **Then** suggested next-month ROP = **16000** (highest month 8000 × 2), not window total × 2.
2. **Given** the user selects **2-month** window or a **custom From–To month range**, **When** suggestions refresh, **Then** window sales and suggested ROP recalculate for that range only.
3. **Given** an item with accelerating or fast-moving signal, **When** ROP row is shown, **Then** an **increase** recommendation appears (suggested ROP may exceed base ×2 or flag “consider above formula”—documented as movement overlay in assumptions).
4. **Given** an item with slowdown signal, **When** ROP row is shown, **Then** a **decrease** recommendation appears so supplier admin does not over-order.
5. **Given** a user with `purchasing.osf.manage`, **When** they accept a suggestion, **Then** they can apply to saved ROP through the existing OSF/item ROP save path without re-entering numbers manually.
6. **Given** a user with read-only access, **When** they view ROP suggestions, **Then** they see suggestions but cannot save changes.

---

### User Story 11 - Purchasing and stores see company-wide item movement (Priority: P1)

**Purchasing buyers** and **store/outlet staff** open the same Item Trends super dashboard (per permission) to understand **how items move across the company**—not only at one shop. Purchasing sees company-wide and supplier-facing ROP signals; store staff see outlet-relevant zones (outlet balance, local fast movers) plus company context where permitted. One dashboard answers “what’s moving, where, and what should we do?”

**Why this priority**: User stated dashboard is mainly for purchasing department **and stores**; both need a shared picture of movement.

**Independent Test**: Log in as purchasing user → full dashboard. Log in as store-authorized user → outlet balance + scoped movement visible; denied zones hidden.

**Acceptance Scenarios**:

1. **Given** a purchasing user with full permission, **When** they open Item Trends, **Then** they see all zones: movement, districts, outlets, ROP suggestions, expansion, area growth.
2. **Given** a store user with outlet-scoped permission, **When** they open Item Trends, **Then** they see outlet balance, local movement, and fast/slow items for their location(s) plus read-only company highlights where policy allows.
3. **Given** both roles use the dashboard weekly, **When** they discuss a SKU, **Then** they reference the same movement metrics and outlet imbalance signals (shared source of truth).

---

### User Story 12 - Intelligent trend engine beyond fixed rules (Priority: P2)

When simple threshold rules miss nuanced patterns—e.g., a gradual climb over two weeks, a repeating spike that doesn't hit a fixed weekday rule, or a slowdown masked by one big order—the **intelligent trend engine** surfaces these items on the dashboard with a plain-language reason (e.g., "emerging trend," "unusual repeat spike," "soft slowdown"). Purchasing admins can see which signals came from **rules** vs **intelligent analysis** so they trust and tune the system over time.

**Why this priority**: User explicitly asked for model/AI agent support when normal rules are insufficient; this is the differentiator that makes the super dashboard smarter than spreadsheet sorting.

**Independent Test**: Seed or identify an item whose trend is obvious visually but fails a simple % threshold; confirm the intelligent engine flags it with a labeled signal on the dashboard.

**Acceptance Scenarios**:

1. **Given** historical sales for many SKUs, **When** the trend engine runs, **Then** each surfaced item includes a signal source label: **rule-based** or **intelligent analysis**.
2. **Given** an item with gradual multi-day acceleration not meeting a single-day spike rule, **When** the engine analyzes the lookback window, **Then** the item can appear in an "emerging trends" intelligent section with a short explanation.
3. **Given** a repeating spike pattern that fixed weekday rules miss (e.g., bi-weekly or pay-day adjacent), **When** intelligent analysis detects repetition, **Then** the item appears in the pattern zone with recurrence noted.
4. **Given** intelligent analysis is unavailable or fails, **When** the dashboard loads, **Then** rule-based sections still work and the user sees a clear degraded-mode notice—not a blank page.
5. **Given** an intelligent signal is shown, **When** the user opens item detail, **Then** they see the supporting metric summary (dates, units, comparison) that justified the signal—no unexplained black-box labels.

---

### User Story 13 - Detect recurring day-of-week or spike patterns (Priority: P2)

From the pattern zone on the super dashboard, the purchasing admin sees items whose movement spikes on specific days, including **recurring** patterns (same weekday elevated in at least two separate weeks) and recent one-off spikes in separate lists or visual layers.

**Why this priority**: Repeatable spikes support campaign timing and inventory; pairs with intelligent engine for non-obvious repeats.

**Independent Test**: For an item with documented Friday spikes over multiple weeks, confirm the pattern zone flags it with dominant day(s) shown on a heatmap or bar chart.

**Acceptance Scenarios**:

1. **Given** at least 28 days of lookback, **When** the pattern zone loads, **Then** items with notable day-of-week concentration appear with dominant day(s) in a visual (heatmap, bar chart, or labeled list with chart).
2. **Given** same-weekday spikes in two or more separate weeks, **When** patterns compute, **Then** the item is marked **recurring**.
3. **Given** a one-day anomaly with no repeat, **When** patterns compute, **Then** it is not promoted as recurring (may appear under recent spikes).
4. **Given** insufficient history, **When** the user opens the pattern zone, **Then** an explanatory empty state suggests minimum range.

---

### User Story 14 - Investigate priority items that are slowing down (Priority: P2)

The slowdown alert zone on the super dashboard highlights **Top Priority** items whose movement dropped meaningfully vs baseline, ranked by severity with red/amber visual urgency. Detail includes recent units, % change, days since peak, and stock-out hints when available.

**Why this priority**: Catching slowdown on priority SKUs prevents revenue leakage; alert styling fits the super dashboard experience.

**Independent Test**: Take a Top Priority SKU with clear sales drop vs prior 30 days; confirm it appears in the slowdown zone with decline magnitude and visual severity.

**Acceptance Scenarios**:

1. **Given** Top Priority items, **When** the slowdown zone loads for last 7 vs prior 7 days, **Then** items with ≥25% unit drop (and meaningful baseline volume) appear ranked by severity with alert styling.
2. **Given** a priority item on the slowdown list, **When** the user opens detail, **Then** they see current rate, baseline rate, percent change, and last peak date.
3. **Given** likely stock-out impact, **When** stock context exists, **Then** detail notes possible stock impact.
4. **Given** Discontinue classification, **When** slowdown lists build, **Then** discontinued items are excluded by default.

---

### User Story 15 - Act on trends with focus lists and period comparison (Priority: P3)

A purchasing lead pins items from any dashboard zone into a **focus list**, compares two periods side-by-side, and exports a summary for the purchasing team.

**Why this priority**: Turns insight into coordinated action after core dashboard and engine are trustworthy.

**Independent Test**: Pin three items, compare two ranges, export summary; confirm SKU set and metrics match.

**Acceptance Scenarios**:

1. **Given** items in any dashboard zone, **When** the user adds them to a focus list, **Then** the list persists for the session or as a saved view.
2. **Given** two selected periods, **When** comparison runs, **Then** each focus item shows side-by-side units and speed.
3. **Given** a completed focus list, **When** the user exports, **Then** output includes SKU, priority, metrics, signal type, and signal source (rule vs intelligent).

---

### Edge Cases

- **Low-volume items**: Minimum volume threshold before fast-mover ranking (default: ≥3 units in period) to avoid noise from single orders.
- **New catalog entries**: Fewer than 7 days of history → "insufficient history" for pattern/slowdown baselines and intelligent engine confidence labels.
- **Returns and cancellations**: Net movement uses fulfilled/net sold units consistent with existing sales reporting.
- **Stock-outs**: Flag rows when stock was zero for a meaningful portion of the period.
- **Duplicate SKUs / bundles**: Attribute sales to sold SKU line, consistent with Cosmo item identity.
- **Discontinued items**: Excluded from default slowdown and new-item panels; searchable when explicit.
- **Tied rankings**: Stable secondary sort (priority tier, then SKU).
- **Intelligent engine timeout or error**: Dashboard falls back to rule-based sections only; error logged for admins; no silent failure.
- **Permission revoked mid-session**: Next refresh or navigation re-checks permission; cached data not shown after denial.
- **Unmapped district**: Orders without resolvable district go to Unmapped bucket; excluded from expansion recommendations until mappable.
- **Cross-district delivery**: Order attributed to one primary district (shipping address district); no double-count across districts.
- **Physical store mapping**: A store may serve multiple districts; expansion logic uses configured store-to-district or proximity rules documented in plan phase—spec requires visible mapping assumptions in detail view.
- **Low-volume districts**: Still appear in “all districts” view with status; not hidden because rank is low.
- **Same item hot in one district, cold in another**: Item × district matrix shows both; national rank does not override district drill-down.
- **Outlet with zero stock reading**: Show as zero; do not treat as transfer source; flag data sync delay if ERP stock stale.
- **ROP window crosses partial month**: Calendar-month boundaries for default 2/3-month windows; custom range uses exact From–To dates inclusive.
- **ROP ×2 with zero sales**: Suggested ROP = 0; decrease recommendation if current ROP > 0.
- **OSF ROP assist vs dashboard ROP**: Dashboard uses multi-month ×2 formula; OSF page may keep purchase-date window (spec 023)—both can coexist; dashboard is recommendation source for supplier admin review.
- **Transfer suggestion not execution**: Dashboard recommends direction only; physical stock transfer remains operational process outside v1 automation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated **Item Trends** super dashboard page separate from the general company Overview and merchant dashboards.
- **FR-002**: Access MUST be restricted to purchasing admins, company admins with bypass, and users granted **`purchasing.item_trends.read`**; all others MUST be denied.
- **FR-003**: Super dashboard MUST present summary KPI cards and multiple chart/visual sections (not table-only) covering movement, new items, slowdowns, patterns, and **district demand**.
- **FR-004**: All dashboard visuals MUST update together when the user changes the selected date range.
- **FR-005**: System MUST rank and filter items using existing product priority classification (Top Priority, Newly Added, Non Priority, Discontinue, etc.).
- **FR-006**: System MUST compute movement speed as units sold per day for the selected range and compare to the immediately preceding equal-length period.
- **FR-007**: System MUST surface a new-items panel for Newly Added products with accelerating vs stalling visual signals.
- **FR-008**: System MUST identify recurring day-of-week spike patterns when the same weekday is elevated in at least two separate weeks within lookback.
- **FR-009**: System MUST maintain a priority-item slowdown alert zone when movement falls meaningfully below baseline (default: ≥25% drop with minimum baseline volume).
- **FR-010**: System MUST include an **intelligent trend engine** capable of detecting emerging trends, non-obvious repeat spikes, and soft slowdowns beyond fixed rules; each intelligent signal MUST show a plain-language reason and supporting metric summary.
- **FR-011**: Every surfaced trend signal MUST indicate whether it was produced by **rule-based** logic or **intelligent analysis**.
- **FR-012**: When intelligent analysis is unavailable, system MUST degrade gracefully to rule-based sections with user-visible notice.
- **FR-013**: System MUST show per-item detail: units, comparison-period units, percent change, priority tier, last peak date, and optional stock-out hint.
- **FR-014**: System MUST apply minimum-volume rules before fast-mover ranking.
- **FR-015**: System MUST exclude Discontinue items from default slowdown and new-item panels unless explicitly included.
- **FR-016**: Users MUST filter by priority tier, date range, signal type, signal source (rule vs intelligent), and **district**.
- **FR-017**: System MUST provide a **district leaderboard** ranking all districts with qualifying demand for the period, including share of total and period-over-period change.
- **FR-018**: System MUST attribute each order to a **customer district** derived from shipping address (Sri Lanka administrative districts); unmapped orders MUST appear in a reconciling Unmapped bucket.
- **FR-019**: System MUST support **district-scoped item trends** (fast movers, new items, slowdowns per district) and an **item × district** view showing relative item strength by area.
- **FR-020**: System MUST provide an **expansion opportunity** panel ranking districts/areas with high demand and weak physical store coverage, with plain-language reasons and supporting metrics.
- **FR-021**: System MUST distinguish **physical store sales** (attributed to company outlet locations) from **delivery/online demand by customer district** when computing expansion opportunities.
- **FR-022**: System MUST provide an **area growth** view listing all districts with data, each with growth status and actionable hints.
- **FR-023**: System MUST provide an **outlet balance** zone comparing the same SKU across outlets with on-hand stock, movement speed, and **transfer candidate** signals (high stock + slow at outlet A, fast movement at outlet B). Default movement speed MUST be **lifetime** (first sale of that SKU at that outlet through today); dashboard From/To MUST be optional for this zone.
- **FR-024**: Transfer candidates MUST show both outlets, stock quantities, speed metrics, and suggested transfer direction; v1 MUST NOT auto-move stock.
- **FR-025**: System MUST compute **suggested next-month ROP = highest calendar-month units in the selected 2- or 3-month sales window × 2**, shown alongside **current saved ROP** and window total. Example: months 4000, 1000, 8000 → suggested ROP = 16000.
- **FR-026**: Default ROP sales window MUST be **last 3 calendar months**; user MUST be able to select **2 months** or a **custom month/date range**.
- **FR-027**: ROP rows MUST include **movement overlay**: increase recommendation when item is accelerating/fast-moving; decrease recommendation when slow-moving—relative to current saved ROP and base formula.
- **FR-028**: Applying ROP changes MUST require explicit user save via existing OSF/item ROP flow (`purchasing.osf.manage`); suggestions MUST NOT silently overwrite saved ROPs.
- **FR-029**: Store/outlet users with permission MUST see outlet-scoped views (outlet balance, local movement); purchasing users MUST see company-wide zones.
- **FR-030**: System MUST support focus lists, period comparison, and export including signal source, **district**, **outlet**, and **ROP suggestion** context when pinned.
- **FR-031**: Trend totals MUST reconcile with existing sales reporting rules (same counting semantics as operational dashboards).

### Key Entities

- **Item trend record**: SKU with priority tier, units in period, daily rate, comparison rate, percent change, and optional sparkline series.
- **Movement signal**: Classified state—fast mover, accelerating, stalling, recurring spike, slowdown, emerging trend—with **source** (rule-based | intelligent analysis) and **reason text**.
- **Pattern annotation**: Day-of-week concentration, recurrence flag, dominant day(s), optional intelligent detection metadata.
- **Dashboard zone**: A visual section (KPI strip, movement leaderboard, new-items panel, slowdown alerts, pattern heatmap, **district leaderboard**, **expansion opportunities**, **area growth map**, emerging trends) composing the super dashboard.
- **District demand profile**: Aggregated units, sales, movement speed, growth rate, and share for a customer district in a period.
- **Item–district strength**: Relative rank or intensity of a SKU’s sales within each district vs company average.
- **Physical coverage**: Which company outlet locations exist and how they relate to districts served (for expansion logic).
- **Expansion opportunity**: A district or area ranked for new physical store potential with score, reasons, top trending SKUs, and nearest existing store context.
- **Area growth status**: Per-district classification (growing, stable, declining, emerging, expansion candidate) with suggested actions.
- **Outlet balance record**: Per SKU × outlet: on-hand stock, movement speed, stock pressure score, and paired transfer candidate (source outlet → destination outlet).
- **Transfer candidate**: Same SKU where source outlet has high stock + slow speed and destination outlet has fast speed; includes suggested direction and supporting metrics.
- **ROP suggestion**: Current saved ROP, peak-month sales, window total, formula result (peak month × 2), movement overlay (increase / hold / decrease), and selected sales window (default 3 months, 2 months, or custom).
- **Intelligent trend engine**: Automated analysis layer (statistical, model, or AI-assisted) that produces signals and explanations when rules are insufficient.
- **Focus list**: User-curated SKU set from dashboard zones with export snapshot.
- **Comparison window**: Current vs baseline date ranges used consistently across dashboard and detail views.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Permitted purchasing admins can open Item Trends and identify the top 20 fast-moving Top Priority items for any 7-day range in under 1 minute using dashboard visuals without exporting data.
- **SC-002**: At least 90% of trend totals for a sample week reconcile within 1% of existing sales reporting for the same SKUs and dates.
- **SC-003**: Unauthorized users are blocked 100% of the time in permission tests (no data leak via API or page).
- **SC-004**: Dashboard presents at least 4 distinct visual zones (KPI cards + ≥3 chart/panel sections) on initial load when data exists.
- **SC-005**: Intelligent engine surfaces at least one additional actionable item per month (vs rule-only mode) in pilot validation—items purchasing confirms they would have missed manually.
- **SC-006**: Newly Added accelerators appear in the new-items panel within one business day of qualifying sales.
- **SC-007**: Top Priority slowdowns (≥25% decline with baseline volume) appear in the alert zone within one refresh cycle.
- **SC-008**: Within 60 days of launch, ≥70% of purchasing admins report the super dashboard reduced manual spreadsheet trend scanning.
- **SC-009**: Users can build and export a 50-item focus list in under 3 minutes.
- **SC-010**: District leaderboard loads all districts with qualifying volume for the range; top district and full list reconcile to company sales totals within 1%.
- **SC-011**: Expansion opportunity panel surfaces at least one high-demand / low-coverage district in pilot validation that leadership confirms was not obvious from store sales alone.
- **SC-012**: District drill-down shows correct top-5 items for a sample district matching manual filter of orders to that district (100% match on test set).
- **SC-013**: Area growth view shows status for 100% of districts that have qualifying order volume in the period.
- **SC-014**: Transfer candidate list correctly identifies sample SKU with high stock/slow at outlet A and fast at outlet B (100% on test pairs).
- **SC-015**: ROP suggestion matches manual calculation (highest month in window × 2) for a sample of 20 SKUs within rounding tolerance.
- **SC-016**: ROP save path requires explicit action—no automated overwrite in permission tests.
- **SC-017**: Store-scoped users see outlet balance for their location(s) without unauthorized company-wide export in access tests.

## Assumptions

- **Users**: Primary audience is **purchasing department** (buyers, supplier admins, purchasing managers) **and store/outlet teams** who need to see how items move across the company. Company admins with bypass retain full access. Merchants and general sales staff are out of scope unless explicitly granted permission.
- **Permission**: **`purchasing.item_trends.read`** for dashboard access; **`purchasing.osf.manage`** to apply ROP suggestions. Outlet-scoped visibility for store users is enforced when role policy limits locations (plan phase defines exact scoping rules).
- **Visual standard**: Super dashboard quality bar matches Rider performance analytics (KPI cards + charts + detail table)—motivating, clean, not a raw data grid.
- **Intelligent engine**: Implementation choice (batch statistical job, lightweight model, or AI agent) is deferred to `/speckit-plan`; spec requires labeled intelligent signals with explanations and graceful fallback. v1 may ship rule-based dashboard first if intelligent engine follows in Phase 2, but both are in scope for the feature.
- **Data source**: Sales from fulfilled order lines in Cosmo OS, aligned with existing dashboard sales semantics.
- **Priority tiers**: Same ERP/Cosmo classification as OSF.
- **Default range**: Last 7 days vs prior 7 days; options for 1, 7, 14, 30, custom.
- **Scope v1 alerts**: In-app dashboard only; push/email digests remain Phase 5.
- **Channels**: Company-wide sales unless filtered; merchant drill-down later.
- **Geography — district**: Customer district resolved from order shipping address using Sri Lanka’s 25 administrative districts (same family of logic as contact allocation and address parsing elsewhere in Cosmo OS). Unmapped addresses roll into an explicit Unmapped bucket.
- **Geography — physical stores**: Company outlet locations (`CompanyLocation` and shop-attributed sales) represent existing physical presence; expansion panel compares delivery demand by district against this coverage.
- **Expansion scoring**: v1 uses rule-based opportunity ranking (demand volume, growth, trending SKU count, physical coverage gap); intelligent engine may enhance regional pattern detection in Phase 2.
- **Cover every area**: Dashboard MUST NOT show only top-N districts; all districts with data appear in the full list or area growth view even when volume is small.
- **Outlets**: Outlet = company shop/location with stock and attributed sales (OSF shop columns / `CompanyLocation`). Stock from live ERP sync; movement from order lines attributed to that outlet where attribution exists.
- **Transfer logic (v1)**: Rule-based—source outlet in bottom movement quartile for SKU with stock above median across outlets; destination in top movement quartile; minimum stock at source and minimum speed gap configurable in plan phase.
- **ROP formula (dashboard)**: **Suggested next-month ROP = highest calendar-month units in the selected window × 2**. Default window = last **3 calendar months**; preset **2 months**; optional custom month range. **Movement overlay**: if item flagged accelerating/fast → **increase** recommendation (prompt to set ROP at or above suggestion); if slowdown → **decrease** recommendation. Complements OSF ROP assist (spec 023 purchase-date window)—dashboard is the multi-month planning view for supplier admin; OSF remains operational save surface.
- **ROP apply**: Review-only on dashboard unless user has manage rights; save goes through existing `ProductOsfRop` / OSF item editor—never silent overwrite.

### Recommended rollout plan (product phases)

| Phase | Deliverable | Value |
|-------|-------------|-------|
| **Phase 1 — Movement + outlets + ROP** | Super dashboard shell, fast/slow/new-item signals, **outlet balance / transfer candidates**, **ROP suggestion panel (×2 formula)**, permission gate | Purchasing + stores see movement, stock imbalance, and ROP hints immediately |
| **Phase 2 — District & expansion** | District leaderboard, expansion opportunities, area growth, item × district matrix | Geographic growth and new-store targeting |
| **Phase 3 — Intelligent engine** | Emerging trends, non-obvious repeats, regional/outlet patterns | Smarter signals rules miss |
| **Phase 4 — Pattern visuals** | Heatmaps, recurring spikes (item, district, outlet scoped) | Timing for promos and stock |
| **Phase 5 — Workflow + alerts** | Focus lists, export, optional digest; optional link to transfer workflow | Team alignment |

**Suggested rhythm after Phase 1**: Mon → Top Priority fast movers + transfer candidates; Wed → ROP review for accelerating/slow SKUs; monthly → district expansion panel; store managers → weekly outlet balance check before reordering.
