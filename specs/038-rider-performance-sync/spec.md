# Feature Specification: Rider Performance Sync & Analytics

**Feature Branch**: `038-rider-performance-sync`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "we have two delivery complete mechanisum by rider app also via link, bith data should update cosmo os rider performance, also riders page, also rider performance page should update with attractive UI with graphs and charts to analyis performance for admins and permited users, Shipping Rule New.xlsx is how riders get payments for their delivery, want calculate it in rider performance side also then permited users can see it, also rider can see it in their app we implemented that before, also i want update rider performnce and rider pages cuz at now order completion and other functions rider do not update this pages i assume"

## Clarifications

### Session 2026-08-11

- Q: Shipping rule import mode → A: Upsert by label (update/add from file; keep labels missing from the file)
- Q: Link complete when no rider task → A: Complete order only — no rider credit if there is no assigned rider task
- Q: Blank Delivery Charges for riders in Excel → A: Keeping empty is OK — riders only serve locations with a rider charge; blank means not a rider location. On import, skip blank rider-charge rows (do not overwrite existing Cosmo values with empty).
- Q: How admins see unmatched labels → A: Summary unmatched count + row marker/badge on affected deliveries/riders
- Q: Riders page open tasks older than today → A: Open tasks always visible (any day); Completed/Failed respect the date filter

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Completions update rider ops & performance (Priority: P1)

When a rider marks a delivery complete in the mobile app **or** a customer/rider confirms delivery via the delivery link, Cosmo OS immediately reflects that completion on the **Riders** operations page and the **Rider performance** page for permitted staff (correct rider, correct day, completed count increases).

**Why this priority**: Admins currently cannot trust these pages for live operations and pay; both completion channels must feed the same source of truth.

**Independent Test**: Complete one order via app and one via link for a known rider on today’s date; refresh Riders + Rider performance and confirm both completions appear under that rider with accurate completed counts.

**Acceptance Scenarios**:

1. **Given** a dispatched order assigned to rider R with an active delivery task, **When** R completes it in the rider app, **Then** within one refresh the Riders page shows +1 Completed for R for the completion day and Rider performance includes that delivery in R’s completed count for that date range.
2. **Given** a dispatched order with a valid delivery confirmation link, **When** delivery is confirmed via the link, **Then** the same Riders and Rider performance updates occur as if completed in the app (same rider attribution, same completed day).
3. **Given** completions exist from both channels on the same day, **When** an admin opens Rider performance for that day, **Then** both channels are counted once each (no double-count, no missing channel).

---

### User Story 2 - Rider pay from shipping rules (Priority: P1)

Permitted users see each rider’s **delivery pay / incentive** calculated from the business shipping-rule sheet (label → rider delivery charge), not from customer shipping amount alone. Riders continue to see their own pay breakdown in the rider app performance view that already exists.

**Why this priority**: Incentive currently shows `0.00` for completed deliveries; pay must match the official shipping-rule rider charges.

**Independent Test**: After rules from *Shipping Rule New.xlsx* are loaded, complete (or use an existing completed) order whose shipping rule label matches a sheet row; Rider performance and rider-app performance show the sheet’s **Delivery Charges for riders** amount for that delivery.

**Acceptance Scenarios**:

1. **Given** shipping rules include label “Colombo 1” with rider charge 300, **When** a completed delivery resolves to that label, **Then** incentive for that delivery is 300 (not the customer shipping amount if different).
2. **Given** a label where customer shipping amount and rider charge differ (e.g. Angulana 400 vs 300), **When** incentive is calculated, **Then** the rider charge (300) is used.
3. **Given** a completed delivery whose shipping label cannot be matched to any rule, **When** performance is shown, **Then** that delivery still counts as completed but contributes **0** incentive, the page shows an **unmatched** summary count, and affected rows/riders are marked so admins can fix rules/labels.
4. **Given** a rider with completed eligible deliveries in a pay period, **When** they open performance in the rider app, **Then** they see the same per-delivery and period totals as the admin view for that rider/period (same rules).

---

### User Story 3 - Admin analytics UI on Rider performance (Priority: P2)

