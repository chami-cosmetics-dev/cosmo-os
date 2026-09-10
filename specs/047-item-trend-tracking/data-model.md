# Data Model: Item Trends Super Dashboard

**Feature**: `047-item-trend-tracking`  
**Date**: 2026-09-02

No new Prisma models in v1. Read models computed from existing tables + ERP stock fetch.

## Existing entities (source)

### Order + OrderLineItem
- **Movement**: `quantity`, `productItem.sku`, completion via `deliveryCompleteAt` / `invoiceCompleteAt`
- **Filter**: `osfCompletedSalesOrderWhere(companyId, start, endExclusive)`
- **Outlet attribution**: `companyLocationId` → OSF column / shop
- **District attribution**: `shippingAddress` (Json) → `resolveAddressDistrict()`

### ProductItem / ProductOsfProfile
- **Identity**: `sku`, title, barcode
- **Priority**: ERP-synced priority field (same as OSF assist grid)

### ProductOsfRop
- **Fields**: `companyId`, `sku`, `columnKey`, `ropQty`
- **Usage**: Current saved ROP for suggestion compare; writes via existing OSF APIs

### OsfColumnConfig
- **Fields**: `key`, `label`, `includeInStock`, `includeInRop`, `companyLocationId`, `directWarehouses`
- **Usage**: Outlet columns for stock + per-outlet movement

### CompanyLocation
- **Fields**: `id`, `name`, `locationReference`, address fields
- **Usage**: Physical store list; district inference for expansion coverage

### EmployeeProfile
- **Fields**: `locationId`, `userId`
- **Usage**: Store-user scoping for outlet-scoped dashboard zones

## Derived read models (API, not persisted)

### ItemTrendKpiSummary
| Field | Type | Notes |
|-------|------|-------|
| fastMoverCount | number | SKUs passing fast-mover rules |
| newItemSignalCount | number | Newly Added accelerate + stall |
| slowdownCount | number | Top Priority slowdowns |
| patternHitCount | number | Recurring weekday (when range ≥28d) |
| topDistrict | string \| null | Name + units |
| totalUnitsTracked | number | Sum in range |

### ItemMovementRow
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| title | string? | |
| priority | string | ERP priority label |
| unitsCurrent | number | |
| unitsPrior | number | Comparison window |
| speedPerDay | number | unitsCurrent / days |
| speedChangePct | number \| null | vs prior |
| signal | enum | fast_mover \| accelerating \| stalling \| slowdown \| none |
| signalSource | enum | rule_based \| intelligent_analysis |
| sparkline | number[] | Optional daily buckets |

### DistrictDemandRow
| Field | Type | Notes |
|-------|------|-------|
| district | string | Includes `Unmapped` |
| units | number | |
| amount | string | Decimal string |
| sharePct | number | Of company total units |
| changePct | number \| null | vs prior period |
| growthStatus | enum | growing \| stable \| declining \| emerging |

### ItemDistrictStrength
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| district | string | |
| units | number | |
| rankInDistrict | number | |
| intensity | number | units / district avg for SKU cohort |

### ExpansionOpportunityRow
| Field | Type | Notes |
|-------|------|-------|
| district | string | |
| score | number | 0–100 normalized |
| deliveryUnits | number | |
| shopUnits | number | Attributed shop sales in district |
| growthPct | number \| null | |
| topSkus | string[] | Up to 5 |
| nearestStore | string \| null | Location name |
| reasons | string[] | Plain language |

### OutletBalanceRow
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| columnKey | string | OSF outlet column |
| outletName | string | |
| stockQty | number | Live ERP |
| unitsInRange | number | |
| speedPerDay | number | |
| stockPressure | enum | high_slow \| low_fast \| balanced |

### TransferCandidate
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| sourceColumnKey | string | |
| sourceOutletName | string | |
| sourceStock | number | |
| sourceSpeed | number | |
| destColumnKey | string | |
| destOutletName | string | |
| destStock | number | |
| destSpeed | number | |
| message | string | e.g. "Move stock from A to B" |

### RopSuggestionRow
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| priority | string | |
| currentRop | number \| null | Per primary ROP column |
| windowSales | number | Sum of units in selected window |
| peakMonthSales | number | Highest calendar-month units in window |
| peakMonth | string \| null | YYYY-MM of peak month |
| suggestedRop | number | peakMonthSales × 2 |
| overlay | enum | increase \| hold \| decrease |
| windowLabel | string | e.g. "Last 3 months" |
| columnKey | string | ROP target column |

### PatternAnnotation
| Field | Type | Notes |
|-------|------|-------|
| sku | string | |
| dominantDays | number[] | 0=Sun … 6=Sat |
| recurring | boolean | |
| signalSource | enum | |

### ItemTrendPageData (aggregate response)
| Section | Type |
|---------|------|
| kpis | ItemTrendKpiSummary |
| movement | ItemMovementRow[] |
| newItems | ItemMovementRow[] |
| slowdowns | ItemMovementRow[] |
| districts? | DistrictDemandRow[] |
| expansion? | ExpansionOpportunityRow[] |
| outlets? | OutletBalanceRow[] |
| transfers? | TransferCandidate[] |
| rop? | RopSuggestionRow[] |
| patterns? | PatternAnnotation[] |
| meta | { from, to, compareFrom, compareTo, scopedLocationId? } |

## Validation rules

- Date range: `from` ≤ `to`; max range 366 days for movement; pattern zone requires ≥28 days
- Minimum volume: fast mover ≥3 units in current period
- Slowdown: ≥25% unit drop, prior period ≥5 units, Top Priority default filter
- ROP suggested: `Math.round(peakMonthSales * 2)`; non-negative
- Transfer: source stock ≥5, speed gap between outlets meaningful (dest ≥2× source speed or dest top quartile + source bottom quartile)
- District: must be non-empty string; `Unmapped` excluded from expansion rank

## State transitions

- **ROP apply**: Dashboard suggestion → user edit → `PATCH` OSF profile → `ProductOsfRop` updated (existing flow)
- **Focus list**: Client-only add/remove until export (P3)
- **Intelligent engine**: `disabled` → `degraded` (rules only + banner) → `active`

## RBAC (not Prisma)

| Permission | Capability |
|------------|------------|
| `purchasing.item_trends.read` | View dashboard + read APIs |
| `purchasing.osf.manage` | Apply ROP from dashboard |
| Admin / super_admin | Full bypass |
