# Feature Specification: Vault Supplement Contact Import

**Feature Branch**: `062-vault-supplement-contacts`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Cosmo OS already has contact details with purchase history. Supplement Vault ERP holds the supplement brand item list. Copy Cosmo OS contacts who bought those items into Supplement Vault, with purchase-history lines limited to supplement items, and update Vault OS customer purchase history. This is a one-time import. Provide the column headers for a spreadsheet template that staff can fill or correct, then upload."

## Clarifications

### Session 2026-10-06

- Q: Does a new phone from the file get added to Contact Master? → A: **Yes.** Each new phone becomes one Vault OS Contact Master contact. A phone already on Contact Master stays that same contact. The import does not create a second contact for the same number.
- Q: Can Customer Insight use this data? → A: **Yes.** On Vault OS, Customer Insight phone search opens that Contact Master contact and uses the imported supplement purchases: invoices, item lines, and spend. Cosmetics lines stay out. Existing Insight access rules stay in force. The import does not assign a merchant.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload the file into Vault OS (Priority: P1)

A Vault OS staff member who manages contacts uploads one spreadsheet. Each data row is one supplement purchase line for one customer. Vault OS creates a contact when that person is new, or matches an existing contact, and shows those lines on that contact’s purchase history. Cosmetics lines never appear. Uploading the same file again does not create a second copy of the same purchase line.

**Why this priority**: This is the import. Without the upload, contacts and purchase history do not move to Vault OS.

**Independent Test**: Upload a small file with two customers, one of them already on Vault OS, and one row whose item code is not a Supplement Vault item. New contact appears, existing contact gains only the new supplement line, the bad row is listed as rejected, and a second upload of the same file does not add duplicate lines.

**Acceptance Scenarios**:

1. **Given** a spreadsheet whose first row is the template headers and whose later rows are valid supplement lines, **When** an authorized staff member uploads it on Vault OS, **Then** each distinct customer is present on Vault OS and each accepted line appears on that customer’s purchase history.
2. **Given** a row whose phone or email already belongs to a Vault OS contact, **When** the file is uploaded, **Then** that existing contact is used, empty profile fields may be filled from the file, and fields that already have a value stay as they are.
3. **Given** the same `source_ref`, invoice number, and item code were already imported, **When** the file is uploaded again, **Then** that purchase line is updated in place and the contact’s purchase count does not increase.
4. **Given** a row whose item code is not on the Supplement Vault ERP item list, **When** the file is uploaded, **Then** that row is rejected, it is not stored on any purchase history, and the rest of the file still processes.
5. **Given** the upload finishes, **When** staff view the result, **Then** they see counts for rows accepted, contacts created, contacts matched, purchase lines added, purchase lines updated, and each rejected row with its row number and reason.
6. **Given** a user who cannot manage Vault OS contacts, **When** they try to download the template or upload a file, **Then** the action is refused.

---

### User Story 2 - Start from a blank template (Priority: P1)

Staff download a blank spreadsheet that already has the agreed header row. They type or paste customers and supplement purchase lines, save the file, and upload it as in User Story 1.

**Why this priority**: The business asked to build the file by hand from a known header list, then correct it and upload it.

**Independent Test**: Download the blank file, confirm the header row matches the template below, add one valid customer line, upload it, and see that line on Vault OS purchase history.

**Acceptance Scenarios**:

1. **Given** an authorized staff member, **When** they download the blank template, **Then** the purchase sheet’s first row contains exactly the headers in the Import File Template section, in that order, and there are no data rows.
2. **Given** the blank template, **When** staff add rows under those headers and upload the file, **Then** Vault OS accepts the file using those header names.
3. **Given** a file whose header row is missing a required header or renames one, **When** it is uploaded, **Then** the whole file is rejected and no contacts or purchase lines are written.

---

### User Story 3 - Review a draft taken from Cosmo OS (Priority: P2)

