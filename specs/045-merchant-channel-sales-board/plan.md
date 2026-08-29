# Implementation Plan: Merchant Channel Sales Board

**Branch**: `045-merchant-channel-sales-board` | **Date**: 2026-08-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/045-merchant-channel-sales-board/spec.md`

## Summary

Extend **Merchant Dashboard → GM view** with shop/online channel sales per merchant, channel monthly targets, footer totals, and staff **shop merchant** flag — without removing or replacing the shipped GM pulse, alerts, health scorecard, MTD chart, or combined monthly targets (spec 037). Channel actuals reuse `fetchMerchantCohortSales` + `isCosmeticsLkLocationName` location split. Schema adds `isShopMerchant`, `shopTargetAmount`, `onlineTargetAmount` via Prisma migration (`db:migrate:create` + `db:deploy:all`).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20, Next.js App Router

**Primary Dependencies**: React, Prisma, Zod, Auth0 RBAC (`hasMerchantDashboardAdminView`, `dashboard.merchant_targets.manage`), existing merchant dashboard page-data + GM overview (`buildGmOverview`, `gm-score.ts`)

**Storage**: Neon PostgreSQL — **migration required** for `EmployeeProfile.isShopMerchant`, `MerchantMonthlyTarget` / `History` channel target columns

**Testing**: Vitest for `splitMerchantChannelSales`, target sync helper, Zod extensions; extend GM overview tests; manual UAT per [quickstart.md](quickstart.md); `npm test` + lint on touched files

**Target Platform**: Cosmo OS web — `/dashboard/merchant` GM view (admin); staff edit; optional P3 merchant personal chips

**Performance Goals**: Channel section loads in same page-data request as GM overview (no extra round-trip). Single cohort fetch for active period; channel split is pure in-memory over `byLocation`.

**Constraints**: Must not regress GM pulse/alerts/health; same attribution as `fetchMerchantCohortSales`; Cosmetics.lk vs shop = location-based; extend existing APIs only; Asia/Colombo date boundaries

**Scale/Scope**: ~15 files — migration, channel helper + tests, extend gm-overview loader, panel UI columns/footer, target + staff validation/API, optional personal dashboard chips (P3)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS with action**: Schema change required. Use `npm run db:migrate:create`; deploy `npm run db:deploy:all` before feature complete.
- **II. Environment & Credential Isolation — PASS**: No new env files or secrets.
- **III. Test & Typecheck Gates — PASS**: Vitest for pure channel split + target rules; CI unchanged.
- **IV. Production Deployment Safety — PASS**: Planning only in this phase.
- **V. Simplicity & Scope Discipline — PASS**: Extends GM view + existing loaders; no parallel admin page; no second attribution engine; small `channel-sales.ts` helper only.

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](data-model.md) documents additive fields + derived DTOs only.
- [contracts/merchant-dashboard-channel-sales.md](contracts/merchant-dashboard-channel-sales.md) extends existing endpoints.
- [research.md](research.md) resolves combined-target sync rule and cohort reuse.
- GM regression explicitly in [quickstart.md](quickstart.md) scenario 1.

## Project Structure

### Documentation (this feature)

```text
specs/045-merchant-channel-sales-board/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── merchant-dashboard-channel-sales.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                              # isShopMerchant, shop/online targets
└── migrations/YYYYMMDDHHMMSS_.../migration.sql

lib/
├── cosmetics-lk-location.ts                   # reuse isCosmeticsLkLocationName
├── merchant-dashboard/
│   ├── channel-sales.ts                       # NEW: splitMerchantChannelSales
│   ├── channel-sales.test.ts                  # NEW
│   ├── gm-score.ts                            # extend GmPulseInput (shop/online)
│   └── gm-score.test.ts                       # extend if pulse fields added
├── page-data/
│   ├── merchant-dashboard-peers.ts            # reuse fetchMerchantCohortSales
│   ├── merchant-dashboard-gm-overview.ts      # extend overview rows + footer
│   └── merchant-dashboard.ts                  # wire channel footer, staff join
├── page-data/staff.ts                         # expose isShopMerchant
└── validation/
    ├── merchant-dashboard.ts                  # channel target fields in Zod
    └── staff.ts                               # isShopMerchant + location rule

app/api/admin/
├── merchant-dashboard/page-data/route.ts      # unchanged route, extended payload
├── merchant-dashboard/targets/route.ts        # channel target fields
└── staff/[userId]/route.ts                    # isShopMerchant validation

app/(dashboard)/dashboard/merchant/
└── merchant-dashboard-panel.tsx               # scorecard columns, footer, target form

components/molecules/
└── staff-edit-form.tsx                        # Shop merchant toggle + validation

components/organisms/
└── staff-management-panel.tsx                 # pass through isShopMerchant if needed
```

**Structure Decision**: Single Next.js app; extend GM view in place. No new routes. Migration follows constitution I.

## Implementation Phases

### Phase A — Schema + helpers (P1 foundation)

1. Migration: `EmployeeProfile.isShopMerchant`, target channel columns + history.
2. `lib/merchant-dashboard/channel-sales.ts` — resolve Cosmetics.lk location ids; `splitMerchantChannelSales(cohortRow, lkIds)`.
3. Target helper: `resolveEffectiveTotalTarget({ targetAmount, shop, online })`.
4. Vitest for split + target rules.

### Phase B — Loader + API (P1 data)

1. Extend `buildGmOverview`:
   - Join `EmployeeProfile` (isShopMerchant, location name) for merchant ids.
   - Load channel targets from `MerchantMonthlyTarget`.
   - Compute shop/online buckets from cohort `byLocation`.
   - Build `gmChannelFooter` + extend `gmPulse`.
2. Extend `getMerchantDashboardPageData` return type.
3. Extend `merchantMonthlyTargetUpsertSchema` + `upsertMerchantMonthlyTarget` + targets route.
4. Extend staff PATCH + `staff-edit-form` validation.

### Phase C — GM view UI (P1 UX)

1. Extend scorecard table columns: outlet, shop, online, channel targets/%.
2. Add **Channel totals** footer card below scorecard.
3. Extend target assignment card with Shop / Online target inputs.
4. Optional: pulse chips for shop/online if layout fits.
5. Preserve click → Merchant view; preserve alerts/pulse/chart order.

### Phase D — Personal dashboard chips (P3)

1. On Merchant view, add Shop MTD / Online MTD chips from viewed-merchant channel split.
2. Hide when zero; do not alter peer/target cards.

### Phase E — Verification

1. Run quickstart scenarios 1–6 (7 for P3).
2. `npm test`, lint, typecheck.
3. `npm run db:deploy:all` on feature branch before merge.

## Complexity Tracking

> No constitution violations requiring justification.

## Artifacts Generated (Phase 0–1)

| Artifact | Path |
|----------|------|
| Research | [research.md](research.md) |
| Data model | [data-model.md](data-model.md) |
| API contract | [contracts/merchant-dashboard-channel-sales.md](contracts/merchant-dashboard-channel-sales.md) |
| Quickstart | [quickstart.md](quickstart.md) |

## Next Step

Run **`/speckit-tasks`** to generate dependency-ordered `tasks.md` for implementation.
