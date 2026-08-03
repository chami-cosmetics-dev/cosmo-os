# Feature Specification: Merchant Daily Book Note

**Feature Branch**: `029-merchant-book-note`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Shop merchants enter daily sales book notes (date, sales invoice, payment type and amount, including dual/split payments). Build a simple merchant UI in Cosmo OS based on the intern's book-note page prototype, persist the entries, and expose an endpoint so the AI/ML intern can fetch the data for ERP verification / bank reconciliation work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant records today's book note (Priority: P1)

A shop merchant (outlet staff) opens a simple Daily Book Note page, picks the sales date and their outlet/company, and enters each physical-book line as: sales invoice number plus amounts by payment method (Cash, Card, KOKO, Bank). A single invoice may have amounts in more than one method (e.g. Cash 500 + Bank 300). They add/remove rows as needed, see per-row and column totals, then save. Saving stores the day's ledger so it is available later — not only on that device.

**Why this priority**: Without reliable outlet capture of split payments, finance and the intern's reconciliation cannot trust what was actually collected at the shop.

**Independent Test**: A merchant can open the page, enter several rows including one multi-method row, save, leave the page, return, and still see the same saved day for that outlet.

**Acceptance Scenarios**:

1. **Given** an authorized merchant on the Book Note page, **When** they select a date and outlet and enter invoice numbers with payment amounts, **Then** each row shows a computed row total and the ledger shows column and grand totals.
2. **Given** a row with amounts in two or more payment methods, **When** the merchant views that row, **Then** the row is visually distinguishable as a multi-method entry (so they can spot split payments while typing).
3. **Given** a filled ledger for a date and outlet, **When** the merchant saves, **Then** the system confirms success and the data is stored for later retrieval (not only in browser memory).
4. **Given** a previously saved book note for an outlet and date, **When** the merchant opens that date again, **Then** the saved rows load so they can continue or correct entries.

---

### User Story 2 - Intern / finance retrieves book note data (Priority: P1)

The AI/ML intern (or authorized finance tooling) needs the merchant-entered ledger in a stable shape: company/outlet, posting date, and rows with sales invoice plus Cash / Card / KOKO / Bank amounts. They obtain that data from Cosmo OS for a given outlet and date (or date range) so their existing verify/reconciliation workflow can consume it without merchants exporting files by hand.

**Why this priority**: Capture without retrieval does not unblock the intern's planned work; Cosmo OS must expose a reliable way for authorized consumers to pull saved days.

**Independent Test**: After merchants save sample rows, an authorized consumer can retrieve the same fields (company, posting date, rows with payment splits) and use them as input to the intern's verify flow.

**Acceptance Scenarios**:

1. **Given** saved book note rows for outlet X on date D, **When** an authorized consumer retrieves book notes for X and D, **Then** they receive company/outlet, posting date, and each row's invoice number and Cash / Card / KOKO / Bank amounts (and row identity suitable for matching).
2. **Given** no saved book note for the requested outlet and date, **When** an authorized consumer retrieves that day, **Then** the result clearly indicates empty data (not an opaque failure).
3. **Given** an unauthenticated or unauthorized caller, **When** they attempt to retrieve book note data, **Then** access is denied.

---

### User Story 3 - Merchant corrects and re-saves a day (Priority: P2)

Merchants sometimes mistype invoice numbers or payment splits. They reopen the same outlet/date, edit amounts or rows, and save again so the stored ledger reflects the corrected book.

**Why this priority**: Physical books get corrected during the day; stale wrong data would poison verification.

**Independent Test**: Save a day, change one amount and remove one row, save again; retrieval returns only the corrected ledger.

**Acceptance Scenarios**:

1. **Given** a saved book note for an outlet and date, **When** the merchant edits rows and saves, **Then** later retrieval shows the updated rows (prior incorrect amounts are not still presented as current).
2. **Given** a merchant removes a row and saves, **When** that day is retrieved again, **Then** the removed row is absent.

---

### User Story 4 - Simple, focused merchant UI (Priority: P2)

The merchant experience stays simple: date, outlet, invoice ledger table, add/remove row, totals, save. It is inspired by the intern's book-note prototype (invoice + Cash/Card/KOKO/Bank columns) but lives inside Cosmo OS with existing navigation and auth — not a separate ERP desk tool and not the finance bank-reconciliation workspace.

**Why this priority**: Merchants need a low-friction daily habit; complexity belongs on the finance/intern side.

**Independent Test**: A merchant who has never seen the finance recon tool can complete entry and save using only on-page labels and totals.

**Acceptance Scenarios**:

1. **Given** a merchant with access, **When** they open Book Note from Cosmo OS, **Then** they see date, outlet, ledger columns (Idx, Sales Invoice, Cash, Card, KOKO, Bank, Row Total), add row, and save — without ERP connection status or verification badges as required steps.
2. **Given** optional export is offered, **When** the merchant exports, **Then** they get a portable snapshot of the current on-screen ledger (same field shape as save) for ad-hoc sharing; primary persistence remains Save plus authorized retrieve.

---

### Edge Cases

