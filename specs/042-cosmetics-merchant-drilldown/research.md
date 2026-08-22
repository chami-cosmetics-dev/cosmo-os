# Research: 042-cosmetics-merchant-drilldown

## 1. Entry UX — click Cosmetics.lk card only

**Decision**: Make only the Cosmetics.lk Merchant Performance donut card a click target. Open an existing shadcn **Sheet** (side panel) owned by `DashboardMainSlot`. Other location cards stay non-clickable. Pass `location.id` through donut stats; treat a card as Cosmetics.lk when `isCosmeticsLkLocationName(name)` (`lib/page-data/merchant-dashboard-cosmetics-lk.ts`). Close/back dismisses the sheet; dashboard From–To and `dateType` stay in `DashboardOverviewProvider`. If the sheet is open and filters change, refetch drill-down.

**Rationale**: Spec v1 is Cosmetics.lk only. Sheet keeps the user on the dashboard (FR-017). Overlay vs route is unspecified; a sheet matches “click card → see breakdowns” without a new page.

**Alternatives considered**:
- Dedicated `/dashboard/cosmetics-lk` route — extra navigation, easier to lose filter state.
- All location cards clickable — out of spec; ERP1 meaning is Cosmetics.lk-specific.
- Expand-in-place accordion — cramped vs merchant table + four breakdowns.

## 2. Do not reuse the card source pie for Website vs ERP1

**Decision**: Classify `Order.sourceName` into three channels:

| Channel | `sourceName` (normalized, case-insensitive) |
|---------|-----------------------------------------------|
| **Website** | `web`, `shopify`, empty/unknown, and any other value not listed below |
| **ERP1** | `erpnext`, `erpnext-pos`, `pos` |
| **Manual** | `manual` |

Hide the Manual location/merchant bucket when its order count is 0 (FR-008: show when any exist).

**Rationale**: Spec: Website = cosmetics.lk website; ERP1 = Cosmetics.lk ERP (counter/POS **and** ERP sales invoices); Manual = Cosmo-created. Current `buildSourceBreakdown` in `dashboard-main-slot.tsx` only special-cases `pos` and `manual` and dumps **everything else into Web** — including `erpnext`. Reusing that pie would mislabel ERP invoices as website.

**Alternatives considered**:
- Reuse Web/POS/Manual pie as-is — rejected (erpnext ≠ website).
- Split POS vs ERP invoices as fourth channel — rejected (spec names two channels + manual exception).
- Live ERP instance lookup — rejected; Cosmo already stamps `sourceName` on ingest.

## 3. Query shape — dedicated Cosmetics.lk fetch, lazy on click

**Decision**: New `GET /api/admin/dashboard/cosmetics-lk-drilldown?from&to&date_type`. Do **not** add line items / discounts / payment splits to `GET /api/admin/dashboard/sales-by-location`. Resolve Cosmetics.lk location by name/shortName regex, then `findMany` orders with `companyId` + `companyLocationId` + existing `buildDashboardSalesDateFilter`. Fetch when the sheet opens (and when open filters change). Optional in-sheet cache keyed by `from|to|dateType`.

**Rationale**: Sales-by-location already loads **all** company locations’ orders for the card grid. VAT needs line items; discounts need `totalDiscounts`. Putting that on first paint would slow the whole dashboard. SC-001 is measured from **click**, not first paint. Performance rule: extra page-data endpoint beats stuffing the overview payload.

**Alternatives considered**:
- Extend sales-by-location DTO — rejected (cost on every dashboard load).
- Client-side from existing `sources` + `merchants` — rejected (no VAT, discounts, payment types, or ERP1 split).

## 4. Merchant attribution — same as the card

**Decision**: For each eligible Cosmetics.lk order, resolve merchant exactly as `fetchDashboardSalesByLocationMerchant`: `getMerchantCouponCode` (join all codes) → `matchMerchantFromCouponMap` → `resolveAssignedMerchantDashboardFallback` → `normalizeDashboardMerchantLabel` (blank/Unknown/Unassigned → **DM-General**). Sum `Number(totalPrice)`. Omit merchants with zero eligible Cosmetics.lk orders. Merchant amount sum **must** equal Cosmetics.lk card headline for the same filter (FR-006).

If this attribution block is copied a third time, extract a small `resolveDashboardOrderMerchant(...)` helper used by dashboard-sales + drill-down (constitution V: third use). Do **not** invent a fourth aggregator framework.

**Rationale**: Spec FR-004/FR-006. Card donut is top-merchant highlight only; drill-down lists every attributed merchant.

**Alternatives considered**:
- `assignedMerchantId` only — rejected (web orders attributed by coupon).
- Merchant-dashboard `classifyMerchantSalesBucket` (self mer vs dm) — wrong grain (viewer-centric, not company-wide).

## 5. Payment types, VAT, discounts

**Decision**:

- **Payment**: `getPaymentMethodInfo({ paymentGatewayPrimary, financialStatus }).label` — same as gateway analysis / merchant Cosmetics.lk breakdown. Empty → `Unspecified`. Attribute **full order `totalPrice`** to that one type (same as `fetchDashboardSalesByLocationGateway`). Location payment totals must sum to card headline (FR-012).
- **VAT**: line `price * quantity`; VAT if `productItem.itemStatusCategory === "VAT_TOP_PRIORITY_BRAND"` (export the constant already used in `merchant-dashboard-cosmetics-lk.ts`). Else other items. Order can increment both buckets’ `orderCount` if it has both kinds of lines (same as merchant personal breakdown). VAT+other **need not** equal `totalPrice` (shipping / order-level discount).
- **Discount amount**: `Number(order.totalDiscounts ?? 0)`.
- **Discount codes**: promotional codes via `getOrderDiscountCouponCode` (excludes MER tracking codes). Per merchant: code → order count. MER/DM codes stay attribution-only; they already appear as merchant names.

**Rationale**: Spec reuses merchant-dashboard VAT meaning and existing payment labels. Tracking coupons are not customer discounts (`lib/order-discount-coupon.ts` already splits them).

**Alternatives considered**:
- List MER codes as discounts — rejected (ops noise; not promotional).
- Force VAT+other = order total — rejected (line spend ≠ invoice total).

## 6. Auth and analysis mode

**Decision**: `requirePermission("dashboard.view")` + same `getDashboardDateTypePermission(dateType)` as sales-by-location. Company-scoped. Drill-down is **always merchant attribution**, even if the dashboard `analysis_type` is `gateway` (donut then shows gateways; click still opens merchant Cosmetics.lk detail). Users without `dashboard.view` never see the cards (FR-016).

**Rationale**: Spec audience = people who already see Merchant Performance. Date-type permissions already gate other clocks.

**Alternatives considered**: New permission — unnecessary. Hide click in gateway mode — spec does not say that; Cosmetics.lk card still exists.

## 7. Eligibility / POS

**Decision**: Reuse `buildDashboardSalesDateFilter` + `isDashboardSalesOrderEligible` unchanged. Delivery-focused filters already drop POS (`pos` / `erpnext-pos`). Drill-down must not invent a second rule. `erpnext` (non-POS ERP invoices) follows the same eligibility as today on the card.

**Rationale**: Spec edge case: POS included/excluded exactly as the active filter.

## 8. Schema / agent context

**Decision**: No Prisma migration. Skip update-agent-context script — repo has none (same as 041).

**Rationale**: Constitution I (no migrate) and V (no speculative tables for aggregates).
