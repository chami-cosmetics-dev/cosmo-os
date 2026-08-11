# Quickstart: Rider Performance Sync & Analytics

**Feature**: `038-rider-performance-sync`  
**Date**: 2026-08-11

Validation guide after implementation (not a full test suite).

## Prerequisites
- Cosmo target env (`npm run env:use cosmo-dev` or local with DB)
- User with `staff.read` (riders/performance) and `settings.company` (charge upload)
- Rider user with `employeeProfile.isRider = active`
- Sample Excel: Shipping Rule New.xlsx (or subset with filled **Delivery Charges for riders**)

## Setup
```bash
npm install
npm run db:generate
# no migration expected for v1
npm run dev
```

## 1) Import rider charges (upsert + skip blanks)
1. Open Settings → rider delivery charges upload
2. Upload Shipping Rule New.xlsx
3. Expect: `imported` ≈ rows with filled rider charge; `skippedBlank` for empty F; second upload does not wipe prior labels omitted from a partial file

## 2) App completion → admin pages
1. Dispatch an order to the test rider (creates `RiderDeliveryTask`)
2. Complete via rider app
3. `/dashboard/riders` → select rider → Completed ≥ 1 for today; open prior-day tasks still listed under Assigned/In progress
4. `/dashboard/riders/performance` → today → rider appears with completed count; incentive matches rule for that label (not shipping amount when they differ)

## 3) Link completion → same pages
1. Dispatch another order; obtain `/r/d/{token}` link
2. Confirm delivery in browser
3. Refresh Riders + performance → +1 completed for same rider/day
4. Confirm a second click is idempotent (no double count)

## 4) Link without task
1. Order with token but no `RiderDeliveryTask`
2. Confirm link → order delivery-complete; performance **unchanged** for riders

## 5) Unmatched + charts
1. Complete a delivery whose label has no charge rule
2. Performance shows unmatched summary ≥ 1 and marker on rider/row; incentive +0 for that delivery
3. Change date range → KPIs, charts, and table update together

## 6) Rider app parity
1. Open rider app Performance for current period
2. Totals match admin for same rider/period (2 dp)

## Automated checks
```bash
npx vitest run lib/rider-delivery-charge.test.ts lib/rider-incentive.ts lib/format-datetime.test.ts
# plus any new tests added for upsert/skip/unmatched/open-task filter
npm run mobile:typecheck   # if mobile types/API client touched
```

## Contracts
- [admin-riders-performance.md](./contracts/admin-riders-performance.md)
- [admin-riders-orders.md](./contracts/admin-riders-orders.md)
- [admin-settings-rider-delivery-charges.md](./contracts/admin-settings-rider-delivery-charges.md)
- [public-rider-delivery-complete.md](./contracts/public-rider-delivery-complete.md)
