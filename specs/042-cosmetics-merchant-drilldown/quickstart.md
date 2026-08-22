# Quickstart: 042-cosmetics-merchant-drilldown

Validate Cosmetics.lk card click → all-merchant breakdown on Cosmo non-prod (`cosmo-dev` or local Cosmo).

## Prerequisites
- User with `dashboard.view` and the date-type permission for the filter under test (`dashboard.date_type.placed_all` for All orders)
- Company has a location named like **Cosmetics.lk**
- Known sample period with Cosmetics.lk orders from:
  - website (`sourceName` web/shopify)
  - ERP1 (`erpnext` and/or `erpnext-pos`/`pos`)
  - at least two attributed merchants (or DM-General + one named merchant)
  - mixed payment types
  - at least one VAT-tagged line (`itemStatusCategory` VAT - Top Priority Brand) and one non-VAT line
  - at least one order with `totalDiscounts` > 0 and a promotional (non-MER) code if available

No migration. After pull: `npm install` / `npm run db:generate` only if local Prisma client is stale.

## Setup
```bash
npm run env:use cosmo-dev
npm run db:generate
```

## Scenarios

### 1. Click opens same filter
1. Open main dashboard. Note Cosmetics.lk card total, From–To, and sales filter.
2. Click Cosmetics.lk card (not DTD / Pevi / other cards).
3. Expect: sheet/panel titled Cosmetics.lk; period + filter match the dashboard; location total matches the card.
4. Click another location card → drill-down must **not** open.
5. Close sheet → still on dashboard with same From–To and filter.

### 2. All merchants + channels
1. In the sheet, every merchant with Cosmetics.lk orders in this filter is listed (not only the donut top merchant).
2. Unassigned orders appear as **DM-General** (same as card).
3. Location Website vs ERP1 order counts/amounts are visible; Manual only if manual orders exist.
4. Sum of merchant amounts = card total. Per merchant, shown channels sum to that merchant’s total.

### 3. Payment, VAT, discounts
1. Location payment-type amounts sum to the card total; Unspecified appears only if such orders exist.
2. VAT items vs other items visible; a mixed-cart order can contribute to both.
3. Location discount total equals sum of order `totalDiscounts` for the same eligible set. Merchant rows show promotional codes (not MER tracking codes).

### 4. Empty / missing
1. Pick a filter with Cosmetics.lk total 0 → sheet still opens; empty merchants; zeros; no error toast that implies failure.
2. (If testable) company without Cosmetics.lk location → card not clickable or GET 404 “Cosmetics.lk location not found”; other dashboard cards still work.

### 5. Filter change
1. With sheet open, change From–To or sales filter (if UI allows) → figures refresh to the new filter.
2. If filters are locked until close: close, change filter, reopen → new figures; old cache must not stick.

## Expected outcomes
- Card headline math unchanged
- `GET /api/admin/dashboard/sales-by-location` payload unchanged (no extra line-item dump)
- `npm test` + lint clean for touched files before PR

## References
- [data-model.md](data-model.md)
- [contracts/admin-dashboard-cosmetics-lk-drilldown.md](contracts/admin-dashboard-cosmetics-lk-drilldown.md)
