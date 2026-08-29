# Quickstart: 046-insight-merchant-monitoring

Validate merchant monitoring on Customer Insight Admin tab (Cosmo non-prod).

## Prerequisites

- Admin user with `hasInsightAdminView` (`canExportFilteredCsv` true on Insight page)
- Company with:
  - ≥2 merchants with allocated contacts
  - Mix of `loyaltyAssignedTier` (gold/platinum/null)
  - Contacts with/without email and birth month/day
  - Contacts with varied `lastPurchaseAt` (today, 45 days ago, 200 days ago, null)
  - At least one purchase in current MTD for purchased-in-period check

## Setup

```bash
npm run env:use cosmo-dev
npm run dev
```

No migration for this feature.

## Unit tests

```bash
npm test -- lib/customer-insight/merchant-monitoring
```

Covers recency bucket boundaries, period validation, rollup invariants.

## Scenarios

### 1. Portfolio snapshot loads

1. Open `/dashboard/customer-insight` → **Admin** tab.
2. **Merchant monitoring** section shows portfolio table.
3. Each merchant row: Allocated, Gold, Plat, Standard, DOB %, Email %.
4. Gold + Plat + Standard = Allocated for a sample row.
5. Compare one merchant allocated total to existing **Merchant allocations** CSV — counts match.

**Pass**: Portfolio visible; tier sum invariant holds.

### 2. Period filter (Today vs MTD)

1. Select **Today** → note `purchasedInPeriodCount` and recency **Today** bucket.
2. Select **MTD** → purchased-in-period counts change; **Allocated** and DOB/Email % unchanged.
3. Custom range with `from > to` → validation error, no stale data.

**Pass**: SC-003 — purchase metrics react; portfolio snapshot stable.

### 3. Recency buckets

1. Pick merchant with known contacts:
   - Last purchase today → **Today** bucket
   - Last purchase 45 days ago → **31–90 days**
   - No `lastPurchaseAt` → **Never purchased**
2. For each bucket, Gold + Plat + Standard = bucket total.

**Pass**: SC-002 spot-check.

### 4. Merchant filter

1. Select one merchant in dropdown.
2. Only that merchant row + recency section shown.
3. Clear filter → all merchants return.

**Pass**: FR-009.

### 5. Drill-down to filter list

1. Click cell **Gold** in **31–90 days** for merchant A.
2. Insight switches to **Filter** tab with `assignedMerchant`, `loyalty=gold`, last-purchase range applied.
3. Listed contacts ⊆ expected set; spot-check 3 ids.

**Pass**: SC-006 manual path.

### 6. Export PDF

1. Load MTD monitoring view.
2. Click **Export PDF** → file downloads.
3. PDF header shows MTD / date range; table numbers match on-screen values.

**Pass**: SC-004 subjective (<30s on dev data).

### 7. CSV allocation summary retained

1. **Merchant allocations** card still has **Export CSV**.
2. CSV downloads; counts still correct.

**Pass**: FR-011.

### 8. Missing DOB / email on call queue open

1. Assign contact missing email and birth day to merchant call queue.
2. Merchant opens contact from **My call queue**.
3. Banner lists missing **Email** and **Birth date**.
4. Fill fields in profile edit → save → banner clears.
5. Refresh monitoring → email/DOB % increased for that merchant.

**Pass**: SC-005.

### 9. Permission gate

1. User with `contacts.insight.read` but **without** admin view.
2. Admin tab / merchant monitoring not visible (or 403 on API).

**Pass**: FR-015.

## API smoke (optional)

```bash
# Replace cookie / use browser devtools copy as fetch
curl -s "http://localhost:3000/api/admin/customer-insight/merchant-monitoring?fromYmd=2026-08-01&toYmd=2026-08-29" \
  -H "Cookie: ..." | jq '.companyPortfolio.allocatedTotal'
```

## Regression

- Phone search insight unchanged for merchants.
- Call queue assign flow still works.
- Allocation summary CSV unchanged.
