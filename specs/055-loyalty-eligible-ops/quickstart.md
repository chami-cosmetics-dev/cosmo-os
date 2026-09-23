# Quickstart: Loyalty Eligible Ops & Call Queue Enhancements

**Feature**: `055-loyalty-eligible-ops`

## Prerequisites

- Cosmo company with Insight admin user + ≥2 merchant users with allocations
- Contacts with lifetime ≥ Gold and mixed loyalty outreach statuses
- Call-queue assignments on known dates (some contacted, some pending)
- Env: DB target via `npm run env:use <target>`; Maileroo for live email tests
- After schema change: `npm run db:migrate:create` → `npm run db:generate` → `npm run db:deploy:<target>` (all three before merge complete)

## Automated checks

```bash
npx vitest run lib/customer-insight/loyalty-eligible-summary.test.ts lib/customer-insight/call-queue.test.ts
```

Expect: pending/newly/updated math, multi-brand OR, assigned-date + not-contacted queue mode.

## Manual — Merchant count (US2)

1. Open `/dashboard/merchant` as merchant with >25 eligible contacts (or seed).
2. Loyalty eligible card shows **total count** ≥ list length when capped.
3. View-as another merchant → count matches that merchant only.

## Manual — Admin summary + list (US1, US3)

1. As Insight admin, open Customer Insight loyalty eligible summary/list UI.
2. Company pending matches list pagination total.
3. Merchant-wise **pending** vs **MTD updated** distinct; spot-check one merchant against known status changes this month.

## Manual — Assign filters (US5–US7)

1. Assign merchant call queue → pick merchant.
2. Set **assigned from/to** covering a known assign batch + **not contacted** → only never-contacted assignments in range.
3. Clear queue date filters → classic allocate candidates return.
4. Select two brands → union of purchasers; combine with Push to Gold → AND with push band.

## Manual — Sales report export (US8)

1. Load Sales report → detail rows show **Assigned date**.
2. Export Excel → open file; assigned date + sales columns match on-screen sample (≥10 rows).

## Manual — Weekly email (US4)

1. Preview: `GET /api/cron/loyalty-eligible-weekly-email?preview=1` with `CRON_SECRET` (or script dry-run).
2. Confirm To = full call-center recipient list (includes careers@); body merchant table + company totals.
3. Optional live send in non-prod; verify no merchant user addresses on To.

## Contracts

- [loyalty-eligible-summary.md](./contracts/loyalty-eligible-summary.md)
- [call-queue-filters-extend.md](./contracts/call-queue-filters-extend.md)
- [loyalty-eligible-weekly-email.md](./contracts/loyalty-eligible-weekly-email.md)

## Data model

See [data-model.md](./data-model.md) for `loyaltyOutreachUpdatedAt` / `loyaltyEligibleAt` write rules.
