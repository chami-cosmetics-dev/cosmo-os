# Contracts: Customer Insight Allocation & Loyalty

**Feature**: `033-insight-allocation-loyalty`  
**Auth**: All routes require authenticated Cosmo user + permission checks below. Validate IDs with `cuidSchema`; Zod on body/query.

Base: `/api/admin/customer-insight`

---

## GET `/api/admin/customer-insight/search`

Unchanged contract from 032 (exact phone → contact id). Does **not** leak owner-only fields.

---

## GET `/api/admin/customer-insight/[contactId]`

**Permission**: `contacts.insight.read`

**Response (owner / admin)** — `visibility: "owner"`:

```json
{
  "visibility": "owner",
  "contact": {
    "id": "cuid",
    "name": "string",
    "email": "string|null",
    "phoneNumber": "string|null",
    "phones": ["string"],
    "birthYear": 1990,
    "birthMonth": 8,
    "birthDay": 15,
    "assignedMerchant": "Merchant Label"
  },
  "loyalty": {
    "key": "gold",
    "label": "Gold",
    "code": "loyalcs",
    "lifetimeTotal": 120000,
    "thresholds": { "goldMin": 75000, "platinumMin": 200000 }
  },
  "progressBar": {
    "currentTotal": 120000,
    "goldMin": 75000,
    "platinumMin": 200000,
    "amountToNext": 80000,
    "tier": "gold"
  },
  "lastContactedAt": "2026-08-01T10:00:00.000Z",
  "canEditProfile": true,
  "canMarkContacted": true,
  "topItems": [{ "name": "Item", "quantity": 2, "spend": 5000 }],
  "series": [{ "month": "2026-07", "spend": 10000, "orderCount": 1 }],
  "invoices": [
    {
      "id": "order:...",
      "source": "order",
      "date": "ISO",
      "reference": "string",
      "status": "string",
      "amount": 1000,
      "includedInLoyaltyTotal": true,
      "lineItems": [{ "name": "string", "quantity": 1, "amount": 1000 }]
    }
  ],
  "invoicePagination": { "page": 1, "pageSize": 20, "total": 5 }
}
```

**Response (limited)** — `visibility: "limited"`:

```json
{
  "visibility": "limited",
  "assignedMerchant": "Merchant Label|null",
  "loyalty": {
    "key": "gold",
    "label": "Gold",
    "code": "loyalcs",
    "lifetimeTotal": 120000,
    "thresholds": { "goldMin": 75000, "platinumMin": 200000 }
  },
  "invoices": [
    {
      "id": "order:...",
      "source": "order",
      "date": "ISO",
      "reference": "string",
      "status": "string",
      "amount": 1000,
      "includedInLoyaltyTotal": true
    }
  ],
  "invoicePagination": { "page": 1, "pageSize": 20, "total": 5 }
}
```

Limited responses **must omit**: `contact` profile card, `progressBar`, `topItems`, `series`, `lastContactedAt`, `canEditProfile`, `canMarkContacted`, invoice `lineItems`.

---

## PATCH `/api/admin/customer-insight/[contactId]`

**Permission**: `contacts.insight.read` + owner **or** admin/super_admin

**Body**:

```json
{
  "name": "string?",
  "email": "string|null?",
  "phoneNumber": "string?",
  "birthYear": "number|null?",
  "birthMonth": "number|null?",
  "birthDay": "number|null?"
}
```

**403** if limited viewer. **200** returns updated owner contact snapshot.

---

## POST `/api/admin/customer-insight/[contactId]/contacted`

**Permission**: `contacts.insight.read` + owner **or** admin/super_admin

**Body**: `{}` or `{ "note": "optional trimmed string" }`

**Effect**: Creates contacted audit + `ContactAllocationUpdate` category `Contacted`; updates `lastContactedAt`. Remakeable.

**403** if limited. **200**: `{ "lastContactedAt": "ISO" }`

---

## GET `/api/admin/customer-insight/filter`

**Permission**: `contacts.insight.read`

**Query**:

| Param | Type | Notes |
|-------|------|--------|
| `pushGold` | `true` | totals ≥ 75k and &lt; 200k |
| `pushPlatinum` | `true` | totals ≥ 200k |
| `loyalty` | `standard\|gold\|platinum` | optional |
| `brand` | string | Vendor name match |
| `minTotal` / `maxTotal` | number | optional range |
| `birthdayThisMonth` | `true` | birthMonth = current calendar month |
| `page` / `pageSize` | number | pageSize ≤ 50 |

Only one of `pushGold` | `pushPlatinum` may be set.

**Scope**: allocated to viewer (labels); admin → all company allocated (or all contacts with optional assigned filter).

**Response**:

```json
{
  "items": [
    {
      "contactId": "cuid",
      "name": "string",
      "phoneNumber": "string|null",
      "lifetimeTotal": 150000,
      "loyalty": { "key": "gold", "label": "Gold", "code": "loyalcs" },
      "assignedMerchant": "string"
    }
  ],
  "pagination": { "page": 1, "pageSize": 25, "total": 10 }
}
```

Sorted by `lifetimeTotal` descending.

---

## Allocation (reuse)

- `POST /api/admin/contacts/allocation` — modes `individual` | `multiple` | `bulk`; permission `contacts.allocation.manage` (admins always).
- Auto-allocate: internal helper on purchase/assign paths; not a public route.

---

## Errors

| Status | When |
|--------|------|
| 400 | Zod / mutual push flags / invalid phone |
| 401 | Unauthenticated |
| 403 | Missing permission or not owner for mutate |
| 404 | Contact not found / not in company |
