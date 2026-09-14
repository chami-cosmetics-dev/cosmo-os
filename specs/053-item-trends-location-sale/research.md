# Research: Item Trends Location-Wise Sale Columns

## Cover days from trailing 30-day avg (not selected range)

**Decision**: Keep `weekNeed = (unitsInRange / daysInRange) × 7`. Redefine `coverDays = stockQty / last30AvgDaily` where `last30AvgDaily = last30Units / 30`. If `last30AvgDaily === 0`, `coverDays = null`.

**Rationale**: Spec separates range sale/week need from “last 30 days avg sale” and stock-to-cover-days. Buyers changing From/To must not rewrite the 30d pace or cover.

**Alternatives considered**: Cover from range avg daily (current `computeCoverMath`) — rejected by spec. Cover from calendar month — not asked.

## Trailing-30 window end date

**Decision**: Trailing 30 calendar days end on **today (Asia/Colombo)** as YMD, independent of selected `from`/`to`. Inclusive count = 30 days; reuse existing inclusive-day helpers.

**Rationale**: Spec: last-30 avg must not change solely because selected range length changes; same “as of” day for a given load moment.

**Alternatives considered**: End on selected `to` — couples historical analysis ranges to cover pace. Rejected for default.

## Second sales pass vs one wide query

**Decision**: Call `salesByOsfColumnInRange` twice in `fetchCoverRows`: (1) selected range, (2) trailing-30 window — same scoped columns and SKU filter. Attach `last30Units` / `last30AvgDaily` per sku × columnKey.

**Rationale**: Existing helper already attributes by OSF column; avoids new aggregation code. Cover loads already budgeted for one sales map; second map is acceptable vs inventing a dual-window aggregator now.

**Alternatives considered**: Single SQL with two date buckets — nicer later, out of scope. Client-side 30d — wrong/incomplete.

## Location-wise ROP from ProductOsfRop

**Decision**: Load `ProductOsfRop` for `companyId` + SKUs in the cover set (and their `commonSkuKey` parents). Per row:

- **Separate grain (API row always per SKU)**: `ropQty` = saved qty for `(sku, columnKey)`, else `null`.
- **Common grain UI parent**: prefer `(commonSkuKey, columnKey)`; else if all child variant ROPs for that column equal → that value; else if exactly one child has non-null ROP → that value; else `null`. **Never sum** variant ROPs into the parent cell.

**Rationale**: Spec: location-wise common SKU ROP, not a sum. OSF stores ROP per sku × columnKey.

**Alternatives considered**: Sum all variant ROPs (like total ROP export) — misleading on location row. Suggested/next ROP from `rop-suggest` — different product; not this column.

## Remove market gap from cover path

**Decision**: Stop calling `fetchMarketGapForSkus` in cover route. Remove gap badge from `cover-panel` / location-compare. Leave `lib/item-trends/market-gap.ts` for Market Price Compare / other callers.

**Rationale**: Spec removes market gap from Item Trends rows.

**Alternatives considered**: Hide in UI only — still pays gap query cost; reject.

## Remove Send column and sendOnly filter

**Decision**: UI drops Send column and send-only checkbox. Sort no longer prioritizes `shouldSend`. API may keep computing `shouldSend` briefly or stop setting it; `sendOnly` query param deprecated (ignore or remove from Zod). CSV drops send / stock_pct columns; adds `rop`, `last_30d_avg_sale`.

**Rationale**: Spec: no send column; send-only filter only served that flag.

**Alternatives considered**: Keep send in CSV for ops — rejected; export should match table.

## Stock source unchanged

**Decision**: Keep existing `stockSource=live|snapshot` + snapshot date resolve. Cover days use the same `stockQty`.

**Rationale**: Spec FR-004; already implemented in `cover-rows.ts`.

## Item mode consistency

**Decision**: Same column removals on Item/warehouse compare surfaces that reuse cover rows (`location-compare-panel`). Add ROP / last-30 / new cover days there too when those cells are shown.

**Rationale**: Spec User Story 6.

## Schema / migration

**Decision**: No new tables or columns.

**Rationale**: All data already available via sales maps, bins/snapshots, `ProductOsfRop`.
