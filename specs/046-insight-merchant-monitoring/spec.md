# Feature Specification: Insight Merchant Monitoring

**Feature Branch**: `046-insight-merchant-monitoring`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Monitor merchants with their allocated customers on the Customer Insight page. Admins filter by Today, MTD, or custom date range. Per merchant: allocated contact counts, Gold / Platinum / Standard counts, percentage with DOB and email on file, purchase recency buckets (today, 1–30, 31–90, 91–180, 181–365, 365+ days) with tier breakdown, PDF export. Date filter affects purchase metrics. When contacts are assigned to a merchant for calling, surface empty DOB and email so the merchant can fill them during contact."

## Clarifications

_None yet — defaults documented in Assumptions._

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant portfolio snapshot (Priority: P1)

An admin opens Customer Insight and sees a **Merchant monitoring** view listing every merchant (or merchant bucket) with allocated contacts. For each row the system shows: total allocated contacts, Gold count, Platinum count, Standard (other) count, percentage with date of birth on file, and percentage with email on file.

**Why this priority**: Admins need a single screen to compare merchant portfolios before drilling into call queues or individual contacts.

**Independent Test**: Load the monitoring table with no merchant filter → each merchant row shows correct allocated total and tier counts that match manual spot-checks against Contact Master allocations.

**Acceptance Scenarios**:

1. **Given** an admin with company-wide Insight admin access, **When** they open the Merchant monitoring section on Customer Insight, **Then** they see one row per merchant with allocated contacts plus an unallocated summary row.
2. **Given** allocated contacts with mixed loyalty tiers, **When** the table loads, **Then** Gold, Platinum, and Standard counts sum to the allocated total for that merchant (each contact counted once using the effective loyalty tier).
3. **Given** allocated contacts where some lack birth month/day or email, **When** the table loads, **Then** DOB completion % and email completion % reflect the share with those fields filled (rounded to whole percent, with raw counts available on hover or in export).
4. **Given** a merchant with zero allocations, **When** the table loads, **Then** that merchant does not appear as a data row (or appears with zero counts per existing allocation-summary conventions).

---

### User Story 2 - Period filter for purchase activity (Priority: P1)

Admins choose **Today**, **MTD**, or a **custom date range**. Purchase-related metrics update to match the selected period. Portfolio snapshot counts (allocation total, tier mix, DOB/email completion) remain the current state of all allocated contacts; purchase recency buckets and “purchased in period” counts respect the period.

**Why this priority**: Operations review daily and month-to-date purchase engagement; the period control is the main lens for activity metrics.

**Independent Test**: Switch between Today and MTD → purchase recency bucket totals change while allocated contact totals stay the same.

**Acceptance Scenarios**:

1. **Given** the admin selects **Today**, **When** purchase metrics load, **Then** the period label shows today’s calendar date and recency buckets are calculated as-of that date.
2. **Given** the admin selects **MTD**, **When** purchase metrics load, **Then** the period runs from the first day of the current calendar month through today (inclusive).
3. **Given** the admin selects a custom **from** and **to** date, **When** purchase metrics load, **Then** results use that inclusive range; invalid ranges (end before start) show a validation message and do not load misleading data.
4. **Given** any period preset, **When** the admin changes the period, **Then** purchase recency and purchased-in-period figures refresh; allocated totals and tier/profile completion percentages do not change solely because the period changed.

---

### User Story 3 - Purchase recency buckets with tier breakdown (Priority: P1)

For each merchant (and a company total), the system shows how many **allocated** contacts last purchased from the company in each recency bucket: **Today**, **1–30 days**, **31–90 days**, **91–180 days**, **181–365 days**, and **More than 365 days** (no purchase on record counts in a separate **Never purchased** bucket). Within each bucket, counts split by Gold, Platinum, and Standard.

**Why this priority**: Merchants and admins prioritize outreach by how recently customers bought; tier splits show where Gold/Platinum reactivation effort should go.

**Independent Test**: Pick one merchant with known last-purchase dates → each contact appears in exactly one bucket with the correct tier label.

**Acceptance Scenarios**:

1. **Given** an allocated contact whose last purchase was today (as-of period end), **When** recency buckets load, **Then** they appear in the **Today** bucket with the correct tier.
2. **Given** an allocated contact whose last purchase was 45 days before the period end, **When** buckets load, **Then** they appear in **31–90 days**.
3. **Given** an allocated contact with no purchase history, **When** buckets load, **Then** they appear in **Never purchased**, not in a day-range bucket.
4. **Given** any bucket, **When** an admin reads the row, **Then** Gold + Platinum + Standard counts equal the bucket total.
5. **Given** the admin changes the period end (e.g. custom range), **When** buckets reload, **Then** day ranges are measured backward from the period end date, not always from “now” if a historical end date is chosen.

