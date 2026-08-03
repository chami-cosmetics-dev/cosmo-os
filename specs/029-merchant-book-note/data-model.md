# Data Model: Merchant Daily Book Note

**Feature**: `029-merchant-book-note`  
**Date**: 2026-08-03

## Entities

### BookNoteDay

One ledger for one shop location and one Colombo calendar sales date.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | Tenant |
| companyLocationId | string | FK → CompanyLocation (“outlet”) |
| postingDate | date | Calendar date only (YYYY-MM-DD semantics); unique with location |
| createdByUserId | string? | User who last saved |
| updatedByUserId | string? | |
| createdAt | datetime | |
| updatedAt | datetime | |

**Constraints**:
- `@@unique([companyLocationId, postingDate])`
- `@@index([companyId, postingDate])`
- Location must belong to `companyId`

**Lifecycle**:
- Created on first successful merchant save for location+date
- Updated on same-day re-save (metadata + row replace)
- Merchant-locked for writes when `postingDate < today(Asia/Colombo)`
- Never deleted in v1 (rows replaced; day row kept)

### BookNoteRow

One physical-book line.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| bookNoteDayId | string | FK → BookNoteDay, onDelete Cascade |
| idxNo | string | Merchant line index (display); length-limited |
| salesInvoice | string | Full invoice number stored |
| cash | Decimal(12,2) | ≥ 0 |
| card | Decimal(12,2) | ≥ 0 |
| koko | Decimal(12,2) | ≥ 0 |
| bankTransfer | Decimal(12,2) | ≥ 0 |
| orderId | string? | Optional FK → Order when suggestion used |
| sortOrder | int | Stable order within day (0..n) |

**Derived (not stored)**:
- `rowTotal` = cash + card + koko + bankTransfer
- `isMultiMethod` = count of amounts > 0 among the four > 1

**Constraints**:
- At least one of cash/card/koko/bankTransfer > 0
- `salesInvoice` non-empty trimmed
- `@@index([bookNoteDayId, sortOrder])`
- `@@index([salesInvoice])` optional for support lookups

### CompanyLocation (existing)

Shop context. Book notes do not modify this model. Expose `id`, `name`, `shortName`, `erpnextCompany` on APIs as `company` / outlet labels.

### Order (existing, read-only for suggestions)

Used only for typeahead + autofill. No schema change required on Order.

## Validation rules (server)

| Rule | Enforcement |
|------|-------------|
| `companyLocationId` cuid + same company | Zod + DB check |
| `postingDate` ISO date | Zod |
| Merchant write only if postingDate === today Asia/Colombo | `formatAppIsoDate` |
| Rows array max length (e.g. 500) | Zod / LIMITS |
| Per-row invoice max length | LIMITS (add `bookNoteSalesInvoice` ~80–120) |
| Amounts ≥ 0, max 2 decimal money | Decimal / Zod |
| Skip or reject blank rows (no invoice and all zero) | Prefer strip empties; reject rows with amounts but no invoice |
| Duplicate invoices | Allowed; client may warn |

## Relationships

```text
Company
  └── CompanyLocation
        └── BookNoteDay (unique per postingDate)
              └── BookNoteRow[]
                    └── Order? (optional orderId)
User (createdBy / updatedBy)
```

## State transitions (BookNoteDay)

```text
[none] --merchant save today--> Editable (today)
Editable --merchant re-save today--> Editable (rows replaced)
Editable --calendar day ends (Colombo)--> MerchantLocked
MerchantLocked --merchant save--> REJECT (DAY_LOCKED)
MerchantLocked --finance GET--> OK (read)
```

## Retrieve DTO mapping (intern-aligned)

| Stored | External field |
|--------|----------------|
| location.erpnextCompany \|\| location.name | `company` |
| postingDate | `posting_date` (YYYY-MM-DD) |
| idxNo | `idx_no` |
| salesInvoice | `sales_invoice` |
| cash | `cash` |
| card | `card` |
| koko | `koko` |
| bankTransfer | `bank_transfer` |
