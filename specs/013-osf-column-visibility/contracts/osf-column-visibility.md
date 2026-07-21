# Contract: OSF Column Visibility

## Permission

| Key | UI / API |
|-----|----------|
| `purchasing.osf.permission` | OSF tab assignment panel; `GET`/`PUT /api/admin/osf/column-access` |
| `purchasing.osf.manage` \| `purchasing.osf.permission` | Full column set on generate (no mark required) |
| `purchasing.osf.read` | `POST /api/admin/osf/generate` with `belowThresholdOnly: false` |
| `purchasing.tools.read` \| `.manage` | Generate with `belowThresholdOnly: true` (unchanged auth) |

## Column groups

| Id | Workbook content |
|----|------------------|
| `core` | Identity + stock + ROP + %/70% + order qty bands (always included) |
| `pricing` | Cosmetics MRP, Discounted Price, OGF Price |
| `cost` | Latest Cost, supplier, last purchase fields, purchased last 30d |
| `margins` | Cosmetics Margin %, OGF Margin % |
| `sales` | Sales Units (month) |

## GET `/api/admin/osf/column-access`

**Auth**: `purchasing.osf.permission`

**Response** `200`:

```json
{
  "groups": [
    { "id": "pricing", "label": "Pricing (MRP / discounted / OGF)" },
    { "id": "cost", "label": "Purchasing cost & supplier" },
    { "id": "margins", "label": "Cosmetics & OGF margins" },
    { "id": "sales", "label": "Monthly sales units" }
  ],
  "users": [
    {
      "id": "clx…",
      "name": "Inoka",
      "email": "inoka@example.com",
      "columnGroups": ["margins"]
    }
  ]
}
```

`groups` omits `core` (always on). `users` = company users with any purchasing OSF/tools permission.

## PUT `/api/admin/osf/column-access`

**Auth**: `purchasing.osf.permission`

**Body**:

```json
{
  "userId": "clx…",
  "columnGroups": ["margins", "pricing"]
}
```

Or batch:

```json
{
  "assignments": [
    { "userId": "clx…", "columnGroups": ["margins"] }
  ]
}
```

**Validation**: Zod + `cuidSchema`; `columnGroups` ⊆ `{ pricing, cost, margins, sales }`.

**Response** `200`: updated user mark(s) echo.

**Errors**: `401` / `403` / `400` validation / `404` user not in company.

## POST `/api/admin/osf/generate` (behavior change)

**Auth**: unchanged (osf.read vs tools for reorder).

**Behavior**: After auth, resolve effective column groups for current user; pass into workbook builder so Main (and sheets in that file) only emit allowed headers. Manage/permission → all groups. No new request body fields required for v1.

**Headers**: existing `X-OSF-Row-Count` etc. unchanged.

## UI contract (OSF tab)

- Visible only if `purchasing.osf.permission`.
- Compact panel: user list + checkboxes per optional group + Save.
- Does not replace Roles UI for granting `purchasing.osf.permission` itself (Roles remains source of who may assign).