Permitted staff open Rider performance and see an attractive analytics view: summary metrics plus charts/graphs (not only a flat table) so they can compare riders and trends over the selected date range.

**Why this priority**: Admins need analysis, not just raw rows; builds on correct data from P1.

**Independent Test**: Open Rider performance for a multi-day range with known completions; verify summary cards and at least two charts update when the date range changes, and the detail table remains available.

**Acceptance Scenarios**:

1. **Given** permitted user access, **When** they open Rider performance, **Then** they see date filters, summary KPIs (e.g. total completions, total incentive, active riders with completions), charts, and a rider detail table.
2. **Given** a date range with data, **When** they change From/To and refresh, **Then** KPIs, charts, and table all reflect the new range (Asia/Colombo calendar days).
3. **Given** a user without permission, **When** they try to open Rider performance or Riders ops analytics, **Then** they are denied the same way other staff pages are.

---

### User Story 4 - Riders page shows live activity correctly (Priority: P2)

On the Riders page, selecting a rider shows up-to-date totals (Total / Assigned / In progress / Completed / Failed) and payment collection breakdowns that stay consistent with completions and payment actions riders perform.

**Why this priority**: Screenshot shows Completed 0 while riders have active work; page must track real task state.

**Independent Test**: Select a rider with known assigned and completed tasks for today; confirm stat cards match those tasks; complete one more delivery and refresh to see Completed increase and Assigned/In progress decrease appropriately.

**Acceptance Scenarios**:

1. **Given** rider R has open tasks from yesterday and completed tasks today, **When** admin selects R with today’s date filter, **Then** Assigned/In progress include yesterday’s open tasks and Completed reflects today’s completions only.
2. **Given** R collected cash/bank/card on deliveries, **When** admin views location totals for R, **Then** non-zero collection amounts appear where payments were recorded (not stuck at Rs. 0.00 when payments exist).

---

### Edge Cases

- Delivery confirmed via link when the rider task is missing or already completed/failed: if already completed/failed, treat as already-done (no double count); if **no rider task exists**, still mark the order delivery-complete but **do not** attribute a rider completion/incentive on Riders or Rider performance.
- Completion day near midnight Asia/Colombo (counts on the correct local calendar day).
- Voided / cancelled / refunded orders: still listed as operational completions only if business rules say so; **incentive** excludes them (same eligibility as today’s performance rules).
- Shipping rule label present on order but blank or zero rider charge in the sheet → not a normal rider location; incentive 0, completion still counted if a rider task was completed.
- Rider user id changed / recreated: new completions attach to the current rider identity; historical remapping of past users is **out of scope** for this feature.
- Large rule set (~3k labels): admins can still load/update rules and performance remains usable for a typical day/week range.
- Riders page date filter applies to Completed/Failed; open Assigned/In progress tasks from earlier days remain visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST treat rider-app delivery complete and link-based delivery confirm as equivalent completion events for rider task status, order delivery-complete state, and admin rider analytics.
- **FR-002**: System MUST attribute each completion to the correct assigned rider so Riders and Rider performance pages update for that rider. Attribution MUST come from the rider delivery task; if link completion occurs with **no** rider task, the order MAY become delivery-complete without creating rider performance credit.
- **FR-003**: Riders page MUST derive Assigned / In progress / Completed / Failed counts from the rider’s delivery tasks. **Assigned** and **In progress** MUST include outstanding open tasks regardless of assign day (so prior-day undelivered work remains visible). **Completed** and **Failed** MUST respect the selected Asia/Colombo date scope (default: today).
- **FR-004**: Rider performance MUST list riders who have eligible completed deliveries in the selected Asia/Colombo date range, with completed count and incentive total.
- **FR-005**: Incentive MUST be calculated from the shipping-rule **rider delivery charge** matched by shipping rule label (per *Shipping Rule New.xlsx* semantics), not by blindly using customer shipping amount when the two differ.
- **FR-006**: Permitted users MUST be able to load/update the shipping-rule rider charges that drive incentive calculation (import or equivalent admin update aligned to the sheet columns: Shipping Rule Label + Delivery Charges for riders). Import MUST **upsert by shipping rule label**: update matching labels, add new labels, and **keep** existing labels that are not present in the uploaded file (no full wipe on import). Rows with a **blank** Delivery Charges for riders value MUST be **skipped** on import (intentional: those locations are outside normal rider coverage).
- **FR-007**: Rider app performance MUST continue to show the rider’s own completed count and incentive using the same calculation rules as admin Rider performance.
- **FR-008**: Rider performance UI MUST provide analytics visuals (summary KPIs + charts/graphs) suitable for comparing riders and trends over the selected range, in addition to a readable detail table.
- **FR-009**: Date filters on Rider performance and Riders MUST use Asia/Colombo calendar days so “today” matches Sri Lanka operations.
- **FR-010**: Access to Riders and Rider performance analytics MUST remain limited to users with existing staff/rider-management read permissions (no new public exposure).
- **FR-011**: System MUST avoid double-counting a single delivery if both app and link completion are attempted; second completion is a no-op or clear already-complete outcome.
- **FR-012**: Unmatched shipping labels MUST not hide the completion from counts; they MUST contribute 0 incentive. Rider performance MUST surface an unmatched summary count and a clear marker on affected rows or rider summaries for the selected range.
- **FR-013**: Link-based confirmation without an assigned rider delivery task MUST NOT invent rider performance credit; it MUST only advance order delivery-complete state.

