# Quickstart: Item Trends Simple Rebuild

1. Apply `Order.district` migration when ready (`npm run db:deploy:cosmo-dev` — only if asked).
2. Optional: `npx tsx scripts/backfill-order-district.ts` on that env.
3. Open `/dashboard/purchasing/item-trends`.
4. Snapshot date defaults to yesterday. Change date → stock/%/cover change.
5. Location tab: one shop, range, send/OOS filters.
6. Item tab: search `ORD04` (common grain) → warehouses, online first, market gap if competitor data.
7. Districts: orders with province/city land in a district; blanks Unmapped.
8. ROP: export CSV.

Tests: `npx vitest run lib/item-trends/sku-group.test.ts lib/item-trends/location-name.test.ts lib/item-trends/cover.test.ts lib/item-trends/district.test.ts`
