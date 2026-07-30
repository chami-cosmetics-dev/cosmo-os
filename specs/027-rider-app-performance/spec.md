# Feature Specification: Rider App Performance & Incentives

**Feature Branch**: `feature/rider-app-performance`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "i want make mobile app more user friendly, now riders are making their incentives by manually by collecting shipping cost of their delivered orders, and also if we can show their performance they can work happiely,i want make better plan"

## Clarifications

### Session 2026-07-30

- Q: Where should the full incentive / performance summary live in the rider app? → A: New dedicated tab or screen (e.g. “My performance”)
- Q: Which date periods can riders pick / how is the pay month defined? → A: Rolling pay month from payday through the day before the next payday (e.g. payday 25th → 25th through 24th next month); D configured by ops/admin
- Q: Can riders open past pay periods? → A: Current pay period + previous one pay period only
- Q: Should the performance summary show failed deliveries? → A: Yes — also show failed-attempt count for the same pay period
- Q: Who sets the payday day-of-month (D)? → A: Ops/admin can set/change it in Cosmo OS settings — **one payday for all companies** (not per-company, not per-rider)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my incentive without manual math (Priority: P1)

A rider opens the mobile app’s dedicated performance area and immediately sees how much incentive they have earned for the **current pay period** (and can still see today’s contribution). The period total matches the sum of shipping costs on deliveries they successfully completed in that pay month—so they no longer keep a paper list or add shipping amounts by hand when preparing for payday.

**Why this priority**: Manual incentive tracking is error-prone, stressful, and the main pain the riders report; fixing visibility is the core of this feature.

**Independent Test**: With payday day-of-month configured, rider completes three deliveries in the current pay period with shipping costs 200, 0, and 350; open the performance tab for the current pay period and confirm total incentive is 550 and completed count is 3.

**Acceptance Scenarios**:

1. **Given** a signed-in rider with completed deliveries in the current pay period, **When** they open the dedicated performance tab/screen, **Then** they see their total incentive and completed-delivery count for that pay period (default view).
2. **Given** a rider completes a delivery whose shipping cost is 400, **When** the completion is recorded, **Then** their incentive total for the current pay period increases by 400 without any manual entry.
3. **Given** a completed delivery has zero or missing shipping cost, **When** the rider views their totals, **Then** that delivery counts toward completed volume but adds 0 incentive.
4. **Given** a delivery failed or was not completed, **When** the rider views their totals, **Then** that delivery does not add incentive or completed-delivery credit.
5. **Given** the configured payday day-of-month is D, **When** the current calendar date is on or after D this month and before D next month, **Then** the current pay period is from D (this month) through the day before D (next month).
---

### User Story 2 - Understand each delivery’s contribution (Priority: P1)

On the completed-deliveries list and/or the performance screen’s detail list, each successful delivery shows the incentive earned for that order (the order’s shipping cost) so the rider can reconcile the **pay-period** total with individual stops.

**Why this priority**: Trust in the total depends on being able to audit line by line; without per-delivery amounts, riders will keep doing mental math.

**Independent Test**: Complete two deliveries in the current pay period with shipping 200 and 350; on the performance detail / completed rows for that period, each shows 200 and 350 and the period total equals 550.

**Acceptance Scenarios**:

1. **Given** a rider views deliveries included in the selected pay period, **When** each completed row is shown, **Then** the incentive for that delivery (shipping cost) is visible next to the order.
2. **Given** shipping cost is zero, **When** the completed row is shown, **Then** incentive is shown as 0 (or equivalent clear “no incentive”) without looking broken.
3. **Given** the rider adds the visible per-delivery incentives for the selected pay period, **When** compared to the period total, **Then** the sums match.

---

### User Story 3 - See my performance at a glance (Priority: P2)

The rider opens a dedicated “My performance” (or equivalently named) tab/screen and sees simple personal performance for the **current pay period** by default: completed deliveries, incentive earned, and **failed-attempt count** for the same period—presented in a friendly, easy-to-read summary so they feel progress toward payday. This is separate from Deliveries, Completed, Cash, and Profile.

**Why this priority**: Motivation and happiness depend on clear progress feedback; this builds on accurate incentive totals from P1 stories.

**Independent Test**: For a rider with 8 completed and 2 failed deliveries in the current pay period, open the dedicated performance tab and confirm the summary shows completed 8, failed 2, and the correct incentive total for the 8 completions.

