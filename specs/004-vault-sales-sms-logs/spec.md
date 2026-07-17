# Feature Specification: Vault Sales SMS Logs & Delivery Visibility

**Feature Branch**: `004-vault-sales-sms-logs`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "planned automate SMS for sales sms not send to vault os. can we see why that happen also in cosmo os we have ui OGF and sales log in there we show failed attempts to users, but in vault os no ui to show that kind of errors, want add ui for vault os also and sms errors can log there"

## Clarifications

### Session 2026-07-15

- Q: Vault logs UI surface — shared page vs Vault-only page? → A: Option B — new Vault-only **Sales SMS Logs** page/route; Cosmo keeps **OGF & Sales Logs** unchanged
- Q: How should Vault show “automation never ran”? → A: Option A — in-page status: enabled/disabled, recipient count, last attempt, next run ~09:00 Asia/Colombo
- Q: Manual catch-up when no log row exists for a day? → A: Option A — Resend on existing log rows **and** “Send for date” when no attempt row exists for that report day

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vault operators can open Sales SMS logs without OGF (Priority: P1)

A Vault OS admin (or other authorized user) needs a dedicated **Sales SMS Logs** place in Vault to review Daily Sales SMS attempts—especially failures. Cosmo keeps its existing **OGF & Sales Logs** screen unchanged. Vault must get its own Sales SMS logs route/navigation so Vault operators are not dependent on OGF being configured.

**Why this priority**: Without a visible log, Vault SMS failures are silent; operators cannot confirm whether the scheduled send ran, skipped, or failed.

**Independent Test**: On a Vault-configured environment with OGF unset, sign in as an authorized user and open the Vault **Sales SMS Logs** nav entry; confirm Daily Sales SMS rows (or an empty state) render without requiring OGF, and Cosmo’s OGF & Sales Logs path remains the Cosmo entry point.

**Acceptance Scenarios**:

1. **Given** Vault OS is running without OGF configured, **When** an authorized user opens the app navigation, **Then** they see a **Sales SMS Logs** entry that opens the Vault-only logs page (not gated on OGF).
2. **Given** that user opens the Vault Sales SMS Logs page, **When** Daily Sales SMS attempts exist for their company, **Then** they see report date, recipients, status, error (if any), source (scheduled / manual / test), and time in Sri Lanka local context.
3. **Given** no SMS attempts yet, **When** the Vault page loads, **Then** an empty state explains that attempts appear after the next scheduled or manual send (no OGF email section on this Vault page).
4. **Given** an authorized user opens Vault Sales SMS Logs, **When** the page loads, **Then** they also see a status summary: whether Daily Sales SMS is enabled, how many recipients are configured, the last attempt (if any), and that the next scheduled run is **09:00 Asia/Colombo**.

---

### User Story 2 - Failed Daily Sales SMS attempts are logged and actionable on Vault (Priority: P1)

When a Daily Sales SMS send fails (or needs a retry), Vault operators see the failure in the Vault logs UI and can trigger a manual resend for that report day, similar to Cosmo’s resend behavior.

**Why this priority**: Visibility alone is not enough for operations; staff need to recover from provider or config failures without waiting for the next morning.

**Independent Test**: Produce or record a failed Daily Sales SMS attempt for a Vault company → open Vault logs → see failed status and error → Resend → new attempt is logged and success/failure is reflected.

**Acceptance Scenarios**:

1. **Given** a Daily Sales SMS send fails for a Vault company, **When** an authorized user opens the Vault logs UI, **Then** a failed row appears with a usable error message.
2. **Given** a failed (or prior) log row, **When** the user chooses Resend for that report date, **Then** the system retries send to the configured recipients and records a new manual attempt.
3. **Given** a successful cron send for a day, **When** the user views the log, **Then** the row shows sent status so they can distinguish “never ran” from “already delivered.”
4. **Given** no log row exists for a chosen report date (e.g. scheduled run never fired), **When** the user chooses **Send for date** with a valid report date and recipients configured, **Then** the system sends that day’s sales SMS and records a new manual attempt.

