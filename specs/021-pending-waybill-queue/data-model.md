# Data Model: Pending Waybill Queue

**Feature**: `021-pending-waybill-queue`  
**Date**: 2026-07-23

## Existing entities (reuse — no new tables for v1)

### OrderWaybill

One courier tracking row per company + waybill number.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id | |
| companyId | String | FK → Company |
| orderId | String? | FK → Order; **null = unmatched** |
| uploadId | String? | FK → WaybillUpload (latest import that wrote this row) |
| invoiceNumber | String | Courier reference / invoice / order no from file |
| waybillNo | String | Unique with companyId |
| courierName | String? | |
| source | String | e.g. `csv_upload`, `xlsx_upload`, `manual` |
| rawPayload | Json? | Full courier row for details popup |
| uploadedAt | DateTime? | Last import/update time for this waybill |
| createdAt / updatedAt | DateTime | |

**Unique**: `@@unique([companyId, waybillNo])` — re-import of same waybill **updates** (latest wins).

**Indexes (existing)**: `companyId+invoiceNumber`, `companyId+uploadId`, `companyId+orderId+createdAt`, `companyId+createdAt`.

### WaybillUpload

One imported file batch.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id | |
| companyId | String | FK → Company |
| uploadedById | String? | FK → User |
| fileName | String | |
| fileType | String | `csv` \| `xlsx` \| `xls` |
| totalRows | Int | |
| importedRows | Int | Valid rows upserted |
| invalidRows | Int | Missing invoice or waybill |
| unmatchedRows | Int | Imported rows with no OS order at import time (must be populated accurately) |
| status | String | `processing` \| `completed` (and failed if ever used) |
| summary | Json? | Mirror of counts |
| createdAt / updatedAt | DateTime | |

### Order (read fields for pending)

| Field | Relevance |
|-------|-----------|
| id | Link target for `OrderWaybill.orderId` |
| name, orderNumber, shopifyOrderId, erpnextInvoiceId | Invoice/reference match candidates |
| deliveryCompleteAt | Non-null → exclude from pending list when matched |
| fulfillmentStage / customer fields | Optional summary in details |

## Derived concepts (application-level)

### Pending waybill

```text
pending = orderId IS NULL
       OR linked Order.deliveryCompleteAt IS NULL
```

```text
not pending (hidden from default list) =
  orderId IS NOT NULL
  AND Order.deliveryCompleteAt IS NOT NULL
```

Hidden rows remain in `OrderWaybill` and searchable.

### Match status

| Status | Condition |
|--------|-----------|
| `unmatched` | `orderId` is null |
| `matched` | `orderId` is non-null |

### Upload history row

Projection of `WaybillUpload` + uploader display name for UI (newest `createdAt` first).

## State transitions

```text
[imported unmatched] ──(rematch finds Order)──► matched pending
[matched pending]    ──(Order.deliveryCompleteAt set)──► hidden from pending list (still searchable)
[matched hidden]     ──(deliveryCompleteAt cleared, rare)──► matched pending again
[any waybill]        ──(re-import same waybillNo)──► fields/uploadId updated; orderId re-resolved
```

No staff “archive” transition in v1.

## Validation rules

- Import file: CSV/XLSX/XLS; max 10,000 rows; each imported row requires normalized invoice/reference and waybill number.
- Page-data query params: `page` ≥ 1; `limit` bounded (default 50, max per existing `LIMITS` / pagination convention).
- Rematch: company-scoped only; never attach an order from another company.
- Auth: `fulfillment.waybill_lookup.read` for list/search; `fulfillment.waybill_lookup.import` for upload.
- IDs in path params (if any rematch-by-id): `cuidSchema`.

## Relationships

```text
Company 1──* WaybillUpload 1──* OrderWaybill
Company 1──* OrderWaybill *──0..1 Order
User 0..1──* WaybillUpload (uploadedBy)
```

## Optional migration (only if needed)

If pending list performance requires it after measurement:

- Consider additional index supporting pending filter + sort, e.g. on `OrderWaybill(companyId, uploadedAt DESC)` or a partial index for `orderId IS NULL`.
- Must use `npm run db:migrate:create` and deploy to all three DBs before calling the change complete.
