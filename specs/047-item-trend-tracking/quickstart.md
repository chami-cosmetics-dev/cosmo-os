# Quickstart: Item Trends Super Dashboard

**Feature**: `047-item-trend-tracking`  
**Date**: 2026-09-02

Validation guide after implementation (not a full test suite).

## Prerequisites

- Cosmo target env (`npm run env:use cosmo-dev` or local with DB)
- User with `purchasing.item_trends.read` (and `purchasing.osf.manage` for ROP apply test)
- Store test user with `EmployeeProfile.locationId` set (optional scoping test)
- Completed orders with line items in last 7–90 days; some with shipping addresses in known districts
- OSF shop columns configured with ERP stock sync
- Sample SKUs with `ProductOsfRop` values

## Setup

```bash
npm install
npm run db:generate
npm run dev
```

RBAC sync adds `purchasing.item_trends.read` on first request boot / login flow (existing `ensureRbac` pattern).

## 1) Permission gate

1. Open `/dashboard/purchasing/item-trends` as user **without** permission → `PermissionDeniedCard`
2. Grant `purchasing.item_trends.read` → page loads with KPI cards + charts
3. Hit API without cookie → `403`

## 2) Movement + KPIs (7-day range)

1. Default range last 7 days vs prior 7
2. Confirm KPI fast mover count > 0 when known hot SKUs exist
3. Change date range → KPIs and movement list refresh together
4. Pick Top Priority filter → list scoped

## 3) Outlet balance & transfer

1. Open **Outlets** tab
2. Find SKU with high stock + low sales at one shop and high sales at another (seed or real)
3. Confirm **transfer candidate** row with message "Move stock from … to …"
4. Verify no stock auto-moved in ERP

## 4) ROP suggestion

1. Open **ROP** tab; default 3-month window
2. Pick SKU with known monthly units (e.g. 4000 / 1000 / 8000) → suggested ROP = **peak month × 2** (16000), not window total × 2
3. Switch to 2-month window → values recalculate
4. Accelerating SKU shows **increase** overlay; slowdown shows **decrease**
5. With `purchasing.osf.manage`, apply suggestion via UI → confirm `ProductOsfRop` updated only after save

## 5) Districts & expansion

1. Open **Districts** tab → leaderboard includes Colombo/Gampaha or Unmapped bucket
2. Drill into one district → top items for that district only
3. **Expansion** panel lists district with high delivery / low shop coverage (if test data exists)

## 6) Store-scoped user

1. Log in as store user with locationId
2. Outlet tab shows own outlet + transfer partners; company-wide export/district expansion hidden or read-only per policy

## 7) Reconciliation

1. Export movement units for one SKU for one week
2. Compare to OSF assist / manual count from orders → within 1%

## Automated checks

```bash
npx vitest run lib/item-trends/
npx vitest run lib/osf/assist-sales.test.ts
npm run lint
```

Add unit tests for: ROP ×2 formula, transfer pairing rules, district aggregation with Unmapped, prior-window comparison.

## Contracts

- [item-trends-page-data.md](./contracts/item-trends-page-data.md)
- [item-trends-districts.md](./contracts/item-trends-districts.md)
- [item-trends-outlets.md](./contracts/item-trends-outlets.md)
- [item-trends-rop.md](./contracts/item-trends-rop.md)

## Phase 2 (after v1)

- Intelligent engine section with `signalSource: intelligent_analysis`
- Pattern heatmap for ranges ≥ 28 days
- Focus list export