---

### User Story 3 - Explain and restore automated Daily Sales SMS for Vault (Priority: P1)

The planned automated Daily Sales SMS is not reaching Vault. Operators and admins need a clear answer for *why* (e.g. schedule not running against Vault, feature disabled, empty recipients, provider credentials missing, skipped as already sent) and the automation must work for Vault when configuration is valid—same product expectation as Cosmo, but for Vault’s own company data and recipients.

**Why this priority**: A logs UI without working automation only shows empty or skip history; restoring reliable morning delivery is the original business need.

**Independent Test**: With Vault Daily Sales SMS enabled and at least one valid recipient, run or simulate the scheduled job for a prior Sri Lanka business day against Vault and confirm either a sent attempt is logged or a skip/failure reason is logged and visible in the Vault UI.

**Acceptance Scenarios**:

1. **Given** Vault has Daily Sales SMS enabled with recipients and provider credentials are valid, **When** the scheduled job runs for the previous Colombo business day, **Then** Vault’s company receives the SMS (or a logged failure with an actionable error if the provider rejects it).
2. **Given** automation cannot run (disabled, no recipients, missing credentials, or wrong environment), **When** the operator opens Vault Sales SMS Logs, **Then** the status summary and/or latest log row make the blocker clear (e.g. disabled, zero recipients, last failure error)—not a silent no-op with no guidance.
3. **Given** a successful send already exists for a report day, **When** the scheduled job runs again without an explicit resend, **Then** it does not spam duplicate sends for that same day; the log still shows the successful prior attempt.

---

### User Story 4 - Cosmo OGF & Sales Logs behavior stays intact (Priority: P2)

Cosmo continues to show OGF email history and Daily Sales SMS logs together for operators who already use that screen. Vault changes must not remove or break Cosmo’s combined OGF + Sales experience.

**Why this priority**: Cosmo’s operational habit is already working; regression would hurt Cosmo while fixing Vault.

**Independent Test**: On Cosmo with OGF configured, open the existing logs area and confirm OGF email history and Daily Sales SMS sections still work, including resend where applicable.

**Acceptance Scenarios**:

1. **Given** Cosmo with OGF configured, **When** an authorized user opens OGF & Sales Logs, **Then** OGF email history and Daily Sales SMS sections both remain available.
2. **Given** a Cosmo Daily Sales SMS failure, **When** the user resends from that screen, **Then** behavior remains equivalent to today.

---

### Edge Cases

- Vault with SMS enabled but empty recipients: send skipped; skip is logged and visible with a clear reason.
- Vault with SMS disabled: no cron send for that company; status summary shows disabled.
- Vault Sales SMS Logs page must not include OGF email history (Cosmo-only surface).
- Cosmo “OGF & Sales Logs” and Vault “Sales SMS Logs” are separate entry points; labels must not imply Vault has OGF.
- Provider/network failure mid-send: partial success per recipient is reflected in status/error text when available; operators can resend.
- No log row for a past report date: **Send for date** still available when recipients are configured; invalid/future dates rejected with a clear message.
- User lacks permission: logs screen, Resend, and Send for date are denied consistently with existing settings/admin access rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Vault OS MUST expose a dedicated navigable **Sales SMS Logs** page (separate from Cosmo’s OGF & Sales Logs) for Daily Sales SMS attempt history, without requiring OGF to be configured.
- **FR-002**: The Vault Sales SMS Logs page MUST list Daily Sales SMS attempts for the user’s company, including report date, recipients, status, error detail when failed/skipped, source, and timestamp (Sri Lanka–aware display).
- **FR-003**: Failed or prior Daily Sales SMS attempts MUST be retryable from the Vault Sales SMS Logs page via an authorized Resend action that logs the new attempt.
- **FR-011**: Authorized Vault operators MUST be able to trigger **Send for date** for a valid report date even when no send-attempt row exists yet (catch-up when automation never ran), and the outcome MUST be logged as a manual attempt.
- **FR-004**: Every scheduled, manual, and test Daily Sales SMS outcome for a Vault company MUST be persisted so operators can audit success, failure, and skip reasons.
- **FR-005**: Automated Daily Sales SMS MUST be able to run for Vault’s company when the feature is enabled and recipients are configured, using Vault’s own sales figures and recipient list—not Cosmo’s.
- **FR-006**: When automation does not send, the system MUST leave an auditable reason (disabled, no recipients, already sent, credentials/provider error, or environment not executing the job) visible to authorized Vault operators.
- **FR-010**: The Vault Sales SMS Logs page MUST show an in-page status summary: enabled/disabled, recipient count, last attempt (if any), and next scheduled run time of **09:00 Asia/Colombo**.
- **FR-007**: Cosmo’s existing OGF email + Daily Sales SMS logs experience MUST remain available and functionally unchanged for Cosmo operators (same Cosmo page/nav as today).
- **FR-008**: Access to Vault Sales SMS Logs and Resend MUST be limited to authorized roles/permissions consistent with Cosmo’s existing OGF & Sales Logs access model (or an equivalent settings/admin permission already used for SMS Portal).
- **FR-009**: The Vault Sales SMS Logs page MUST NOT include OGF email history; Cosmo retains OGF history on its own page.