Staff download a draft spreadsheet, using the same headers, already filled from Cosmo OS. The draft includes only contacts who bought at least one item that exists on the Supplement Vault ERP item list. Each row is one of those supplement lines. Cosmetics lines and contacts who never bought a supplement item are left out. Staff may add, delete, or correct rows, then upload the file to Vault OS.

**Why this priority**: Hand-building every historical line is slow and easy to miss. The draft is the one-time extract; the upload in User Story 1 is what updates Vault OS. Staff still control the file before it is applied.

**Independent Test**: A Cosmo OS contact with one supplement line and one cosmetics line on the same invoice produces one draft row for the supplement line only. A contact with only cosmetics lines does not appear. After staff delete a draft row and upload, that deleted line is not on Vault OS.

**Acceptance Scenarios**:

1. **Given** Cosmo OS purchase history and the Supplement Vault ERP item list, **When** staff download the draft, **Then** every row’s item code exists on that item list and every included contact has at least one such row.
2. **Given** an invoice that mixes supplement items and cosmetics items, **When** the draft is created, **Then** only the supplement lines are present and the purchase amount stored later is the sum of the uploaded supplement lines, not the original mixed invoice total.
3. **Given** a cancelled Cosmo OS purchase, **When** the draft is created, **Then** that purchase is omitted.
4. **Given** staff change a phone, item code, quantity, or price in the draft and upload it, **When** Vault OS purchase history is opened, **Then** it shows the edited values, not the original Cosmo OS values.

---

### User Story 4 - Contact Master and Customer Insight (Priority: P1)

A new phone in the file is added to Vault OS Contact Master. Staff and merchants then search that phone on Vault OS Customer Insight and see the imported supplement purchases: who the customer is, which invoices, which items, and how much they spent on those lines.

**Why this priority**: Contact Master is where the number must live. Customer Insight is how the business uses that customer after the import.

**Independent Test**: Upload one new phone with two supplement lines. Contact Master shows one contact for that phone. Customer Insight search of that phone shows both lines and a spend total equal to those two lines. Search the same phone again after a second upload of the same file and the contact count is still one.

**Acceptance Scenarios**:

1. **Given** the file has a phone that is not on Vault OS Contact Master and at least one accepted supplement line, **When** the upload finishes, **Then** Contact Master has one new contact for that phone with the name and purchase lines from the file.
2. **Given** the file has a phone already on Vault OS Contact Master, **When** the upload finishes, **Then** that same contact is kept and the accepted supplement lines are added to it.
3. **Given** the new contact has a phone, **When** a permitted user searches that phone on Vault OS Customer Insight, **Then** Insight shows that contact and the imported supplement invoices, item lines, and spend.
4. **Given** a contact was imported with supplement lines only, **When** Customer Insight shows spend, items, and invoices, **Then** those figures include the imported supplement lines and exclude cosmetics lines that were left out of the file.
5. **Given** a new contact was created by this import, **When** Customer Insight is opened, **Then** the contact has no merchant assignment from the file. The sales-person name on a purchase line stays on that purchase. Existing Insight access rules still decide who sees the full page.

---

### Edge Cases

