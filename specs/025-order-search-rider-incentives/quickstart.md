# Quickstart: 025-order-search-rider-incentives

Validate the four user stories after implementation.

## Prerequisites
- Cosmo OS running against a migrated DB (`DeliveryPayment.customerGaveAmount` / `changeAmount` present)
- Rider user with active mobile session; staff user with `dashboard.view`, `orders.read`, `staff.read`
- At least one COD order with known `orderNumber` and non-zero `totalShipping`

## 1. Order number visibility
1. Open Orders list, a fulfillment queue, Approvals, Riders ops table, and rider app route list.
2. Confirm each order row shows the business order number (or documented fallback).
3. Open one detail on web and mobile — order number visible in header.

**Expect**: No primary surface relies only on phone/internal id.

## 2. Dashboard search
1. Go to `/dashboard`.
2. Search by full order number → open hit → correct order.
3. Search by customer phone → hits show order numbers.
4. Search nonsense string → empty state.

**Expect**: Results within normal interactive time; unauthorized users cannot call quick-search API.

## 3. Cash tender + balance
1. On rider app, open COD delivery amount due 3500 (or test amount).
2. Enter customer gave 5000 (and payment method/lines as required).
3. Confirm UI shows balance 1500 before complete.
4. Complete delivery; open order in Cosmo OS fulfillment/order detail.

**Expect**: Web shows customer gave 5000 and change 1500; `collectedAmount` remains amount due for cash reconciliation.

## 4. Rider performance / incentive
1. Note order `totalShipping` (e.g. 400).
2. Complete delivery as rider A.
3. Open `/dashboard/riders/performance` (or riders performance tab), set date range including today.
4. Confirm rider A completed count +1 and incentive + shipping amount.

**Expect**: Failed delivery does not add incentive; voided orders excluded from totals.

## Automated checks
```bash
npm test
npm run mobile:typecheck
```
Add/extend unit tests for: tender/change math, cashDue from split lines, incentive sum helper, quick-search query validation.