### Key Entities

- **Daily Sales SMS Configuration**: Per-company enablement and recipient phone list for automated/manual sales SMS.
- **Daily Sales SMS Send Attempt**: A recorded try to send the daily sales report SMS for a company and report date (status, error, recipients, source).
- **Vault OS Deployment**: The Vault product environment/tenant where OGF is not used but Daily Sales SMS still applies.
- **Cosmo OS Deployment**: The Cosmo product environment where OGF email sync and Sales SMS logs already coexist.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized Vault users can reach Daily Sales SMS logs from navigation in under 30 seconds without needing OGF configuration.
- **SC-002**: 100% of failed or skipped Vault Daily Sales SMS attempts that the system processes are visible in the Vault logs UI within one minute of the attempt.
- **SC-003**: After a known Vault failure, an authorized operator can complete Resend for that report day in under 2 minutes and see the new attempt result in the log.
- **SC-004**: With valid Vault configuration, a scheduled run for a test prior business day produces a logged sent or failed attempt (never a silent miss with no log) in at least 95% of controlled test runs.
- **SC-005**: Cosmo operators retain access to OGF email history and Daily Sales SMS logs; regression checks on Cosmo log visibility pass for both sections.
- **SC-006**: Operators reviewing Vault Sales SMS Logs can state the blocker for a missed morning SMS (disabled, empty recipients, provider error, already sent, or no last attempt yet) from the status summary and log rows without contacting engineering in those common cases.

## Assumptions

- Daily Sales SMS product rules already defined in `003-admin-daily-sales-sms` (format, previous Colombo day, idempotent success day, recipients in SMS Portal settings) remain the baseline; this feature extends Vault visibility and delivery reliability.
- Vault and Cosmo remain separate tenants/environments with separate company data; logs must never mix companies across tenants.
- The main gap for “no UI on Vault” today is navigation/product surface gated on OGF; Vault will get a dedicated Sales SMS Logs page rather than sharing Cosmo’s OGF & Sales Logs entry.
- “SMS errors” for this release means Daily Sales SMS attempt failures/skips (and clear reasons). Generic one-off SMS Portal messaging outside Daily Sales is out of scope unless already sharing the same log model.
- Restoring Vault automation may require confirming the schedule actually executes against the Vault deployment/environment; operators diagnose via the in-page status summary (enabled, recipients, last attempt, next 09:00 Colombo run) plus send-log rows—not a separate ops-only console in v1.
- Permission model mirrors Cosmo’s existing logs access (settings-level manage or equivalent), not a brand-new role for v1.
- OGF email resend remains Cosmo-only; Vault focus is Sales SMS logs + resend.
- Scheduled Daily Sales SMS run time for **both Cosmo OS and Vault OS** is **09:00 Asia/Colombo** (Vercel cron `30 3 * * *` UTC).
