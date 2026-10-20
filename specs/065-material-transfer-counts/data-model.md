# Data Model: Material Transfer Counts and Shop Returns

**Feature**: `065-material-transfer-counts`  
**Date**: 2026-10-13

Extends the existing `MaterialTransfer` and `MaterialTransferLine` models. No new table.

## MaterialTransfer

| Field | Change |
|-------|--------|
| `direction` | New enum `store_to_shop \| shop_to_main`. Default `store_to_shop` so current rows stay store sends. |
| `status` | Enum gains `requested`, `confirming`, `confirmed`. Existing `sent` and `received` stay. |
| `erpName` | Optional. Null until a books document exists. |
| `receivedByUserId`, `receivedAt` | Unchanged meaning: the person who marked received or confirmed. |

Unchanged: `companyId`, `slot` (`erp1` \| `erp2`), `erpCompany`, `sourceWarehouse`, `targetWarehouse`, `createdByUserId`, timestamps.

Unique `(companyId, slot, erpName)` stays. In Postgres, null `erpName` values do not collide.

### States

**store_to_shop**

1. Create after a successful Stock Entry submit → `sent`, `erpName` set, line `receivedQty` 0.
2. Shop marks received → `received`. Counts lock.

**shop_to_main**

1. Shop sends → `requested`, `erpName` null, line `sentQty` = shop qty, `receivedQty` 0.
2. Stores confirm starts → conditional update `requested` → `confirming`. If no row updates, do not post.
3. ERP submit succeeds → `confirmed`, `erpName` set, `receivedByUserId` set.
4. ERP submit fails or the shop warehouse is short → `requested` again, `erpName` stays null.
5. All received quantities 0 → stay `requested`, no ERP call.

A row in `confirming` is not editable. A row in `received` or `confirmed` is not editable.

## MaterialTransferLine

| Field | Change |
|-------|--------|
| `receivedQtyUpdatedByUserId` | Nullable user id. Last person who set `receivedQty` (scan or typed). |
| `receivedQtyUpdatedAt` | Nullable timestamp for that change. |

Unchanged: `itemCode`, `itemName`, `barcode`, `uom`, `sentQty`, `receivedQty`.

No sort column. Scan-to-top is client state.

## Validation

| Action | Rule |
|--------|------|
| Send quantity | Integer, 1 … `availableQty` from the source warehouse. Over available refused. |
| Received quantity | Integer, 0 … 100000, while status is `sent` (store-to-shop, outlet user) or `requested` (shop-to-main, stores user). May differ from `sentQty`. |
| Store-to-shop submit | Source and target rules already in `submitMaterialTransfer`. erp1 VAT-only. Live bin must cover each qty. |
| Shop-to-main create | Source is the outlet’s one shop warehouse. Target is that company’s one main warehouse. No Stock Entry. erp1 VAT-only. Live bin must cover each sent qty. |
| Shop-to-main confirm | Status was `requested`. At least one `receivedQty` > 0. Each positive qty ≤ live qty in the shop warehouse. One Stock Entry for those positive qtys. |
| Mismatch | Status is `received` or `confirmed`, and some line has `receivedQty ≠ sentQty`. |

## Who can see a row

- Stores (`store.material_transfer.write`): every transfer for the company.
- Outlet user: store-to-shop whose **target** matches the outlet, and shop-to-main whose **source** matches the outlet. Same `warehouseMatchesOutlet` helper as today.

## Reminder

Not a table. `fetchTaskReminders` counts rows with `direction = shop_to_main` and `status = requested` for the company. Visible to users with `store.material_transfer.write`.

## Migration

Create with `npm run db:migrate:create`. Apply with `npm run db:deploy:all` only after the user confirms. Do not `db push` to vault, cosmo-dev, or cosmo-prod.

Existing rows: `direction = store_to_shop`, status unchanged, `erpName` unchanged, new line columns null.
