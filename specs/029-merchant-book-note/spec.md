# Feature Specification: Merchant Daily Book Note

**Feature Branch**: `029-merchant-book-note`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Shop merchants enter daily sales book notes (date, sales invoice, payment type and amount, including dual/split payments). Build a simple merchant UI in Cosmo OS based on the intern's book-note page prototype, persist the entries, and expose an endpoint so the AI/ML intern can fetch the data for ERP verification / bank reconciliation work."

## Clarifications

### Session 2026-08-03

- Q: Who can enter book notes vs who can retrieve them? → A: Merchants enter their outlet(s) only; finance/admin (including the intern via that access) can retrieve all outlets' saved days. Merchants do not get read-all; finance does not enter/edit book notes in v1.
- Q: Can merchants still change a day after it was saved (and possibly already pulled by finance)? → A: Same-calendar-day only — after the sales date ends in Asia/Colombo, merchants cannot change that outlet+date; finance/admin retrieve remains available for past days.
- Q: What should merchants type in the Sales Invoice field? → A: Typeahead from Cosmo OS POS/orders — as the merchant types an invoice number, suggest matching OS orders and let them select the full invoice number; store that full number on the row (manual entry still allowed if no match).
- Q: How does a merchant choose which outlet the book note is for? → A: Always a dropdown of every outlet the merchant is allowed to use (not auto-locked to a single default; never all company outlets beyond assignment).
- Q: When a merchant picks a suggested POS/order, what gets filled on the row? → A: Fill full invoice number and autofill amount(s) from the OS order; merchant can edit any amount fields before save.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant records today's book note (Priority: P1)

A shop merchant (outlet staff) opens a simple Daily Book Note page, picks the sales date and their outlet/company, and enters each physical-book line as: sales invoice number plus amounts by payment method (Cash, Card, KOKO, Bank). A single invoice may have amounts in more than one method (e.g. Cash 500 + Bank 300). They add/remove rows as needed, see per-row and column totals, then save. Saving stores the day's ledger so it is available later — not only on that device.

**Why this priority**: Without reliable outlet capture of split payments, finance and the intern's reconciliation cannot trust what was actually collected at the shop.

**Independent Test**: A merchant can open the page, enter several rows including one multi-method row, save, leave the page, return, and still see the same saved day for that outlet.

**Acceptance Scenarios**:

1. **Given** an authorized merchant on the Book Note page, **When** they open the page, **Then** they see an outlet dropdown listing every outlet they are allowed to use, choose one with the sales date, and enter invoice numbers with payment amounts — each row shows a computed row total and the ledger shows column and grand totals.
2. **Given** a merchant typing in the Sales Invoice field, **When** characters match Cosmo OS POS/orders for their outlet (and ideally the selected date), **Then** suggestions show matching orders and choosing one fills the full invoice number and autofills payment amount(s) from that order; the merchant can edit any amount before save.
3. **Given** a row with amounts in two or more payment methods, **When** the merchant views that row, **Then** the row is visually distinguishable as a multi-method entry (so they can spot split payments while typing).
4. **Given** a filled ledger for a date and outlet, **When** the merchant saves, **Then** the system confirms success and the data is stored for later retrieval (not only in browser memory).
5. **Given** a previously saved book note for an outlet and date, **When** the merchant opens that date again, **Then** the saved rows load so they can continue or correct entries.

---

### User Story 2 - Intern / finance retrieves book note data (Priority: P1)

Authorized finance/admin users (including the AI/ML intern using that access) need the merchant-entered ledger in a stable shape: company/outlet, posting date, and rows with sales invoice plus Cash / Card / KOKO / Bank amounts. They can retrieve **any** outlet’s saved days (single date or date range). Merchants only enter/edit their own outlet(s) and do not have company-wide retrieve. Finance/admin do not enter or edit book notes in v1 — retrieve only.

**Why this priority**: Capture without retrieval does not unblock the intern's planned work; Cosmo OS must expose a reliable way for authorized consumers to pull saved days.

**Independent Test**: After merchants save sample rows, an authorized consumer can retrieve the same fields (company, posting date, rows with payment splits) and use them as input to the intern's verify flow.

**Acceptance Scenarios**:

1. **Given** saved book note rows for outlet X on date D, **When** an authorized consumer retrieves book notes for X and D, **Then** they receive company/outlet, posting date, and each row's invoice number and Cash / Card / KOKO / Bank amounts (and row identity suitable for matching).
2. **Given** no saved book note for the requested outlet and date, **When** an authorized consumer retrieves that day, **Then** the result clearly indicates empty data (not an opaque failure).
3. **Given** an unauthenticated or unauthorized caller, **When** they attempt to retrieve book note data, **Then** access is denied.

---

### User Story 3 - Merchant corrects and re-saves a day (Priority: P2)

