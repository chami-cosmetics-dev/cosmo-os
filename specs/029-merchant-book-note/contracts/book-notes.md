# Contract: Merchant Book Notes API

**Feature**: `029-merchant-book-note`  
**Date**: 2026-08-03

Auth: Auth0 session via existing `requirePermission`. All IDs validated with `cuidSchema`. Bodies/query via Zod in `@/lib/validation` (extend LIMITS as needed).

---

## 1. GET `/api/admin/book-notes/page-data`

**Permission**: `book_notes.manage`

**Query**:
| Param | Required | Description |
|-------|----------|-------------|
| companyLocationId | no | If set with `postingDate`, include saved day |
| postingDate | no | `YYYY-MM-DD` |

**Response 200**:
```json
{
  "locations": [
    { "id": "cl_...", "name": "OGF", "shortName": "OGF", "erpnextCompany": "Chami Trading (PVT) LTD" }
  ],
  "today": "2026-08-03",
  "day": null
}
```

When day exists, `day` shape matches §4 day object (without requiring finance permission).

**Errors**: 401/403; 400 invalid query; 404 location not in company.

---

## 2. GET `/api/admin/book-notes/order-suggestions`

**Permission**: `book_notes.manage`

**Query**:
| Param | Required | Description |
|-------|----------|-------------|
| companyLocationId | yes | Scope orders |
| q | yes | Min 2 chars |
| postingDate | no | Prefer orders on this Colombo day |

**Response 200**:
```json
{
  "suggestions": [
    {
      "orderId": "ord_...",
      "salesInvoice": "INV-500-00063",
      "label": "INV-500-00063",
      "totalPrice": 8000,
      "cash": 8000,
      "card": 0,
      "koko": 0,
      "bankTransfer": 0,
      "paymentGatewayPrimary": "Cash",
      "sourceName": "erpnext-pos"
    }
  ]
}
```

Limit ~20. Amounts already mapped to book-note columns (see research R4).

**Errors**: 401/403; 400 missing params.

---

## 3. PUT `/api/admin/book-notes`

**Permission**: `book_notes.manage`

**Body**:
```json
{
  "companyLocationId": "cl_...",
  "postingDate": "2026-08-03",
  "rows": [
    {
      "idxNo": "1",
      "salesInvoice": "INV-500-00063",
      "cash": 500,
      "card": 0,
      "koko": 0,
      "bankTransfer": 300,
      "orderId": "ord_..."
    }
  ]
}
```

**Behavior**: Upsert `BookNoteDay` by location+date; replace all rows in a transaction. Reject if `postingDate < today` Asia/Colombo (`code: "DAY_LOCKED"`). Strip fully empty rows. Reject row with amounts > 0 and empty invoice.

**Response 200**: day object (§4).

**Errors**: 401/403; 400 validation; 403/409 `DAY_LOCKED`; 404 location.

---

## 4. GET `/api/admin/book-notes`

**Permission**: `book_notes.read`

**Query**:
| Param | Required | Description |
|-------|----------|-------------|
| companyLocationId | yes* | Outlet scope (*or omit only if product later adds list-all; v1 require it or `from`/`to` with location) |
| postingDate | one of | Single day `YYYY-MM-DD` |
| from / to | one of | Inclusive date range (max 31 days) |

**Response 200** (intern-aligned; Cosmo extras allowed alongside):
```json
{
  "company": "Chami Trading (PVT) LTD",
  "companyLocationId": "cl_...",
  "locationName": "OGF",
  "posting_date": "2026-08-03",
  "rows": [
    {
      "idx_no": "1",
      "sales_invoice": "INV-500-00063",
      "cash": 500,
      "card": 0,
      "koko": 0,
      "bank_transfer": 300,
      "row_total": 800,
      "is_multi_method": true
    }
  ],
  "days": []
}
```

For a date range, return `{ "days": [ { same shape as single day }, ... ] }` and omit top-level `rows` **or** always use `{ days: [...] }` for consistency — **v1 prefer always `{ days: Day[] }`** even for one day.

Empty: `{ "days": [] }`.

**Errors**: 401/403; 400 invalid range.

---

## 5. Day object (shared)

```ts
type BookNoteDayDto = {
  id: string;
  companyLocationId: string;
  company: string;          // erpnextCompany || name
  locationName: string;
  posting_date: string;     // YYYY-MM-DD
  locked: boolean;          // true if posting_date < today Colombo
  rows: Array<{
    idx_no: string;
    sales_invoice: string;
    cash: number;
    card: number;
    koko: number;
    bank_transfer: number;
    row_total: number;
    is_multi_method: boolean;
    orderId?: string | null;
  }>;
};
```

---

## 6. Permissions (RBAC)

| Key | Description |
|-----|-------------|
| `book_notes.manage` | Merchant page + suggestions + save |
| `book_notes.read` | Finance/intern retrieve |

---

## 7. Non-goals

- Public unauthenticated access
- Finance PUT/edit

## 8. Send to ERP (ss9 verify)

**OS → ERP push** after merchants save:

```http
POST /api/admin/book-notes/send-to-erp
Permission: book_notes.manage
Body: { "companyLocationId": "cl_...", "postingDate": "YYYY-MM-DD" }
```

Cosmo loads the saved day and calls ERP:

```http
POST {ErpnextInstance.baseUrl}/api/method/verify_book_note
Authorization: token {apiKey}:{apiSecret}
Content-Type: application/x-www-form-urlencoded

rows_json=<json array>&company=<erpnextCompany or location name>
```

`rows_json` items: `idx_no`, `sales_invoice`, `cash`, `card`, `card_last_4` (when card > 0), `koko`, `bank_transfer` (matches `ss9_verify_book_note.py`).

Override method name with env `ERPNEXT_BOOK_NOTE_VERIFY_METHOD` (default `verify_book_note`).

**Intern must register** Server Script (API) with `api_method = verify_book_note` and paste ss9 script body.
