# Quickstart: Abandoned Cart Deduplication & Abandonment Reason

**Feature**: `054-abandoned-cart-dedupe`  
**Date**: 2026-09-14

## Prerequisites

- Cosmo OS local/dev env with Shopify abandoned-checkout sync working (feature `015`).
- User with `abandoned_orders.read` + `abandoned_orders.manage`.
- Migration applied: `npm run db:generate` then `npm run db:deploy:<target>` after `db:migrate:create`.

## Setup

1. Create/apply schema migration for new `ShopifyAbandonedCheckout` columns (see [data-model.md](./data-model.md)).
2. Deploy app with updated sync, follow-up PATCH, panel, export.
3. Open `/dashboard/orders/abandoned-orders` once so sync + backfill can populate fingerprints/groups (or trigger cron sync).

## Validation scenarios

### V1 — Exact duplicate status sync

1. Ensure two checkouts exist for same phone with identical line multiset (seed via sync/webhook or DB fixtures in test).
2. Confirm both visible; exact-duplicate indicator shows count ≥ 2.
3. On one row: set status Closed, customer response, abandonment reason `koko_payment_issue`, remark; save.
4. **Expect**: peer row shows same status, response, reason, remark after refresh/list update without editing peer.

### V2 — Subset soft-hide

1. Checkout A: product P1 qty 1 (older `abandonedAt`).
2. Checkout B: P1 qty 1 + P2 qty 1 (newer), same phone.
3. Run sync/dedupe.
4. **Expect**: A absent from default list/export; B visible. A row still in DB with `supersededByCheckoutId = B`.

### V3 — Disjoint carts stay; smaller later stays

1. Same phone: cart {P1} and cart {P2} → both visible.
2. Older {P1,P2}, newer {P1} only → both visible (newer not a superset).

### V4 — Same-day sibling badge (no status sync)

1. Same phone, same calendar day (Asia/Colombo), two different fingerprints.
2. **Expect**: both visible; only most recent shows badge with count `1` and link/jump to sibling.
3. Change status on one → other status unchanged.

### V5 — Abandonment reason optional

1. Close a row with customer response, leave abandonment reason empty → save OK.
2. Set reason `city_not_available` → visible on row + CSV column.
3. Confirm reason is distinct from remark / customer response.

### V6 — No phone

1. Checkout with null/empty phone → no group, no supersession against others, no same-day badge.

## Automated checks

```bash
npm test -- abandoned-checkout-cart
# or full:
npm test
```

Cover fingerprint equality, proper-subset true/false, qty edge cases.

## Reference

- Spec: [spec.md](./spec.md)
- Research: [research.md](./research.md)
- Contract: [contracts/abandoned-cart-dedupe.md](./contracts/abandoned-cart-dedupe.md)
