# Implementation Plan: Stock Compare Redesign

**Branch**: `060-stock-compare-redesign` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/060-stock-compare-redesign/spec.md`

**Note**: Spec directory is independent of the current git branch (`feature/purches-history` at plan time). `.specify/feature.json` points here.

## Summary

Redesign existing **Cosmetics Stock Comparer** into two tabs: **main** (Cosmetics main ≤ threshold vs other stock, **online warehouses first then shops**, 90-day Cosmetics.lk / Shopify-facing sales + **Critical** for top 20% sellers) and **brand** (same ERP1/ERP2 brand rules). Keep `reports.stock_comparer`, live Bin fetch, and tab-specific exports.

**Technical approach**: Extend `lib/cosmetics-stock-comparer.ts` (drop P1/P2/P3; add online/shop classify via `isShopWarehouseName`; add Critical helper). One GET `/api/admin/reports/stock-comparer` attaches sales from completed website-channel orders (90-day Colombo window). Redesign `CosmeticsStockComparer` with existing Tabs. No Prisma migration. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router / repo tsconfig)

**Primary Dependencies**: Next.js, React, Prisma (read `Order` / `OrderLineItem` / `CompanyLocation` for sales only), Zod-style query parse already on the route, Auth0 via `requirePermission("reports.stock_comparer")`, `buildCatalogRows` + `resolveOsfColumns` + `getAllOsfErpInstances` + `fetchBinActualQty`, `isShopWarehouseName`, `resolveCosmeticsLkChannel`, `osfCompletedSalesOrderWhere`, xlsx-js-style, `components/ui/tabs`

**Storage**: **No Prisma migration.** Live stock from ERPNext Bin HTTP. Sales from existing Neon orders. Permission already seeded.

**Testing**: Vitest on `lib/cosmetics-stock-comparer` (grouping, threshold, brand, Critical); `npm test` + lint on touched files; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS web dashboard (Purchasing / Stock Comparer). Rider app unchanged.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: Default threshold-0 report usable within **60s** (spec SC-001). One user-triggered GET; bins batched per ERP instance; one 90-day sales aggregate (not per-row). Tab switch must not refetch.

**Constraints**: Constitution I–V. Never invent stock or Critical ranks on failure. No Stock Entry / transfer. Secrets stay in existing ERP instance rows / env files. Do not implement 059 here.

**Scale/Scope**: One existing page + one existing API + comparer helpers + organism tabs. Working set = SKUs at/below Cosmetics main threshold, not the full Shopify ≤3 showdown.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — no Prisma model/field |
| II. Environment & Credential Isolation | **PASS** — reuse per-tenant ERP instances + company-scoped order reads |
| III. Test & Typecheck Gates | **PASS** — Vitest for comparer helpers; no rider-app files |
| IV. Production Deployment Safety | **PASS** — planning only; no prod deploy/push |
| V. Simplicity & Scope Discipline | **PASS** — in-place redesign; reuse Bin route + shop-name + channel helpers; no new permission/page/job |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — session/read shapes; no new tables
- [contracts/stock-comparer.md](./contracts/stock-comparer.md) — existing GET only; no mutate-ERP route
- [quickstart.md](./quickstart.md) — validates tabs, grouping, Critical, exports; no transfer created

## Project Structure

### Documentation (this feature)

```text
specs/060-stock-compare-redesign/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── stock-comparer.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/purchasing/stock-comparer/
└── page.tsx                              # existing auth gate; copy tweak if needed

components/organisms/
├── cosmetics-stock-comparer.tsx          # tabs, Critical, online-then-shops, tab exports
└── app-sidebar.tsx                       # unchanged entry (reports.stock_comparer)

lib/cosmetics-stock-comparer.ts           # online/shops grouping; Critical helper
lib/cosmetics-stock-comparer.test.ts      # rewrite priority tests; add Critical tests

lib/cosmetics-stock-comparer-sales.ts     # optional thin 90-day website-sales loader
# (or keep fetch in the route if a second file is unnecessary)

app/api/admin/reports/stock-comparer/
└── route.ts                              # attach sales90d + critical; same auth/bins

lib/item-trends/physical-shops.ts         # reuse isShopWarehouseName (no change unless gap)
lib/cosmetics-lk-channel.ts               # reuse website-channel filter
lib/osf/assist-sales.ts                   # reuse osfCompletedSalesOrderWhere
```

**Structure Decision**: Same purchasing page and API. Logic stays in `lib/cosmetics-stock-comparer*` — do not add `lib/shopify-stock-showdown` or a second report route. No new package, no rider-app, no Prisma schema.

## Complexity Tracking

> No constitution violations requiring justification.

## Agent context

Skipped — repo has no `.specify` `update-agent-context` script (same as 041–059).
