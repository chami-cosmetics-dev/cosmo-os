# Research: Shop Item Requests

**Feature**: `066-shop-item-requests`  
**Date**: 2026-10-16

## Decision: Separate tables, not `MaterialTransfer`

**Decision**: Add `ShopItemRequest` and `ShopItemRequestLine`. Do not add a direction or status on `MaterialTransfer`.

**Rationale**: A material transfer row is a stock movement: required warehouses, an ERP slot, and a Stock Entry on send or on stores confirm. This request has no source or target, and marking done must not post. Forcing it into that table would invent empty warehouses and a status that never reaches ERP.

**Alternatives considered**: A third `direction` with nullable warehouses. Rejected because unique keys and confirm logic assume a books document. A JSON blob on the user. Rejected because pending and done need a filter and history.

## Decision: Who can create, list, and close

**Decision**: No new permission key.

- Create and list own requests: staff profile has an outlet name. Same gate as the receive page. `store.material_transfer.write` is not required.
- List every outlet and mark done: `store.material_transfer.write`.
- A user with neither an outlet nor write permission gets 403.

**Rationale**: Shop merchants already open `/dashboard/store/material-transfer/receive` from an outlet, often without the stores write permission. Stores who send transfers already have write. Spec 065 kept the same split.

**Alternatives considered**: Reuse `store.material_transfer.shop_return`. Rejected. That permission is only for sending stock back. A merchant who can receive should be able to request.

## Decision: Where the screens sit

**Decision**: Shop tab on the receive page. Stores tab on the material-transfer page.

**Rationale**: The send page requires write permission, so shop users never see it. The spec’s “new tab” is for shop users. Stores need a pending queue next to the work they already do. Draft lines stay in the browser until submit, matching the send list.

**Alternatives considered**: One page for both roles. Rejected because the two entry URLs and permission gates already differ.

## Decision: How an item is found

**Decision**:

- Suggestions: ERP Item search on erp1 and erp2, `item_code like`, disabled items excluded, minimum 2 characters, cap 15 merged hits. Item name is not searched. Duplicate codes across ERPs collapse to one suggestion.
- Add by exact code: if the string equals one `item_code`, use it.
- Add by barcode: if it is not an exact item code, call `erpnext.stock.utils.scan_barcode` on each configured ERP.
- Zero matches: 404, client plays `playScanErrorSound`, no line.
- Two different item codes: 409, same sound, no line.
- The same code on both ERPs: one line.

**Rationale**: Requests are not limited to the OSF sheet or to VAT items. ERP is the catalog material transfer already uses. Suggestions stay SKU-only because the spec asks for SKU suggestions, not a name search.

**Alternatives considered**: `searchStockRequestProducts` (wishlist), which also searches product title and the web catalog. Rejected for this screen so a name fragment does not add the wrong item. Local `ProductItem` only. Rejected because many ERP items are not in that table.

## Decision: Shop Availability

**Decision**: Read `ProductOsfProfile.shopAvailability` for the company. Match the item code, the hyphen/underscore swap of a trailing variant (`SKU_1` and `SKU-1`), and nothing else. Store `allowed`, `not_allowed`, or null on the line at submit. Only `not_allowed` plays the error sound and shows “this item is not allowed for shops”. The line is still added. `allowed` and null are silent.

**Rationale**: OSF already stores Allowed / Not Allowed on that field. The workbook treats any other value as blank. Capturing it at submit keeps history stable if someone later changes the sheet. Stock is the figure the spec says must stay current; Shop Availability is not.

**Alternatives considered**: Live Shop Availability on every open. Rejected because the spec’s entity says the value is captured. Blocking Not Allowed items. Rejected by the spec.

## Decision: The six main warehouses and the under-4 mark

**Decision**: Resolve these columns from the live warehouse list each time stock is loaded. Do not hardcode only one spelling if the list uses the company name.

| Column | How to pick the warehouse |
|--------|---------------------------|
| Cosmetics main | erp1 warehouse whose name is `Main Warehouse - Cosmo` (case-insensitive). |
| Pevi | erp2 main warehouse. Prefer name `Main Warehouse - Pevi`. Else the one main whose name or company contains `pevi` as a word. |
| SPK | Same, token `spk`. |
| Chami | Same, token `chami`. |
| Udara | Same, token `udara`. |
| SDP | Same, token `sdp`. |

`isMainWarehouseName` decides what counts as a main (excludes goods-in-transit and work-in-progress). If zero or more than one warehouse match and the preferred exact name is absent, that column is unknown.

Stock uses `fetchBinActualQty` once per ERP for the lines on screen.

- ERP call throws: those columns are unknown. Do not invent a number.
- Call succeeds and the Bin key is missing: quantity 0. Same as `sourceQty` on a send.
- Cannot-transfer when the quantity is a number and is strictly below 4. 4 or more is clear. Unknown is not marked.

The mark is display-only. Submit and mark-done ignore it.

**Rationale**: The spec names six company mains and a per-warehouse under-4 warning. Cosmetics main is already `Main Warehouse - Cosmo` everywhere in this app. The trading mains follow `Main Warehouse - {token}` in tests (`Chami`, `SPK`). Matching the token covers a company label that is longer than the token (`Pevi Trading Lanka (Pvt) Ltd`) without listing legal names.

**Alternatives considered**: Sum of the six warehouses under 4 as one item flag. Rejected. The spec asks to show each warehouse, and a sum under 4 would almost never flag a single low main. Freeze stock at submit. Rejected. The spec says opening a request shows current stock.

## Decision: Mark done

**Decision**: One conditional update from `pending` to `done`, setting `doneByUserId` and `doneAt`. If no row updates, return 409 and leave the row done once. No ERP call. No `MaterialTransfer` insert.

**Rationale**: Two stores users can open the same request. The first success wins. The spec says the second sees it already done, and done does not move stock.

**Alternatives considered**: A `confirming` lock like shop returns. Rejected. There is no external post to protect.

## Decision: History filter

**Decision**: `status=pending` or `status=done`. Omit the parameter and the list is pending. Cap 300, newest first. Shop users: `outletName` equals their current outlet name. Stores: all outlets in the company.

**Rationale**: Matches the spec’s default and the existing history cap. Outlet is stored on the request so a later profile change does not rewrite history. A renamed outlet will not see the old name; that is acceptable and the same string match the receive list already uses.

**Alternatives considered**: All-status default. Rejected. New requests must show as pending.
