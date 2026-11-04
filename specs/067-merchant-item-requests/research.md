# Research: Merchant New Item Requests

**Feature**: `067-merchant-item-requests`  
**Date**: 2026-10-21

## Decision: New tables, not Item Creation and not Shop Item Request

**Decision**: Add `NewItemRequest` and `NewItemRequestBrandPriority`. Do not write `ItemCreationRequest`, `ShopItemRequest`, `ProductItem`, or ERP/Shopify.

**Rationale**: Spec is an inbox. Already-have is a status, not a SKU match. Closed does not create a SKU. Item Creation stays the place that creates catalogue items. Shop item requests are existing SKUs for store transfer.

**Alternatives considered**: A new status on `ItemCreationRequest`. Rejected — that workflow has purchasing/SEO/stores stages and ERP writes. A JSON blob on the user. Rejected — purchasing needs a company-wide brand group and history.

## Decision: Two permission keys

**Decision**:

| Key | Who | What |
|-----|-----|------|
| `new_item_requests.manage` | Merchants (assigned on their role) | Create. Read own rows only. No brand dashboard, export, priority upload, or status change. |
| `new_item_requests.admin` | Purchasing (and anyone who should see all) | Create. Read all. Brand dashboard. Export. Priority upload. Mark already have or closed. |

`admin` includes create. A user with both keys is treated as admin. `hasPermission` already returns true for every key when the role is `admin` or `super_admin`, so those roles see the admin dashboard without a extra assign. Add both keys to `DEFAULT_PERMISSIONS`. Add `new_item_requests.admin` to the default **manager** role (it already has purchasing). Do not put manage on viewer/finance/hod. Merchant roles get manage in the Roles UI.

**Rationale**: Spec names exactly these two. Same shape as `book_notes.manage` / `book_notes.admin`.

**Alternatives considered**: Reuse `item_creation.purchasing.manage`. Rejected — merchants must create without Item Creation access. Reuse `dashboard.merchant_view`. Rejected — too broad.

## Decision: One page, two sidebar slots, same URL

**Decision**: Route `/dashboard/new-item-requests`.

- Manage without admin: sidebar **Order Management** (next to Book Notes). Page shows create form + own list.
- Admin: sidebar **Purchasing**. Page shows create form + brand dashboard, filters, export, priority upload, status actions.

Same URL. Admin-or-super_admin sidebar already treats every key as present, so they only get the Purchasing entry if Order Management hides the link when admin is present.

**Rationale**: Merchants do not have the Purchasing group. Purchasing lives in that group. One page avoids a second implementation.

**Alternatives considered**: Nested under Item Creation. Rejected — spec says this screen must not open Item Creation. Two routes. Rejected — extra files for the same data.

## Decision: Existing brand = current `Vendor` name

**Decision**: “Brands we already have” are `Vendor.name` for the caller’s company (catalogue vendors). Suggest with `contains` + case-insensitive, minimum 2 characters, cap 15, ordered by name. Server decides existing vs new at submit: if a vendor matches the trimmed name case-insensitively, `brandIsExisting = true` and store the vendor’s actual name. Else `brandIsExisting = false` and store the trimmed typed name. Client cannot force the flag.

Normalize for grouping and priority lookup: trim, collapse internal whitespace to one space, lower-case. Store both display `brandName` and `brandNameNormalized`.

**Rationale**: Vendors are the brand list merchants already see on Items / Vendors & Categories. ERP item-master brands would miss Shopify-only vendors and need a live ERP call.

**Alternatives considered**: Distinct `ProductItem.vendor` join only. Same table. OSF brand list. Rejected — OSF is purchasing sheet, not the catalogue.

## Decision: Brand group label vs frozen request flag

**Decision**:

- Each **request** keeps `brandIsExisting` from submit time (spec: new stays new on that row).
- Each **brand row** on the dashboard uses the **current** vendor match for existing/new, and the **current** priority file.

If a new name is later added as a vendor, the brand row can show existing while an older request inside still shows it was new when asked.

**Rationale**: Purchasing cares whether we sell that brand *now*. History on the row still shows what the merchant submitted.

## Decision: Priority file replace-all

**Decision**: Admin uploads `.xlsx` / `.xls` / `.csv` (max 8MB). First sheet. Header row must include a brand column and a priority column (header match ignores case/spaces; accept `brand`, `brand name`, `vendor`, `priority`, `priority status`). Data rows: brand name + priority text as written. Skip blank brand or blank priority. Duplicate normalized brand: last row wins. Zero usable rows → 400, previous rows stay. Success: transaction delete-all for the company, then insert. Priority values are free text (cap 100). Lookup is by `brandNameNormalized`. New brands never show priority.

**Rationale**: Spec says the admin uploads the file they already use and a new upload replaces the previous list. Same parse style as rider delivery charges / OSF ROP.

**Alternatives considered**: Derive priority from `ProductItem.status` (Top Priority Brand / …). Rejected — spec says they will upload a brand-wise file; item status is product-level, not a brand master.

## Decision: Image via Cloudinary, URL on the row

**Decision**: Optional one image. JPEG / PNG / WebP / GIF, max 5MB. Server-side `cloudinary.uploader.upload` into folder `new-item-requests/{companyId}` (same pattern as profile photo). Store `imageUrl` (and `imagePublicId` if Cloudinary returns it). Create is multipart: fields + optional file. If the file is present and upload fails, do not create the row. Display with the stored URL. Export writes the URL, not an embedded picture.

**Rationale**: One small product photo. Authenticated Cloudinary + signed delivery is for Cosmo Academy / product assets. Profile photos already use a public image URL. Direct-upload signing is for large video.

**Alternatives considered**: Multipart-only after create. Extra round trip. `File` table row. Extra join for one URL.

## Decision: Status machine

**Decision**: `open` (default) → `already_have` or `closed`. Idempotent if already in the target status (200, no duplicate). No reopen. No switch from `already_have` to `closed` or back. No SKU field. Set `statusChangedByUserId` and `statusChangedAt` on a real change.

**Rationale**: Spec only named already-have plus a way to clear open counts. Reopen and cross-status edits are extra.

## Decision: Export current view as xlsx

**Decision**: Admin `GET` export with the same filters as the list (status, optional brand normalized, optional created-from/to). `xlsx` workbook. Columns: created at, creator name, brand, existing/new (frozen), current priority, description, link, image URL, status, status changed at, status changed by. Cap 5_000 rows. Zero rows: headers only.

**Rationale**: Matches purchase-history / book-notes export. Image as URL keeps the file small.

## Decision: No notifications, no Item Creation control, no customer identity

**Decision**: v1 has no reminder bubble and no email. No button that opens Item Creation. Form has no customer name or phone.

**Rationale**: Spec assumptions. Purchasing opens the dashboard.
