# Data Model: ERP Return SI Link

**Feature**: `005-erp-return-si-link`  
**Date**: 2026-07-15

## Entities

### Order (existing — extended)

| Field | Type | Notes |
|-------|------|--------|
| erpnextInvoiceId | string? | **Original** ERP Sales Invoice (unchanged) |
| shopifyOrderId / name / orderNumber | string | Existing Shopify / display refs (unchanged) |
| financialStatus | string? | Set to `voided` on credit note (existing) |
| fulfillmentStage | enum | Set to `returned` on credit note (existing) |
| **erpReturnSalesInvoiceIds** | **String[]** | **New.** ERP Return SI / credit-note SI document names linked to this original order. Default `[]`. Deduped, trimmed, order of first-seen preserved |
| rawPayload | Json? | May still contain legacy `erpReturnSalesInvoiceNames` during transition; not the source of truth after migration |

### Relationships (logical)

```text
Original Order 1 ── N Return SI document names (erpReturnSalesInvoiceIds)
Original Order 1 ── 1 Original SI (erpnextInvoiceId)
ERP Return SI ──return_against──▸ Original SI (ERP system of record)
```

No new Prisma models. Return SI is **not** a separate Order row for this feature when an original exists.

## Validation rules

- Each array element: non-empty trimmed string; max length aligned with ERP SI name limits (reuse existing invoice name truncation if any; otherwise ≤ 140).
- Deduplicate case-sensitively as ERP returns (ERP names are typically exact); avoid inserting blanks.
- Never replace `erpnextInvoiceId` with a Return SI value.
- Multiple Return SIs allowed (partial returns / repeated notes).

## State transitions

| Event | Order financial / stage | erpReturnSalesInvoiceIds |
|-------|-------------------------|---------------------------|
| Return SI webhook with `return_against` matched | voided + returned (unless skip-void protection) | Append Return SI name |
| Skip-void protected (finance revert / rearrange active) | Unchanged by CN path | Still append Return SI name when known |
| Original SI status “Credit Note Issued” without return name | voided + returned (existing) | Unchanged unless reconcile discovers Return SI |
| Recovery backfill | No invent void on active orders | Append discovered Return SI names |
| Duplicate webhook same Return SI | No duplicate void side effects | No duplicate array entry |

## Indexes

- Optional: GIN on `erpReturnSalesInvoiceIds` if production search volume warrants it after UAT; not required for v1 if suffix search uses efficient `EXISTS` + company scope.
- Existing `@@index([erpnextInvoiceId])` remains for original SI.

## Legacy backfill

Source for one-time copy:

- `rawPayload.erpReturnSalesInvoiceNames` (string array) → merge into `erpReturnSalesInvoiceIds`
- ERP list where `return_against` = original `erpnextInvoiceId` / name variants (recovery)
