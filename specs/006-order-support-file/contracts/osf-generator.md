# Contract: OSF Generator & Maintenance APIs

**Feature**: `006-order-support-file`  
**Date**: 2026-07-16

## Auth

All routes require authenticated Cosmo admin session.

| Permission | Capabilities |
|------------|----------------|
| `purchasing.osf.read` | Generate OSF; list profiles (read-only) |
| `purchasing.osf.manage` | Edit Shop Availability, ROP, column config |

Admins / super_admin inherit both via existing RBAC patterns.

---

## `GET /api/admin/osf/columns`

Returns active OSF column configs for the user’s company.

**Response 200**

```json
{
  "columns": [
    {
      "id": "cuid",
      "key": "lmj",
      "label": "LMJ",
      "companyLocationId": "cuid|null",
      "companyLocationName": "string|null",
      "includeInStock": true,
      "includeInRop": true,
      "sortOrder": 10,
      "active": true
    }
  ]
}
```

---

## `PUT /api/admin/osf/columns`

Replace or upsert column list (`purchasing.osf.manage`).

**Body**

```json
{
  "columns": [
    {
      "key": "lmj",
      "label": "LMJ",
      "companyLocationId": "cuid",
      "includeInStock": true,
      "includeInRop": true,
      "sortOrder": 10,
      "active": true
    }
  ]
}
```

**Validation**: Zod + `cuidSchema` for location ids; unique keys; trimmed labels (`LIMITS`).

**Response 200**: same shape as GET.

---

## `GET /api/admin/osf/profiles`

Search/list OSF profiles joined with catalog identity.

**Query**: `q` (sku/title), `page`, `limit`, optional `shop_availability`

**Response 200**

```json
{
  "items": [
    {
      "sku": "CAN07_1",
      "productTitle": "string",
      "brand": "string|null",
      "shopAvailability": "allowed|not_allowed|null",
      "rops": { "lmj": 6, "lwk": 3 }
    }
  ],
  "total": 0,
  "page": 1,
  "limit": 50
}
```

---

## `PATCH /api/admin/osf/profiles/[sku]`

Upsert availability and/or ROP map (`purchasing.osf.manage`).

**Body**

```json
{
  "shopAvailability": "allowed",
  "rops": {
    "lmj": 6,
    "cos_rop": 24
  }
}
```

Omit keys to leave unchanged; set ROP value to `null` to clear.

**Response 200**: updated profile + rops.

**Errors**: 400 validation; 404 if sku empty; 403 without manage.

---

## `POST /api/admin/osf/generate`

Build and download Main OSF workbook (`purchasing.osf.read`).

**Body**

```json
{
  "salesMonth": "2026-06",
  "asOfDate": "2026-07-16",
  "includeInactive": false
}
```

- `salesMonth`: `YYYY-MM` (Asia/Colombo calendar month for sales units)
- `asOfDate`: header stamp (defaults today Colombo)
- `includeInactive`: optional catalog filter

**Response 200**

- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="OSF-{asOfDate}.xlsx"`
- Body: XLSX buffer (Main sheet)

**Errors**:
- 400 invalid month/date
- 403 missing permission
- 502 if ERP credentials missing / ERP unreachable (no partial invent of stock/cost)

### Main sheet contract (column groups)

1. Identity: SKU forms, Item Status, Shop Availability, Description, Brand, Barcode, Country (blank ok), Image, Site Status  
2. Stock: configured stock columns + Total + Common SKU Stock  
3. ROP: configured ROP columns + Common ROP + % + 70% threshold + availability label  
4. Order qty: per stock/ROP location + TOTAL + Common SKU Reorder  
5. Pricing: MRP, Discounted, **OGF Price** (independent UI value), Latest Cost, Latest supplier, Cosmetics Margin, OGF Margin `(OGF−cost)/OGF`
6. Monthly sales: units for `salesMonth`

Blank cells when source missing — never fabricated numbers.

---

## UI contracts

| Surface | Behavior |
|---------|----------|
| OSF Generate panel | Month picker + Generate download button; shows progress/error |
| OSF product editor | Search SKU; toggle Shop Availability; numeric ROP inputs per active ROP column; Save |
| OSF columns settings | Map label ↔ location; stock/ROP flags; order; save |

No Excel upload control in v1.
