# Implementation Plan: Cosmetics.lk Merchant Drill-down

**Branch**: `042-cosmetics-merchant-drilldown` | **Date**: 2026-08-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/042-cosmetics-merchant-drilldown/spec.md`

## Summary

Main dashboard Cosmetics.lk Merchant Performance card becomes a click target. Click opens a drill-down (sheet) for the **same From–To + sales filter**, listing every attributed sales merchant at Cosmetics.lk with order count, amount, Website vs ERP1 vs Manual channels, payment types, VAT vs other line spend, and promotional discounts. Lazy-load a dedicated Cosmetics.lk-scoped query — do **not** bloat `sales-by-location`. No schema change. Reuse dashboard eligibility + merchant attribution; do **not** reuse the card’s Web/POS/Manual source pie (it currently folds `erpnext` into Web).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js / project tsconfig)

**Primary Dependencies**: Next.js App Router, React, Prisma, Zod, Auth0 (`requirePermission("dashboard.view")`), existing dashboard date-type permissions, shadcn Sheet

**Storage**: Existing Neon PostgreSQL via Prisma — **no migration**. Read `Order`, `OrderLineItem`, `ProductItem.itemStatusCategory`, `CompanyLocation`. Aggregates are derived, not stored.

**Testing**: Vitest for channel classifier, VAT/discount/payment buckets, and merchant-total invariants vs card attribution; `npm test` + lint on touched files; manual UAT per [quickstart.md](quickstart.md)

**Target Platform**: Vercel-hosted Cosmo OS company main dashboard (`dashboard.view`)

**Project Type**: Single full-stack Next.js web app (rider app / merchant personal dashboard unchanged)

**Performance Goals**: First merchant figures visible within 10s of click on a typical business day (SC-001). Query **only** Cosmetics.lk `companyLocationId` orders; fetch on click (and when open filters change), not on dashboard first paint.

**Constraints**: Same eligibility as card (`buildDashboardSalesDateFilter` + `isDashboardSalesOrderEligible`); same merchant attribution as `fetchDashboardSalesByLocationMerchant`; Cosmetics.lk card only; `dashboard.view` + `getDashboardDateTypePermission(dateType)`; no export; no card-total math change

**Scale/Scope**: One GET contract, one page-data fetcher, channel helper + tests, Cosmetics.lk-only click on donut grid + Sheet UI. Other location cards stay inert.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS**: No schema change; no `db:migrate` / `db:push`.
- **II. Environment & Credential Isolation — PASS**: No new secrets or env files. Reuse existing dashboard auth.
- **III. Test & Typecheck Gates — PASS**: Vitest for pure classifiers + aggregate invariants; CI scripts unchanged.
- **IV. Production Deployment Safety — PASS**: Planning only; no prod deploy in this phase.
- **V. Simplicity & Scope Discipline — PASS**: Cosmetics.lk click-through only; dedicated Cosmetics.lk query instead of stuffing line items into company-wide sales-by-location; reuse attribution/eligibility/VAT meaning; no all-location drill-down, no export.

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](data-model.md) is derived aggregates only — no Prisma fields.
- [contracts/admin-dashboard-cosmetics-lk-drilldown.md](contracts/admin-dashboard-cosmetics-lk-drilldown.md) is one GET, same query clock as sales-by-location.
- [quickstart.md](quickstart.md) validates click + reconciliation, not a new data pipeline.

## Project Structure

### Documentation (this feature)

```text
specs/042-cosmetics-merchant-drilldown/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── admin-dashboard-cosmetics-lk-drilldown.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
lib/
├── cosmetics-lk-channel.ts                    # NEW: sourceName → website | erp1 | manual
├── cosmetics-lk-channel.test.ts               # NEW
├── page-data/
│   ├── merchant-dashboard-cosmetics-lk.ts     # reuse isCosmeticsLkLocationName + VAT category
│   ├── dashboard-sales.ts                     # reuse date filter, eligibility, merchant resolve
│   └── dashboard-cosmetics-lk-drilldown.ts    # NEW: company-wide Cosmetics.lk aggregates
├── page-data/dashboard-cosmetics-lk-drilldown.test.ts  # NEW: bucket invariants
├── payment-method-label.ts                    # reuse getPaymentMethodInfo
├── order-discount-coupon.ts                   # reuse getOrderDiscountCouponCode
├── merchant-groups.ts                         # reuse coupon map + assigned fallback
├── merchant-dm-sales.ts                       # reuse normalizeDashboardMerchantLabel
├── dashboard-date-type-permissions.ts         # reuse GET date-type gate
└── validation.ts                              # add cosmeticsLkDrilldownQuerySchema (from/to/date_type)

app/api/admin/dashboard/
├── sales-by-location/route.ts                 # unchanged (card totals)
└── cosmetics-lk-drilldown/route.ts            # NEW GET

components/organisms/
├── dashboard-main-slot.tsx                    # Cosmetics.lk card click → sheet
└── dashboard-cosmetics-lk-drilldown-sheet.tsx # NEW: location + merchant breakdowns

components/ui/sheet.tsx                        # reuse
```

**Structure Decision**: Extend existing Cosmo admin dashboard (same app). New Cosmetics.lk-scoped page-data + GET; click wiring on existing donut grid. No new package, no Prisma migration, merchant personal dashboard and rider app out of scope.

## Complexity Tracking

> No constitution violations requiring justification.
