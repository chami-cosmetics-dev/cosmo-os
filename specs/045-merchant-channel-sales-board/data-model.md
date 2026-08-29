# Data Model: Merchant Channel Sales Board

**Feature**: `045-merchant-channel-sales-board`  
**Date**: 2026-08-29

Extends existing Prisma models and derived read models. Integrates with GM view (`merchant-dashboard-gm-overview.ts`) and spec 037 targets.

## Schema changes (write)

### EmployeeProfile

| Field | Type | Rules |
|-------|------|--------|
| `isShopMerchant` | `Boolean` | Default `false`. When `true`, `locationId` (CompanyLocation) MUST be non-null on save. |

**Unchanged**: `locationId` → `CompanyLocation` (outlet for book notes spec 029). Do **not** use `outletId` (review `Outlet` model).

### MerchantMonthlyTarget

| Field | Type | Rules |
|-------|------|--------|
| `targetAmount` | `Decimal(14,2)` | **Kept required.** Combined target; auto-synced to `shop + online` when channel targets saved. |
| `shopTargetAmount` | `Decimal(14,2)?` | Optional monthly shop channel target (LKR). |
| `onlineTargetAmount` | `Decimal(14,2)?` | Optional monthly online channel target (LKR). |

Unique key unchanged: `(companyId, userId, yearMonth)`.

### MerchantMonthlyTargetHistory

| Field | Type | Rules |
|-------|------|--------|
| `shopTargetAmount` | `Decimal(14,2)?` | Snapshot on set/update. |
| `onlineTargetAmount` | `Decimal(14,2)?` | Snapshot on set/update. |

`targetAmount`, `action`, `assignedByUserId`, `note` unchanged.

## Existing entities (read)

### Order (via `fetchMerchantCohortSales`)

Same as spec 037. Channel derived from `companyLocationId` + Cosmetics.lk location set.

### CompanyLocation

| Use |
|-----|
| Resolve Cosmetics.lk id(s) via `isCosmeticsLkLocationName(name \| shortName)` |
| Staff outlet label via `EmployeeProfile.location` |

### User + merchant roles

Cohort = users with merchant role names (`listMerchantRoleUsers`). DM-General synthetic row may appear in cohort; channel split applies to its attributed orders too.

## Derived read models (not stored)

### ChannelSalesBucket

| Field | Type | Rules |
|-------|------|--------|
| `orderCount` | number | Attributed orders in bucket |
| `amount` | number | Sum `totalPrice` |

### MerchantChannelOverviewRow

Extends `MerchantDashboardOverviewRow` (GM scorecard):

| Field | Type | Rules |
|-------|------|--------|
| `isShopMerchant` | boolean | From `EmployeeProfile.isShopMerchant` |
| `outletName` | string \| null | `CompanyLocation.name` when `locationId` set |
| `shop` | ChannelSalesBucket | Non–Cosmetics.lk locations |
| `online` | ChannelSalesBucket | Cosmetics.lk location(s) |
| `shopTargetAmount` | number \| null | Monthly target |
| `onlineTargetAmount` | number \| null | Monthly target |
| `shopPercent` | number \| null | `shop.amount / shopTarget` when target > 0 |
| `onlinePercent` | number \| null | `online.amount / onlineTarget` when target > 0 |
| `effectiveTotalTarget` | number \| null | Channel sum if any channel target set; else `targetAmount` |
| *(existing)* | | `mtdSales`, `todaySales`, calls, health, pace, etc. |

**Invariant**: `shop.amount + online.amount === total attributed sales for period` (equals extended `mtdSales` or period total column).

### GmChannelFooter

| Field | Type | Rules |
|-------|------|--------|
| `periodLabel` | string | e.g. "MTD", "Today", "2026-08-01 – 2026-08-15" |
| `fromYmd` | string | Active period start |
| `toYmd` | string | Active period end |
| `shop` | ChannelSalesBucket | Sum of merchant rows + unassigned |
| `online` | ChannelSalesBucket | Sum of merchant rows + unassigned |
| `grandTotal` | ChannelSalesBucket | shop + online |

**Invariant**: `grandTotal.amount === gmPulse.companyMtdSales` (or period-equivalent pulse field) for same `fromYmd`/`toYmd`.

### GmPulse extension (optional fields)

| Field | Type | Rules |
|-------|------|--------|
| `shopAmount` | number | Company shop channel total for pulse period |
| `onlineAmount` | number | Company online channel total |
| `shopOrderCount` | number | |
| `onlineOrderCount` | number | |

## Channel classification rules

```
FOR each attributed order in cohort window:
  merchantId := resolveCohortMerchantId(...)  // existing
  locationId := order.companyLocationId
  IF location matches Cosmetics.lk THEN bucket := online
  ELSE bucket := shop
```

Unassigned merchant bucket (`merchantId` null → skip or DM-General per existing rules): if orders exist with no merchant attribution, include **Unassigned** scorecard row so footer reconciles.

## Target display rules (MTD vs custom range)

| UI period | Actuals window | Target month | Label |
|-----------|----------------|--------------|-------|
| Today | `todayYmd` | `yearMonth` containing today | "Monthly targets · today actuals" |
| MTD | month start → today | current `yearMonth` | Standard MTD |
| Custom | `fromDate`–`toDate` | `yearMonth` of `toDate` (or span note if cross-month) | Helper text required |

## Validation rules

### Staff save
- `isShopMerchant === true` → `locationId` required.
- `isShopMerchant === false` → `locationId` optional (unchanged).

### Target upsert
- Each target field: positive finite number ≤ 1_000_000_000 or omitted/null.
- At least one of `targetAmount`, `shopTargetAmount`, `onlineTargetAmount` must be provided on upsert OR keep existing `targetAmount` requirement with optional channel fields as additive inputs on same form.

### Page data
- Channel section only when `viewerIsAdmin === true` (same as `overview`).

## State transitions

### MerchantMonthlyTarget upsert
1. Load existing row for `(companyId, userId, yearMonth)`.
2. Merge `targetAmount`, `shopTargetAmount`, `onlineTargetAmount` from request.
3. If either channel target provided: set `targetAmount = (shop ?? 0) + (online ?? 0)` unless admin explicitly sent `targetAmount` alone (legacy path: channel null, targetAmount only).
4. Write target + append history with all three amounts.

## Permissions

| Action | Permission |
|--------|------------|
| View GM channel section | `viewerIsAdmin` / `hasMerchantDashboardAdminView` (same as GM view) |
| Edit targets | `dashboard.merchant_targets.manage` |
| Edit staff shop merchant | Existing staff edit permission |

## Out of scope entities

- `Outlet` / `OutletUser` (reviews)
- New `SalesChannel` enum on `Order`
- Separate channel target table
