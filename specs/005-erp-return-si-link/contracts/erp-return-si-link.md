# Contract: ERP Return SI Link

**Feature**: `005-erp-return-si-link`  
**Date**: 2026-07-15

## 1. Orders list page-data (search)

**Endpoint**: `GET /api/admin/orders/page-data` (existing)

**Change**: When `search` / `q` is present, results include orders whose `erpReturnSalesInvoiceIds` match the term with the **same endsWith / insensitive** semantics as `erpnextInvoiceId`.

**List item field** (add):

```json
{
  "id": "…",
  "erpnextInvoiceId": "ACC-SINV-2026-00123",
  "erpReturnSalesInvoiceIds": ["ACC-SINV-2026-00999"],
  "financialStatus": "voided"
}
```

Empty array omit or `[]` — UI hides Return SI chrome when empty.

## 2. Order detail

**Endpoint**: `GET /api/admin/orders/[id]` (existing)

**Response addition**:

```json
{
  "erpnextInvoiceId": "ACC-SINV-2026 and original",
  "erpReturnSalesInvoiceIds": ["ACC-SINV-RETURN-001"]
}
```

UI labels:
- Original: existing ERP SI / invoice link
- Return: **Return SI** (or **Credit note SI**) — distinct; may link to ERP SI URL pattern using each id

## 3. Credit-note / return webhook (behavior contract)

**Endpoint**: `POST /api/webhooks/erpnext/sales-invoice` (existing)

When payload is a return invoice (`is_return` / negative grand total / `return_against` set):

| Condition | HTTP / result | OS effect |
|-----------|---------------|-----------|
| `return_against` resolves to original OS order | `ok: true, returned: true` | Original voided/returned per existing rules; **append** `data.name` to `erpReturnSalesInvoiceIds` |
| Protected skip-void | still `returned`/handled as today | **Append** Return SI id; do not force void |
| No matching original | `ok: true, skipped: true` | Do not attach Return SI to an unrelated order |

Original order’s `erpnextInvoiceId` MUST remain the original SI.

## 4. Recovery (optional admin)

**Suggested**: `POST /api/admin/erp-migrations/recover-return-si`  
**Auth**: same class as other `erp-migrations` routes (admin / settings.manage)

**Body** (example):

```json
{
  "orderId": "cuid…",
  "limit": 25,
  "dryRun": true
}
```

**Behavior**:
- Resolve original SI from order
- List ERP Sales Invoices with `return_against` = variants of that SI
- Append submitted/submitted-cancelled return names to `erpReturnSalesInvoiceIds`
- `dryRun: true` → report only
- Must not void active orders solely because a Return SI exists (void is separate existing reconcile path)

**Response** (example):

```json
{
  "checked": 10,
  "updated": 3,
  "results": [
    {
      "orderId": "…",
      "originalInvoice": "ACC-SINV-…",
      "returnInvoiceNames": ["ACC-SINV-R-…"],
      "status": "updated"
    }
  ]
}
```

## 5. Permissions

- List / detail / search: existing orders permissions
- Recovery: restricted to erp-migration / settings admin pattern (not all merchandisers)
