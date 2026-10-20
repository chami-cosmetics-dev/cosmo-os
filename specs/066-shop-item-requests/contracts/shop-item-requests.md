# Contract: Shop Item Requests

**Feature**: `066-shop-item-requests`  
**Date**: 2026-10-16

Auth: outlet on the staff profile, or `store.material_transfer.write`. Mark done and the all-outlet list need write. No new permission key.

Base path: `/api/admin/store/material-transfer/shop-requests`.

These routes do not create a Stock Entry and do not write `MaterialTransfer`.

## Shared types

```json
{
  "shopAvailability": "not_allowed",
  "stocks": [
    { "key": "cosmetics_main", "label": "Cosmetics main", "qty": 12, "cannotTransfer": false },
    { "key": "pevi", "label": "Pevi", "qty": 3, "cannotTransfer": true },
    { "key": "spk", "label": "SPK", "qty": 0, "cannotTransfer": true },
    { "key": "chami", "label": "Chami", "qty": 4, "cannotTransfer": false },
    { "key": "udara", "label": "Udara", "qty": null, "cannotTransfer": false },
    { "key": "sdp", "label": "SDP", "qty": 9, "cannotTransfer": false }
  ]
}
```

`shopAvailability` is `allowed`, `not_allowed`, or null. `qty` null means unknown. Column order is fixed.

Request:

```json
{
  "id": "cuid",
  "outletName": "Maharagama",
  "status": "pending",
  "createdAt": "2026-10-16T06:00:00.000Z",
  "createdByName": "Nimal Perera",
  "doneAt": null,
  "doneByName": null,
  "lines": [
    {
      "itemCode": "ACN01_1",
      "itemName": "Item",
      "barcode": "062600656827",
      "neededQty": 2,
      "shopAvailability": "not_allowed",
      "stocks": []
    }
  ]
}
```

`stocks` on a saved line is live at read time. `shopAvailability` is the value stored at submit. `createdByName` and `doneByName` are display names. Null name if the user is gone.

## `GET /suggest?q=`

Outlet or write permission.

`q` trimmed, at least 2 characters. Shorter returns `{ "hits": [] }`.

```json
{ "hits": [{ "itemCode": "ACN01_1", "itemName": "Item" }] }
```

At most 15 hits. Match is item code only, both ERPs, disabled items excluded. One hit per item code.

ERP search failure for one slot still returns hits from the other. Both failing returns 502.

## `POST /lookup`

Outlet or write permission. Body: `{ "code": "barcode-or-sku" }`.

200: one item.

```json
{
  "item": {
    "itemCode": "ACN01_1",
    "itemName": "Item",
    "barcode": "062600656827",
    "shopAvailability": "not_allowed",
    "stocks": []
  }
}
```

| Case | Status | Client |
|------|--------|--------|
| No item | 404 | Error sound. No line. |
| More than one item code | 409 | Error sound. No line. |
| `shopAvailability` is `not_allowed` | 200 | Error sound and the not-allowed notice. Add the line at quantity 1, or add 1 if that code is already on the draft. |
| Other availability | 200 | No Shop Availability sound. Add the same way. |

The server does not beep. Repeat adds are client state.

## `POST /`

Outlet required. Write permission alone, with no outlet, is 403.

Body:

```json
{
  "lines": [{ "itemCode": "ACN01_1", "neededQty": 2 }]
}
```

1 … 100 lines. `neededQty` integer 1 … 100000. Unique `itemCode`. The server resolves each code again (exact item code only, not a fresh barcode scan). Unknown code is 404 and nothing is saved. The server writes name, barcode, and Shop Availability. It ignores any availability or stock the client might send.

201: the request, `status` `pending`, with live `stocks`.

## `GET /`

Query `status`: `pending` (default) or `done`.

- Write permission: every outlet in the company.
- Outlet only: `outletName` equals the caller’s current outlet.
- Both: write permission wins on this route, so stores see every outlet.

200: `{ "requests": [ ... ] }` newest first, cap 300. List rows include creator, outlet, status, and lines with live stocks so the queue can show the under-4 mark without a second call.

## `GET /[id]`

Same visibility as the list. 404 when the id is outside the caller’s company or outlet. 200: one request with live stocks.

## `POST /[id]/done`

Write permission required. Outlet-only callers get 403.

No body. Updates a `pending` row to `done` in one conditional write.

| Case | Status |
|------|--------|
| Updated | 200, the done request |
| Already done, or not visible | 409, message that it is already done |
| Missing in this company | 404 |

Does not insert `MaterialTransfer` and does not call ERP write methods.
