# Research: Material Transfer Counts and Shop Returns

**Feature**: `065-material-transfer-counts`  
**Date**: 2026-10-13

## 1. Where shop-to-main lives

**Decision**: Same `MaterialTransfer` row, new `direction` `store_to_shop | shop_to_main`. Existing rows default to `store_to_shop`.

**Rationale**: Both flows share lines, barcode, sent qty, received qty, outlet scope, and history. A second table would duplicate the receipt screen.

**Alternatives considered**:

- A `ShopReturn` model — same fields, a second history. Rejected.
- Post a draft Stock Entry at shop send and submit it on confirm — the spec forbids any books document until stores confirm. A draft is still a books document. Rejected.

## 2. Status

**Decision**: Add `requested` and `confirmed` beside `sent` and `received`.

| Direction | Open | Done |
|-----------|------|------|
| store_to_shop | `sent` (books already posted) | `received` (shop locked the count) |
| shop_to_main | `requested` (no books document) | `confirmed` (one books document posted) |

Confirm claims the row with `updateMany` where `status = requested`, sets a short-lived `confirming` value, posts, then sets `confirmed`. Any failure sets `requested` again. A second confirm that finds `confirmed` or `confirming` does not post.

**Rationale**: Reusing `sent` for an unposted shop request would make every open return look like a store send. The claim stops two stores users posting two Stock Entries.

**Alternatives considered**:

- Optimistic lock column only — works, but a status the UI can show (“Confirming”) is clearer if a request is mid-post. `confirming` is not a user action.

## 3. Books document name

**Decision**: `erpName` becomes optional. Store-to-shop still stores the `MAT-STE-…` name at send. Shop-to-main leaves it null until confirm, then stores the name from that one submit. Postgres unique `(companyId, slot, erpName)` allows many nulls, so unposted requests do not collide. History shows a books link only when `erpName` is set. Until then the row label is the shop warehouse and the time, and it is not a link.

**Rationale**: The spec says an unconfirmed return has no entry identifier to open.

**Alternatives considered**:

- A fake `SHM-` name in `erpName` — the entry would look like a books id and invite a bad click. Rejected.

## 4. Who counted

**Decision**: `MaterialTransferLine.receivedQtyUpdatedByUserId` (and `receivedQtyUpdatedAt`) is the last person who changed that line, scan or typed quantity. `MaterialTransfer.receivedByUserId` / `receivedAt` stay the person who marked received or confirmed. Both names go out on the transfer payload.

**Rationale**: The spec splits “who last changed the line” from “who marked it”.

**Alternatives considered**:

- Audit log only — stores need the name on the row without opening the audit screen. Rejected as the only store.

## 5. Available cap and beep

**Decision**: Send lists (store-to-shop and shop-to-main) keep quantity a whole number from 1 through `availableQty` on the line. `upsertTransferLine` and `setTransferLineQty` refuse a step past available and return a reason the panel uses to call `playScanErrorSound`. A code that is not one sendable item, or not on an open receipt, uses the same sound. The server checks the live bin again on store-to-shop submit and on shop-to-main create and confirm. The client beep is not the only guard.

Receipt counts (shop receive, stores confirm) stay 0 through 100000 and may be below or above sent. They do not beep for a mismatch.

**Rationale**: The spec blocks over-available on send only. Short and extra receipts are allowed.

**Alternatives considered**:

- Cap only in the browser — a second tab could post a higher qty. Server re-check stays.

## 6. Scan to top, highlight, green border

**Decision**: Client-only. A successful scan moves that line to index 0 and sets `highlightedItemCode`. The next successful scan replaces the highlight. A send line whose `qty === availableQty` gets a green border. Other lines keep the normal border. Receipt lines do not get the green border.

**Rationale**: Order is display state. The database has no line position. Green means “sending the full available amount”, which is a send-list rule.

**Alternatives considered**:

- Persist sort order — history would reshuffle as people scan. The spec only asks for the open list. Rejected.

## 7. Low count on store submit

