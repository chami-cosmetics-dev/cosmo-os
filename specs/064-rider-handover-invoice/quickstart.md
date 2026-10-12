# Quickstart: Rider Cash Handover and Invoice Close

**Feature**: `064-rider-handover-invoice`  
**Spec**: [spec.md](./spec.md)  
**Contract**: [contracts/rider-handover.md](./contracts/rider-handover.md)

Validate on cosmo-dev (or local pointed at a non-prod database). Do not deploy schema to production from this guide.

## Prerequisites

- Signed-in Cosmo user with `riders.performance.read`
- A second check with only that permission (no handover keys)
- A user with `riders.handover.summary` only
- A user with `riders.handover.receive` (finance role after RBAC sync)
- One rider with delivery-complete tasks on a known Colombo day, in at least two ERP companies if the data exists
- Mix of COD cash, card or bank, and one split cash+card if the data exists
- One of those orders placed as cash and collectable as bank transfer or card in ERP modes
- One order in the range already invoice-closed

Migration (after implementation, non-prod first):

```bash
npm run db:migrate:create
npm run db:deploy:cosmo-dev
npm run db:generate
```

`npm run db:deploy:all` only when the user explicitly confirms all three databases.

## Unit checks

```bash
npm test -- lib/rider-handover.test.ts lib/rider-incentive.test.ts
```

Expect:

- Company lines use `erpnextCompany`, fall back to location name, drop zero-cash companies, and sum to the full total
- COD counts; card and bank do not; a split counts only the COD part
- A second receipt without confirm is rejected; with confirm it is allowed
- A delivery-complete order that is not invoice-closed adds a completion and `0` incentive
- The same order after invoice close adds the rider charge on that delivery’s aggregate
- Void / cancelled / refunded still add nothing
- Completed count still includes the not-yet-closed delivery

Lint touched files. If `mobile/rider-app` types for performance change, run `npm run mobile:typecheck`.

## Staff UAT

1. Open `/dashboard/riders/performance` as a user with performance read and neither new permission. Confirm no slip, no order load, no Mark invoices completed.
2. As summary-only: pick one rider and one day. Generate. Confirm company cash lines and a full total, and no order rows. Print. Confirm rider name, dates, totals, **Handover by** with the rider name, and **Cash collected**, each with a signature line. Confirm the print hides the rest of the page.
3. As summary-only, call or click anything that loads orders, marks received, or marks invoices completed. Expect denial.
4. As receive user: same rider and day. Mark money received. Refresh the summary and see who received it and the totals stored. Mark again. Expect a confirm. Cancel and confirm no second row. Confirm and see a second receipt.
5. Load orders. Confirm every delivery-complete order for that rider and day is listed, including card/bank and already closed. Change one cash order’s mode to bank transfer or card. The choices match that order’s ERP instance modes.
6. Press **Mark invoices completed**. Eligible orders become invoice complete. The changed order’s payment entry in ERP uses the mode you picked. An already closed order gains no second payment entry. If one order has no sales invoice, it stays not invoice complete, the reason is visible, and the others in the run stay closed.
7. Card or bank orders can be closed without marking money received (use a range you have not received, or skip step 4 on a second day).
8. Rider with no completions in the range: summary prints zeros.

## Incentive UAT

1. Note a delivery-complete order that is not invoice-closed and has a known rider charge. Staff performance and the rider app for that delivery day show the completion and do not include the charge in incentive.
2. After step 6 closes it, the same delivery day includes the charge on both views. Totals match to 0.01.
3. A prepaid order that was already invoice-closed earns the charge as soon as the rider completes delivery.
4. Unmatched district behavior is unchanged for a delivery that still has no rider charge.

## Out of checks

- Vault OS
- Rider-app cash handover submit (`/api/mobile/v1/handovers`)
- Signature image upload
- Closing more than 80 eligible orders in one request (expect the shorten-range error, no partial stamp)
