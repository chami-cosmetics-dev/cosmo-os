# Data Model: Shop Item Requests

**Feature**: `066-shop-item-requests`  
**Date**: 2026-10-16

New tables. `MaterialTransfer` and `MaterialTransferLine` stay unchanged.

## ShopItemRequest

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | |
| `companyId` | string | Caller company. Cascade delete with company. |
| `outletName` | string | Outlet name from the staff profile at submit. Not updated later. |
| `status` | `pending` \| `done` | Default `pending`. |
| `createdByUserId` | string, nullable | Set null if the user is deleted. |
| `doneByUserId` | string, nullable | Set when status becomes `done`. |
| `doneAt` | datetime, nullable | Set with `doneByUserId`. |
| `createdAt`, `updatedAt` | datetime | |

Indexes: `(companyId, status, createdAt desc)`, `(companyId, outletName, status, createdAt desc)`.

### States

1. Shop submits at least one line → `pending`.
2. Stores user with write permission marks done → conditional update `pending` → `done`. Set `doneByUserId` and `doneAt`.
3. A second mark finds no `pending` row → 409, status stays `done`.

No path back to `pending`. No other status.

## ShopItemRequestLine

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | |
| `requestId` | string | Cascade delete with the request. |
| `itemCode` | string | ERP item code. |
| `itemName` | string | |
| `barcode` | string | Empty string when the item has none. |
| `neededQty` | int | Whole number, 1 … 100000. |
| `shopAvailability` | string, nullable | `allowed`, `not_allowed`, or null. Copied from OSF at submit. |

Index: `(requestId)`.

One row per item code on a request. The client merges a repeat add into the existing draft line before submit. The server rejects a body that repeats `itemCode`.

Not stored: main-warehouse quantities, cannot-transfer marks, sort order. Those are computed when a draft line is looked up and when a saved request is opened.

## Validation

| Action | Rule |
|--------|------|
| Add to draft | Client only until submit. Lookup must return exactly one item. |
| Needed quantity | Integer, 1 … 100000. |
| Remove line | Client only, before submit. |
| Submit | At least one line, at most 100 lines, unique `itemCode`. Caller has an outlet. Writes `outletName` and `shopAvailability` from the server, not from the client body. Client may send item code and quantity only. |
| Shop Availability | Server reads `ProductOsfProfile` for the company. Match item code or the hyphen/underscore swap of a trailing variant. Any value other than `allowed` or `not_allowed` is stored null. |
| Mark done | Caller has `store.material_transfer.write`. Status was `pending`. No line edits. |
| After submit | No add, edit, or delete of lines. |

## Stock view (not a table)

Six columns, in this order: Cosmetics main, Pevi, SPK, Chami, Udara, SDP.

Each cell is `{ qty: number \| null, cannotTransfer: boolean }`.

- `qty == null` → warehouse unresolved or that ERP read failed. `cannotTransfer` is false.
- `qty` is a number and `qty < 4` → `cannotTransfer` true.
- `qty >= 4` → `cannotTransfer` false.

## Who can see a row

- Stores (`store.material_transfer.write`): every request for the company.
- Outlet user: requests whose `outletName` equals their current outlet name.
- A stores user who also has an outlet and is not using the stores list still follows the outlet rule on the shop screen. The stores screen uses the write permission and shows every outlet.

## Migration

Create with `npm run db:migrate:create`. Apply with `npm run db:deploy:all` only after the user confirms. Do not `db push` to vault, cosmo-dev, or cosmo-prod.

No backfill. Existing material transfers are untouched.