**Acceptance Scenarios**:

1. **Given** a signed-in rider, **When** they open the dedicated performance tab/screen, **Then** they see at least: completed delivery count, failed-attempt count, and incentive total for the current pay period, plus clear start/end dates for that period.
2. **Given** the rider switches between the current pay period and the previous pay period, **When** the summary refreshes, **Then** completed count, failed count, and incentive update to that period only (no older periods offered in v1).
3. **Given** the rider has no completions and no failures in the pay period, **When** they open the dedicated performance tab/screen, **Then** they see a clear empty/zero state (not an error).
4. **Given** the rider app’s main navigation, **When** the rider looks at available tabs/screens, **Then** a dedicated performance entry is present and distinct from Completed and Profile.
5. **Given** a delivery marked failed (not completed) in the pay period, **When** the rider views performance, **Then** it increments failed-attempt count and does not add incentive.
---

### User Story 4 - Friendlier daily home cues (Priority: P3)

From the rider’s main daily workflow screens, a concise cue (e.g. today’s completed count and today’s incentive) is visible without digging through menus, so performance feels part of the normal day—not only reachable via the dedicated tab.

**Why this priority**: Improves friendliness and habit formation; valuable after the dedicated summary exists.

**Independent Test**: With today’s incentive 550 and 3 completions, open the primary rider home/route screen and confirm those figures appear in a compact summary; tapping it opens the dedicated performance tab (current pay period, with today’s contribution visible in context).

**Acceptance Scenarios**:

1. **Given** the rider is on a primary daily screen (route/deliveries home), **When** they have completions today, **Then** a compact “today” completed count and incentive cue is visible.
2. **Given** the rider taps the cue, **When** navigation occurs, **Then** they land on the dedicated performance tab/screen (defaulting to the current pay period).

---

### Edge Cases

- Order completed then later voided, cancelled, or returned: that order’s incentive MUST be excluded from the rider’s active totals for the pay period (same rule as ops dashboard).
- Offline completion that syncs later: once synced as completed, incentive and counts update; until then the rider sees a clear “pending sync” or stale-data cue rather than a wrong final total presented as final.
- Rider assigned then reassigned: incentive accrues only to the rider who completed the delivery.
- Multiple tenants / companies in one app session: totals reflect only deliveries for the rider’s active context (no mixing other riders’ data).
- Pay period crossing month/year boundaries: totals still cover from payday day-of-month through the day before the next payday (inclusive start, exclusive of next payday).
- Payday day-of-month not yet configured by ops/admin: feature MUST show a clear message that pay-period totals are unavailable until payday is configured (not a silent wrong window).
- Another rider’s data: a rider MUST never see another rider’s incentive or performance.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The rider mobile app MUST provide a dedicated performance tab/screen (distinct from Deliveries, Completed, Cash, and Profile) that shows the signed-in rider their own incentive total for the current pay period by default.
- **FR-002**: Incentive for a completed delivery MUST equal that order’s shipping cost at completion (same business rule as the existing ops rider performance view).
- **FR-003**: Failed, incomplete, voided, cancelled, or returned deliveries MUST NOT contribute incentive to the rider’s totals.
- **FR-004**: The dedicated performance tab/screen MUST show completed-delivery count, failed-attempt count, and incentive total for the same selected pay period, and MUST display the pay period’s start and end dates.
- **FR-005**: Each completed delivery in the rider’s history for the period MUST display the incentive amount for that delivery (on Completed history and/or within the performance screen’s detail list).
- **FR-006**: A pay period MUST run from the configured payday day-of-month D through the calendar day before the next occurrence of D (rolling pay month). Authorized ops/admin users MUST be able to set and change D in Cosmo OS settings as a **single shared value for all companies** (not a different payday per company or per rider). Riders MUST be able to view the **current** pay period and the **immediately previous** pay period only (no deeper history in v1).
- **FR-007**: A rider MUST only ever see their own performance and incentive data—never other riders’.
- **FR-008**: Period totals shown to the rider MUST match the sum of per-delivery incentives listed for that period (within normal currency rounding).
- **FR-009**: Primary daily screens SHOULD surface a compact today cue (completed count + incentive) that navigates to the dedicated performance tab/screen (current pay period).
- **FR-010**: Empty and zero states MUST be clear and non-alarming (e.g. “No completions yet this pay period” rather than a technical error).
- **FR-011**: When completion data may still be syncing, the app MUST not present an outdated total as final without indication that an update is pending.
- **FR-012**: Ops/admin web performance dashboard behavior remains the source of truth for the same incentive rule; rider-facing numbers MUST use the same eligibility rules so ops and rider do not disagree for the same completions.
- **FR-013**: Completions are attributed to a pay period by completion date falling within that pay period’s date window.
- **FR-014**: Failed-attempt count for a pay period MUST include deliveries attributed to the rider that were marked failed (or equivalent non-completed failure outcome) with failure/attempt date in that pay period, and MUST NOT include successful completions.
- **FR-015**: Only users with appropriate ops/admin access MUST be able to change the payday day-of-month setting; riders MUST NOT change D.
- **FR-016**: If payday is not configured, the rider performance tab MUST NOT invent a default pay window that could misstate earnings; it MUST explain that configuration is required.

