# Contract: Material Transfer Counts and Shop Returns

**Feature**: `065-material-transfer-counts`  
**Date**: 2026-10-13

Auth is unchanged: `requireMaterialTransferView`. Write actions that post or confirm need `store.material_transfer.write`. Shop receive and shop-to-main create need an outlet on the staff profile. No new permission key.

Base path: `/api/admin/store/material-transfer`.

## Transfer payload

History, get-one, create, count, receive, and confirm return the same shape.

```json
{
  "id": "cuid",
  "direction": "store_to_shop",
  "status": "sent",
  "slot": "erp1",
  "erpName": "MAT-STE-2026-00318",
  "erpUrl": "https://cosmetics-lk-01.m.frappe.cloud/app/stock-entry/MAT-STE-2026-00318",
  "erpCompany": "Cosmetics.lk",
  "sourceWarehouse": "Main Warehouse - Cosmo",
  "targetWarehouse": "Maharagama Shop Warehouse - Cosmo",
  "createdAt": "2026-10-13T00:00:00.000Z",
  "receivedAt": null,
  "receivedByName": null,
  "mismatch": false,
  "lines": [
    {
      "itemCode": "ACN01_1",
      "itemName": "Item",
      "barcode": "062600656827",
      "uom": "Nos",
      "sentQty": 3,
      "receivedQty": 0,
      "receivedQtyUpdatedByName": null
    }
  ]
}
```

`erpUrl` is null when `erpName` is null. `mismatch` is true only for `received` or `confirmed` when some line differs. `availableQty` is not stored; send screens keep it in client state from lookup.

## Existing routes

### `POST /lookup`

Unchanged request. Still returns `availableQty` for the source warehouse. Unknown barcode or SKU is 404. The panel plays the error beep. The server does not beep.

### `POST /submit`

Unchanged body (slot, company, warehouses, lines). Still creates and submits the Stock Entry, then stores a `store_to_shop` row at `sent`.

Added server check: each line qty is an integer ≥ 1 and ≤ the live source bin. Over available is 409 and no Stock Entry is left behind (same draft-delete as today). erp1 non-VAT still rejected.

The low-count mark is not this route. The panel computes it before the user confirms. See [submit review](#submit-review-client).

### `GET /history`

Query:

| Param | Values | Meaning |
|-------|--------|---------|
| `scope` | `all` \| `shop` | `all` requires write. `shop` is the caller’s outlet. |
| `status` | optional existing filter | |
| `mismatch` | `1` optional | Only `received` and `confirmed` rows with a differing line. |

Each row includes `direction`, `erpUrl`, barcode, `receivedByName`, and `receivedQtyUpdatedByName`.

### `POST /[id]/count`

Body: `{ "code": "barcode-or-sku" }` **or** `{ "itemCode": "ACN01_1", "qty": 4 }`.

- Scan form adds 1 to `receivedQty` when the code is on the transfer. Unknown code is 404. The panel beeps. No new line.
- Qty form sets `receivedQty` to that integer (0 … 100000), including values below or above `sentQty`.
- Allowed while `sent` for an outlet user who matches the target, or while `requested` for a stores user on a `shop_to_main` row.
- Writes `receivedQtyUpdatedByUserId` to the caller.
- `received`, `confirmed`, and `confirming` return 409.

### `POST /[id]/receive`

Store-to-shop only. Outlet user. Status must be `sent`. Sets `received`, `receivedByUserId`, `receivedAt`. Later counts return 409. Mismatches are allowed, including all zeros.

## New routes

### `GET /shop-return`

Outlet user. Response:

```json
{
  "slot": "erp2",
  "erpCompany": "Chami",
  "sourceWarehouse": "Shop Warehouse - Chami",
  "targetWarehouse": "Main Warehouse - Chami"
}
```

`409` with a clear error when the outlet matches no single shop warehouse or that company has no single main warehouse. No warehouse list the user can switch.

### `POST /shop-return`

Outlet user. Body: `{ "lines": [{ "itemCode", "itemName", "barcode", "uom", "qty" }] }`.

Server binds source and target from the same resolution as GET. Rejects qty above the live shop bin, erp1 non-VAT, and an empty line list. Creates `direction = shop_to_main`, `status = requested`, `erpName = null`, `sentQty = qty`, `receivedQty = 0`. Does not call ERP.

### `POST /[id]/confirm`

Stores user (`store.material_transfer.write`). Shop-to-main only.

Body: `{ "lines": [{ "itemCode": "ACN01_1", "qty": 2 }] }`. These qtys are what stores counted. They are saved as `receivedQty` (and last-changed-by) before the books call.

| Case | Result |
|------|--------|
| Status is not `requested` | 409, no Stock Entry |
| Every qty is 0 | 400, stay `requested`, no Stock Entry |
| A positive qty is above the shop warehouse live bin | 409, stay `requested`, no Stock Entry, message names the item |
| Success | One Stock Entry, shop warehouse → main, positive qtys only. Status `confirmed`, `erpName` and `erpUrl` set, `receivedByName` set |
| ERP submit fails | 502, status back to `requested`, no leftover draft (same delete-draft rule as send) |

A second successful confirm is impossible: status is no longer `requested`.

## Submit review (client)

Not an API. When the stores user opens confirm on a store-to-shop send and the source name is a main warehouse:

- Show every line (item, barcode, qty, available).
- Mark lines where `qty < availableQty`.
- Do not mark lines where `qty === availableQty`.
- Confirm still calls `POST /submit`.

## History clicks (client)

| Click | Result |
|-------|--------|
| Entry identifier when `erpUrl` is set | New tab to that URL. Item list stays closed. |
| Rest of the row | Item list, including barcode and the two person names. |
| Row when `erpUrl` is null | Item list only. No books link. |

## Reminder

`GET /api/admin/task-reminders` includes category `shop_to_main` for users with `store.material_transfer.write`.

Each open request (`shop_to_main` + `requested`) is a reminder. `href` is `/dashboard/store/material-transfer`. Title identifies the shop warehouse. When the request is confirmed, that reminder is gone.

## Send-list client rules

Shared by the store-to-shop panel and the shop-return panel:

- Scan adds 1 or inserts qty 1, then moves that line to the top and highlights it.
- Typed qty replaces the line qty when it is an integer from 1 through available.
- Over available or an unknown code plays `playScanErrorSound` and does not change the list.
- `qty === availableQty` renders a green border.
