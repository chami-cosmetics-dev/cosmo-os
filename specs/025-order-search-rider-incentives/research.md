# Research: 025-order-search-rider-incentives

## Decision 1: Order number display strategy

**Decision**: Treat business-facing identity as `orderNumber` when present, with `name` as co-label / fallback, then `shopifyOrderId`. Align web and mobile with a shared display helper (extend or wrap `orderDisplayLabel` / fulfillment reference helpers) so lists show the human order number, not only ERP SI/`name`.

**Rationale**: Spec requires order number everywhere. Today most UIs prefer `name ?? orderNumber`, and mobile often renders only `orderLabel`. ERP-origin orders can hide the number staff use on stickers/calls.

**Alternatives considered**:
- Keep `name`-first only — rejected; fails ERP and inconsistent mobile display.
- Dual always-on labels (`#orderNumber` + SI) everywhere — acceptable where space allows; not required on dense mobile cards if `orderNumber` is primary.

## Decision 2: Dashboard home search

**Decision**: Add a search bar on Cosmo OS `/dashboard` home. New `GET /api/admin/orders/quick-search?q=` reuses/extends orders page filters (`orderNumber`, `name`, phone) and adds customer-name matching. Auth: require `orders.read` (page already needs `dashboard.view` for home). Minimum query length 2–3 characters; cap results (e.g. 20).

**Rationale**: Spec defines main page as Cosmo OS web home; no global search exists there today. Orders page search is the closest pattern.

**Alternatives considered**:
- Only enhance Orders page search — rejected; user asked for main page.
- Client-only filter of dashboard charts — rejected; charts are aggregates, not order rows.

## Decision 3: Cash tender vs collected amount

**Decision**: Add `customerGaveAmount` (tendered) and `changeAmount` (computed balance) on `DeliveryPayment`. Keep `collectedAmount` as amount due/collected for reconciliation and ERP. For split payments, tender applies to the COD/cash portion due; `changeAmount = customerGaveAmount − cashDue`.

**Rationale**: Spec’s “customer gave 5000 / order 3500 / balance 1500” is change-making, not a second collection total. Overloading `collectedAmount` would break cash handover and PE amounts.

**Alternatives considered**:
- Store tender only on COD `DeliveryPaymentLine` — workable but harder for header display and older single-method rows; header fields are simpler for v1.
- Require exact tender only — rejected; stores need overpay/change.

## Decision 4: Rider incentive model (v1)

**Decision**: Incentive for a completed delivery = `Order.totalShipping` (null/0 → 0) attributed to the rider who completed the `RiderDeliveryTask`. Dashboard aggregates by date range from completed tasks, excluding voided/cancelled orders. No separate payroll rate table in v1.

**Rationale**: Spec assumption is 100% of shipping cost at completion. Existing riders page already has completed counts/cash totals but not shipping/incentive.

**Alternatives considered**:
- Persistent `RiderIncentiveEntry` ledger on every complete — useful for audit/void reversal; optional if aggregation proves insufficient. Prefer computed aggregate first; add ledger only if voids require durable reverse rows.
- Configurable % of shipping — deferred; not in v1 scope.

## Decision 5: Permissions for performance dashboard

**Decision**: Gate rider performance page/API with existing `staff.read` (same as `/dashboard/riders`). Do not invent `riders.*` keys in v1 unless product later wants tighter RBAC.

**Rationale**: Matches current riders area; avoids RBAC seed churn.

**Alternatives considered**: New `riders.performance.read` — cleaner long-term, more setup cost now.
