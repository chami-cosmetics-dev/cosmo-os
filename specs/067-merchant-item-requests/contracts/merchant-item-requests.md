# Contract: Merchant New Item Requests

**Feature**: `067-merchant-item-requests`  
**Date**: 2026-10-21

Auth: `requireAnyPermission(["new_item_requests.manage", "new_item_requests.admin"])` unless noted. Admin-only routes use `new_item_requests.admin`.

`admin` here means `hasPermission(..., "new_item_requests.admin")` (includes role `admin` / `super_admin`).

Base path: `/api/new-item-requests`.

These routes do not create Item Creation rows, ERP items, Shopify products, or shop item requests.

## Shared types

Request (list/detail):

```json
{
  "id": "cuid",
  "brandName": "The Ordinary",
  "brandNameNormalized": "the ordinary",
  "brandIsExisting": true,
  "priority": "Top Priority Brand",
  "description": "Niacinamide 10% 30ml — customer saw it on Nykaa",
  "storeUrl": "https://www.nykaa.com/example",
  "imageUrl": "https://res.cloudinary.com/…/image.jpg",
  "status": "open",
  "createdAt": "2026-10-21T05:30:00.000Z",
  "createdByName": "Nimal Perera",
  "statusChangedAt": null,
  "statusChangedByName": null
}
```

`priority` is the **current** file value for that normalized brand when `brandIsExisting` is true (or when the live vendor match exists on a brand row). Null if none. `createdByName` / `statusChangedByName` are display names; null if the user is gone.

`status` is `open`, `already_have`, or `closed`.

Brand group:

```json
{
  "brandName": "The Ordinary",
  "brandNameNormalized": "the ordinary",
  "isExisting": true,
  "isNew": false,
  "priority": "Top Priority Brand",
  "requestCount": 3
}
```

`isExisting` / `isNew` are **live** vendor match. `priority` is current file; always null when `isNew`.

Errors: `{ "error": "string" }` with 400 / 401 / 403 / 404 / 409 / 413.

## `GET /api/new-item-requests/brands/suggest?q=`

Manage or admin.

`q` trimmed, at least 2 characters. Shorter → `{ "hits": [] }`.

```json
{
  "hits": [
    {
      "name": "The Ordinary",
      "priority": "Top Priority Brand"
    }
  ]
}
```

At most 15. Company vendors only. `priority` null when the file has no row.

## `POST /api/new-item-requests`

Manage or admin. `multipart/form-data`.

| Field | Required | Notes |
|-------|----------|--------|
| `brandName` | yes | Text |
| `description` | yes | Text |
| `storeUrl` | no | Text. Empty omitted. |
| `image` | no | File |

200: `{ "request": { …Request } }`.

400 on validation. 413 if the image is over 5MB. Creator is the caller. `brandIsExisting` is computed on the server.

## `GET /api/new-item-requests`

Manage or admin.

Query:

| Param | Default | Notes |
|-------|---------|--------|
| `status` | `open` | `open` \| `already_have` \| `closed` |
| `brand` | | Normalized or display brand. Admin: filter to that group. Manage: still own rows only. |
| `createdFrom` | | `YYYY-MM-DD` inclusive, optional |
| `createdTo` | | `YYYY-MM-DD` inclusive, optional |

Manage: `{ "requests": [ …Request ] }` newest first, max 300, **own rows only**.

Admin: `{ "brands": [ …Brand group ] }` ordered by `requestCount` desc, then `brandName`. Counts follow `status` (and dates if set). `brand` query is omitted on this call; use the brand detail list.

## `GET /api/new-item-requests/brands/{brandNormalized}`

Admin only.

Same `status` / date query as list. `{ "brand": { …Brand group }, "requests": [ …Request ] }` newest first, max 500.

404 if that group has no rows in the company (any status), so a typo does not look like an empty brand.

Manage calling this → 403.

## `GET /api/new-item-requests/{id}`

Manage or admin. 200 `{ "request": { …Request } }`. Manage: 404 when not owner.

## `POST /api/new-item-requests/{id}/status`

Admin only. JSON `{ "status": "already_have" }` or `{ "status": "closed" }`.

200 `{ "request": { …Request } }`. 409 if moving between `already_have` and `closed`. 404 if missing. Manage → 403.

## `GET /api/new-item-requests/export`

Admin only. Same query as admin list (`status`, optional `brand`, dates).

200 Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). Filename `new-item-requests-{status}-{date}.xlsx`.

Columns: Created at, Creator, Brand, Existing or new, Priority, Description, Link, Image URL, Status, Status changed at, Status changed by.

Empty view: header row only. Cap 5_000. Manage → 403.

## `GET /api/new-item-requests/priority`

Admin only. `{ "count": 12, "uploadedAt": "2026-10-21T06:00:00.000Z" }` (`uploadedAt` null when count is 0).

## `POST /api/new-item-requests/priority`

Admin only. `multipart/form-data` field `file` (xlsx/xls/csv, max 8MB).

200 `{ "count": 80 }`. 400 if unreadable or zero usable rows (previous list kept). Manage → 403.

## Page

`GET /dashboard/new-item-requests` — `requireAnyPermission` of the two keys. 401 → login. 403 → `PermissionDeniedCard`. Load initial list (manage) or brand groups (admin) on the server and pass `initial*` props. No client waterfall for first paint.
