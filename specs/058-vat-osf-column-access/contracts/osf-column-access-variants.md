# Contract: OSF Column Access by Variant

## Permission

Unchanged keys:

| Key | Behavior |
|-----|----------|
| `purchasing.osf.permission` | Column Access UI; `GET`/`PUT /api/admin/osf/column-access` |
| `purchasing.osf.manage` \| `purchasing.osf.permission` | Full column set for the **requested variant** on generate |
| `purchasing.osf.read` / `purchasing.tools.*` | Generate still gated; columns filtered by variant marks |

## Variant values

| `osfVariant` | UI label |
|--------------|----------|
| `main` | Main OSF |
| `vat` | VAT Items OSF |
| `non_vat` | Others (Non-VAT) OSF |

## Catalog (variant-filtered)

Assignable entries same shape as today:

```json
{ "id": "rop:cosmo_shop_gcc", "label": "GCC Shop ROP" }
```

For `osfVariant=vat`, catalog **MUST NOT** include `stock:` / `rop:` / `order:` keys for non–Cosmetics.lk / non-shop location columns. Static assignable columns (pricing, margins, sales, totals, …) remain.

Identity headers never listed.

## GET `/api/admin/osf/column-access?osfVariant=main|vat|non_vat`

**Auth**: `purchasing.osf.permission`

**Query**: `osfVariant` required (or default `main` for backward compatibility — prefer required in new UI).

**Response** `200`:

```json
{
  "osfVariant": "vat",
  "columns": [
    { "id": "Cosmetics MRP", "label": "Cosmetics MRP" },
    { "id": "stock:cosmetics_lk", "label": "Cosmetics.lk" },
    { "id": "rop:cosmo_shop_gcc", "label": "GCC Shop ROP" }
  ],
  "users": [
    {
      "id": "clx…",
      "name": "…",
      "email": "…",
      "columnKeys": []
    }
  ],
  "catalogSize": 42
}
```

`users[].columnKeys` = stored marks for **that variant only** (sanitized to catalog). Missing DB row → `[]`.

## PUT `/api/admin/osf/column-access`

**Auth**: `purchasing.osf.permission`

**Body**:

```json
{
  "osfVariant": "vat",
  "assignments": [
    {
      "userId": "clx…",
      "columnKeys": ["Cosmetics MRP", "stock:cosmetics_lk", "rop:cosmo_shop_gcc"]
    }
  ]
}
```

**Validation**: Zod; each key ∈ variant catalog; user eligible.

**Response** `200`: echo variant + updated assignments.

**Errors**: `400` unknown key / invalid variant; `404` ineligible user; `401`/`403`.

## POST `/api/admin/osf/generate` (behavior)

Existing `osfVariant` body field.

**New behavior**:
1. Optionally run Cosmetics shop column ensure (see [osf-shop-column-sync.md](./osf-shop-column-sync.md)).
2. Resolve effective access keys for **`osfVariant`** (not Main marks).
3. For `vat`: workbook stock/ROP/order location columns = Cosmetics.lk + shops only; Total ROP = Cosmetics.lk ROP only (existing).
4. Download filename / `X-OSF-Variant` / UI copy: **VAT Items OSF** when `vat`.

## UI contract

- Access panel: variant selector → Main / **VAT Items OSF** / Others.
- Switching variant reloads catalog + marks; Save writes only the selected variant.
- Generate panel: option labeled **VAT Items OSF** (not “VAT OSF”).