### Key Entities

- **Rider delivery task**: Per-order assignment to a rider; statuses include assigned, in progress, completed, failed; completion timestamp drives performance day.
- **Delivery completion event**: App or link confirmation that marks the task completed and the order delivery-complete.
- **Shipping rule rider charge**: Mapping from shipping rule label → amount paid to the rider for that delivery.
- **Rider performance summary**: Per-rider aggregates (completions, incentive) for a date range, plus series used for charts.
- **Delivery payment collection**: Cash/bank/card amounts collected on deliveries, shown on Riders location totals when present.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After either app or link completion, an admin refresh shows the delivery in that rider’s Completed count for the correct Colombo day within 30 seconds (no manual data repair).
- **SC-002**: For a sample of 20 completed deliveries with known matching labels from the shipping sheet, admin incentive totals match sheet rider charges with 100% agreement.
- **SC-003**: For labels where sheet customer shipping ≠ rider charge, calculated incentive equals the rider-charge column in at least 10 spot-checked cases.
- **SC-004**: Permitted users can answer “who completed most deliveries” and “who earned most incentive” for a selected range using the new charts without exporting to a spreadsheet.
- **SC-005**: On a rider with both assigned and completed work today, Riders page Completed is greater than 0 when completed tasks exist (no false all-zero Completed card).
- **SC-006**: Rider app performance totals for a given period match admin totals for the same rider and period within rounding to 2 decimal places.

## Assumptions

- *Shipping Rule New.xlsx* (sheet “Final (2)”) is the business source of truth for rider delivery pay: use **Shipping Rule Label** + **Delivery Charges for riders**; **Shipping Amount** is customer/shipping side and may differ.
- Shipping-rule imports are upsert-by-label (not full replace); labels omitted from a file remain until explicitly changed in a later upload or removed by a separate admin action outside this feature’s default import.
- Blank/missing rider charges in the sheet are intentional for non-rider (islandwide / out-of-coverage) labels; import skips those rows. If a completed delivery somehow uses such a label, incentive is 0.
- Existing admin permission for staff/riders read continues to gate these pages; no new anonymous analytics.
- Historical repair of completions lost to past user-id recreations is out of scope (separate recovery if needed).
- Chart set for v1: at minimum (1) completions by rider for the range, (2) incentive by rider for the range, and (3) daily trend of completions and/or incentive across the selected range; table remains for exact numbers.
- Existing rider-app performance tab remains the rider-facing surface; this feature fixes parity and rules accuracy rather than inventing a second rider UI.
- Voided/cancelled/refunded orders stay excluded from **incentive** totals consistent with current performance eligibility rules; completion visibility on Riders ops may still show task status for operations.
