# Feature Specification: ERP Sync Failure Alerts

**Feature Branch**: `009-erp-sync-failure-alerts`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Automatically retry ERP sync failures, including orders stuck without an error. If orders remain unsynced by 11:59 PM local time, email company heads a detailed failed-order report with totals including and excluding shipping. Provide configurable email settings and test/preview controls for both Cosmo OS and Vault OS. Use buddhima.cosmetics@outlook.com for Supplement Vault."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatically recover stuck ERP order syncs (Priority: P1)

Operations staff expect orders that were claimed for ERP synchronization but left pending without an error to be detected and retried automatically, rather than remaining indefinitely in a manual-retry queue.

**Why this priority**: Recovering these orders before the business-day cutoff reduces missing ERP sales and avoids preventable reconciliation work.

**Independent Test**: Place an eligible order into a stale pending state with no error details, run the recovery process, and verify that the order is retried exactly once, reaches ERP when the retry succeeds, and records a useful failure when it does not.

**Acceptance Scenarios**:

1. **Given** an order has remained pending without an ERP invoice or error beyond the allowed in-progress period, **When** automated recovery runs, **Then** the order is classified as interrupted or stuck and becomes eligible for automatic retry.
2. **Given** a stale pending order is retried successfully, **When** recovery completes, **Then** the ERP reference is recorded and the order no longer appears among unresolved failures.
3. **Given** a retry fails, **When** the attempt completes, **Then** the failure reason, attempt time, and retry status are recorded and visible to operators.
4. **Given** concurrent recovery runs inspect the same order, **When** they attempt to claim it, **Then** no more than one active retry occurs and no duplicate ERP sale is created.

---

### User Story 2 - Alert company heads about unresolved end-of-day failures (Priority: P1)

At the end of each company's local business day, company heads receive one consolidated email identifying orders from that day that still have not synchronized to ERP. The report enables them to reconcile differences between operational sales and ERP daily sales, including orders that may only reach ERP on the following day.

**Why this priority**: An unresolved order can change the ERP day total and otherwise remain invisible during daily reconciliation.

**Independent Test**: Prepare a known set of unresolved orders, execute the cutoff report for that local date, and verify the recipients, order rows, timestamps, and all summary totals against the source orders.

**Acceptance Scenarios**:

1. **Given** one or more qualifying orders remain unresolved at 11:59 PM in the company's local timezone, **When** the end-of-day check runs, **Then** all configured recipients receive one consolidated failure email for that company and business date.
2. **Given** no qualifying unresolved orders exist at cutoff, **When** the check runs, **Then** no failure email is sent and the check is recorded as having no failures.
3. **Given** an order has no captured error because synchronization was interrupted, **When** it appears in the email, **Then** the report labels it clearly as stuck or interrupted and shows when that condition was detected.
4. **Given** the same cutoff check is executed more than once, **When** the report for that company and date was already sent successfully, **Then** a duplicate automatic email is not sent.
5. **Given** an automatic email delivery fails, **When** an authorized user reviews the send history, **Then** the failure reason is visible and the report can be sent again manually.

---

### User Story 3 - Reconcile totals with and without shipping (Priority: P1)

Recipients can use the email directly for daily tallying because it provides order-level values and report totals both including shipping and excluding shipping.

**Why this priority**: Leadership needs both values to compare like-for-like with different daily sales reports.

**Independent Test**: Use orders with known item and shipping values, including zero and discounted shipping, and verify every row and consolidated total.

**Acceptance Scenarios**:

1. **Given** unresolved orders with shipping charges, **When** the report is generated, **Then** each row displays the order total including shipping, shipping total, and order total excluding shipping.
2. **Given** multiple unresolved orders, **When** the report is generated, **Then** it displays the failed-order count and summed totals for shipping, including shipping, and excluding shipping.
3. **Given** an order has no shipping charge, **When** it appears in the report, **Then** shipping displays as zero and its including- and excluding-shipping totals remain consistent.

---

### User Story 4 - Configure failure emails for both operating systems (Priority: P2)

Authorized administrators in Cosmo OS and Vault OS can independently enable the alert, maintain recipient email addresses, preview a report for a selected date, send a test email, and see the latest send result using a settings experience consistent with Daily Sales SMS.

**Why this priority**: Each business has different leadership recipients, and administrators must be able to maintain them without a code change.

**Independent Test**: Configure different recipient lists in the two operating systems, save them, preview and test each configuration, and verify that each business uses only its own settings.