- Empty sales invoice on a row with amounts: save is blocked or that row is rejected with a clear message (invoice is required for usable verify input).
- All payment amounts zero on a row: treat as incomplete; do not persist as a meaningful sale line (or reject with clear message).
- Multi-method totals: row total equals sum of Cash + Card + KOKO + Bank; no separate "total" field for the merchant to type.
- Duplicate invoice numbers on the same day/outlet: allow save but surface a non-blocking warning so merchants can fix typos (physical books sometimes repeat or correct later).
- Very large day (many rows): merchants can add rows beyond the initial blank set without losing prior rows on the page.
- Unauthorized merchant for another outlet: they cannot save or load another outlet's book note.
- Concurrent edits: last successful save for that outlet+date wins; no merge of conflicting row lists in v1.
- Partial day: merchants may save an incomplete day and continue later the same day.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Cosmo OS Daily Book Note page for authorized merchant/outlet users to enter and save daily sales book lines.
- **FR-002**: Each book note MUST be scoped to one outlet/company and one sales (posting) date.
- **FR-003**: Each row MUST capture: line index, sales invoice number, Cash amount, Card amount, KOKO amount, and Bank (bank transfer) amount.
- **FR-004**: System MUST allow a single row to have non-zero amounts in more than one payment method (dual/split payments).
- **FR-005**: System MUST compute and display row total as the sum of the four payment amounts, plus column totals and a grand total for the ledger.
- **FR-006**: System MUST allow merchants to add and remove rows before save.
- **FR-007**: System MUST persist the full ledger for an outlet+date on Save so it survives browser/device changes.
- **FR-008**: System MUST reload the latest saved ledger when a merchant opens an outlet+date that already has data.
- **FR-009**: System MUST replace the stored ledger for that outlet+date on re-save (full replace of current day's rows).
- **FR-010**: System MUST provide authenticated retrieve access so authorized consumers (intern / finance tooling) can obtain book note data by outlet and date (and optionally date range).
- **FR-011**: Retrieved data MUST include company/outlet identity, posting date, and rows with sales invoice plus Cash / Card / KOKO / Bank amounts in a stable field shape suitable for the intern's verify workflow.
- **FR-012**: System MUST reject unauthenticated or unauthorized save and retrieve attempts.
- **FR-013**: System MUST validate inputs server-side (required invoice when amounts present, non-negative amounts, date and outlet identity, reasonable length limits).
- **FR-014**: Merchant UI MUST remain entry-focused: no requirement to run ERP verification, match badges, or bank statement upload on this page.
- **FR-015**: System MUST visually indicate multi-method rows (more than one payment method with amount > 0) in the merchant ledger.
- **FR-016**: Optional portable export of the current ledger MAY be offered for convenience; it MUST NOT be the only way for the intern to obtain data.

### Key Entities

- **Book Note Day**: One outlet/company + one posting date; owns the set of rows that constitute that day's physical book capture; replaced as a whole on each successful save.
- **Book Note Row**: One ledger line: index, sales invoice number, Cash / Card / KOKO / Bank amounts; derived row total and multi-method flag.
- **Outlet / Company**: The shop context the merchant is recording for (aligned with Cosmo OS outlet/company concepts already used elsewhere).
- **Book Note Consumer**: Authorized user or integration that reads saved days via the retrieve API for verification/reconciliation outside this page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merchant can enter and save a typical day of at least 20 invoice lines (including at least one split-payment line) in under 10 minutes once familiar with the page.
- **SC-002**: After save, an authorized retrieval for that outlet and date returns 100% of saved rows with matching invoice numbers and payment amounts (within 0.01 currency unit).
- **SC-003**: At least 90% of first-time merchant testers complete a save of a 5-row sample without assistance beyond on-page labels.
- **SC-004**: Intern/finance can obtain a day's book note through Cosmo OS retrieve access without merchants emailing or hand-exporting files for the happy path.
- **SC-005**: Re-saving a corrected day causes prior incorrect amounts for that outlet+date to no longer appear in retrieve results within one minute of save.

## Assumptions

- Scope for Cosmo OS v1 is **capture + persistence + authorized retrieve**. ERP-side verification (matching sales invoices / payment records, category checks, clearance, bank statement matching) remains in the intern's ERP scripts and finance tools — not rebuilt inside Cosmo OS in this feature.
- Payment methods for v1 are exactly the four columns from the intern prototype: Cash, Card, KOKO, Bank transfer. Additional methods are out of scope until requested.
- "Company" on the prototype maps to the Cosmo OS outlet/company the merchant is allowed to work with; merchants only see outlets they are authorized for.
- Access uses Cosmo OS sign-in and role/permission checks; the intern's retrieve access is granted via an appropriate permission (or admin/finance role), not public anonymous access.
- Amounts are in the business's usual currency (LKR) with two-decimal money semantics; no multi-currency conversion on this page.
- Local draft recovery (e.g. unsaved typing) is nice-to-have; durable Save to Cosmo OS is the source of truth the intern must use.
- The bank reconciliation desk page and verify script supplied by the intern are reference for data shape and downstream process only — they are not delivered as Cosmo OS features under this spec.
- Optional export uses the same logical fields as Save (company/outlet, posting date, rows with index, sales invoice, cash, card, koko, bank transfer) so the intern's tooling can stay aligned.

## Out of Scope

- Running or embedding ERP verification / match status on the merchant page
- Finance bank statement upload, clearance, or live `book_note_verified` desk notifications
- Changing how Sales Invoices or Payment Entries are created in ERP
- Merchant mobile native app (web page in Cosmo OS is sufficient for v1)
