# Quickstart: Merchant Customer Insight

**Feature**: `032-merchant-customer-insight`  
**Date**: 2026-08-05

Validation guide after implementation. See [contracts/customer-insight.md](./contracts/customer-insight.md) and [data-model.md](./data-model.md).

## Prerequisites

- Cosmo OS app running against a company DB with `ContactMaster` rows, phones, and some `Order` / `AdaptPurchaseHistory` data
- A user whose role includes **`contacts.insight.read`** and does **not** need Contact Master permissions
- A second user without `contacts.insight.read` (deny check)
- Optional: admin with Contact Master — confirm their list/export still works and is separate

## Setup

```bash
npm install
npm run db:generate
# no migration expected for v1
npm run dev
```

Ensure RBAC sync has run so `contacts.insight.read` exists (app boot / existing `ensureDefaultRbacSetupIfNeeded`). Assign the permission to a merchant test role in Settings → Roles if not defaulted.

## Manual checks

### 1. Permission gate

1. Sign in as user **without** `contacts.insight.read`
2. Open `/dashboard/customer-insight` → Permission denied (or redirect)
3. `GET /api/admin/customer-insight/search?phone=0771234567` → 403
4. Confirm sidebar has no Customer Insight link

### 2. Phone search (US1)

1. Sign in as merchant with `contacts.insight.read`
2. Open `/dashboard/customer-insight`
3. Search a known phone → matches (≤10) with name/phone
4. Search unknown phone → empty / not-found, no other customers
5. Confirm UI has **no** full contact table, Import, or Export

### 3. Insight + loyalty (US2, US4)

1. Select a match (or single auto-open)
2. Verify name, phone, lifetime total, group badge
3. Spot-check tiers:
   - total &lt; 100000 → Standard
   - 100000–250000 → Gold (`loyalcs`)
   - &gt; 250000 → Platinum (`loyalcs2`)
4. Invoice list shows Cosmo + Adapt rows with date, reference, status, amount
5. Cancelled Cosmo order (if any) listed but not inflating lifetime total

### 4. Items, frequency, charts (US3)

1. Customer with ≥3 loyalty-eligible invoices → KPIs + spend/order chart + top items
2. Customer with 0–2 → factual empty/KPI state, no misleading empty chart

### 5. Isolation (US5)

1. As merchant, attempt Contact Master `/dashboard/contacts` → denied if they lack master perms
2. Confirm insight APIs never return a browsable full list (`search` capped; no page-all)
3. No export/import controls on insight page; no insight export route

### 6. Automated (after units land)

```bash
npm test -- customer-insight
# or targeted: loyalty-tier / lifetime-total tests
```

## Expected outcomes

| Check | Pass criteria |
|-------|----------------|
| SC-001 | Known phone → identity + group in normal interactive use |
| SC-003 | Merchant cannot list/export/import via this feature |
| SC-004 | Boundary totals 100000 and 250000 classify as Gold |
| SC-006 | Charts only when enough history; else clear facts |

### Implementation note (2026-08-05)

- Unit tests: `npm test -- lib/customer-insight` (loyalty tiers, lifetime total, search cap)
- Assign `contacts.insight.read` to merchant roles in Settings → Roles (manager defaults include it after RBAC sync)
- No Prisma migration for this feature (v1 computes on read)

## Out of scope for this quickstart

- ERP customer_group write-back
- Native mobile app
- Caching lifetime totals on ContactMaster
