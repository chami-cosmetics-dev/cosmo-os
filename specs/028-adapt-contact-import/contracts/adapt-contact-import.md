# Contract: Adapt Contact Import (CLI + Contact History API)

**Feature**: `028-adapt-contact-import`  
**Date**: 2026-07-31

## 1. CLI — `scripts/import-adapt-sales-invoices.cjs`

### Invocation

```text
node scripts/import-adapt-sales-invoices.cjs \
  --company-id <cuid> \
  --file <path-to-csv-or-xlsx> \
  [--map <path-to-location-map.json>] \
  [--dry-run] \
  [--resume <path-to-checkpoint.json>] \
  [--report <path-to-report.json>] \
  [--batch-size <n>]
```

### Modes

| Flag | Behavior |
|------|----------|
| `--dry-run` | Classify all rows; print counts; **no DB writes** |
| (omit) | Real import: create/enrich contacts; upsert `AdaptPurchaseHistory` |
| `--resume` | Skip invoice keys listed as completed in checkpoint file |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Completed (dry-run or real); see report for row-level skips/errors |
| 1 | Fatal (missing args, unreadable file, company not found, DB error abort) |

### Report shape (stdout summary + optional `--report` JSON)

```json
{
  "companyId": "c…",
  "dryRun": true,
  "rowsRead": 0,
  "contactsWouldCreate": 0,
  "contactsWouldEnrich": 0,
  "purchasesWouldUpsert": 0,
  "skipped": 0,
  "failed": 0,
  "ambiguous": 0,
  "skipReasons": {
    "cancelled_or_deleted": 0,
    "no_identifier": 0,
    "bad_amount_or_date": 0
  }
}
```

Real run uses `contactsCreated`, `contactsEnriched`, `purchasesUpserted` instead of `Would*` fields.

### Input columns (accepted headers; normalized case/typos)

**Primary file**: `invoice_data_headers.csv` (86 columns). Alternate lean file `sales_invoice_master.csv` (72 columns) lacks `location_name` / `KnownName` / `in_payment_type_name` — not the default.

Required for a successful purchase row (after skip rules): usable phone or email + parseable invoice identity + date + amount.

Key mapped fields:  
`customer_tp`, `customer_tp_raw`, `customer_email`, `attention_name`, `invoice_date` (`D/M/YYYY`), `sales_invoice_no`, `sales_invoice_master_id`, `ttl_amount`, `location_name`, `sales_location_id`, `merchent_id`, `KnownName`, `payment_methode`, `in_payment_type_name`, `active_flag`, `deleted_on`, `cancel_coment`, optional CRM (`district`, `zone`, `customer_shipping_address`, `post_code`, `nearest_outlet`, notes), payment amounts (`invoice_payment_cash_amount`, `invoice_payment_card_amount`).

---

## 2. Contact purchase history API (extended)

### `GET /api/admin/contacts/[id]/orders`

**Auth**: existing `contacts.master.read` | `contacts.updates.read` | `contacts.read`

**Response** (additive; backward compatible):

```json
{
  "contact": { "id": "…", "name": "…", "email": "…", "phoneNumber": "…", "emails": [], "phoneNumbers": [] },
  "orders": [ /* existing Cosmo Order-shaped objects */ ],
  "adaptPurchases": [
    {
      "id": "aph…",
      "source": "adapt",
      "salesInvoiceNo": "SI-123",
      "invoiceDate": "2024-01-15T00:00:00.000Z",
      "ttlAmount": "4500.00",
      "currency": null,
      "locationName": "Colombo",
      "companyLocationId": "cl…",
      "companyLocationName": "Colombo Main",
      "paymentMethod": "Cash",
      "merchantKnownName": "Nimal",
      "lineItems": []
    }
  ]
}
```

Notes:
- `lineItems` empty for v1 (no Adapt line export).
- UI may merge `orders` + `adaptPurchases` sorted by date; Adapt rows must not link to `/api/admin/orders/{id}/invoice` unless a real Order id exists.
- Alternative acceptable contract: single `orders` array with `source: "cosmo" | "adapt"` discriminator — implement either consistently in UI.

### Mutations

None for Adapt history in v1 (import is CLI-only). Contact Updates PATCH unchanged.

---

## 3. Location map file

```json
[
  {
    "salesLocationId": "1",
    "locationName": "Head Office",
    "companyLocationId": "<CompanyLocation cuid>"
  }
]
```

Invalid `companyLocationId` for the company → treat as unmapped (text only); count warning, do not fail whole run.
