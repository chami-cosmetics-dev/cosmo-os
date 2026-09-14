# Contract: Abandoned Cart Deduplication & Abandonment Reason

**Feature**: `054-abandoned-cart-dedupe`  
**Date**: 2026-09-14  
**Extends**: `015-abandoned-orders-followup` contracts

## UI contract

**Surface**: `/dashboard/orders/abandoned-orders` — `AbandonedOrdersPanel` + follow-up form

### List

- Default rows: `supersededByCheckoutId` is null only.
- Columns / row affordances (additive):
  - **Abandonment reason** (label or em dash).
  - **Same-day badge** on the most recent visible cart for that phone that calendar day when `sameDaySiblingCount > 0` (e.g. `+2`). Badge opens/navigates to sibling rows (scroll/highlight or filter-to-ids — implementation may choose; must reach each sibling without re-searching phone).
  - **Exact-duplicate indicator** when other group members exist (count or “linked” cue). Saving follow-up on one updates all linked copies in the client list after response.

### Follow-up editor (additive)

- Select **Abandonment reason**: empty + three options (see data-model). Optional always.
- Existing status / customer response / remark behavior unchanged.
- On save success, response item(s) reflect propagated fields for exact-duplicate peers (panel should patch local state for returned row; optional refetch).

### Export

- CSV adds column **Abandonment reason** (label or raw code — prefer human label).
- Default export excludes superseded rows (same filter as list).

---

## Admin API

### `GET /api/admin/abandoned-orders/page-data`

**Auth**: `abandoned_orders.read` (unchanged)

**Behavior additions**:
1. After sync (existing), ensure dedupe backfill has run for company when fingerprints missing (or run lightweight phone-scoped dedupe as part of sync).
2. Query excludes `supersededByCheckoutId != null` by default.
3. Each item may include linking metadata (below).

**Item fields (additive)**:

| Field | Type | Notes |
|-------|------|-------|
| `abandonmentReason` | string \| null | Enum value or null |
| `exactDuplicateGroupId` | string \| null | |
| `exactDuplicateCount` | number | Peers in group including self (≥1) |
| `sameDaySiblingCount` | number | Other same-day intents; 0 if not most recent or none |
| `sameDaySiblings` | `{ id: string; abandonedAt: string; lineItemsSummary: string }[]` | Only populated when this row is the day’s most recent for the phone and count > 0; otherwise `[]` |

---

### `PATCH /api/admin/abandoned-orders/[id]/follow-up`

**Auth**: `abandoned_orders.manage`

**Body** (Zod additive):

```json
{
  "followUpStatus": "closed",
  "customerResponse": "unable_to_contact",
  "remark": "optional text",
  "abandonmentReason": "city_not_available"
}
```

| Field | Rules |
|-------|--------|
| `abandonmentReason` | Optional; `null` clears; else one of `koko_payment_issue`, `city_not_available`, `no_need_of_products` |

**Behavior additions**:
1. Validate body (existing Closed → customerResponse required).
2. If row has `exactDuplicateGroupId`, update **all** non-deleted group members (same company) with the same `followUpStatus`, `customerResponse`, `remark`, `abandonmentReason`, `lastFollowUpById`, `lastFollowUpAt`.
3. Audit log primary entity id; metadata MAY include `exactDuplicateGroupId` and peer ids/count.
4. Response: updated primary row as list item shape (including new fields). Clients may refetch list to refresh peers.

**Errors**: unchanged 400/403/404 patterns.

---

### `GET /api/admin/abandoned-orders/export`

- Same filters as list; exclude superseded by default.
- Add CSV column for abandonment reason label.

---

## Internal lib contract

### `lib/abandoned-checkout-cart.ts`

- `normalizeAbandonedCheckoutLines(lineItemsJson): CartLine[]`
- `buildCartFingerprint(lines): string`
- `isProperCartSubset(older, newer): boolean`

### `lib/abandoned-checkout-dedupe.ts`

- `recomputeCheckoutCartFields(row): { phoneNormalized, cartFingerprint }`
- `dedupeAbandonedCheckoutsForCompany(companyId, opts?: { phoneNormalized?: string }): Promise<void>`
- `backfillAbandonedCheckoutDedupe(companyId): Promise<{ processed: number }>`

Called from sync + webhook after upsert; backfill when columns null.

### Sync / webhook

- Persist richer `lineItemsJson` when variant/product ids available.
- After upsert batch (or per phone), call dedupe.
- Must not overwrite manual follow-up fields beyond existing recovered-sale rules; dedupe only sets link/hide/fingerprint fields (and may copy nothing from Shopify onto follow-up).

---

## Permissions

Unchanged: `abandoned_orders.read` view; `abandoned_orders.manage` mutate (including abandonment reason and group propagate).
