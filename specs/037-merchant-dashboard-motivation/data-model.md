# Data Model: Merchant Dashboard Motivation & Sales Tracking

**Feature**: `037-merchant-dashboard-motivation`  
**Date**: 2026-08-11

v1 introduces **no new Prisma models**. Motivation metrics are **derived read models** over existing entities.

## Existing entities (read)

### User (+ roles)

| Field / relation | Use |
|------------------|-----|
| `id`, `companyId` | Viewed merchant / cohort member |
| `knownName`, `name`, `email` | Display name |
| `couponCodes` | Attribution |
| merchant-level roles via `userRoles` | Cohort membership (`isMerchantRoleName`) |

### Order

| Field | Use |
|-------|-----|
| `companyId`, date fields used by `buildDashboardSalesDateFilter` | Window filter |
| eligibility fields for `isDashboardSalesOrderEligible` | Include/exclude |
| `totalPrice` | Amount |
| `companyLocationId` | Location share |
| `discountCodes`, `rawPayload`, `sourceName` | Coupon attribution |
| `assignedMerchantId` / `assignedMerchant.couponCodes` | Fallback attribution |

### CompanyLocation

| Field | Use |
|-------|-----|
| `id`, `name` | Location labels in pie / share |

### MerchantMonthlyTarget (+ History)

| Field | Use |
|-------|-----|
| `yearMonth`, `targetAmount` | Monthly history target join; existing target card |
| history rows | Existing target assignment audit (unchanged purpose) |

## Derived read models (not stored)

### PeriodSales

| Field | Type | Rules |
|-------|------|--------|
| `total` | number | Attributed sum |
| `orderCount` | number | Attributed order count |

Used for **Today** and **MTD** on the viewed merchant.

### PeerBoardEntry

| Field | Type | Rules |
|-------|------|--------|
| `rank` | number | 1-based in full cohort |
| `merchantId` | string (cuid) | Cohort user |
| `displayName` | string | Merchant display |
| `total` | number | Period attributed sales |
| `orderCount` | number | Period order count |
| `isViewed` | boolean | Highlight self |

### PeerBoard

| Field | Type | Rules |
|-------|------|--------|
| `period` | `"today"` \| `"mtd"` | Label |
| `fromYmd` / `toYmd` | string | Window |
| `viewedRank` | number \| null | null if cohort empty |
| `viewedTotal` | number | |
| `leaderTotal` | number | Max total in cohort |
| `gapToLeader` | number | `max(0, leaderTotal - viewedTotal)` |
| `peerBand` | enum | `leader` \| `chasing` \| `mid` \| `behind` \| `no_sales` \| `solo` |
| `cheerMessage` | string | Non-punitive copy |
| `entries` | PeerBoardEntry[] | Top 10 + self if needed; ≤ 11 |

### LocationPeerRow

| Field | Type |
|-------|------|
| `merchantId` | string |
| `displayName` | string |
| `total` | number |
| `orderCount` | number |
| `sharePct` | number \| null |

### LocationShareRow

| Field | Type | Rules |
|-------|------|--------|
| `locationId` | string \| `"unassigned"` | |
| `locationName` | string | |
| `locationTotal` | number | Cohort sum in location |
| `selfAmount` | number | Viewed merchant |
| `selfOrderCount` | number | |
| `selfSharePct` | number \| null | self / locationTotal |
| `peers` | LocationPeerRow[] | Compact; exclude self |

### LocationShareBundle

| Field | Type |
|-------|------|
| `today` | LocationShareRow[] |
| `mtd` | LocationShareRow[] |

Only locations where `selfAmount > 0` (or document empty state if none).

### DailySalesHistoryRow

| Field | Type | Rules |
|-------|------|--------|
| `ymd` | string | `yyyy-mm-dd` Colombo |
| `total` | number | |
| `orderCount` | number | |

Window: **current month start → today** (Colombo).

### MonthlySalesHistoryRow

| Field | Type | Rules |
|-------|------|--------|
| `yearMonth` | string | `yyyy-mm` |
| `total` | number | |
| `orderCount` | number | |
| `targetAmount` | number \| null | From `MerchantMonthlyTarget` |
| `percent` | number \| null | Existing percent helper |
| `status` | string | Align with existing target status vocabulary |

Window: **last 3 calendar months** including current.

## Relationships (logical)

```text
Viewed merchant (User)
  → PeriodSales (today, mtd)
  → PeerBoard (today, mtd)  — among Merchant cohort
  → LocationShareBundle     — locations with self sales
  → DailySalesHistoryRow[]  — current month
  → MonthlySalesHistoryRow[] — last 3 months
  → MerchantMonthlyTarget   — optional join on monthly history
```

## Validation / identity rules

- `merchantUserId` query (admin): `cuidSchema` when present.
- Non-admin: force viewed merchant = session user.
- Cohort = users with merchant-level role names only.
- Amounts: non-negative numbers; currency display LKR (existing formatter).
- Ranks: deterministic sort for ties.

## State transitions

None persisted. Peer/target cheer bands are computed per response.
