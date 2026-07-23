# Contract: OSF Per-Column Access

## Permission

| Key | UI / API |
|-----|----------|
| `purchasing.osf.permission` | Access panel; `GET`/`PUT /api/admin/osf/column-access` |
| `purchasing.osf.manage` \| `purchasing.osf.permission` | Full column set on generate |
| `purchasing.osf.read` | Full OSF generate (filtered by marks unless full-access) |
| `purchasing.tools.*` | Reorder-only generate (same filter) |

## Access catalog

Assignable entries returned as:

```json
{ "id": "rop:cosmo_shop_gcc", "label": "GCC Shop ROP" }
```

Identity headers are **not** listed (always included).

## GET `/api/admin/osf/column-access`

**Auth**: `purchasing.osf.permission`

**Response** `200`:

```json
{
  "columns": [
    { "id": "Cosmetics MRP", "label": "Cosmetics MRP" },
    { "id": "stock:cosmetics_lk", "label": "Cosmetics.lk" },
    { "id": "rop:cosmo_shop_gcc", "label": "GCC Shop ROP" },
    { "id": "order:lmj", "label": "LMJ ORDER QTY" }
  ],
  "users": [
    {
      "id": "clx…",
      "name": "H G P INOKA",
      "email": "hpg.inoka@gmail.com",
      "columnKeys": ["Cosmetics MRP", "rop:cosmo_shop_gcc"]
    }
  ]
}
```

`users` = company users with any purchasing OSF/tools permission.  
Legacy clients expecting `groups` / `columnGroups` are obsolete after this feature.

## PUT `/api/admin/osf/column-access`

**Auth**: `purchasing.osf.permission`

**Body** (batch preferred):

```json
{
  "assignments": [
    { "userId": "clx…", "columnKeys": ["Cosmetics MRP", "stock:lmj", "rop:lmj"] }
  ]
}
```

**Validation**: Zod + `cuidSchema` for `userId`; each `columnKeys` entry ∈ current catalog ids.

**Response** `200`: echo updated assignments.

**Errors**: `401` / `403` / `400` / `404` user not in company.

## POST `/api/admin/osf/generate` (behavior change)

**Auth**: unchanged.

**Behavior**: Resolve effective **column keys** for current user; pass into workbook builder. Filter column defs by `accessKey`. Manage/permission → all keys. TOTAL / Common aggregates use signed-sum-floor-at-zero (see formulas contract in [osf-rop-import.md](./osf-rop-import.md) § Totals).

## UI contract (OSF tab — Excel column access)

- Visible only if `purchasing.osf.permission`.
- **User list** (name + email) retained.
- Per user: **Access** searchable multi-select listing all `columns` from GET; mark/unmark; Save persists batch.
- Restricted downloaders see only marked columns (+ identity) on full and reorder-only downloads.
