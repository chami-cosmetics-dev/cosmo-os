# Data Model: Abandoned Cart Deduplication & Abandonment Reason

**Feature**: `054-abandoned-cart-dedupe`  
**Date**: 2026-09-14

## Entity: ShopifyAbandonedCheckout (extended)

Existing abandoned checkout row from Shopify sync/webhook. New fields below; existing follow-up fields unchanged in meaning.

### New fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `abandonmentReason` | String? | No | `koko_payment_issue` \| `city_not_available` \| `no_need_of_products` |
| `phoneNormalized` | String? | No | Canonical phone for linking; null if unusable |
| `cartFingerprint` | String? | No | Sorted multiset hash/key of lines |
| `exactDuplicateGroupId` | String? | No | Shared cuid across exact duplicates |
| `supersededByCheckoutId` | String? | No | Id of newer proper-superset checkout |
| `supersededAt` | DateTime? | No | When soft-hide applied |

### Indexes (recommended)

- `@@index([companyId, phoneNormalized, abandonedAt])` — same-day + cohort scans  
- `@@index([companyId, phoneNormalized, cartFingerprint])` — exact-dupe lookup  
- `@@index([companyId, exactDuplicateGroupId])` — follow-up propagate  
- `@@index([companyId, supersededByCheckoutId])` — default list filter  

Optional self-relation: `supersededByCheckout` → `ShopifyAbandonedCheckout` for clarity (onDelete SetNull).

### Existing fields used

- `customerPhone`, `lineItemsJson`, `lineItemsSummary`, `abandonedAt`
- `followUpStatus`, `customerResponse`, `remark`, `lastFollowUpById`, `lastFollowUpAt`
- `companyId`

## Derived (not persisted)

### Exact-duplicate group

- Members: same `companyId` + `phoneNormalized` + `cartFingerprint`, `supersededByCheckoutId` null (or include superseded only for historical sync — v1 only link non-superseded).
- Shared write set: `followUpStatus`, `customerResponse`, `remark`, `abandonmentReason`, `lastFollowUpById`, `lastFollowUpAt`.

### Cart line multiset

- Parsed from `lineItemsJson`.
- Line key: `variantId || productId || normalizedTitle` + quantity.
- Exact equal: identical multisets.
- Proper subset: every line in A appears in B with qty_A ≤ qty_B, and B has at least one extra product or higher qty on some line.

### Same-day sibling set

- Key: `phoneNormalized` + calendar day(`abandonedAt`, `Asia/Colombo`).
- Members: non-superseded rows.
- Badge on max(`abandonedAt`): count of other members whose `exactDuplicateGroupId` (or fingerprint) differs from the badge row’s group.

## Validation rules

- `abandonmentReason`: null or one of the three enum values (Zod).
- Closing follow-up still requires `customerResponse` when status is `closed` (unchanged); abandonment reason never required.
- Rows without `phoneNormalized` never enter groups / supersession / badges.
- Soft-hidden rows excluded from default list + default CSV.

## State transitions

```text
[ingested]
    → compute phoneNormalized + cartFingerprint
    → if exact match peers → assign exactDuplicateGroupId
    → if older proper subset of newer → superseded (soft-hide)
    → else remain visible

[visible] --follow-up save--> [visible]
    + if exactDuplicateGroupId set → propagate fields to group peers

[visible] --newer proper superset arrives--> [superseded]
[superseded] --no default list-- (data retained)
```

## Constants

```text
ABANDONMENT_REASONS =
  koko_payment_issue
  city_not_available
  no_need_of_products
```

Labels (UI/CSV):
- Koko payment issue
- City not available
- No need of the product(s)