- A row with neither phone nor email is rejected. Nothing is created from that row.
- Phone matches one Vault OS contact and email matches a different Vault OS contact. The row is rejected as ambiguous and listed in the result.
- Quantity is zero, blank, or negative, the date is not a real calendar date, item code is blank, or unit price is missing. The row is rejected. Other rows still import.
- The same `source_ref`, invoice number, and item code appear twice in one file. The later row replaces the earlier one for that upload.
- A customer’s every row is rejected. No new contact is created for that customer.
- A new contact is created only from accepted rows. Profile fields come from the first accepted row for that customer in the file; later rows do not overwrite a value already set during that upload.
- Line amount is blank. Vault OS uses quantity times unit price. When line amount is present, that amount is kept.
- The file has only the header row. The upload finishes with zero changes and says there were no data rows.
- Cosmo OS contacts, Cosmo OS purchase history, and Supplement Vault ERP items are not changed by the draft download or the upload.
- Extra columns beyond the template are ignored. Missing optional columns are allowed. Missing required headers reject the file.
- Several rows share one new phone. Contact Master gains one contact. All accepted lines for that phone sit on that contact.
- A row has an email and no phone. Contact Master can still store that customer. Customer Insight phone search cannot open them until a phone is on the contact.
- The `merchant` column is the sales person on that purchase. It does not allocate the contact to a merchant.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Vault OS MUST let authorized contact staff download a blank spreadsheet template and upload a completed spreadsheet. The business process is a one-time migration, not a standing feed.
- **FR-002**: The import MUST be a one-time file import. Vault OS MUST NOT keep copying Cosmo OS purchases on a schedule after this import.
- **FR-003**: Staff MUST be able to correct the file and upload it again. A repeated line with the same `source_ref`, invoice number, and item code MUST update the existing Vault OS purchase line and MUST NOT add a duplicate.
- **FR-004**: Each data row MUST represent one purchase line for one customer. Contact columns on that row identify the customer.
- **FR-005**: A row MUST include `customer_name`, `invoice_no`, `invoice_date`, `item_code`, `item_name`, `quantity`, `unit_price`, and `source_ref`. At least one of `phone` or `email` is required.
- **FR-006**: `invoice_date` MUST be a calendar date written as `YYYY-MM-DD`.
- **FR-007**: Vault OS MUST accept a row only when `item_code` matches an item on the Supplement Vault ERP item list. All other item rows MUST be rejected.
- **FR-008**: Vault OS MUST match an existing contact by phone first, then by email. When both identify different contacts, the row MUST be rejected.
- **FR-009**: For a matched contact, the upload MUST fill profile fields that are empty and MUST leave profile fields that already have a value unchanged.
- **FR-010**: New Contact Master contacts MUST receive name, phone, email, address, city, and district from the accepted rows. Loyalty, merchant assignment, reminders, call-queue placement, and extra phone or email lists MUST NOT be copied.
- **FR-011**: Accepted lines MUST appear on that Vault OS contact’s customer purchase history, grouped under the invoice number and invoice date, with item name, item code, quantity, and unit price visible.
- **FR-012**: The amount shown for an imported invoice MUST be the sum of its accepted supplement lines, not a cosmetics-inclusive total from Cosmo OS.
- **FR-013**: Optional columns `address`, `city`, `district`, `line_amount`, `currency`, `payment_method`, `location`, and `merchant` MUST be stored when provided. Blank `currency` MUST be treated as LKR.
- **FR-014**: The upload result MUST list every rejected row with row number and a reason a staff member can fix in the file.
- **FR-015**: A header row that does not contain the required headers MUST reject the entire file with no writes.
- **FR-016**: Staff MUST be able to download a draft, using the same headers, of Cosmo OS contacts who bought at least one Supplement Vault ERP item, containing only those supplement lines, excluding cancelled purchases.
- **FR-017**: Preparing or uploading the file MUST NOT change Cosmo OS contacts, Cosmo OS purchase history, or Supplement Vault ERP items.
- **FR-018**: The upload MUST NOT create or edit customers inside Supplement Vault ERP. Supplement Vault ERP is the item list used to decide which lines qualify.
- **FR-019**: A phone that is not already on Vault OS Contact Master MUST create one Contact Master contact. The same phone MUST NOT create a second contact on a later row or a later upload.
- **FR-020**: Vault OS Customer Insight MUST open an imported contact by phone search and MUST include that contact’s imported supplement invoices, item lines, and spend. Cosmetics lines omitted from the file MUST stay out of those Insight figures.

### Import File Template

One sheet named `Purchases`. Row 1 is the header row. Data starts on row 2. A second sheet may explain the columns; it is not imported.

