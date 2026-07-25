# Quickstart: Print Invoice Without Marking Printed

Validation guide for [spec.md](./spec.md). See [contracts/invoice-print-modes.md](./contracts/invoice-print-modes.md) for query modes.

## Prerequisites

- Local app running against a non-prod env (`npm run env:use <target>` as usual).
- User with `fulfillment.order_print.read` (view-only) and, separately, a user/role with `fulfillment.order_print.print` for formal print comparison.
- At least one **unprinted** order (`printCount = 0`), one **already printed** order, and one **cancelled** order visible in an orders/fulfillment list that opens the invoice timeline modal.

## Setup

No migration. Pull branch, install if needed, `npm run db:generate` if Prisma client is stale.

## Validation scenarios

### 1. Unprinted order — view-only Print Invoice (P1)

1. Open an order with Print timeline step incomplete (`printCount` 0).
2. Note Print step shows incomplete (no printed timestamp).
3. Click **Print Invoice**.
4. New tab opens with invoice HTML; print dialog may appear (format autoPrint).
5. Close/cancel or complete the dialog.
6. Return to the modal (refresh if needed) — Print step still incomplete; `printCount` still 0; stage unchanged.

**Pass**: Invoice visible/printable; no mark-as-printed.

### 2. Already printed order — reprint without changing status (P1)

1. Open an order with `printCount > 0` and a known `lastPrintedAt`.
2. Click **Print Invoice**.
3. Confirm invoice opens (may show COPY watermark).
4. Confirm `printCount` and `lastPrintedAt` unchanged.

**Pass**: Reprint works; formal print metadata unchanged.

### 3. Cancelled order (P1)

1. Open a cancelled order in the invoice timeline modal.
2. Click **Print Invoice**.
3. If GET succeeds: invoice prints/opens; cancelled state and print fields unchanged.
4. If 409 finance block: confirm status still unchanged and user sees a clear failure (known constraint).

**Pass**: No workflow mutation.

### 4. Discoverability (P2)

1. Open order details modal.
2. Confirm **Print Invoice** is visible without expanding obscure sections (actions near View JSON is fine).
3. Confirm label does not say it completes the Print timeline step.

### 5. Formal print still marks printed (FR-008)

1. From fulfillment **Print** queue (not order-details view-only button), print an unprinted order via existing formal flow (`?print=1`).
2. Confirm `printCount` increments and timeline Print completes.

**Pass**: Formal path unchanged.

### 6. Permission

1. User with read but not print: can use order-details Print Invoice (view-only).
2. User without read: cannot load invoice / button hidden or unauthorized.

## Optional automated check

If a pure helper parses print/preview query flags:

```bash
npm test -- invoice-print
```

(or the specific test file added for the helper)

## Done when

All scenarios 1–5 pass; scenario 6 matches [contracts/invoice-print-modes.md](./contracts/invoice-print-modes.md).
