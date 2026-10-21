# Data Model: Merchant New Item Requests

**Feature**: `067-merchant-item-requests`  
**Date**: 2026-10-21

New tables. `ItemCreationRequest`, `ShopItemRequest`, `Vendor`, and `ProductItem` stay unchanged. Vendor is **read** to decide existing vs new.

## NewItemRequestStatus

`open` | `already_have` | `closed`

Default `open`.

### States

1. Manage or admin submits a valid form → `open`.
2. Admin marks already have → `already_have`. Set `statusChangedByUserId`, `statusChangedAt`.
3. Admin marks closed → `closed`. Same status fields.
4. A second mark to the same status succeeds and does not rewrite the status fields.
5. Mark from `already_have` to `closed` (or the reverse) is rejected (409). No reopen to `open`.

## NewItemRequest

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | |
| `companyId` | string | Caller company. Cascade delete with company. |
| `brandName` | string | Display name. Vendor’s stored name when existing; trimmed typed name when new. Max `LIMITS.vendorName`. |
| `brandNameNormalized` | string | Trim, collapse whitespace, lower-case. Used for grouping and priority join. |
| `brandIsExisting` | boolean | Frozen at submit from a vendor match. |
| `description` | string | Required. Max 1000. |
| `storeUrl` | string, nullable | Other-store link. Valid http(s) URL. Max 2048. |
| `imageUrl` | string, nullable | Cloudinary secure URL. |
| `imagePublicId` | string, nullable | Cloudinary public id when uploaded. |
| `status` | `NewItemRequestStatus` | Default `open`. |
| `createdByUserId` | string, nullable | Set null if the user is deleted. |
| `statusChangedByUserId` | string, nullable | Set on a real status change. |
| `statusChangedAt` | datetime, nullable | Set with `statusChangedByUserId`. |
| `createdAt`, `updatedAt` | datetime | |

Indexes:

- `(companyId, status, createdAt desc)`
- `(companyId, brandNameNormalized, status, createdAt desc)`
- `(companyId, createdByUserId, createdAt desc)`

### Who can see a row

- Admin (`new_item_requests.admin`, or role `admin` / `super_admin`): every request for the company.
- Manage only: `createdByUserId` equals the caller. No other user’s row, including by id.

## NewItemRequestBrandPriority

One current list per company. Upload replaces every row for that company.

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | |
| `companyId` | string | Cascade delete with company. |
| `brandName` | string | Display name from the file (first non-empty spelling). |
| `brandNameNormalized` | string | Same normalize as requests. |
| `priority` | string | Free text from the file. Max 100. |
| `uploadedByUserId` | string, nullable | Last successful upload’s user. |
| `createdAt`, `updatedAt` | datetime | |

Unique: `(companyId, brandNameNormalized)`.

Index: `(companyId, brandNameNormalized)`.

## Brand group (derived, not a table)

Built from requests in the current status filter (default `open`), grouped by `brandNameNormalized`.

| Field | Source |
|-------|--------|
| `brandName` | Canonical vendor name if a vendor matches now, else the latest request’s `brandName` |
| `brandNameNormalized` | Group key |
| `isExisting` | Current vendor match (live, not frozen) |
| `isNew` | Not `isExisting` |
| `priority` | Current priority row for that normalized name, else null. Null when `isNew`. |
| `requestCount` | Count of requests in the group for the current filter |
| `requests` | On drill-in only: those rows, newest first |

## Validation

| Action | Rule |
|--------|------|
| Brand | Trimmed, 1…`LIMITS.vendorName.max`. Required. |
| Suggest | `q` trimmed, length ≥ 2. Else empty hits. Cap 15 vendors. |
| Description | Trimmed, 1…1000. |
| Store URL | Empty → null. Else must be `http:` or `https:` URL, max 2048. |
| Image | Optional. `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max 5MB. |
| Submit | Brand + description. Server sets existing flag and names. Ignore client `brandIsExisting`. |
| After submit | No update of brand, description, link, or image. |
| Status | Admin only. Body `{ "status": "already_have" \| "closed" }`. From `open` only, or same-status idempotent. |
| Priority upload | Admin. Usable row count ≥ 1 or 400 and no delete. |
| Export | Admin. Same filters as list. Max 5_000 rows. |
| Manage GET by id | 404 if not owner (do not leak existence to another manage user). |

## Normalize

```text
trim → replace /\s+/ with a single space → lower-case
```

Vendor match: `name` equals the trimmed display string, `mode: "insensitive"`, same `companyId`.

## Migration

Create with `npm run db:migrate:create`. Apply with `npm run db:deploy:all` only after the user confirms. Do not `db push` to vault, cosmo-dev, or cosmo-prod.

Add relations on `Company` and `User` (`created` / `statusChanged` / `priorityUploaded`).
