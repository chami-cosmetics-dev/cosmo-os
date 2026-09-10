# Data Model: Item Trends Stock Phases

## New: ErpStockSnapshot

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | |
| companyId | string | FK Company cascade |
| snapshotDate | string | Colombo `YYYY-MM-DD` |
| capturedAt | DateTime | Actual run time |
| sku | string | ERP item_code |
| warehouse | string | ERP warehouse name |
| qty | float | Summed `actual_qty` (> 0 only) |

**Unique**: `(companyId, snapshotDate, sku, warehouse)`  
**Indexes**: `(companyId, snapshotDate)`, `(companyId, sku, snapshotDate)`  
**Retention**: cron deletes `snapshotDate` older than 90 days.

Missing row = qty 0.

## Derived: CoverRow

| Field | Notes |
|-------|--------|
| sku, title, brand, commonSkuKey, commonSkuTitle, variantTitle | catalog |
| columnKey, outletName, channelKind | `online` \| `physical` |
| unitsInRange, daysInRange, avgDaily, weekNeed | from section date range |
| stockQty | latest snapshot, 0 if missing |
| stockPctOfWeek, coverDays | null if avgDaily = 0 |
| shouldSend | stock < weekNeed * 0.5 and weekNeed > 0 |
| suggestedSendQty | ceil(max(0, weekNeed − stock)) |
| isOosInRange | unitsInRange > 0 and stockQty ≤ 0 |

## Existing changes

- `ItemMovementRow`: add `brand`, `commonSkuKey`, `commonSkuTitle`, `variantTitle`
- `OutletBalanceRow`: add `channelKind`; `stockQty` from snapshot
- `RopSuggestionRow.currentRop`: sum of all OSF ROP columns
