# Data Model: Item Trends Location-Wise Sale Columns

No Prisma schema changes. Logical entities for cover rows.

## LocationSaleRow (API: CoverRow — extended)

| Field | Type | Notes |
|-------|------|-------|
| sku | string | Variant or parent display key |
| commonSkuKey | string | Parent grouping key |
| columnKey | string | OSF warehouse/location column |
| outletName | string | Single display name |
| channelKind | online \| physical | Sort: online first in Item mode |
| locationGroup | cosmetics_lk \| trading | Existing |
| unitsInRange | number | Sale in selected From/To |
| daysInRange | number | Inclusive days of selected range |
| weekNeed | number | `(unitsInRange / daysInRange) × 7` |
| last30Units | number | Units in trailing 30 calendar days (Colombo) |
| last30AvgDaily | number | `last30Units / 30` |
| stockQty | number | Snapshot or live per filter |
| coverDays | number \| null | `stockQty / last30AvgDaily` if avg > 0 |
| ropQty | number \| null | Saved `ProductOsfRop` for location × SKU rules |
| isOosInRange | boolean | Sold in range and stock ≤ 0 (optional highlight) |

### Removed from UI / export (may linger unused in types briefly)

- `stockPctOfSale`, `stockPctOfWeek`
- `shouldSend`, `suggestedSendQty`
- `marketGapPct`, `isCheapestInMarket`

## ProductOsfRop (existing)

- Unique `(companyId, sku, columnKey)` → `ropQty`
- Read-only for this feature (no write on Location table)

## Trailing30Window

- `endYmd`: today Asia/Colombo
- `startYmd`: end − 29 days (30 inclusive)
- Independent of selected analysis range

## StockReading

- Unchanged: live bin map or `ErpStockSnapshot` for selected date
- Missing snapshot date → stock not ready; do not invent live substitute

## Validation rules

- `daysInRange <= 0` → reject cover request (existing)
- `last30AvgDaily === 0` → `coverDays = null`
- Common parent ROP: never sum child `ropQty` values
- Rows with `unitsInRange <= 0` and `stockQty <= 0` and no SKU filter: continue to omit (existing noise filter) unless product later asks to show ROP-only rows

## State / transitions

None. Stateless read model per request.
