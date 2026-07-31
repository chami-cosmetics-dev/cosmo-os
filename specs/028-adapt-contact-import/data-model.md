# Data Model: Adapt Contact & Purchase History Import

**Feature**: `028-adapt-contact-import`  
**Date**: 2026-07-31

## Entities

### ContactMaster (existing)

Enriched in place; no schema change required for v1 beyond relation to new history table.

| Field (relevant) | Import behavior |
|------------------|-----------------|
| `companyId` | Required scope |
| `phoneNumber` / phones | Match key; add secondary phone if blank primary / new variant |
| `email` / emails | Secondary match; fill if blank |
| `name` | Fill if blank from `attention_name` |
| `address`, `district`, `zone`, `town`, `remarks`, … | Fill-blanks only from Adapt optional CRM columns |
| `lastPurchaseAt` | Update if Adapt invoice date is newer |
| `recentMerchant` | Update with Adapt `KnownName` when purchase snapshot advances |
| `assignedMerchant` | **Never** set from Adapt merchant id/name |
| `source` | On create only: e.g. `adapt` when blank |

### AdaptPurchaseHistory (new)

Dedicated historical purchase; never an Order.

| Field | Type | Notes |
|-------|------|-------|
| `id` | cuid | PK |
| `companyId` | string | FK Company; cascade |
| `contactId` | string | FK ContactMaster; cascade |
| `companyLocationId` | string? | FK CompanyLocation; set null on delete; optional map hit |
| `adaptInvoiceKey` | string | Idempotency key (see Identity) |
| `salesInvoiceMasterId` | string? | Adapt `sales_invoice_master_id` |
| `salesInvoiceNo` | string | Adapt invoice number |
| `invoiceDate` | DateTime | From `invoice_date` |
| `ttlAmount` | Decimal | From `ttl_amount` |
| `currency` | string? | If present in file; else null / company default display |
| `locationName` | string? | Adapt `location_name` text |
| `salesLocationId` | string? | Adapt `sales_location_id` text |
| `paymentMethod` | string? | `payment_methode` / `in_payment_type_name` |
| `merchantKnownName` | string? | Adapt `KnownName` |
| `adaptMerchantId` | string? | `merchent_id` |
| `adaptCustomerMasterId` | string? | Traceability only |
| `rawPaymentContext` | Json? | Optional cash/card amounts snapshot |
| `importBatchId` | string? | Optional run id for audit |
| `createdAt` / `updatedAt` | DateTime | Standard |

**Indexes / constraints**:
- `@@unique([companyId, adaptInvoiceKey])`
- `@@index([contactId, invoiceDate(sort: Desc)])`
- `@@index([companyId, invoiceDate])`

### Adapt Import Batch (logical / optional table)

v1 may keep batch summary as CLI stdout + optional JSON report file (`--report out.json`) rather than a DB table.

If persisted later: `id`, `companyId`, `fileName`, `dryRun`, `startedAt`, `finishedAt`, counts (createdContacts, enrichedContacts, purchasesUpserted, skipped, failed, ambiguous).

### Adapt Location Mapping (config, not required DB)

Operator-supplied JSON/CSV:

```json
[
  { "salesLocationId": "12", "locationName": "Colombo", "companyLocationId": "clxxx" }
]
```

Lookup order: `salesLocationId` exact → normalized `locationName` → unmapped (text only).

## Identity rules

1. **Contact key**: phone variants via `buildPhoneLookupVariants`; else email (case-insensitive).
2. **Best match** among multiple contacts: newer `lastPurchaseAt`, else newer `updatedAt` (same spirit as `pickBetterContact`).
3. **Purchase key** (`adaptInvoiceKey`):
   - If `sales_invoice_master_id` non-empty → `mid:{id}`
   - Else → `cmp:{sales_invoice_no}|{sales_location_id}|{yyyy-mm-dd}`

## Validation rules

- Skip purchase if cancelled/deleted/inactive flags.
- Skip contact+purchase if no phone and no email.
- Skip purchase write if amount/date unparseable; may still enrich contact.
- Amounts: Decimal; reject non-finite.
- String lengths: respect `LIMITS` from `@/lib/validation`.

## State / lifecycle

```text
Adapt row → classify → [skip | ambiguous+write-best | write]
AdaptPurchaseHistory: upsert by adaptInvoiceKey (no workflow states)
ContactMaster: create | enrich-blanks | snapshot-update
```

No transition into fulfillment stages.

## Relationships

```text
Company 1──* ContactMaster 1──* AdaptPurchaseHistory
Company 1──* CompanyLocation 1──* AdaptPurchaseHistory (optional)
```
