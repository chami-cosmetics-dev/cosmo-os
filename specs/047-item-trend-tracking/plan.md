# Implementation Plan: Item Trends Super Dashboard

**Branch**: `047-item-trend-tracking` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/047-item-trend-tracking/spec.md`

## Summary

Build a permission-gated **Item Trends** super dashboard for purchasing and store teams: rule-based movement signals (fast/slow/new items), **outlet stock imbalance / transfer candidates**, **ROP suggestions** (window sales × 2 with increase/decrease overlay), **district leaderboard + expansion opportunities**, and (Phase 2) statistical intelligent trends. Reuse OSF completed-sales semantics, ERP live stock, existing ROP storage, and Recharts patterns from Rider performance—no new Prisma tables in v1.

## Technical Context

**Language/Version**: TypeScript — Next.js App Router (Cosmo OS web)

**Primary Dependencies**: Next.js, Prisma, Zod, Auth0 (`@auth0/nextjs-auth0`), Recharts + `components/ui/chart.tsx`, existing OSF libs (`assist-sales`, `sku-column-stock`, `column-config`)

**Storage**: Neon PostgreSQL (existing models only); ERP live stock via existing bin fetch; RBAC permission seed via `lib/rbac.ts`

**Testing**: Vitest for `lib/item-trends/*` (aggregation, signals, ROP formula, transfer rules, district grouping); manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS `/dashboard/purchasing/item-trends` (web admin)

**Project Type**: Web application — server page + API routes + client analytics panel

**Performance Goals**: Initial page-data (movement + KPIs) < 5s p95 for 7-day range; list sections capped at 100 rows with pagination; parallel district/outlet fetches

**Constraints**: Constitution I — no `db:push` on shared DBs; v1 no new migrations (permission via RBAC sync only); ROP writes only through existing OSF PATCH; transfer suggestions read-only; Asia/Colombo calendar boundaries

**Scale/Scope**: Full SKU catalog for ROP tab (paginated); ~25 districts; tens of outlet columns; purchasing + scoped store users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | **PASS** | v1 adds permission via RBAC seed only—no Prisma migration. If snapshot/cache table added later, use `db:migrate:create` + `db:deploy:all` |
| II. Environment & Credential Isolation | **PASS** | Company-scoped queries; ERP stock uses existing per-target credentials |
| III. Test & Typecheck Gates | **PASS** | Vitest for new `lib/item-trends/`; lint clean on touched files |
| IV. Production Deployment Safety | **PASS** | Plan does not push `main` or run prod deploy |
| V. Simplicity & Scope Discipline | **PASS** | Derived read models, reuse OSF/ROP/stock paths; intelligent engine deferred to Phase 2 statistical layer (no LLM v1) |

**Post-design re-check:** **PASS** — four read API contracts extend existing patterns; no new entities; ROP apply delegates to OSF routes.

## Project Structure

### Documentation (this feature)

```text
specs/047-item-trend-tracking/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── item-trends-page-data.md
│   ├── item-trends-districts.md
│   ├── item-trends-outlets.md
│   └── item-trends-rop.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
lib/rbac.ts                                    # + purchasing.item_trends.read
lib/validation.ts                              # + itemTrendsQuerySchema
lib/item-trends/
├── aggregate.ts                               # SKU units, speed, comparison windows
├── signals.ts                                 # fast/slow/new/pattern rule engine
├── district.ts                                # district leaderboard, expansion, area growth
├── outlets.ts                                 # per-outlet stock + movement + transfers
├── rop-suggest.ts                             # window sales × 2 + overlay
└── intelligent.ts                             # Phase 2 statistical signals

app/(dashboard)/dashboard/purchasing/item-trends/page.tsx
components/organisms/item-trends-panel.tsx
components/organisms/item-trends/              # zone sub-panels (optional split)

app/api/admin/purchasing/item-trends/page-data/route.ts
app/api/admin/purchasing/item-trends/districts/route.ts
app/api/admin/purchasing/item-trends/outlets/route.ts
app/api/admin/purchasing/item-trends/rop/route.ts

components/organisms/app-sidebar.tsx           # Purchasing → Item Trends nav

lib/item-trends/*.test.ts
```

**Structure Decision**: Single Next.js app layout following Rider performance + OSF assist patterns—`lib/item-trends/` for pure aggregation logic, thin API routes, one main client panel with tabbed zones.

## Complexity Tracking

> No constitution violations requiring justification.

| Item | Phase | Notes |
|------|-------|-------|
| Intelligent trend engine | Phase 2 | Statistical layer only; avoids LLM ops complexity in v1 |
| In-memory district aggregation | v1 | Upgrade to SQL GROUP BY if perf fails SC targets |

## Implementation Phases (aligned with spec rollout)

### Phase 1 — Core dashboard (P1 user stories)

1. RBAC: `purchasing.item_trends.read` + sidebar nav
2. Page shell + `item-trends-panel` (KPI cards, date range, priority filter)
3. `page-data` API: movement, new items, slowdowns, KPIs
4. Outlets API + transfer candidates UI
5. ROP API + suggestion table; link apply to OSF PATCH
6. Store scoping via `EmployeeProfile.locationId`

### Phase 2 — Geography (P1 district stories + P2 area growth)

7. Districts API: leaderboard, drill-down, expansion panel
8. Item × district matrix visual
9. Area growth status column

### Phase 3 — Patterns + intelligent engine (P2)

10. Weekday pattern zone (≥28 day range)
11. `intelligent.ts` statistical signals + degraded-mode banner

### Phase 4 — Workflow (P3)

12. Focus list (client state) + CSV export
13. Period comparison modal

## Key Integration Points

| Need | Reuse |
|------|-------|
| Unit sales | `osfCompletedSalesOrderWhere`, `aggregateSalesBySkuInRange` |
| Per-outlet sales | `salesByOsfColumnLast90d` attribution pattern |
| Live stock | `fetchSkuColumnLiveStock` |
| Current ROP | `ProductOsfRop` + `resolveOsfColumns` |
| ROP save | `PATCH /api/admin/osf/profiles/[sku]` |
| District | `resolveAddressDistrict` |
| Charts | `ChartContainer`, `rider-performance-panel` layout |
| Permissions | `hasPermission`, `requirePermission`, `PermissionDeniedCard` |

## Artifacts Generated

| Artifact | Path |
|----------|------|
| Research | [research.md](./research.md) |
| Data model | [data-model.md](./data-model.md) |
| Quickstart | [quickstart.md](./quickstart.md) |
| Contracts | [contracts/](./contracts/) |

## Next Step

Run **`/speckit-tasks`** to generate dependency-ordered `tasks.md` for implementation.
