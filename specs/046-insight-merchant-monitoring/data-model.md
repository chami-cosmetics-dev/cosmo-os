# Data Model: Insight Merchant Monitoring

**Feature**: `046-insight-merchant-monitoring`  
**Date**: 2026-08-29

No Prisma schema changes. All metrics are derived from existing `ContactMaster`, purchase history, and merchant alias resolution.

## Existing entities (read)

### ContactMaster

| Field | Monitoring use |
|-------|----------------|
| `assignedMerchant` | Group key; rolled up via merchant alias map |
| `loyaltyAssignedTier` | `effectiveLoyaltyTierKey` → Gold / Platinum / Standard |
| `email` | Email completion (non-empty trim) |
| `birthMonth`, `birthDay` | DOB completion (both valid 1–12 / 1–31) |
| `lastPurchaseAt` | Recency bucket classification |
| `companyId` | Tenant scope |

### AdaptPurchaseHistory

| Field | Monitoring use |
|-------|----------------|
| `contactId` | Purchased-in-period distinct contact set |
| `invoiceDate` | Inclusive period window |
| `ttlAmount` | Not used in v1 rollups |

### Order (Cosmo)

Same eligibility as `customerLifetimeTotalOrderWhere` in `lifetime-total.ts` — used only for purchased-in-period detection when Adapt has no row in window.

### Merchant roster / aliases

From `listInsightMerchantRosterOptions` + `resolveAssignedMerchantFilterLabels` (`allocation-summary.ts`).

## Derived read models (not stored)

### MerchantMonitoringPeriod

| Field | Type | Rules |
|-------|------|--------|
| `preset` | `"today"` \| `"mtd"` \| `"custom"` | Client hint for label |
| `fromYmd` | string | Inclusive start (YYYY-MM-DD) |
| `toYmd` | string | Inclusive end; clamped ≤ today |
| `periodEndYmd` | string | Same as `toYmd`; anchor for recency |
| `periodLabel` | string | Display: `Today`, `MTD`, or `Aug 1 – Aug 29, 2026` |

### TierCountTriple

| Field | Type |
|-------|------|
| `gold` | number |
| `platinum` | number |
| `standard` | number |
| `total` | number |

Invariant: `gold + platinum + standard === total`.

### MerchantMonitoringPortfolioRow

| Field | Type | Rules |
|-------|------|--------|
| `merchantValue` | string | Filter key (MER code or legacy label) |
| `merchantLabel` | string | Display name |
| `allocatedTotal` | number | Count of contacts assigned to merchant |
| `tiers` | TierCountTriple | Registered loyalty tier |
| `dobCompleteCount` | number | Has month + day |
| `dobCompletePercent` | number | Rounded 0–100 |
| `emailCompleteCount` | number | Has email |
| `emailCompletePercent` | number | Rounded 0–100 |
| `purchasedInPeriodCount` | number | ≥1 purchase in `[fromYmd, toYmd]` |

### RecencyBucketKey

`today` | `d1_30` | `d31_90` | `d91_180` | `d181_365` | `d365_plus` | `never`

### RecencyBucketCell

| Field | Type |
|-------|------|
| `bucket` | RecencyBucketKey |
| `label` | string |
| `tiers` | TierCountTriple |

### MerchantMonitoringRecencyRow

| Field | Type |
|-------|------|
| `merchantValue` | string |
| `merchantLabel` | string |
| `buckets` | RecencyBucketCell[] |

### MerchantMonitoringReport

| Field | Type |
|-------|------|
| `period` | MerchantMonitoringPeriod |
| `generatedAt` | string (ISO) |
| `portfolioRows` | MerchantMonitoringPortfolioRow[] |
| `companyPortfolio` | MerchantMonitoringPortfolioRow |
| `recencyRows` | MerchantMonitoringRecencyRow[] |
| `companyRecency` | RecencyBucketCell[] |
| `unallocatedCount` | number |

**Invariants**

1. Sum of `portfolioRows[].allocatedTotal` + `unallocatedCount` = total ContactMaster rows for company.
2. Each contact with `assignedMerchant` set appears in exactly one merchant row and one recency bucket for that merchant.
3. `companyPortfolio` / `companyRecency` = aggregate of visible rows (respects `assignedMerchant` filter).
4. Portfolio tier totals do not change when only `fromYmd` changes (recency anchor fixed on `toYmd`).

## Filter extensions (drill-down)

Add to `customerInsightFilterFieldsSchema`:

| Field | Type | Rules |
|-------|------|--------|
| `lastPurchaseFrom` | YYYY-MM-DD optional | Inclusive; pair with `lastPurchaseTo` |
| `lastPurchaseTo` | YYYY-MM-DD optional | Inclusive |
| `loyalty` | `gold` \| `platinum` \| `standard` optional | Matches `effectiveLoyaltyTierKey` |
| `hasLastPurchase` | `"true"` \| `"false"` optional | `false` = never purchased |

Mapping from `RecencyBucketKey` + `periodEndYmd` → filter params documented in contract.

## UI state (client)

| State | Purpose |
|-------|---------|
| `monitoringPeriodPreset` | today / mtd / custom |
| `monitoringFrom` / `monitoringTo` | Custom dates |
| `monitoringMerchant` | Optional merchant filter |
| `monitoringReport` | Last successful `MerchantMonitoringReport` |
| `busyKey` | `merchant-monitoring` / `merchant-monitoring-pdf` |

No new Prisma models or migrations.
