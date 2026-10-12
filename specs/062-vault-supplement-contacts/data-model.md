# Data Model: Vault Supplement Contact Import

**Feature**: `specs/062-vault-supplement-contacts`  
**Date**: 2026-10-06

No new table. One new column on the purchase-history row Insight and Contact Master already read.

## AdaptPurchaseHistory (extend)

Existing invoice row. This import adds `origin` and uses the current unique key.

| Field | Change | Rule |
|-------|--------|------|
| `origin` | **New** `String`, default `adapt` | `adapt` for rows already in the database. `vault_supplement_import` for this file. |
| `companyId` | unchanged | Vault OS company on upload. Cosmo company is only read when building the draft. |
| `contactId` | unchanged | Contact Master contact created or matched for this customer. |
| `adaptInvoiceKey` | unchanged unique with `companyId` | `vsupp:{source_ref}\|{invoice_no}`. Prefix keeps Adapt keys intact. |
| `salesInvoiceNo` | unchanged | `invoice_no` from the file. |
| `invoiceDate` | unchanged | Colombo calendar day from `invoice_date`. |
| `ttlAmount` | unchanged | Sum of line amounts on this invoice after the merge. Not the Cosmo mixed-invoice total. |
| `currency` | unchanged | File value, or `LKR` when blank. |
| `locationName` | unchanged | `location` when provided. |
| `paymentMethod` | unchanged | `payment_method` when provided. |
| `merchantKnownName` | unchanged | `merchant` when provided. Does not set `ContactMaster.assignedMerchant`. |
| `lineItems` | unchanged JSON | Array of supplement lines. See line shape below. |
| `importBatchId` | unchanged | Id of the upload that last touched the row. |
| `companyLocationId` | unchanged | Left null. `location` stays text. |
| `salesInvoiceMasterId`, `adaptMerchantId`, `adaptCustomerMasterId`, `rawPaymentContext` | unchanged | Left null for this import. |

**Line shape** (same object Contact Master and Insight already render via `adaptLineItemsForPurchaseUi`):

| JSON field | File column |
|------------|-------------|
| `id` | `{adaptInvoiceKey}:{item_code}` |
| `itemCode` | `item_code` |
| `itemName` | `item_name` |
| `quantity` | `quantity` |
| `unitPrice` | `unit_price` as a decimal string |
| `lineAmount` | `line_amount`, or `quantity * unit_price` when blank |
| `itemId` | null |

**Merge**: Load the invoice by `(companyId, adaptInvoiceKey)`. Replace a line when `itemCode` matches. Keep lines whose `itemCode` is not in this upload. Recompute `ttlAmount`. Do not delete the invoice when the file omits it.

**Index**: Existing `(companyId, adaptInvoiceKey)` unique is the upsert key. No extra index.

## ContactMaster (write existing fields only)

Created when the normalized phone (else email) matches nobody in the Vault company.

| Field | On create | On match |
|-------|-----------|----------|
| `companyId` | Vault company | unchanged |
| `name` | `customer_name` | unchanged when already set; fill when empty |
| `phoneNumber` | normalized phone | fill when empty |
| `email` | normalized email | fill when empty |
| `address`, `city`, `district` | from the file when present | fill when empty |
| `source` | `vault-supplement-import` | unchanged |
| `osRegistrationCreated` | `false` | unchanged |
| `assignedMerchant`, loyalty fields, `remindAt`, call queue | unset | unchanged |
| `lastPurchaseAt` | latest imported invoice date | move forward only when an imported date is newer |
| `purchaseOrderCount`, `purchaseTotalValue`, `purchaseLastOrderAt` | recomputed by the existing purchase-summary helper for this contact | same |

Also ensure the primary `ContactPhone` / `ContactEmail` row exists when that value was written, using the current contact-identifier helpers. Do not import extra phones or emails.

**Identity inside one file**: Group rows by normalized phone, else normalized email. One group becomes one contact.

**Ambiguous**: Phone variants hit one contact and the email hits another, or either side hits more than one contact. Reject every row in that group. Do not create.

## File rows (not stored as their own table)

Validated in memory, then folded into the invoice JSON.

| Column | Required on the row | Notes |
|--------|---------------------|-------|
| `customer_name` | yes | |
| `phone` | phone or email | Normalized with existing phone variants |
| `email` | phone or email | Trimmed, lowercased |
| `address`, `city`, `district` | no | |
| `invoice_no` | yes | |
| `invoice_date` | yes | `YYYY-MM-DD` only |
| `item_code` | yes | Must be in the Vault ERP code set loaded for this request |
| `item_name` | yes | |
| `quantity` | yes | Finite number > 0 |
| `unit_price` | yes | Finite number |
| `line_amount` | no | Finite number when present |
| `currency` | no | Default `LKR` |
| `payment_method`, `location`, `merchant` | no | |
| `source_ref` | yes | Stable id. With `invoice_no` and `item_code`, identifies the line across uploads |

Sheet name `Purchases`. Header match is by name. A missing required header rejects the file with no writes. Sheet `Guide` and extra columns are ignored.

## Item code set (not stored)

In-memory set for one request. Union of Supplement Vault ERP1 and ERP2 stock item codes, using the catalog-sync filters (skip disabled except force-included SKUs; skip `DELIVERY-CHARGES` and `TEST`).

The Cosmo draft does not query this ERP. It receives the codes in an uploaded workbook with header `item_code`.

## Relationships

```text
Vault ERP item codes
        │  (file: item_code column)
        ▼
Cosmo OS orders + Adapt history ──draft xlsx──► staff edit
                                                      │
                                                      ▼
                                            Vault OS upload
                                                      │
                        ┌─────────────────────────────┴──────────────────────────┐
                        ▼                                                        ▼
                 ContactMaster                                          AdaptPurchaseHistory
                 (create or match)                                      origin = vault_supplement_import
                        │                                                        │
                        └────────────────────┬───────────────────────────────────┘
                                             ▼
                              Contact purchase history UI
                              Customer Insight (phone search)
```

## State

No workflow states. A row is rejected or accepted. An accepted line is inserted or replaced inside its invoice. Contacts are created or matched. Nothing in this import is cancelled later by omitting a row.
