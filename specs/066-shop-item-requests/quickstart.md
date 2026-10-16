# Quickstart: Shop Item Requests

**Feature**: `066-shop-item-requests`  
**Date**: 2026-10-16

Validation guide. Implementation steps belong in `tasks.md`.

## Prerequisites

- Checkout includes this feature’s migration.
- Create the migration with `npm run db:migrate:create` when implementing. Apply it only to the database you were told to use. Do not deploy to production unless someone asked in that moment.
- `npm run db:generate` after the migration exists.
- A shop user whose staff profile has an outlet.
- A stores user with `store.material_transfer.write`.
- erp1 and erp2 configured for that company, with the six main warehouses reachable.
- One item whose OSF Shop Availability is Not Allowed, and one item with stock below 4 at one of those mains.

## Unit checks

From the repo root:

```bash
npm test -- lib/material-transfer/shop-item-request.test.ts
```

Expect these rules to pass:

- Cosmetics main is `Main Warehouse - Cosmo`. Pevi, SPK, Chami, Udara, and SDP resolve from the token, preferring `Main Warehouse - {token}`.
- Two mains for one token and no exact preferred name → that column is unknown.
- Quantity 0, 1, 2, 3 → cannot-transfer. Quantity 4 → not marked. Null quantity → not marked.
- Shop Availability warns only for `not_allowed`.
- A repeated item code in the submit body is rejected.
- Mark-done updates only a `pending` row.

Lint the files this feature changes. `npm test` for the repo suite before a PR. No mobile typecheck unless a shared type imported by the rider app changes.

## Staff UAT

Contracts: [shop-item-requests.md](./contracts/shop-item-requests.md). Fields: [data-model.md](./data-model.md).

1. Sign in as the shop user. Open **Receive transfer**. Choose **Request items**.
2. Scan a known barcode. The line shows quantity 1 and six stock cells.
3. Type a SKU prefix, pick a suggestion, and confirm that item is a second line.
4. Add the Not Allowed item. An error sound plays, the notice says it is not allowed for shops, and the line stays.
5. Find a main warehouse cell below 4. It is marked cannot-transfer. Submit anyway.
6. Change a quantity, remove one line, and submit the rest. The request appears under Pending with your name and outlet.
7. Sign in as stores. Open **Material transfer**, tab **Shop requests**. Pending shows that request, the creator, the outlet, Shop Availability, and the same six stocks with the same cannot-transfer cells.
8. Mark it done. It leaves Pending. Done still opens it. No new material transfer exists for those lines.
9. As the shop user, Pending and Done show only that outlet. A request for another outlet is absent.
10. Scan an unknown code. Error sound, no line. Submit with an empty list does nothing.

## Out of scope for this check

- Creating or submitting a Stock Entry.
- Changing a request after submit.
- Vault OS.
