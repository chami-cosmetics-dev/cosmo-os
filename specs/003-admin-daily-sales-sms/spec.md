# Feature Specification: Admin Daily Sales SMS

**Feature Branch**: `003-admin-daily-sales-sms`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Hi All, Day (2026-06-30) Value: 1,970,256 Count: 198 --- MTD Sales: 43,287,867 MTD Sales (Location Wise): WEB, OGF, CTW, HO, STW, CP, PTW, KBG, MHG ... we have to send this kind of SMS to our admins phone numbers i dont have phone numbers yet till we have to build function for this case"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Daily sales SMS body matches the agreed report format (Priority: P1)

An operations/admin recipient receives (or can preview) a daily sales SMS that looks like the company report: day label with date, that day’s total value and order count, month-to-date (MTD) sales total, then MTD sales broken down by location short code (e.g. WEB, OGF, CTW, HO, STW, CP, PTW, KBG, MHG).

**Why this priority**: Matching the existing report format is the core product value; wrong numbers or layout make the SMS useless for leadership.

**Independent Test**: For a known business day with known totals, generate the SMS text (without needing real phones) and compare day value, count, MTD total, and each location line to the expected report.

**Acceptance Scenarios**:

1. **Given** a completed business day with known sales, **When** the daily sales message is generated for that day, **Then** the body includes Day (YYYY-MM-DD), Value, Count, MTD Sales, and MTD Sales (Location Wise) lines in the same structure as the sample report.
2. **Given** multiple company locations with sales in the month, **When** the message is generated, **Then** each location with MTD sales appears with its short code and amount; locations with zero MTD may be omitted or shown as zero consistently (see Assumptions).
3. **Given** amounts and counts, **When** the message is formatted, **Then** numbers use readable thousand separators (e.g. 1,970,256) consistent with the sample style.

---

### User Story 2 - Configure admin recipient phone numbers before go-live (Priority: P1)

Authorized settings users can maintain the list of admin phone numbers that should receive the daily sales SMS. At least one number is already known for go-live (**0766713205**); more may be added later. The list must remain editable (add/remove) without code changes.

**Why this priority**: Recipients drive delivery; the known number must be configurable in product settings, not hard-coded only in chat.

**Independent Test**: Confirm **0766713205** is (or can be) saved as a recipient; add a second number; remove one; confirm the active list drives sends and preview/test still works.

**Acceptance Scenarios**:

1. **Given** an authorized admin, **When** they add, edit, or remove recipient phone numbers for daily sales SMS, **Then** the saved list is what future sends use.
2. **Given** recipient **0766713205** is configured (and optionally others), **When** a send is triggered for a day, **Then** each configured number receives the same sales SMS body (or a clear per-number failure is recorded if delivery fails).
3. **Given** the recipient list is empty, **When** the scheduled daily send runs, **Then** no blast is attempted; the system records that send was skipped due to empty recipients (preview still available).

---

### User Story 3 - Automatic daily send for the previous Sri Lanka business day (Priority: P2)

Once recipients exist, the company receives the previous calendar day’s sales SMS automatically each morning (Sri Lanka time), without someone manually compiling the report.

**Why this priority**: Automation is the operational goal after format + recipients work; manual/test send can cover MVP if needed.

**Independent Test**: After configuring recipients, run or simulate the daily job for a fixed “as of” day and confirm the correct previous day is used and recipients get one message for that day (no duplicate for the same day unless explicitly re-sent).

**Acceptance Scenarios**:

1. **Given** recipients are configured and the daily job runs on morning of 2026-07-01 (Asia/Colombo), **When** the job executes, **Then** the SMS is for Day (2026-06-30) with that day’s value/count and MTD as of that day.
2. **Given** the job already successfully sent for a given day, **When** it runs again the same day without an explicit resend, **Then** it does not spam duplicate daily messages for that same day.
3. **Given** an authorized user, **When** they trigger a one-off test/preview send for a chosen day, **Then** they can verify the message before relying on the schedule.

---

### User Story 4 - Failed SMS visible on OGF logs with manual resend (Priority: P1)

Operators already review nightly OGF **email** history at `/dashboard/ogf-logs`. When a daily sales **SMS** fails (or needs a manual send), that attempt must appear on the same page so staff can see the error and **Resend** manually — same operational habit as OGF email resend.

**Why this priority**: Without a failure surface, silent SMS misses are as bad as silent email misses; reusing the known OGF logs screen avoids a second hidden place to check.

**Independent Test**: Force a failed send (bad gateway or bad number) → row appears on OGF logs with failed status and error; click Resend → new attempt logged as manual; success updates status or adds a sent row.

**Acceptance Scenarios**:

1. **Given** a daily sales SMS send fails, **When** an authorized user opens `/dashboard/ogf-logs`, **Then** they see a Daily Sales SMS log section (alongside existing OGF email history) including report date, recipients, status, error, and source (cron/manual).
2. **Given** a failed (or prior) daily sales SMS log row, **When** the user clicks Resend, **Then** the system regenerates/sends that report day’s SMS to configured recipients and records a manual attempt.
3. **Given** only successful OGF emails and no SMS attempts yet, **When** the page loads, **Then** OGF email history still works unchanged; SMS section shows empty state.

---

### Edge Cases

