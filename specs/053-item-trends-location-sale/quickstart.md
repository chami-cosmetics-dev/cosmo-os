# Quickstart: Item Trends Location-Wise Sale Columns

Validate after implement (`/speckit-tasks` → `/speckit-implement`).

## Prerequisites

- User with `purchasing.item_trends.read`
- Company with OSF columns, recent completed sales, `ProductOsfRop` for at least one SKU × location
- Snapshot history if testing snapshot mode; ERP reachability for live mode

## Unit checks

```bash
npm test -- lib/item-trends/cover.test.ts
npm test -- lib/item-trends/cover-rows
# or focused files added for rop-resolve / trailing-30 helpers
```

Expected:

- Week need still `(units / days) × 7`
- Cover days = `stock / (last30Units/30)`; null when last30 avg is 0
- Fixture: 14/7 days, last30=60, stock=10 → weekNeed 14, avg 2, coverDays 5
- Common ROP resolve does not sum variant ROPs

## Manual UI

1. Open `/dashboard/purchasing/item-trends` → **Location**.
2. Confirm columns: Item, Location, **ROP**, **Sale**, **Stock**, **Week need**, **Last 30d avg sale**, **Cover days**.
3. Confirm **absent**: Stock/sale, Send, Market gap, send-only filter.
4. Change date range only → Sale + Week need change; Last 30d avg stays stable for the same load day.
5. Toggle stock live ↔ snapshot → Stock + Cover days follow source; Sale unchanged.
6. Common grain parent with known location ROP → ROP cell matches saved common/location value (not sum of variants).
7. Export CSV headers match new columns (include rop + last_30d_avg; no should_send / stock_pct_of_sale).
8. **Item** mode: same removals; Main/online still sorts above shops.

## API smoke

```http
GET /api/admin/purchasing/item-trends/cover?from=YYYY-MM-DD&to=YYYY-MM-DD&stockSource=snapshot
```

Expect `trailing30From` / `trailing30To`, rows with `ropQty`, `last30AvgDaily`, `coverDays`; no reliance on market gap fields. See [contracts/item-trends-cover.md](./contracts/item-trends-cover.md).

## Out of scope for this quickstart

- Districts totals
- ROP suggestion export panel formulas
- Nightly snapshot cron
- Market Price Compare pages
