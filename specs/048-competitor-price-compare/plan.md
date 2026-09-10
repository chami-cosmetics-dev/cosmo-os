# Implementation Plan: Competitor Price Compare

**Branch**: `048-competitor-price-compare` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/048-competitor-price-compare/spec.md`

## Summary

Build a **Market Price Compare** area under Purchasing so staff can track competitor listed prices (six fixed LK online beauty retailers) against Cosmo **MRP**, **PROMO**, and **OGF** per SKU. v1 is **manual entry + CSV import** (no scraping). New Prisma tables store competitor links and price history; our three price layers are loaded live from `ProductItem` + `ProductOsfProfile` (same sources as OSF). Gap math, stale flags, and layer-aware filters live in `lib/market-prices/`. Optional P3: compact gap badge on Item Trends movement rows.

## Technical Context

**Language/Version**: TypeScript — Next.js App Router (Cosmo OS web)

**Primary Dependencies**: Next.js, Prisma, Zod, Auth0, existing OSF catalog helpers (`buildCatalogRows`), CSV parser (`lib/adapt-import/csv`), existing RBAC (`lib/rbac.ts`)

**Storage**: Neon PostgreSQL — **new models** `MarketCompetitor`, `MarketCompetitorLink`, `MarketCompetitorPriceHistory`; competitors seeded via migration SQL; links company-scoped

**Testing**: Vitest for `lib/market-prices/*` (gap %, median, stale, promo resolution, CSV row validation); manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS `/dashboard/purchasing/market-prices` (web admin)

**Project Type**: Web application — server page + API routes + client compare panel

**Performance Goals**: List page-data (500 linked SKUs) < 3s p95; CSV import preview 500 rows < 30s; export instant for filtered view ≤ 2000 rows

**Constraints**: Constitution I — `npm run db:migrate:create` + `npm run db:deploy:all`; no scraping (FR-017); company-scoped data; Asia/Colombo date boundaries for check dates

**Scale/Scope**: ~6 competitors × thousands of SKUs (most untracked initially); weekly CSV refresh ~50–500 rows; purchasing team only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | **PASS (with action)** | Three new Prisma models + competitor seed migration; MUST use `db:migrate:create` then `db:deploy:all` before merge |
| II. Environment & Credential Isolation | **PASS** | All link/history queries scoped by `companyId`; no cross-tenant competitor URLs stored outside company links |
| III. Test & Typecheck Gates | **PASS** | Vitest for pure gap/import logic; lint on touched files; Vercel `next build` gate |
| IV. Production Deployment Safety | **PASS** | Plan does not push `main` or run prod deploy without user confirmation |
| V. Simplicity & Scope Discipline | **PASS** | Thin API routes; pure `lib/market-prices/`; no scrape jobs, no AI matching, no auto price writes to catalog |

**Post-design re-check:** **PASS** — three tables, four API contracts, reuse catalog + CSV patterns; Item Trends badge deferred to P3.

## Project Structure

### Documentation (this feature)

```text
specs/048-competitor-price-compare/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── market-prices-page-data.md
│   ├── market-prices-links.md
│   └── market-prices-import.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
prisma/schema.prisma                           # MarketCompetitor*, migration + seed
prisma/migrations/…                            # create tables + seed 6 competitors

lib/rbac.ts                                    # + purchasing.market_prices.read / .manage
lib/validation/market-prices.ts                # Zod query/body/CSV schemas

lib/market-prices/
├── competitors.ts                             # slug constants, domain validation
├── catalog-prices.ts                          # MRP / PROMO / OGF batch load per SKU
├── gap.ts                                     # median, min, max, gap %, cheapest flags
├── stale.ts                                   # 14-day stale rule
├── summary.ts                                 # per-SKU MarketCompareSummary builder
├── import.ts                                  # CSV parse, validate, preview, apply
├── export.ts                                  # filtered CSV export
└── *.test.ts

app/(dashboard)/dashboard/purchasing/market-prices/page.tsx
components/organisms/market-prices-panel.tsx
components/organisms/market-prices/              # detail drawer, link form, import dialog

app/api/admin/purchasing/market-prices/page-data/route.ts
app/api/admin/purchasing/market-prices/links/route.ts
app/api/admin/purchasing/market-prices/links/[id]/route.ts
app/api/admin/purchasing/market-prices/import/route.ts      # preview + commit
app/api/admin/purchasing/market-prices/export/route.ts
app/api/admin/purchasing/market-prices/template/route.ts    # CSV template download

components/organisms/app-sidebar.tsx           # Purchasing → Market Prices nav

# P3 optional
lib/item-trends/market-gap.ts                  # badge helper for movement rows
components/organisms/item-trends/*             # gap badge column
```

**Structure Decision**: Mirror Item Trends (047) and OSF purchasing tools — pure logic in `lib/market-prices/`, thin API routes, one client panel with layer toggle + import dialog.

## Complexity Tracking

> No constitution violations requiring justification.

| Item | Phase | Notes |
|------|-------|-------|
| Item Trends gap badge | P3 | Optional; reads same summary helper |
| Fast-mover filter on compare list | P2 | Calls item-trends signal helper read-only |

## Implementation Phases (aligned with spec priorities)

### Phase 1 — Core compare list (P1 US-1)

1. Prisma migration + seed six competitors
2. RBAC permissions + sidebar nav
3. `lib/market-prices/gap.ts` + `catalog-prices.ts` + tests
4. `page-data` API + list UI with MRP/PROMO/OGF columns and layer toggle

### Phase 2 — Link management (P1 US-2)

5. Links CRUD API + link form (size mismatch confirm)
6. SKU detail drawer — six competitor slots

### Phase 3 — CSV workflow (P1 US-3)

7. Template download + import preview/commit API
8. Import dialog UI + export route

### Phase 4 — Filters & polish (P2 US-4, US-5)

9. Filters: above market, cheapest, stale, brand, competitor, search
10. Price history on link detail

### Phase 5 — Item Trends integration (P3 US-6)

11. `market-gap` helper + badge on movement table (OGF default)

## Key Integration Points

| Need | Reuse |
|------|-------|
| MRP + PROMO | `buildCatalogRows` → `compareAtPrice`, `price` |
| OGF | `ProductOsfProfile.ogfPrice` batch by SKU |
| PROMO when no sale | PROMO = catalog `price`; if `price >= compareAtPrice` treat as **no promo** (gap uses MRP-equivalent) |
| CSV parse | `parseCsvRecords` from `lib/adapt-import/csv` |
| CSV export | `buildCsv` from `lib/reports/csv` |
| Permissions | `requirePermission`, `hasPermission`, `PermissionDeniedCard` |
| Purchasing nav | `app-sidebar.tsx` under Purchasing group |
| Item Trends (P3) | `lib/item-trends/aggregate` movement SKU list + `market-gap` |

## Artifacts Generated

| Artifact | Path |
|----------|------|
| Research | [research.md](./research.md) |
| Data model | [data-model.md](./data-model.md) |
| Quickstart | [quickstart.md](./quickstart.md) |
| Contracts | [contracts/](./contracts/) |

## Next Step

Run **`/speckit-tasks`** to generate dependency-ordered `tasks.md`.
