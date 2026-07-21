# Data Model: Abandoned Orders Follow-up

**Feature**: `015-abandoned-orders-followup`  
**Date**: 2026-07-21

## New entities

### ShopifyAbandonedCheckout

One row per Shopify abandoned checkout per company + store handle.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | Cosmo primary key |
| companyId | String | FK → Company |
| shopifyCheckoutGid | String | Full GID e.g. `gid://shopify/AbandonedCheckout/123` |
| shopifyCheckoutId | String | Numeric id extracted from GID for display |
| shopifyAdminStoreHandle | String | Store handle used for sync |
| companyLocationId | String? | Optional FK — first matching location for handle |
| customerName | String? | Concat first + last from Shopify |
| customerEmail | String? | |
| customerPhone | String? | From customer / billing / shipping phone |
| lineItemsSummary | String | Human-readable e.g. `"Serum x2, Moisturizer x1"` (max `LIMITS` text) |
| lineItemsJson | Json? | Optional raw line items for future use |
| totalPrice | Decimal | Checkout total |
| currency | String | e.g. `LKR` |
| abandonedAt | DateTime | Shopify `createdAt` |
| shopifyUpdatedAt | DateTime? | Shopify `updatedAt` |
| shopifyCompletedAt | DateTime? | Non-null when recovered in Shopify |
| shopifyRecoveredAt | DateTime? | When Cosmo detected recovery on sync |
| abandonedCheckoutUrl | String? | Shopify recovery URL (optional display) |
| followUpStatus | String @default("pending") | `pending` \| `follow_up` \| `closed` |
| customerResponse | String? | Enum below; null until set |
| remark | String? | Optional; max `LIMITS.remark` or `LIMITS.notes` |
| lastFollowUpById | String? | FK → User |
| lastFollowUpAt | DateTime? | |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

**Unique**: `@@unique([companyId, shopifyCheckoutGid])`

**Indexes**:
- `@@index([companyId, followUpStatus, abandonedAt(sort: Desc)])`
- `@@index([companyId, abandonedAt(sort: Desc)])`
- `@@index([companyId, customerResponse])`

### CompanyAbandonedCheckoutSync

Per-company sync watermark.

| Field | Type | Notes |
|-------|------|-------|
| companyId | String @id | FK → Company |
| lastSyncedAt | DateTime? | |
| lastSyncError | String? | Truncated error message |
| updatedAt | DateTime @updatedAt | |

## Enums (application-level strings)

### followUpStatus

| Value | Label | Default filter |
|-------|-------|----------------|
| `pending` | Pending | Included |
| `follow_up` | Follow up | Included |
| `closed` | Closed | Excluded unless filter expanded |

### customerResponse

| Value | Label |
|-------|-------|
| `no_more_interest` | No more interest |
| `purchased_elsewhere` | Purchased elsewhere |
| `changed_my_mind` | Changed my mind |
| `recovered_sale` | Recovered sale |
| `no_response` | No response |

Required when `followUpStatus = closed` (unless auto-set recovered_sale from Shopify).

## State transitions

```text
[pending]     ──(user: follow up)──► follow_up
[follow_up]   ──(user: close + response)──► closed
[closed]      ──(user: reopen)──► follow_up
[pending/follow_up] ──(Shopify completedAt set)──► closed + recovered_sale (if no manual close yet)
```

## Validation rules

- PATCH follow-up: `followUpStatus` enum; `customerResponse` enum optional unless closing.
- Closing without `customerResponse` → 400.
- `remark` trimmed, max length from `LIMITS`.
- Row must belong to actor `companyId`.
- Manage permission required for PATCH; read for GET/export.
- Reopen: `closed → follow_up` allowed; response not cleared required but may remain visible until next close.

## Relationships

```text
Company 1──* ShopifyAbandonedCheckout
Company 1──0..1 CompanyAbandonedCheckoutSync
User 1──* ShopifyAbandonedCheckout (lastFollowUpBy)
CompanyLocation 0..1──* ShopifyAbandonedCheckout (optional link by store handle)
```

## Sync merge rules

1. Upsert by `(companyId, shopifyCheckoutGid)`.
2. On insert: `followUpStatus = pending`, follow-up fields null.
3. On update from Shopify: refresh customer/cart/total/timestamps; never clear `remark` / `followUpStatus` / `customerResponse` unless recovery rule applies.
4. Skip import if `abandonedAt < now - 7 days`.
5. Recovery: if `shopifyCompletedAt` newly set and row not manually closed → auto close + `recovered_sale`.

## Existing entities (read-only reference)

- **CompanyLocation**: `shopifyAdminStoreHandle`, `shopifyShopName` — drives which stores to sync.
- **User**: actor for `lastFollowUpById`.
- **Order**: not linked in v1 (abandoned checkout ≠ completed order); future optional link via customer email/phone match out of scope.