Merchants sometimes mistype invoice numbers or payment splits. **On the same sales calendar day (Asia/Colombo)**, they reopen the same outlet/date, edit amounts or rows, and save again so the stored ledger reflects the corrected book. Once that sales date has ended in Asia/Colombo, the day becomes read-only for merchants (they may still view it if loaded, but cannot save changes). Finance/admin can still retrieve past days.

**Why this priority**: Physical books get corrected during the day; stale wrong data would poison verification — but unlimited past-day edits would silently change data finance already pulled.

**Independent Test**: Save a day for today, change one amount and remove one row, save again; retrieval returns only the corrected ledger. Attempting to save a prior calendar day (Asia/Colombo) is rejected.

**Acceptance Scenarios**:

1. **Given** a saved book note for an outlet and **today’s** sales date (Asia/Colombo), **When** the merchant edits rows and saves, **Then** later retrieval shows the updated rows (prior incorrect amounts are not still presented as current).
2. **Given** a merchant removes a row and saves on the same sales day, **When** that day is retrieved again, **Then** the removed row is absent.
3. **Given** a book note whose sales date is before today in Asia/Colombo, **When** a merchant attempts to save changes, **Then** the system rejects the save with a clear message that the day is locked.

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
- No suggestion match: merchant may still type and save a full invoice number and amounts manually (e.g. edge cases not in OS search).
- Suggestion list empty or slow: entry remains usable with manual typing; save does not depend on picking a suggestion.
- Autofilled amounts after suggestion: merchant may change any Cash / Card / KOKO / Bank value (including clearing or splitting) before save; physical-book intent wins.
- All payment amounts zero on a row: treat as incomplete; do not persist as a meaningful sale line (or reject with clear message).
- Multi-method totals: row total equals sum of Cash + Card + KOKO + Bank; no separate "total" field for the merchant to type.
- Duplicate invoice numbers on the same day/outlet: allow save but surface a non-blocking warning so merchants can fix typos (physical books sometimes repeat or correct later).
- Very large day (many rows): merchants can add rows beyond the initial blank set without losing prior rows on the page.
- Unauthorized merchant for another outlet: they cannot save or load another outlet's book note.
- Finance/admin retrieve: may load any outlet’s day; merchants attempting company-wide retrieve are denied.
- Concurrent edits (same day): last successful save for that outlet+date wins; no merge of conflicting row lists in v1.
- Past sales date (Asia/Colombo): merchant save/update is rejected; day is read-only for merchants.
- Partial day: merchants may save an incomplete day and continue later **only while that sales date is still today** in Asia/Colombo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Cosmo OS Daily Book Note page for authorized merchant/outlet users to enter and save daily sales book lines for outlets they are allowed to work with.
- **FR-002**: Each book note MUST be scoped to one outlet/company and one sales (posting) date. The merchant UI MUST always present an outlet dropdown of every outlet that merchant is allowed to use (even if the list has only one item); merchants MUST NOT be able to select outlets outside their assignment.
- **FR-003**: Each row MUST capture: line index, sales invoice number (full number as stored after entry or suggestion selection), Cash amount, Card amount, KOKO amount, and Bank (bank transfer) amount.
- **FR-004**: System MUST allow a single row to have non-zero amounts in more than one payment method (dual/split payments).
- **FR-005**: System MUST compute and display row total as the sum of the four payment amounts, plus column totals and a grand total for the ledger.
- **FR-006**: System MUST allow merchants to add and remove rows before save.
- **FR-007**: System MUST persist the full ledger for an outlet+date on Save so it survives browser/device changes.
- **FR-008**: System MUST reload the latest saved ledger when a merchant opens an outlet+date that already has data.
- **FR-009**: System MUST replace the stored ledger for that outlet+date on re-save (full replace of current day's rows), but ONLY when the sales date is still the current calendar day in Asia/Colombo.
- **FR-010**: System MUST provide authenticated retrieve access so finance/admin consumers (including the intern via that access) can obtain book note data for **any** outlet by date (and optionally date range). Merchants MUST NOT receive company-wide retrieve.
- **FR-011**: Retrieved data MUST include company/outlet identity, posting date, and rows with sales invoice plus Cash / Card / KOKO / Bank amounts in a stable field shape suitable for the intern's verify workflow.
- **FR-012**: System MUST reject unauthenticated or unauthorized save and retrieve attempts (merchant save limited to their outlets; retrieve-all limited to finance/admin).
- **FR-013**: System MUST validate inputs server-side (required invoice when amounts present, non-negative amounts, date and outlet identity, reasonable length limits). Cosmo OS MUST NOT require a rigid invoice regex beyond non-empty trimmed text within length limits.
- **FR-014**: Merchant UI MUST remain entry-focused: no requirement to run ERP verification, match badges, or bank statement upload on this page.
- **FR-015**: System MUST visually indicate multi-method rows (more than one payment method with amount > 0) in the merchant ledger.
- **FR-016**: Optional portable export of the current ledger MAY be offered for convenience; it MUST NOT be the only way for the intern to obtain data.
- **FR-017**: Finance/admin MUST NOT create or edit book note rows through this feature in v1 (retrieve-only for that role class).
- **FR-018**: System MUST reject merchant create/update saves when the book note’s sales date is before the current calendar date in Asia/Colombo, with a clear locked-day message. Finance/admin retrieve of past days MUST still succeed.
- **FR-019**: While the merchant types in the Sales Invoice field, the system MUST suggest matching Cosmo OS POS/orders for the selected outlet (preferring the selected sales date) and, on selection, fill the row with the order’s full invoice number and autofill payment amount(s) from that order’s available payment data.
- **FR-020**: System MUST allow saving a manually typed invoice number when no suggestion is chosen, so entry is not blocked if search finds nothing.
- **FR-021**: After a suggestion autofills amounts, the merchant MUST be able to edit any payment amount fields before save; the saved values are whatever the merchant confirms, not a locked OS snapshot.
- **FR-022**: When an OS order has a single total without a method split, the system MUST still autofill a usable starting amount (planning maps which column receives it); the merchant reallocates across Cash / Card / KOKO / Bank as needed for dual payments.

### Key Entities

- **Book Note Day**: One outlet/company + one posting date; owns the set of rows that constitute that day's physical book capture; replaced as a whole on each successful save while the sales date is still today in Asia/Colombo; becomes merchant-locked afterward.
- **Book Note Row**: One ledger line: index, sales invoice number, Cash / Card / KOKO / Bank amounts; derived row total and multi-method flag.
- **Outlet / Company**: The shop context the merchant is recording for (aligned with Cosmo OS outlet/company concepts already used elsewhere).
- **Book Note Consumer**: Finance/admin user (or tooling using that access) that reads saved days for any outlet for verification/reconciliation outside the merchant entry page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merchant can enter and save a typical day of at least 20 invoice lines (including at least one split-payment line) in under 10 minutes once familiar with the page.
- **SC-002**: After save, an authorized retrieval for that outlet and date returns 100% of saved rows with matching invoice numbers and payment amounts (within 0.01 currency unit).
- **SC-003**: At least 90% of first-time merchant testers complete a save of a 5-row sample without assistance beyond on-page labels.
- **SC-007**: When typing a partial invoice that matches an OS POS/order for that outlet, merchants can select a suggestion and land the full invoice number plus autofilled amount(s) on the row in under 5 seconds of typical network conditions, then edit amounts before save if needed.
- **SC-004**: Intern/finance can obtain a day's book note through Cosmo OS retrieve access without merchants emailing or hand-exporting files for the happy path.
- **SC-005**: Re-saving a corrected day **on the same Asia/Colombo sales date** causes prior incorrect amounts for that outlet+date to no longer appear in retrieve results within one minute of save.
- **SC-006**: After the sales date ends in Asia/Colombo, 100% of merchant save attempts for that date are rejected as locked; finance/admin can still retrieve those days.

## Assumptions

- Scope for Cosmo OS v1 is **capture + persistence + authorized retrieve**. ERP-side verification (matching sales invoices / payment records, category checks, clearance, bank statement matching) remains in the intern's ERP scripts and finance tools — not rebuilt inside Cosmo OS in this feature.
- Payment methods for v1 are exactly the four columns from the intern prototype: Cash, Card, KOKO, Bank transfer. Additional methods are out of scope until requested.
- "Company" on the prototype maps to the Cosmo OS outlet the merchant selects from their allowed-outlet dropdown; the dropdown always lists all assigned outlets for that merchant (never unassigned company outlets).
- Access uses Cosmo OS sign-in and role/permission checks: merchants write their outlets; finance/admin retrieve all outlets; finance/admin do not edit book notes in v1; no public anonymous access. The intern uses finance/admin retrieve access (not a separate anonymous key).
- Calendar boundaries for editability use Asia/Colombo (same convention as other Cosmo OS daily sales features). Merchants may create/update only while the book note sales date equals “today” in that timezone; past days are merchant-locked but still retrievable by finance/admin.
- Local draft recovery (e.g. unsaved typing) is nice-to-have; durable Save to Cosmo OS is the source of truth the intern must use.
- The bank reconciliation desk page and verify script supplied by the intern are reference for data shape and downstream process only — they are not delivered as Cosmo OS features under this spec.
- Sales invoice entry uses Cosmo OS POS/order typeahead to suggest and fill the full invoice number and autofill payment amount(s) from the order; merchants can edit amounts before save. Exact which OS order identifier is labeled “full invoice number” and how a single order total maps into Cash/Card/KOKO/Bank columns is resolved at planning against existing order/payment fields.

## Out of Scope

- Running or embedding ERP verification / match status on the merchant page
- Finance bank statement upload, clearance, or live `book_note_verified` desk notifications
- Changing how Sales Invoices or Payment Entries are created in ERP
- Merchant mobile native app (web page in Cosmo OS is sufficient for v1)
