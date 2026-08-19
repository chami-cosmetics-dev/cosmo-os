# Quickstart: Insight Filters, Merchant Dash & Loyalty Contact Flow

**Feature**: `039-insight-loyalty-contact-flow`  
**Date**: 2026-08-12

Manual validation after implement. See [data-model.md](./data-model.md) and [contracts/](./contracts/).

## Prerequisites

- Cosmo env selected (`npm run env:use cosmo-dev` or local)
- Migrations applied: `npm run db:generate` && `npm run db:deploy:<target>` (after migrate create)
- Users:
  - Merchant A (allocated contacts, `dashboard.merchant_view` / merchant role)
  - User M with `contacts.merge` only (plus insight read)
  - User Master with `contacts.master.manage`
  - User without merge / without master
- Sample contacts: birthdays spanning a range; totals above/below 100k and 250k; brand+item purchases; contact history rows

## 1. Insight filters

1. Open Customer Insight as Merchant A (allocated scope).
2. Confirm Push Gold / Push Platinum / loyalty-tier quick filters are gone.
3. Set **min total** only → only customers ≥ min; no silent max.
4. Set **birthday from–to** → only matching month-days (include a year-wrap case if possible).
5. Brand dropdown is A–Z; search narrows brands.
6. Item filter with **no brand** → searchable full item list; pick item → results.
7. Select brand → item list only that brand; search works.
8. Last-contacted date range → matches latest history timestamp.
9. No-purchase free date range → customers with no purchase in window.
10. After a master assignment exists, loyalty registration date filter returns that contact.
11. Combine min total + brand → AND semantics; high totals first.

## 2. Merge permission

1. As user **without** `contacts.merge`: Merge control absent; POST merge → 403.
2. As user M with `contacts.merge`: merge source→target; target survives; audit module `customer-insight` / `contact_merged`.

## 3. Contact history + remark

1. Mark contacted with remark R1 → history shows R1 + time.
2. Mark again with remark R2 → both rows remain; last contacted = second.
3. Contact Updates / insight history shows remark column.

## 4. Loyalty outreach → master assign

1. Contact with total ≥ 100k, unassigned → appears on Merchant A loyalty card (default dash; Daily/Top Lifetime hidden).
2. Merchant: loyalty informed + remark → status contacted.
3. Responded → appears in master queue; Not responded → not in queue, still on card.
4. User Master assigns Platinum only if total ≥ 250k (Gold only if in gold band); wrong band rejected.
5. Insight detail shows Gold/Platinum + assignee name + time.
6. Audit: `merchant-dashboard` and/or `customer-insight` rows present.

## 5. Merchant dash call center + lists + range

1. Default merchant dash: no Daily Customer / Top Lifetime cards.
2. Enable opt-in → cards appear.
3. Call Center Performance visible for that merchant; change from/to → chart updates.
4. Main Overview from/to still drives main graphs including call center.

## 6. Automated checks

```bash
npm test -- lib/customer-insight
npm run lint
```

Expect new/updated unit tests for birthday wrap, min-only total, outreach transitions, assignment band checks, merge permission helper.

## Done when

- Quickstart sections 1–5 pass on cosmo-dev (or local)
- Migration deployed per Constitution I before calling the feature complete in prod
