# Quickstart: validate Multi-SKU Company Availability

## Prerequisites

- `npm run env:use cosmo-dev` (ERP2 instance labelled "ERP2" configured for the company).
- Your role has `products.order_availability.read`. Grant it in Settings → Roles. The permission is registered in `lib/rbac.ts`.
- Optional: set `ORDER_AVAILABILITY_CAP_LKR` to a small value (e.g. `100000`) to force cap scenarios on dev.

## Automated

```bash
npm test -- lib/order-availability
npx tsc --noEmit
npm run lint
```

The unit tests in `lib/order-availability/rank.test.ts` must cover:
1. Normalisation: duplicates merged with quantities added, case-insensitive, blanks dropped, more than 50 rejected.
2. Classification: covered, short and missing at the exact boundaries (available = qty, available = qty − 1, 0, negative).
3. Ranking: coverage first, then totalAvailable (capped at requested qty), then name.
4. Cap status: unknown, reached, would_exceed, near and ok at the boundaries (`used + order === limit` is ok or near, not exceed).
5. Options: capped companies skipped, only N labelled A/B/C in order, zero-coverage never labelled, fewer than N eligible → only those, none eligible → correct `noOptionReason`.

## Manual (dev server, `npm run dev`)

Open `/dashboard/products/vat-status?tab=order-availability`.

| # | Do | Expect |
|---|----|--------|
| 1 | Paste 5 SKUs spread across companies, then click Check | One row per ERP2 company with "x of 5". The best coverage is at the top. |
| 2 | Look at the top of the results | Up to 3 cards, Option A/B/C, each showing coverage, MTD used, order value, and headroom after. |
| 3 | Set the cap env var low so the best-coverage company exceeds it | That company appears under "Other companies" marked "Would exceed cap", and Option A moves to the next company. |
| 4 | Click Option B | It is marked selected and the detail view lists the missing SKUs with source company/warehouse and quantity, largest first. |
| 5 | Include a nonsense SKU | It is listed as "Not found" and the others still check. |
| 6 | Enter qty 999 for one SKU | Most companies show it as "Short" with the available quantity. |
| 7 | Paste 51 distinct SKUs | Validation message, and no ERP call is made. |
| 8 | Open the tab as a user without the permission | The tab is hidden. If the user has no tab permission at all, the page shows a permission-denied card. |
| 9 | Compare 3 random warehouse quantities against ERP2 Stock Balance | They match `actual − reserved` at the shown time (SC-004). |
| 10 | Confirm in ERP2 that no Stock Entry, SO or SI was created by the checks | Read-only (FR-020). |
