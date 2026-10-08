# Implementation Plan: ROP Warehouse Compare

**Branch**: `063-rop-warehouse-compare` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/063-rop-warehouse-compare/spec.md`

**Note**: `setup-plan.ps1 -Json` returned `BRANCH` empty (no `SPECIFY_FEATURE`). Spec directory is `specs/063-rop-warehouse-compare` via `.specify/feature.json`. Do not open a second page.

## Summary

Extend **Cosmetics Stock Comparer** with a reorder-point percent watch (Cosmetics main + both non-shop ERP2 warehouses), a shops tab, identity filters, and a pick-any-warehouse compare. Keep the absolute threshold list, Critical badge, brand tab, permission, and exports.

**Technical approach**: One existing `GET /api/admin/reports/stock-comparer` keeps the Bin pull. Attach `ProductOsfRop` per OSF column and catalog priority / VAT already on `buildCatalogRows`. New pure helpers decide hits with **inclusive** `stock * 100 <= rop * percent` (do not call `isBelowReorderThreshold` or `listBelowThresholdSkus`). UI adds Shops and Compare tabs and filters rows in the browser. No Prisma migration. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router / repo tsconfig)

**Primary Dependencies**: Next.js, React, Auth0 via `requirePermission("reports.stock_comparer")`, `buildCatalogRows`, `resolveOsfColumns`, `getAllOsfErpInstances`, `fetchBinActualQty`, `ProductOsfRop`, `percentOfRop` / new inclusive check, `baseSku`, `vatStatusLabel`, `isShopWarehouseName`, `isShopOsfColumn`, `isCosmeticsLkRopColumn`, existing `classifyWarehouseKind`, xlsx-js-style, `components/ui/tabs`

**Storage**: **No Prisma migration.** Live stock from ERPNext Bin. Reorder points from existing `ProductOsfRop`. Priority and VAT from existing catalog fields on `ProductItem`.

**Testing**: Vitest on comparer helpers (percent inclusive, ERP2 non-shop selection, website-OOS flag, common SKU, priority, VAT, focus warehouse excluded from “elsewhere”). `npm test` and lint on touched files. Manual UAT in [quickstart.md](./quickstart.md).

**Target Platform**: Cosmo OS web dashboard (Purchasing / Stock Comparer). Rider app unchanged.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: A run with percent set stays usable within **60 seconds** (spec SC-001). One user-triggered GET. Bins stay batched per ERP instance. One `ProductOsfRop` read for the company. Tab switches and identity filters do not refetch.

**Constraints**: Constitution I–V. Never invent stock or reorder points. Missing or zero ROP is not a hit. No Stock Entry / transfer. Do not replace Shopify Stock Showdown, Item Trends, store allocation, or the OSF workbook. Secrets stay in existing ERP instance rows.

**Scale/Scope**: Same page, same route, comparer helpers, organism tabs. Working set for the new watch is SKUs at or below the entered percent on a watched warehouse, not the full catalog painted as hits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — no Prisma model or field |
| II. Environment & Credential Isolation | **PASS** — reuse per-tenant ERP instances and company-scoped ROP / catalog reads |
| III. Test & Typecheck Gates | **PASS** — Vitest for helpers; no rider-app files |
| IV. Production Deployment Safety | **PASS** — planning only; no prod deploy or push |
| V. Simplicity & Scope Discipline | **PASS** — in-place extend; reuse Bin route, OSF columns, `baseSku`, VAT label; no new permission, page, or job |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — response shapes only; no new tables
- [contracts/stock-comparer-rop.md](./contracts/stock-comparer-rop.md) — same GET; no mutate-ERP route
- [quickstart.md](./quickstart.md) — validates percent, shops, filters, focus compare; no transfer created

## Project Structure

### Documentation (this feature)

```text
specs/063-rop-warehouse-compare/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── stock-comparer-rop.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/purchasing/stock-comparer/
└── page.tsx                              # existing auth gate; unchanged unless copy needs a line

app/api/admin/reports/stock-comparer/
└── route.ts                              # optional ropPercent + focusWarehouse; attach ROP + identity

components/organisms/
├── cosmetics-stock-comparer.tsx          # percent input, Shops + Compare tabs, identity filters, exports
└── app-sidebar.tsx                       # unchanged entry (reports.stock_comparer)

lib/
├── cosmetics-stock-comparer.ts           # watch-column pick, percent hits, shop rows, focus compare
├── cosmetics-stock-comparer.test.ts      # new cases beside existing threshold / brand tests
├── osf/base-sku.ts                       # common SKU (reuse)
├── osf/formulas.ts                       # percentOfRop (reuse; do not use isBelowReorderThreshold)
├── osf/vat-membership.ts                 # vatStatusLabel (reuse)
├── osf/column-config.ts                  # resolveOsfColumns (reuse)
├── osf/erp-stock.ts                      # fetchBinActualQty (reuse)
└── osf/below-threshold-skus.ts           # do not call — company-total, different rule
```

**Structure Decision**: Extend the existing Stock Comparer page, route, and `lib/cosmetics-stock-comparer.ts`. Identity filters run on the payload already returned. No new route and no new dashboard.

## Complexity Tracking

None. Constitution Check has no violations to justify.

## Agent context

No `.specify/scripts/**/update-agent-context*` script in this repo (same skip as `060-stock-compare-redesign`). Context is this plan plus research, data model, and contract.