---

### User Story 4 - Filter by merchant and drill to contacts (Priority: P2)

Admins can filter the monitoring view to one merchant or view all. Selecting a merchant narrows purchase buckets and optional contact lists to that merchant’s allocations. Clicking a metric (e.g. “Gold in 1–30 days”) opens the existing Insight filter or call-queue flow pre-scoped to those contacts.

**Why this priority**: Monitoring is actionable only if admins can reach the contacts behind a number.

**Independent Test**: Filter to merchant A → only merchant A’s counts appear; click a bucket cell → Insight filtered list shows the same contacts.

**Acceptance Scenarios**:

1. **Given** multiple merchants with allocations, **When** the admin picks one merchant in the filter, **Then** all metrics and buckets show only that merchant’s allocated contacts.
2. **Given** a bucket or tier cell is clickable, **When** the admin activates it, **Then** they land on a pre-filtered contact list (existing Insight filter or call-queue assign panel) matching that merchant and recency/tier selection.
3. **Given** the admin clears the merchant filter, **When** the view reloads, **Then** company-wide totals and all merchant rows return.

---

### User Story 5 - PDF export (Priority: P2)

Admins export the current monitoring view (selected period, merchant filter, portfolio table, and recency bucket matrix) as a **PDF** suitable for sharing in meetings or archiving.

**Why this priority**: Leadership reviews merchant performance offline; CSV alone is insufficient for formatted reports.

**Independent Test**: Export with MTD selected → PDF header shows MTD label and date range; table values match on-screen numbers.

**Acceptance Scenarios**:

1. **Given** the monitoring table is loaded, **When** the admin clicks **Export PDF**, **Then** a PDF downloads containing the period label, generation timestamp, merchant rows, portfolio metrics, and recency bucket matrix matching the current filters.
2. **Given** a single-merchant filter is active, **When** PDF exports, **Then** only that merchant’s section is included (or the PDF clearly labels the scoped merchant).
3. **Given** export is in progress, **When** the admin triggers another action, **Then** buttons show loading state and duplicate exports are prevented until the first completes or fails.
4. **Given** export fails, **When** the error occurs, **Then** the admin sees a clear error toast and can retry.

---

### User Story 6 - Surface missing DOB and email when contacting assigned contacts (Priority: P2)

When a merchant (or admin acting for them) opens an allocated contact from the call queue or monitoring drill-down, missing **date of birth** and **email** are highlighted before or during the contact flow so the merchant can fill them while on the call. Existing profile edit rules apply (allocated merchant and admins may edit).

**Why this priority**: Monitoring shows low DOB/email completion; the contact workflow is where those gaps get closed.

**Independent Test**: Open a queued contact missing email → banner or inline prompt lists “Email” and “Birth date” as empty; save after fill → monitoring DOB/email % increases on next refresh.

**Acceptance Scenarios**:

1. **Given** an allocated contact missing email or birth month/day, **When** a merchant opens them from the assign call queue, **Then** empty fields are visibly flagged with a short prompt to collect them on the call.
2. **Given** the merchant fills email and birth month/day and saves, **When** profile save succeeds, **Then** the contact no longer shows those fields as missing in the contact view.
3. **Given** a non-allocated merchant views the same contact via phone search, **When** the limited insight view loads, **Then** the full profile edit and missing-field prompts for allocation follow existing visibility rules (no new access granted).
4. **Given** all profile fields required for loyalty are complete, **When** the contact opens, **Then** no missing-field banner appears.

---

### Edge Cases

