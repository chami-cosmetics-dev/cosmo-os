# Data Model: Customer Insight Allocation & Loyalty

**Feature**: `033-insight-allocation-loyalty`  
**Date**: 2026-08-07

No new Prisma models required for v1. Extends Feature 032 read models with ownership, visibility, progress, filters, and contacted events.

## Existing entities (write + read)

### ContactMaster

| Field | Use |
|-------|-----|
| `id` | Insight key |
| `companyId` | Tenant scope |
| `name`, `email`, `phoneNumber` | Profile card; PATCH by owner |
| `birthYear`, `birthMonth`, `birthDay` | DOB display + birthday-month filter |
| `assignedMerchant` | Allocation label (`knownName \|\| name \|\| email`); ownership + filters |
| `recentMerchant` | Display / auto-allocate source hint (do not overwrite `assignedMerchant` when set) |
| phones / emails | Lookup + secondary identifiers on profile edit |

### Order / OrderLineItem / AdaptPurchaseHistory

Unchanged from 032 for totals and invoices. Brand for filters:

| Source | Brand resolution |
|--------|------------------|
| Cosmo `OrderLineItem` → `ProductItem.vendor.name` | Primary brand |
| Adapt `lineItems` JSON | Use brand/vendor field if present; else unknown (exclude from brand match) |

### ContactAllocationUpdate

| Field | Use |
|-------|-----|
| `contactId`, `companyId` | Scope |
| `category` | `"Contacted"` for Mark Contacted (dashboard series) |
| `createdAt`, `createdBy` | Last contacted + audit trail |

### AuditLog

Reuse action `contact_follow_up_contacted` (same as Contact Updates follow-up) for consistency with queue/audit consumers.

## Derived models

### LoyaltyTier (updated thresholds)

| Field | Rules |
|-------|--------|
| `key` | `standard` \| `gold` \| `platinum` |
| `label` | Standard / Gold / Platinum |
| `code` | Gold → `loyalcs`; Platinum → `loyalcs2` |
| `lifetimeTotal` | Sum of loyalty-eligible invoices (032 rules) |
| `thresholds` | `{ goldMin: 75000, platinumMin: 200000 }` |
| Classification | platinum if `total >= platinumMin`; else gold if `total >= goldMin`; else standard |

### Push bands (filters)

| Filter | Lifetime total |
|--------|----------------|
| Push to Gold | `>= 75000 && < 200000` |
| Push to Platinum | `>= 200000` |

### OwnershipContext

| Field | Type | Rules |
|-------|------|--------|
| `isOwner` | boolean | Admin/super_admin **or** `assignedMerchant` matches viewer display labels |
| `visibility` | `owner` \| `limited` | Owner → full DTO; else limited |
| `assignedMerchantLabel` | string \| null | Always safe to show on limited view |

Viewer labels: non-empty trimmed `{knownName, name, email}` compared case-insensitively to `assignedMerchant`.

### PurchasingProgressBar

| Field | Description |
|-------|-------------|
| `currentTotal` | Lifetime total (currency amount, primary label) |
| `goldMin` | 75000 |
| `platinumMin` | 200000 |
| `amountToNext` | Distance to next milestone (0 if already platinum) |
| `tier` | Current LoyaltyTier key |

Owner-only in API response.

### CustomerInsightSummary (visibility-aware)

**Always (any merchant with insight.read who can search):**

| Field | Notes |
|-------|--------|
| `visibility` | `owner` \| `limited` |
| `loyalty.lifetimeTotal` | Yes |
| `loyalty` tier summary | Yes (limited may still show tier label from total) |
| `assignedMerchant` | Label or null |
| `invoices` | Headers only when limited (`lineItems` omitted) |

**Owner / admin only:**

| Field | Notes |
|-------|--------|
| `contact` profile card | name, email, phones, DOB |
| `progressBar` | PurchasingProgressBar |
| `topItems`, `series` | Charts/lists |
| `lastContactedAt` | Latest contacted event |
| `canEditProfile`, `canMarkContacted` | true for owner/admin |
| Invoice `lineItems` | Item-wise sales |

### AllocatedFilterResult

| Field | Description |
|-------|-------------|
| `items` | `{ contactId, name, phone, lifetimeTotal, loyalty, assignedMerchant }[]` |
| `pagination` | page, pageSize, total |
| Sort | `lifetimeTotal` descending |

Scope: `assignedMerchant` in viewer labels (or all company contacts for admin).

### ContactedEvent

Not a new table — composite of latest `ContactAllocationUpdate` (category Contacted) and/or audit follow-up. Each Mark Contacted creates a new event (remakeable).

## Validation rules

- Profile PATCH: Zod trimmed strings + length limits; optional DOB components consistent (month 1–12, day valid).
- Filter query: pageSize ≤ 50; brand trimmed; pushGold/pushPlatinum mutually exclusive with each other if both sent (prefer reject or define AND — **prefer OR exclusive flags: only one push mode**).
- Contacted POST: body empty or optional note ≤ LIMITS.
- Allocation: reuse existing allocation Zod (`allocatedTo` label).

## State transitions

```text
assignedMerchant empty + purchase by merchant M
  → auto-allocate: assignedMerchant = displayName(M)
assignedMerchant set
  → auto-allocate: no-op
Manual / bulk allocation
  → overwrite assignedMerchant (permissioned)
Mark contacted (anytime, owner)
  → new Contacted event; lastContactedAt updates; dashboard count +1 for that day/merchant
```
