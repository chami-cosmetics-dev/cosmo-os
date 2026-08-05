# Contract: Customer Insight API

**Feature**: `032-merchant-customer-insight`  
**Base path**: `/api/admin/customer-insight`  
**Auth**: Session + `contacts.insight.read` on every route  
**Mutations**: None (GET only)

---

## GET `/api/admin/customer-insight/search`

Search contacts by phone. Never returns an unfiltered directory.

### Query

| Param | Required | Rules |
|-------|----------|--------|
| `phone` | yes | Trimmed; must be phone-like; digit length after normalize ≥ 7; max length per LIMITS |

### Success `200`

```json
{
  "matches": [
    {
      "id": "clxxxxxxxx",
      "name": "Jane Doe",
      "phoneNumber": "0771234567",
      "email": "jane@example.com"
    }
  ],
  "truncated": false
}
```

- `matches`: 0–10 items only
- `truncated`: `true` if more than 10 raw hits existed (caller must refine phone)

### Errors

| Status | When |
|--------|------|
| 401 | Not authenticated |
| 403 | Missing `contacts.insight.read` |
| 400 | Missing/invalid phone |
| 404 | No company on user |

### Non-goals

- No `page` / `limit` that walks all contacts
- No export fields / CSV
- No Adapt/Order payloads on this route

---

## GET `/api/admin/customer-insight/[contactId]`

Full insight for one contact in the caller’s company.

### Path

| Param | Rules |
|-------|--------|
| `contactId` | `cuid` |

### Query

| Param | Default | Rules |
|-------|---------|--------|
| `invoicesPage` | `1` | positive int |
| `invoicesPageSize` | `25` | 1–50 |

### Success `200`

```json
{
  "contact": {
    "id": "clxxxxxxxx",
    "name": "Jane Doe",
    "phoneNumber": "0771234567",
    "phones": ["0771234567"],
    "email": "jane@example.com"
  },
  "loyalty": {
    "key": "gold",
    "label": "Gold",
    "code": "loyalcs",
    "lifetimeTotal": 185000,
    "currency": "LKR",
    "thresholds": { "goldMin": 100000, "platinumAbove": 250000 }
  },
  "frequency": {
    "orderCount": 12,
    "firstOrderAt": "2024-01-15T00:00:00.000Z",
    "lastOrderAt": "2026-07-01T00:00:00.000Z",
    "avgDaysBetweenOrders": 45.5
  },
  "topItems": [
    { "name": "Product A", "quantity": 8, "spend": 42000 }
  ],
  "series": [
    { "month": "2026-01", "spend": 12000, "orderCount": 2 }
  ],
  "chartsAvailable": true,
  "invoices": [
    {
      "id": "order:claaa",
      "source": "order",
      "date": "2026-07-01T10:00:00.000Z",
      "reference": "SI-0001",
      "status": "paid",
      "amount": 5000,
      "includedInLoyaltyTotal": true
    }
  ],
  "invoicePagination": {
    "page": 1,
    "pageSize": 25,
    "total": 40
  }
}
```

### Semantics

- `loyalty.key`: `standard` | `gold` | `platinum` per thresholds (Gold inclusive 100000–250000)
- Cancelled Cosmo orders appear in `invoices` with `includedInLoyaltyTotal: false`
- `chartsAvailable`: `false` when loyalty-eligible order/invoice count &lt; 3 (UI shows KPIs only)
- `series` / `topItems` use loyalty-eligible documents only

### Errors

| Status | When |
|--------|------|
| 401 | Not authenticated |
| 403 | Missing permission |
| 400 | Invalid cuid / page params |
| 404 | Contact not in company / no company |

### Non-goals

- PUT/PATCH/DELETE
- Import/export
- Listing sibling contacts
- Writing ERP/Adapt customer group tags

---

## UI route (informational)

| Route | Permission | Behavior |
|-------|------------|----------|
| `/dashboard/customer-insight` | `contacts.insight.read` | Search + insight panel; no Import/Export |

Sidebar: show link only when user has `contacts.insight.read`.