- Merchant with only legacy display-name allocation (no MER code) still rolls up via existing alias resolution.
- Contact changes allocated merchant mid-period → counted under current allocation for portfolio snapshot; purchase history follows the contact.
- Period end in the future → treat as invalid or clamp to today (consistent with Merchant Dashboard).
- Company with no allocated contacts → empty state with guidance, not a broken table.
- Very large merchant (10k+ contacts) → monitoring load remains responsive (target: initial table within a few seconds for typical company size; exact performance validated in planning).
- Tier ties (assigned Platinum but spend says Standard) → effective tier rules match existing Customer Insight loyalty display.
- Export while data is stale → PDF uses the same snapshot as the last successful load, or re-fetches before export.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a **Merchant monitoring** section on the Customer Insight page for users with company-wide Insight admin view permission.
- **FR-002**: System MUST list each merchant with allocated contacts showing: allocated total, Gold count, Platinum count, Standard count, DOB completion percentage, and email completion percentage.
- **FR-003**: System MUST compute tier counts using the same effective loyalty tier rules as Customer Insight (assigned tier overrides spend-based tier).
- **FR-004**: DOB completion MUST require both birth month and birth day on file; email completion MUST require a non-empty primary email.
- **FR-005**: System MUST offer period presets **Today**, **MTD**, and **custom date range** (inclusive), matching the interaction pattern of the Merchant Dashboard period controls.
- **FR-006**: Purchase recency buckets MUST include: Today, 1–30 days, 31–90 days, 91–180 days, 181–365 days, More than 365 days, and Never purchased, measured from the period end date backward.
- **FR-007**: Each recency bucket MUST include Gold, Platinum, and Standard sub-counts that sum to the bucket total.
- **FR-008**: Changing the period MUST update purchase recency buckets and any purchased-in-period counts; portfolio allocation and tier/profile completion figures MUST reflect current allocated contacts regardless of period unless explicitly filtered by merchant only.
- **FR-009**: System MUST allow filtering the view to a single merchant or all merchants.
- **FR-010**: System MUST support **Export PDF** of the current monitoring view with period and filter context in the document header.
- **FR-011**: System MUST retain existing CSV export for allocation summary counts (or include those columns in the new export) without removing admin CSV access.
- **FR-012**: Clicking a monitoring metric MUST deep-link into existing Insight filter or call-queue flows with merchant, and where applicable recency or tier, pre-applied.
- **FR-013**: When an allocated contact is opened from call queue assignment, system MUST highlight missing email and missing birth date (month and day) using the same completeness rules as loyalty profile completion.
- **FR-014**: Profile edits from the contact flow MUST persist through the existing Customer Insight profile update path and affect future monitoring percentages.
- **FR-015**: Unauthorized users MUST NOT see merchant monitoring metrics for merchants or contacts outside their permission scope.

### Key Entities

- **Merchant monitoring row**: Per-merchant rollup — merchant identity, allocated contact count, tier counts, DOB %, email %, optional purchased-in-period count.
- **Recency bucket**: Time-since-last-purchase band with tier sub-counts, scoped to allocated contacts for a merchant or company-wide.
- **Period selection**: Preset (Today / MTD) or custom from/to dates defining the period end and label for purchase metrics and export.
- **Allocated contact**: Contact Master record with `assignedMerchant` set, tied to a merchant via MER code or resolved alias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admins can open merchant monitoring and see portfolio + recency data for all merchants in one view without exporting to spreadsheets first.
- **SC-002**: For a sample of 20 contacts per merchant, tier and recency bucket assignments match manual calculation with 100% accuracy.
- **SC-003**: Switching period preset (Today ↔ MTD) updates purchase bucket totals within one interaction; allocated totals unchanged.
- **SC-004**: PDF export completes in under 30 seconds for companies with up to 50 merchants and 50,000 allocated contacts.
- **SC-005**: After merchants fill missing DOB/email on queued contacts, company-wide DOB/email completion percentages increase on the next monitoring refresh.
- **SC-006**: 90% of admin users in UAT can find a merchant’s stale 91–180 day Gold contacts and open the pre-filtered list in under 2 minutes without training.

## Assumptions

- **Audience**: Company admins with existing Insight admin view (`hasInsightAdminView` / equivalent), not individual shop merchants, for the monitoring table; merchants benefit from Story 6 on their own allocated contacts only.
- **Placement**: Merchant monitoring extends the current Customer Insight **Admin** tab (alongside allocation summary and call-queue assign), not a separate route.
- **Tier labels**: “Gold”, “Platinum”, and “Standard” (other) match existing Customer Insight loyalty naming and thresholds.
- **Last purchase date**: Uses the same last-purchase field / logic as Customer Insight filters and call queue (`lastPurchaseAt` or equivalent consolidated purchase history).
- **Portfolio vs activity**: Allocation totals, tier mix, and DOB/email % are **current-state** metrics for all allocated contacts; only purchase recency and purchased-in-period metrics react to the date filter. If product owners prefer tier counts scoped to “purchased in period,” that is a follow-up clarification.
- **PDF format**: Landscape table layout with company name, period, and generation date in the header; detailed visual design deferred to planning.
- **Performance**: Initial implementation may paginate or lazy-load recency detail per merchant if company-wide matrix is too heavy; MVP must show company totals and per-merchant portfolio rows without timeout.
- **Dependencies**: Reuses existing merchant alias resolution (`allocation-summary`), loyalty tier classification, profile completeness helpers, Merchant Dashboard period UX, and Insight call queue — no new contact allocation model.