### Key Entities

- **Rider incentive (personal)**: The signed-in rider’s earned amount for a pay period; sum of shipping costs on eligible completed deliveries attributed to that rider.
- **Delivery incentive line**: Per completed delivery amount equal to that order’s shipping cost, shown on history rows.
- **Rider performance summary (personal)**: Aggregated completed count, failed-attempt count, and incentive total for a rider over a selected pay period, shown on the dedicated performance tab/screen.
- **Pay period**: Rolling month from payday day-of-month D through the day before the next D; performance tab defaults to the current pay period and allows switching to the immediately previous pay period only.
- **Payday day-of-month**: Single shared configurable calendar day number (1–28 recommended for safety across months) set by ops/admin in Cosmo OS; applies to **all companies**; anchors all rider pay periods.
- **Performance tab/screen**: Dedicated rider-app navigation destination for personal incentive and performance (not merged into Completed or Profile).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After completing a delivery with a known shipping cost, the rider sees that amount reflected in their current pay-period incentive total within 30 seconds of a successful sync (or immediately when online).
- **SC-002**: In a controlled test set of at least 10 completed deliveries inside one pay period, the rider’s pay-period incentive total matches the sum of those orders’ shipping costs (eligible only) within 1 currency unit, and matches ops totals for the same rider and same completion set.
- **SC-003**: At least 90% of riders in a pilot can state their current pay-period incentive from the app without writing it down or calculating shipping costs manually.
- **SC-004**: Riders can open the performance summary and understand pay-period completed count, failed count, and incentive (including period dates) in under 10 seconds from the primary daily screen cue.
- **SC-005**: Support/ops tickets about “my incentive doesn’t match what I calculated” drop after rollout for riders using the app (target: no systematic mismatch between rider app and ops for the same rules).
- **SC-006**: Zero incidents of one rider viewing another rider’s incentive or performance during acceptance testing.
- **SC-007**: Given a configured payday D, acceptance tests confirm completions on D count in the new period and completions on the day before next D count in the ending period.
- **SC-008**: An authorized ops/admin can set payday D once in Cosmo OS settings; after save, rider pay-period windows for every company reflect the same D without requiring a mobile app store release.

## Assumptions

- Incentive rule stays aligned with the existing Cosmo OS ops definition: **100% of the order’s shipping cost** on successful completion by the completing rider (no new tiered rates or percentage tables in this feature).
- This feature is **rider-facing visibility and motivation** in the mobile app; it does not replace payroll, cash handover, or settlement workflows already handled elsewhere (e.g. cash tab).
- No public leaderboard or cross-rider ranking in v1 (personal progress only), to keep the experience supportive rather than competitive.
- Full summary lives on a **new dedicated tab/screen**; Completed remains the delivery history list (with per-row incentive) and is not the primary performance home.
- Pay periods are **rolling months** from payday day-of-month D through the day before the next D; D is a **single Cosmo OS setting for all companies** managed by ops/admin (not per-company; not per-rider).
- Riders may switch between **current** and **previous** pay period only in v1 (no full history browser).
- Compact home cue may still show **today’s** completed count and incentive for daily motivation; the dedicated tab defaults to the **current pay period** (what they get paid on).
- Performance summary **includes failed-attempt count** for the selected pay period alongside completed count and incentive.
- Shipping cost already stored on the order remains the source of truth; if shipping is 0, incentive for that order is 0.
- Language and layout stay consistent with the current rider app design system (friendlier cues, not a redesign of the whole app).
- Multi-company / tenant riders see totals for deliveries they completed in contexts they are allowed to access; no cross-rider leakage.
