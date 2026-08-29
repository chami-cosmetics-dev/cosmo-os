# Research: 045-merchant-channel-sales-board

## 1. Placement — extend GM view, not new route

**Decision**: Add **Channel sales** section inside Merchant Dashboard → **GM view** (`merchant-dashboard-panel.tsx`). Reuse existing tab, pulse, alerts, scorecard, MTD chart, target card. No new sidebar item or `/dashboard/merchant-channel` route.

**Rationale**: Spec integration table + user request to match early GM work without override. Single admin morning flow on `/dashboard/merchant`.

**Alternatives considered**:
- Standalone admin page — rejected (duplicates GM scorecard; spec revised).
- GM sub-tab “Channel sales” — deferred; v1 uses scrollable section below scorecard unless UX testing shows clutter.

## 2. Channel classification — reuse cohort `byLocation`, not new order pass

**Decision**: After `fetchMerchantCohortSales` for the active period window, split each merchant’s `byLocation` map:
- **Online**: location where `isCosmeticsLkLocationName(locationName)` (resolve Cosmetics.lk `companyLocationId`s once per company).
- **Shop**: all other attributed location buckets (physical outlets).
- **Total**: existing `row.total` / `row.orderCount` (must equal shop + online).

Implement pure helper `splitMerchantChannelSales(cohort, cosmeticsLkLocationIds)` in `lib/merchant-dashboard/channel-sales.ts` (new, small).

**Rationale**: Spec FR-004 + “no second attribution engine.” `fetchMerchantCohortSales` already attributes orders and buckets by location. Cosmetics.lk detection already exists (`lib/cosmetics-lk-location.ts`). Spec 042 website/ERP1 sub-split stays out of scope.

**Alternatives considered**:
- Second `prisma.order.findMany` for channel only — rejected (duplicate IO).
- Classify by `sourceName` instead of location — rejected (shop merchants can have online sales at Cosmetics.lk location regardless of `sourceName`).

## 3. Period alignment with existing GM / dashboard clocks

**Decision**: Channel actuals use the **same** `fromYmd` / `toYmd` as:
- GM scorecard date-scoped metrics (`rangeFromYmd` / `chartRangeToYmd` from `getMerchantDashboardPageData`).
- Presets: **Today** → `todayYmd`; **MTD** → month start through `rangeToYmd`; **custom** → `fromDate` / `toDate` query params (existing `merchantDashboardPageDataQuerySchema`).

Run **one** cohort fetch for the active GM period (not separate today + mtd channel columns in v1 unless UI adds period toggle on channel section — v1: single period matches page range controls).

**Rationale**: Spec FR-003; avoids mismatch between channel footer and `gmPulse` when both use same window.

**Alternatives considered**:
- Always show Today + MTD channel columns side-by-side — rejected for v1 (wide table); P3 if needed.

## 4. Combined vs channel targets — sync rule

**Decision**:

| Stored fields | Effective total target (display) | Shop / online columns |
|---------------|----------------------------------|------------------------|
| Only `targetAmount` | `targetAmount` | Shop/online target columns show — |
| `shopTargetAmount` and/or `onlineTargetAmount` set | `shopTarget + onlineTarget` (nulls = 0) | Each channel shows its target and % |
| Both combined + channel set | **Display** uses channel sum for channel %; **persist** all three fields; on save when channel fields provided, **auto-sync** `targetAmount = shop + online` so personal dashboard `target.percent` unchanged |

Channel % = channel actual ÷ channel target (MTD month targets vs period actuals with helper label when range ≠ full month).

**Rationale**: Spec additive targets + SC-003 (no regression for legacy-only `targetAmount`). Keeps `targetAmount` NOT NULL in schema.

**Alternatives considered**:
- Drop `targetAmount` — rejected (breaks 037).
- Channel targets display-only — rejected (need persistence + history).

## 5. Schema migration — minimal additive fields

**Decision**: One migration via `npm run db:migrate:create`:

| Model | Field | Type |
|-------|-------|------|
| `EmployeeProfile` | `isShopMerchant` | `Boolean @default(false)` |
| `MerchantMonthlyTarget` | `shopTargetAmount` | `Decimal(14,2)?` |
| `MerchantMonthlyTarget` | `onlineTargetAmount` | `Decimal(14,2)?` |
| `MerchantMonthlyTargetHistory` | `shopTargetAmount` | `Decimal(14,2)?` |
| `MerchantMonthlyTargetHistory` | `onlineTargetAmount` | `Decimal(14,2)?` |

Deploy with `npm run db:deploy:all` before merge (Constitution I).

**Rationale**: Spec FR-006, FR-009, FR-011. Mirrors `isRider` pattern on `EmployeeProfile`.

**Alternatives considered**:
- Separate `MerchantChannelTarget` table — rejected (constitution V; one row per merchant-month already exists).

## 6. Extend `buildGmOverview` — single overview DTO

**Decision**: Extend `MerchantDashboardOverviewRow` with channel + staff fields:

- `isShopMerchant`, `outletName` (from `EmployeeProfile.location` join)
- `shopOrderCount`, `shopAmount`, `onlineOrderCount`, `onlineAmount`
- `shopTargetAmount`, `onlineTargetAmount`, `shopPercent`, `onlinePercent`
- `effectiveTotalTarget` (computed per rule §4)

Extend `GmPulseInput` with optional `shopAmount`, `onlineAmount`, `shopOrderCount`, `onlineOrderCount` for pulse chips + footer reconciliation.

Add `gmChannelFooter` DTO if footer needs period label separate from pulse.

**Rationale**: Spec FR-010; one loader pass; regression-safe extension of shipped GM code.

## 7. UI — merge channel columns into scorecard

**Decision**: Extend existing **Merchant scorecard** table columns (shop, online, total, channel targets/%) rather than a second table. Add **Channel totals** footer row/card below scorecard. Keep pulse → alerts → scorecard order.

Target card: add Shop target + Online target inputs beside existing Target amount; one Save.

Staff: `isShopMerchant` checkbox in `staff-edit-form.tsx`; require `locationId` when checked (client + API).

**Rationale**: Spec “extend, not replace”; fewer scroll sections.

## 8. API — extend existing endpoints only

**Decision**:
- `GET /api/admin/merchant-dashboard/page-data` — extended JSON (no new route).
- `POST` merchant-dashboard targets route — accept optional `shopTargetAmount`, `onlineTargetAmount`; extend Zod `merchantMonthlyTargetUpsertSchema`.
- `PATCH /api/admin/staff/[userId]` — accept `isShopMerchant`; validate location when true.

**Rationale**: Spec edge case “prefer one endpoint”; performance rule from `.cursor/rules/performance-optimization.mdc`.

## 9. Personal dashboard P3 — lightweight chips

**Decision**: Add optional Shop MTD / Online MTD chips on Merchant view using same channel split on **viewed merchant** cohort MTD only. Reuse `cosmeticsLkBreakdown` area or Today/MTD card row — do not duplicate full GM table.

**Rationale**: Spec US-7 P3; low risk add-on after GM view ships.

## 10. Tests

**Decision**: Vitest for `splitMerchantChannelSales` (pure), target effective-total helper, Zod schemas. Extend `gm-score.test.ts` only if pulse footer math added. Manual UAT per quickstart.md.

**Rationale**: Constitution III; mirror 042 classifier tests.