| Header | Required | What staff enter |
|--------|----------|------------------|
| customer_name | Yes | Customer name |
| phone | Phone or email | Primary phone |
| email | Phone or email | Primary email |
| address | No | Street address |
| city | No | City |
| district | No | District |
| invoice_no | Yes | Invoice or order number to show on purchase history |
| invoice_date | Yes | Purchase date as `YYYY-MM-DD` |
| item_code | Yes | Item code that exists on Supplement Vault ERP |
| item_name | Yes | Item name to show on the line |
| quantity | Yes | Quantity greater than zero |
| unit_price | Yes | Price per unit |
| line_amount | No | Line total; blank means quantity times unit price |
| currency | No | Blank means LKR |
| payment_method | No | How the purchase was paid |
| location | No | Store or channel name |
| merchant | No | Sales person name |
| source_ref | Yes | Stable id for this purchase from Cosmo OS, or a unique id staff assign for a hand-typed row |

Example data row (one supplement line):

| customer_name | phone | email | address | city | district | invoice_no | invoice_date | item_code | item_name | quantity | unit_price | line_amount | currency | payment_method | location | merchant | source_ref |
|---------------|-------|-------|---------|------|----------|------------|--------------|-----------|-----------|----------|------------|-------------|----------|----------------|----------|----------|------------|
| Nimal Perera | 0771234567 | nimal@example.com | 12 Galle Rd | Colombo | Colombo | INV-1001 | 2024-03-15 | SV-WHEY-1KG | Whey Protein 1kg | 2 | 15000 | 30000 | LKR | Cash | Website | Kamal | COSMO-ORD-1001 |

### Key Entities

- **Import file**: One spreadsheet staff create, review, and upload. One row is one supplement purchase line plus the customer identity for that line.
- **Contact Master contact**: The Vault OS customer record created or matched by phone. Customer Insight reads this record.
- **Customer purchase history**: The purchases a staff member sees on a Vault OS contact. This import adds or updates supplement lines only.
- **Supplement item**: An item whose code exists on the Supplement Vault ERP item list. That list decides which lines qualify. Cosmetics items do not qualify.
- **Source reference**: The value that, together with invoice number and item code, identifies one purchase line across a corrected re-upload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can download the blank template and confirm all 18 headers in under 2 minutes.
- **SC-002**: After a successful upload, every accepted line is visible on the matching Vault OS contact’s purchase history, and a reviewer finds no cosmetics item from that file.
- **SC-003**: At least 95% of rows in a staff-corrected file either import or return a specific row-level reason on the first upload.
- **SC-004**: Uploading a file of 5,000 data rows shows the result summary within 5 minutes.
- **SC-005**: Uploading the same accepted file a second time leaves the number of purchase lines unchanged.
- **SC-006**: A mixed Cosmo OS invoice contributes only its supplement lines to the draft, and the Vault OS invoice amount equals the sum of those uploaded lines.
- **SC-007**: After upload, 100% of sampled new phones appear once in Contact Master, and Customer Insight phone search shows the imported supplement invoices, items, and spend for each sampled phone.

## Assumptions

- Destination is Vault OS Contact Master and the purchase history Customer Insight already shows for that contact. Supplement Vault ERP supplies the item list only. ERP customer records are out of scope.
- “Supplement item” means the purchase line’s item code matches an item code on the Supplement Vault ERP item list. Name-only matches are not used. Staff can correct a code in the file before upload.
- Cosmo OS purchase history used for the draft includes both current Cosmo OS sales and older imported purchase history already shown on the contact. Cancelled purchases are excluded.
- Phone matching ignores spaces, dashes, and a leading country code of +94 or 94 when the rest of the number matches. Email matching ignores letter case and surrounding spaces.
- This import does not delete Vault OS purchase history. Rows removed from a later file stay on Vault OS.
- Loyalty status, assigned merchant, reminders, call queue, and secondary phones or emails are out of scope.
- Currency is Sri Lankan rupees when the currency cell is blank.
- One authorized staff member runs the draft, review, and upload. There is no recurring sync.
