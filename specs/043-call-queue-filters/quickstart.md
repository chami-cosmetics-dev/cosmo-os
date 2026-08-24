# Quickstart: Merchant Call Queue Filters, Assign, Export & Sales Report

**Feature**: `043-call-queue-filters`  
**Date**: 2026-08-24

Manual checks after implement. See [data-model.md](./data-model.md) and [contracts/call-queue-assign.md](./contracts/call-queue-assign.md).

## Prerequisites

- `npm run env:use` your Cosmo target; `npm run db:generate` + `db:deploy:<target>` after migrate
- User with Insight **admin view** (same as today’s Assign merchant call queue)
- Merchant M with allocated contacts spanning totals 74_999 / 75_000 / 100_000 / 100_001 / 199_999 / 200_000 / 250_000 / 250_001
- Contacts with brands, last-purchase dates, Gold/Platinum assigned vs unassigned
- Categories: Black List, Wrong Number, Not Responding, Not Interested

## 1. Filters (labels have no prices)

1. Open Customer Insight → Assign merchant call queue. Labels **Push to Gold** / **Push to Platinum** only.
2. Load merchant M, Push to Gold → only 75k–100k inclusive (100_000 in, 100_001 out).
3. Push to Platinum → 200k–250k inclusive (250_000 in, 250_001 out).
4. Both on → union of those two bands.
5. Loyalty Gold / unassigned / last-purchase range / brand AND with push chips (push chips OR each other).
6. Oldest / never contacted first unchanged.

## 2. Hide windows

1. Allocate a contact today → absent from load for 2 months.
2. Assign + merchant sets Interested or Not Interested today → absent until +2 months.
3. Assign + **Not Responding** → absent 7 days, then appears again.
4. **Black List** / **Wrong Number** → never on load (still in Excel if previously assigned).
5. Loyalty “Not responded” alone does not start the 1-week clock.

## 3. Select count / page / all

1. Multi-page list. Type **10** → first 10 **eligible** across pages (skip already queued).
2. Tick **page** → current page only.
3. Select all → all eligible; assign in chunks of 200 with remaining count if needed.

## 4. Excel + report

1. Export Excel → all merchants, all history rows, current status/category.
2. Re-assign after Not Responding week → two rows for same contact.
3. Report: after-assignment sales move when a later qualifying purchase posts; after-contact uses first update after assign.

## 5. Auth

User without insight admin view: candidates / assign / export / report → 403.

## Automated

```bash
npm test -- lib/customer-insight/call-queue
```

Expect unit tests for inclusive push bands, hide windows (2 months / 7 days / Black List), eligible-N skipping queued.