**Decision**: When the source warehouse name matches `isMainWarehouseName`, the confirm dialog lists every line and marks each line with `qty < availableQty`. Lines with `qty === availableQty` are not marked low. `availableQty == null` is not marked (nothing to compare). The user can still submit. Shop-to-main confirm does not show this mark. The figure is the available quantity already on the line from lookup, the same number as the green border.

**Rationale**: The spec asks for a warning when stores send less than main has, and still allows the send. A fresh bin fetch on dialog open is a second round trip the warning does not need.

**Alternatives considered**:

- Block submit when any line is low — contradicts “they can still submit”. Rejected.
- Mark low lines on every source, including a shop warehouse — the spec names the main warehouse. Rejected.

## 8. Mismatch filter

**Decision**: A transfer is a mismatch only when it is finished (`received` or `confirmed`) and at least one line has `receivedQty !== sentQty`. Open `sent` and `requested` rows stay out of the filter, including a new shop return whose received qty is still 0. Query `mismatch=1` on history. Stores see all shops. An outlet user sees only transfers their outlet matches (target for store-to-shop, source for shop-to-main).

**Rationale**: If open rows counted, every uncounted transfer would be a mismatch and the filter would not match the spec’s “exact vs short after receipt” test. Marking received at all zeros is finished, so it is a mismatch. Confirming a shop return at all zeros does not finish the request, so it stays off the filter.

**Alternatives considered**:

- Any row with a differing line, including open — floods the filter. Rejected.

## 9. Shop warehouse to main

**Decision**: Reuse `warehouseMatchesOutlet` (including the existing ERP2 code alias, such as MNK → Cool Planet). The source is the one shop warehouse on erp1 or erp2 that matches the outlet. The target is the main warehouse (`isMainWarehouseName`) on that same ERP company. If zero or more than one shop matches, or no single main matches, the screen says no shop warehouse is allocated and send stays disabled. The user cannot pick another warehouse and cannot start main-to-shop.

erp1 shop returns still allow only VAT items. erp2 allows any item. No company picker.

**Rationale**: Outlet assignment is already the receive gate. The same match picks the return warehouse.

**Alternatives considered**:

- A new outlet-to-warehouse table — the spec says the outlet name matches the shop warehouse. Rejected until a real outlet fails that match.

## 10. What confirmation posts

**Decision**: `submitMaterialTransfer` runs once, source = shop warehouse, target = main, quantities = the received qty stores just saved, lines with qty 0 omitted. If every received qty is 0, respond 400 and do not call ERP. If any positive qty is above the shop warehouse’s live available qty, respond 409, name the item, and do not call ERP. Success stores `erpName`, sets `confirmed`, sets `receivedByUserId`, and the reminder query no longer sees the row.

**Rationale**: The books must move the quantity stores counted, and only when the shop warehouse can cover it.

**Alternatives considered**:

- Post the shop’s sent qty — the spec says stores’ count. Rejected.
- Post a partial set when one line is short — one confirmation is one document or none. Rejected.

## 11. Reminder

**Decision**: Add category `shop_to_main` to the task-reminder union. Show it when the user has `store.material_transfer.write` (admins already pass that check). Do not add a `reminders.*` key. The bubble counts `direction = shop_to_main` and `status = requested` for the company, links to `/dashboard/store/material-transfer`, and drops that request when status leaves `requested`.

**Rationale**: The spec says the reminder is for people who already send store-to-shop. Reminder permissions are a second tick. This feature asked for no new role.

**Alternatives considered**:

- New `reminders.shop_to_main` permission — stores would need a manual tick they were not given. Rejected.

## 12. History click

**Decision**: The entry identifier is an anchor to `{instanceBaseUrl}/app/stock-entry/{erpName}` when `erpName` is set, `target=_blank`, click does not open the item list. The rest of the row opens the item list (barcode, sent, received, who last changed the line, who marked or confirmed). No `erpName` means no anchor.

**Rationale**: Today the entry name toggles the item list. The spec splits the two clicks.

**Alternatives considered**:

- Open ERP inside Cosmo OS — no embedded ERP desk. A new tab is the existing way staff open books. Rejected as extra UI.