**Acceptance Scenarios**:

1. **Given** an authorized Vault OS administrator, **When** the feature is first configured, **Then** `buddhima.cosmetics@outlook.com` can be saved as the Supplement Vault recipient and additional valid addresses can be added one per line.
2. **Given** different recipient lists in Cosmo OS and Vault OS, **When** each company's cutoff job runs, **Then** each report is sent only to that company's configured recipients.
3. **Given** an invalid or duplicate email address, **When** an administrator saves settings, **Then** the invalid entry is identified, duplicates are not sent twice, and valid entries remain editable.
4. **Given** an empty recipient list or disabled setting, **When** the scheduled check runs, **Then** no email is attempted and the skip reason is recorded.
5. **Given** an authorized administrator selects a report date, **When** they choose Preview, **Then** they can inspect the exact report data without sending an email.
6. **Given** valid recipients and a selected report date, **When** the administrator chooses Send test email, **Then** a clearly identified test report is delivered and its result appears as the latest send status.

### Edge Cases

- An order enters pending status seconds before the cutoff and is still within the normal in-progress allowance.
- An automated retry begins before cutoff but finishes after cutoff.
- An order synchronizes after the recipient report is generated; the sent report remains an accurate cutoff snapshot and later status is available in history.
- A retry succeeds in ERP but the local response is interrupted; duplicate protection must detect the existing ERP sale before creating another.
- Orders span multiple currencies; reports must not combine unlike currencies into one unlabeled amount.
- Shipping discounts, free shipping, taxes, refunds, cancellations, and voided orders must not produce mathematically inconsistent totals.
- One recipient delivery fails while other recipients succeed.
- The email service is unavailable at cutoff; the failed attempt remains available for manual resend.
- The local timezone crosses midnight or changes; the configured company timezone determines the business date and cutoff.
- A company has no configured location or an order has a missing customer email/name; the report still identifies the order using available data.
- A large number of failures exceeds a practical email length; the complete report remains accessible and the email retains summary totals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect ERP order synchronizations that remain pending without a completed ERP reference or recorded error beyond a defined normal in-progress allowance.
- **FR-002**: Stale pending orders MUST receive a meaningful interrupted/stuck classification, detection time, and retry eligibility instead of displaying empty failure details.
- **FR-003**: The system MUST automatically retry stale pending orders and other retryable ERP synchronization failures before the applicable local business-day cutoff.
- **FR-004**: Automated retries MUST prevent overlapping attempts for the same order and MUST avoid creating duplicate ERP sales when a prior attempt succeeded remotely.
- **FR-005**: Each retry attempt MUST record its outcome, attempt time, failure reason when applicable, and whether another automatic retry is scheduled.
- **FR-006**: Non-retryable failures MUST remain available for manual review without repeated automatic attempts.
- **FR-007**: The system MUST evaluate unresolved ERP synchronization failures for each company at 11:59 PM in that company's configured local timezone.
- **FR-008**: The cutoff report MUST include orders belonging to that company and business date that lack a completed ERP sales reference at the cutoff snapshot.
- **FR-009**: Cancelled or voided orders that should not produce an ERP sale MUST be excluded from the unresolved-failure report.
- **FR-010**: When qualifying failures exist, the system MUST send one consolidated report per company and business date to that company's enabled recipient list.
- **FR-011**: The automatic report MUST NOT be sent when the feature is disabled, the recipient list is empty, or there are no qualifying failures; the reason MUST be recorded.
- **FR-012**: The system MUST prevent duplicate automatic reports for the same company and business date while allowing an authorized user to resend explicitly.
- **FR-013**: Each report MUST identify the company, business date, local cutoff time, generation time, failed-order count, and report currency or currencies.
- **FR-014**: Each failed-order row MUST show the order number, order date/time, customer, location, current ERP synchronization state, failure or stuck reason, failure/detection time, and latest retry status.
- **FR-015**: Each failed-order row MUST show the amount including shipping, shipping amount, and amount excluding shipping.
- **FR-016**: The report summary MUST show the sum including shipping, total shipping, and sum excluding shipping, with arithmetic consistency between the three values.
- **FR-017**: Amounts in different currencies MUST be grouped and totaled separately.
- **FR-018**: Failure and order timestamps MUST be displayed in the company's local timezone and labeled sufficiently to avoid timezone ambiguity.
- **FR-019**: Authorized administrators MUST be able to enable or disable ERP failure email alerts independently for Cosmo OS and Vault OS.
- **FR-020**: Authorized administrators MUST be able to add, edit, and remove each company's recipient email addresses without a code deployment.
- **FR-021**: Recipient addresses MUST be validated, normalized for duplicate detection, and isolated by company so one operating system cannot use or reveal the other's list.
- **FR-022**: Supplement Vault MUST support `buddhima.cosmetics@outlook.com` as an initial configured recipient.
- **FR-023**: The settings screen MUST provide an enabled control, one-email-per-line recipient editor, last-send status, report-date selector, Preview action, and Send test email action consistent with the existing Daily Sales SMS workflow.
- **FR-024**: Preview MUST show the same order selection, fields, and totals that a real report for the selected company and date would use.
- **FR-025**: Test emails MUST be visibly labeled as tests and MUST record recipient count, outcome, time, and error details without counting as the automatic cutoff report.
- **FR-026**: The system MUST retain report send history sufficient for authorized users to see the report date, source (automatic, test, or manual), recipients, status, sent/failed time, and error details.
- **FR-027**: Authorized users MUST be able to resend a failed or prior report for its original company and business date, with the new attempt recorded separately.
- **FR-028**: An email delivery failure MUST NOT stop ERP retry processing or alter an order's synchronization state.
- **FR-029**: The cutoff email MUST represent an immutable snapshot of failures and totals at report generation time so later successful retries do not change what recipients originally received.

