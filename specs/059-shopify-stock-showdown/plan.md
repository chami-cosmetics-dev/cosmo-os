# Implementation Plan: Shopify Stock Showdown

**Branch**: `059-shopify-stock-showdown` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/059-shopify-stock-showdown/spec.md`

## Summary

New **Shopify Stock Showdown** dashboard: list Shopify-tracked items with on-hand **<= 3** (default; optional OOS-only filter), show stock at **other ERP warehouses and retail shops**, and suggest **advisory** transfers into Shopify using **last-30-day Shopify sales**. Gated by a **new** RBAC permission independent of stock comparer / item trends / store stock count.

**Technical approach**: Read `ProductItem.inventoryQuantity` for the selected Shopify `CompanyLocation`; pull elsewhere stock via existing OSF column warehouses + live ERP `Bin` (`fetchBinActualQty`) for the low-stock SKU set only; aggregate Shopify sales from completed orders at that location over a Colombo trailing-30 window; pure helpers for threshold filter + suggestion math (Vitest). No Prisma schema change; no ERP writeback. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router / repo tsconfig)

**Primary Dependencies**: Next.js, React, Prisma (read `ProductItem`, `Order`/`OrderLineItem`, `CompanyLocation`, `OsfColumnConfig` / resolved columns), Zod, Auth0 via `requirePermission`, `getAllOsfErpInstances` + `fetchBinActualQty` from `lib/osf/erp-stock.ts`, shop heuristics from `lib/item-trends/physical-shops.ts`

**Storage**: **No Prisma migration.** Permission catalog upsert via existing `DEFAULT_PERMISSIONS` / `ensureDefaultRbacSetup`. Live elsewhere stock from ERPNext HTTP; Shopify on-hand and 30-day sales from Neon (already synced).

**Testing**: Vitest for threshold filter, suggestion allocation/cap, destination-exclusion / dedupe helpers; `npm test` + lint on touched files; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS (primary) and Vault OS web dashboard where Shopify locations exist; purchasing/inventory nav

**Project Type**: Single full-stack Next.js web app (rider app unchanged)

**Performance Goals**: Default showdown list usable within **30s** for typical low-stock set (hundreds of SKUs, not full catalog). One API load for destinations; one showdown load batched by ERP instance for bins. No per-row ERP round-trip in the UI.

**Constraints**: Constitution I–V. Never invent stock (ERP fail → unavailable, not 0). Suggestions advisory only — no Stock Entry / Stock Transfer. Exclude destination Shopify warehouses from “elsewhere.” Cap suggested qty at source available. Secrets stay in existing ERP instance rows / env files.

**Scale/Scope**: One new permission; one dashboard page; two admin APIs (destinations + showdown); one organism panel; `lib/shopify-stock-showdown/*` helpers. Working set = SKUs with Shopify qty <= 3 at one destination shop.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — no Prisma model/field; permission seed only |
| II. Environment & Credential Isolation | **PASS** — reuse per-tenant `ErpnextInstance` + company-scoped Prisma reads |
| III. Test & Typecheck Gates | **PASS** — Vitest for pure helpers; no rider-app files |
| IV. Production Deployment Safety | **PASS** — planning only; no prod deploy/push |
| V. Simplicity & Scope Discipline | **PASS** — advisory showdown only; reuse OSF bins + ProductItem; no new job queue / history table |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — session + read shapes; no new tables
- [contracts/shopify-stock-showdown.md](./contracts/shopify-stock-showdown.md) — GET destinations + GET showdown; no mutate-ERP route
- [quickstart.md](./quickstart.md) — validates filter, elsewhere stock, suggestions; checks no ERP transfer created

## Project Structure

### Documentation (this feature)

```text
specs/059-shopify-stock-showdown/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── shopify-stock-showdown.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/purchasing/shopify-stock-showdown/
└── page.tsx                              # auth gate + panel

components/organisms/
├── shopify-stock-showdown-panel.tsx      # NEW: destination picker, filter, table, suggestions
└── app-sidebar.tsx                       # Purchasing / reports entry when permitted

lib/shopify-stock-showdown/
├── auth.ts                               # purchasing.shopify_stock_showdown.read
├── types.ts
├── threshold.ts                          # <=3 vs OOS-only
├── threshold.test.ts
├── suggestions.ts                        # demand gap + allocate/cap across sources
├── suggestions.test.ts
├── sources.ts                            # map OSF columns → ERP/shop sources; exclude destination
├── sources.test.ts
└── sales.ts                              # trailing-30 Shopify units by SKU for location

app/api/admin/shopify-stock-showdown/
├── destinations/route.ts                 # GET Shopify CompanyLocations
└── showdown/route.ts                     # GET list + elsewhere + suggestions; maxDuration 60

lib/validation/shopify-stock-showdown.ts  # Zod query params
lib/rbac.ts                               # DEFAULT_PERMISSIONS entry
```

**Structure Decision**: Sibling of Cosmetics Stock Comparer under purchasing. Dedicated `lib/shopify-stock-showdown/*` — do not overload item-trends outlet transfer UI. Reuse OSF bin fetch and physical-shop naming; do not reuse cosmetics file comparer. No new package, no rider-app, no Prisma schema.

## Complexity Tracking

> No constitution violations requiring justification.