- No orders that day: Value 0, Count 0; still include MTD and location breakdown for the month to date.
- Empty recipient list: skip live send; keep compose/preview available.
- Invalid phone number in the list: skip or fail that number with a visible/logged error; do not block other valid numbers.
- Cancelled/voided orders: excluded from day and MTD totals (see Assumptions).
- Location without a short code: use a stable display label so the SMS remains readable.
- SMS length limits: if the location list is long, prefer a complete report that still fits practical SMS/concatenated SMS limits, or a documented truncation policy that keeps day + MTD total intact.
- Month boundary: on the 1st, MTD equals that day’s sales only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute daily sales Value (sum of order amounts) and Count (number of orders) for a selected calendar day in Asia/Colombo.
- **FR-002**: System MUST compute MTD sales as the sum of qualifying order amounts from the 1st of that month through the selected day (inclusive), Asia/Colombo.
- **FR-003**: System MUST compute MTD sales per company location and present each line with a short location code and amount in the style `CODE->: amount`.
- **FR-004**: System MUST assemble an SMS body that includes Day (date), Value, Count, separator, MTD Sales, and MTD Sales (Location Wise) sections matching the sample report structure.
- **FR-005**: Authorized users MUST be able to maintain a list of admin phone numbers that receive this SMS (add/remove/update). Initial known recipient: **0766713205** (Sri Lanka mobile); normalize to the same format used by the company SMS gateway when sending.
- **FR-006**: System MUST send the daily sales SMS to all configured recipients when a send is triggered and the recipient list is non-empty.
- **FR-007**: System MUST skip live recipient sends when no numbers are configured, without failing the product in an unclear way.
- **FR-008**: System MUST support generating the message for a chosen day for preview/test before phones are fully provisioned.
- **FR-009**: System MUST schedule or otherwise automate one daily send for the previous Asia/Colombo calendar day once recipients are configured (exact clock time configurable or documented default).
- **FR-010**: System MUST avoid duplicate automatic sends for the same company and same report day under normal re-runs.
- **FR-011**: Day/MTD totals MUST exclude voided/cancelled orders so cancelled orders do not inflate sales SMS figures.
- **FR-012**: The feature MUST be usable for the Cosmetics (Cosmo OS) tenant first; Vault OS may reuse the same capability later with its own recipients and locations.
- **FR-013**: Failed (and recent) daily sales SMS send attempts MUST appear on the existing OGF logs page (`/dashboard/ogf-logs`) in a dedicated Daily Sales SMS section, without removing OGF email history.
- **FR-014**: Authorized users MUST be able to manually Resend a daily sales SMS for a logged report day from that page (same operational pattern as OGF email Resend).
- **FR-015**: Manual resend MUST write a new log entry with source `manual` and status `sent` or `failed` (with error text on failure).

### Key Entities

- **Daily sales report (logical)**: Report day, day value, day count, MTD total, per-location MTD rows, generated message body, generation timestamp.
- **Admin SMS recipient**: Phone number intended for daily sales alerts; belongs to a company/tenant configuration.
- **Send attempt**: Record of whether a report day was sent, skipped (no recipients), or failed (for audit / de-duplication) — **same records power the OGF logs SMS section**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a sample day with known sales, generated Value, Count, MTD total, and each location MTD line match the business report within rounding tolerance of 1 currency unit.
- **SC-002**: An authorized user can add or remove an admin recipient phone number in under 2 minutes without developer help.
- **SC-003**: With recipients configured, the previous day’s SMS is delivered (or a clear delivery failure is recorded) within 15 minutes of the scheduled daily run.
- **SC-004**: With zero recipients configured, automatic send completes as a deliberate skip (no erroneous blast) 100% of the time in testing.
- **SC-005**: Operators can produce a preview of the SMS for any past day in under 1 minute for verification before go-live.
- **SC-006**: After a forced SMS failure, an operator finds the failed row on `/dashboard/ogf-logs` and completes a manual Resend in under 2 minutes without developer help.

## Assumptions

- Primary rollout is **Cosmo OS** (location short codes in the sample match Cosmetics locations); Vault can adopt the same pattern later with separate recipient settings.
- “Sales” for this SMS means **order total amount for orders created on that calendar day** (Asia/Colombo), excluding voided/cancelled orders; MTD uses the same rule from month start through the report day. If leadership later defines sales as delivered or invoice-complete only, the definition can be changed in one place.
- Location short codes (WEB, OGF, CTW, etc.) come from each location’s configured code/name abbreviation already used operationally; if missing, a truncated location name is used.
- Currency is LKR; amounts are shown as whole numbers with thousand separators (no currency symbol required in SMS, matching the sample).
- Zero-MTD locations are omitted from the location-wise list to keep SMS shorter (non-zero locations only), unless stakeholders later request all locations.
- Existing company SMS gateway / SMS portal settings are reused for delivery; this feature does not invent a new SMS vendor.
- Initial admin recipient for Cosmo: **0766713205**. Additional numbers may be added via settings later; do not rely on a single hard-coded number as the only storage mechanism long-term.
- Default automatic send time is early morning Asia/Colombo (e.g. after 00:15) covering the **previous** calendar day; exact time can be adjusted in ops config.
- Duplicate protection is per company + report day for the automatic job; explicit “resend” from `/dashboard/ogf-logs` (or settings test send) may allow another send and must log `source: manual`.
- OGF logs page remains the operator console for OGF **email** history; Daily Sales SMS logs are an **additional section** on the same page (do not delete email rows or break OGF resend).