### Key Entities

- **ERP synchronization failure**: The current unresolved state of an order, including ERP reference state, reason, original failure or stuck-detection time, latest attempt, retry count, and next retry eligibility.
- **Failure alert settings**: Company-specific enabled state, local timezone, and recipient email list.
- **Failure report snapshot**: The company, business date, cutoff and generation times, selected order details, currency-grouped totals including/excluding shipping, and shipping total captured when the report is generated.
- **Email recipient**: A validated company-specific leadership email address eligible to receive automatic, test, and manual reports.
- **Email send attempt**: A record of report source, recipients, attempt time, status, delivery error, and relationship to a report snapshot.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In testing, 100% of orders deliberately placed in stale pending-without-error state are detected and either synchronized successfully or given a visible reason and attempt time on the next recovery run.
- **SC-002**: Concurrent recovery tests create zero duplicate ERP sales for the same order.
- **SC-003**: For every company with unresolved failures and enabled recipients, the end-of-day email is delivered or a visible delivery failure is recorded within 15 minutes of the 11:59 PM local cutoff.
- **SC-004**: For known test orders, failed-order count and totals including shipping, shipping, and excluding shipping match source values within the smallest currency unit.
- **SC-005**: Automatic reporting produces no duplicate email for the same company and business date during repeated scheduled executions.
- **SC-006**: An authorized administrator can configure or update recipients, preview a selected date, and initiate a test email in under 3 minutes without developer assistance.
- **SC-007**: Cross-company testing confirms that 100% of Cosmo OS and Vault OS reports use only their respective settings, orders, and recipients.
- **SC-008**: A recipient can identify every unresolved order and reconcile the report's three summary totals without opening an additional operational system.

## Assumptions

- “Both OS” means Cosmo OS and Supplement Vault/Vault OS, using the same capability with strictly separate company settings and data.
- `buddhima.cosmetics@outlook.com` is the initial Supplement Vault recipient; Cosmo OS recipients will be added through the settings screen.
- The company timezone defaults to Asia/Colombo where no separate timezone is configured.
- A pending order is considered stale only after a short in-progress allowance has elapsed; the exact allowance and retry spacing will be selected during planning to avoid retrying active work.
- The system makes reasonable automatic retry attempts before cutoff, but persistent or non-retryable failures remain visible for manual resolution.
- The email is a cutoff reconciliation alert, not a guarantee that the order will never synchronize afterward. A later ERP sync may post on the following ERP day, which is why the cutoff snapshot is retained.
- “Including shipping” means the order's qualifying total inclusive of shipping; “excluding shipping” equals that total minus the order's net shipping amount. Existing business rules for cancellations, refunds, discounts, and taxes remain unchanged unless separately specified.
- The report covers orders associated with the selected business date according to the same company-local order-date rule used by daily sales reporting.
- A single email may address multiple configured recipients, but recipient delivery outcomes must remain auditable.
- Existing authentication and company-level authorization rules govern access to settings, previews, history, and resends.
