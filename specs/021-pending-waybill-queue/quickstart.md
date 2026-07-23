# Quickstart: Pending Waybill Queue

**Feature**: `021-pending-waybill-queue`  
**Date**: 2026-07-23

Validation after implementation. See [contracts/pending-waybill-queue.md](./contracts/pending-waybill-queue.md) and [data-model.md](./data-model.md).

## Prerequisites

- Feature implemented (import mapping, page-data, pending + history UI, rematch)
- Env: `npm run env:use cosmo-dev` (or vault as needed)
- If a migration was added for indexes: `npm run db:generate` then `npm run db:deploy:cosmo-dev` (all DBs before calling complete)
- Users:
  - **Importer**: `fulfillment.waybill_lookup.import` (+ read)
  - **Viewer**: `fulfillment.waybill_lookup.read` only
  - **Denied**: neither permission
- At least two OS orders in the company: one **not** delivery-complete, one **delivery-complete** (known invoice/order numbers)
- Two sample courier files (CSV or XLSX) with distinct waybill numbers:
  - **File A**: invoice matching open order + one unmatched fake invoice
  - **File B**: different waybills; optionally one overlapping waybill number from A to test latest-wins

## 1. Unit tests

```bash
npm test -- order-waybills
```

**Expected**: Pending predicate and invoice normalization/rematch helpers pass.

## 2. Multi-upload retention

1. Sign in as Importer; open `/dashboard/fulfillment/waybill-lookup`.
2. Upload **File A**; note imported count and unmatched count.
3. Upload **File B**.

**Expected**:
- Upload history shows **both** File A and File B.
- Search still finds a waybill that existed only in File A.
- Pending list still includes File A’s pending rows (unless they became delivery-complete).

## 3. Latest-wins on same waybill number

1. Upload a file that updates a waybill number already imported with new courier raw fields.

**Expected**: That waybill’s details show the newer fields; other waybills unchanged; upload history has a new entry.

## 4. Order mapping

1. After File A import, open pending list.

**Expected**:
- Row with known open-order invoice shows **Matched** and OS display id.
- Fake invoice shows **Unmatched**.
- Details for matched row show raw courier fields + order context.

## 5. Rematch without re-upload

1. Create/import an OS order whose invoice matches a previously unmatched waybill (or use rematch after creating the order).
2. Refresh page / run Re-check matches.

**Expected**: Previously unmatched row becomes Matched without re-uploading the file.

## 6. Delivery-complete hidden from pending

1. Ensure a waybill is matched to an order; mark that order delivery-complete in OS (existing fulfillment flow).
2. Refresh pending list.
3. Search by that waybill/invoice.

**Expected**:
- Row absent from pending list.
- Search still returns the waybill and order.

## 7. Unmatched stays pending

1. Confirm unmatched rows remain on the pending list after refresh.

**Expected**: Unmatched rows visible until matched and (if applicable) delivery-complete.

## 8. Permission gates

1. As Viewer: pending list + search + history visible; upload control hidden/disabled; import POST 403.
2. As Denied: page denied / redirect-login as existing pattern.

## 9. Import safeguards

1. Upload empty or wrong file type.

**Expected**: Clear error; prior uploads and waybills unchanged.

## Sign-off

| Scenario | Pass? |
|----------|-------|
| Multi-upload retention | |
| Latest-wins overlap | |
| Mapping matched/unmatched | |
| Rematch | |
| Delivery-complete hidden + still searchable | |
| Permissions | |
| Bad file leaves data intact | |
