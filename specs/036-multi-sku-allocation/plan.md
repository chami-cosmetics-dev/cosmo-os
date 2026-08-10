# Implementation Plan: Multi-SKU Location Allocation

**Branch**: `036-multi-sku-allocation` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-multi-sku-allocation/spec.md`

## Summary

Extend the existing **Store Location Allocation** advisor so store users can scan/add **multiple SKUs/barcodes** into one session, enter **take qty per SKU** (starts blank), compute each SKU’s location split with the current `need × (1 + sales)` rules (90-day Cosmo sales), then review packing via a **location walkthrough** (one location popup/step showing all items’ qtys for that location; arrow keys; **skip all-zero locations**), and **export/print** one multi-item plan — still **no** ERP stock transfers.

**Technical approach**: Evolve `store-location-allocation-panel` into a session list + walkthrough UI; reuse lookup/plan/allocate helpers; add multi-SKU plan batching (client fan-out or thin batch API); extend export workbook with per-SKU sheets/sections + location-oriented summary; pure helpers for walkthrough sequence (non-empty locations) covered by Vitest.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma, Zod (`lib/validation/store-allocation`), existing `lib/store-allocation/*`, `lib/osf/*`, `xlsx`, RBAC `store.allocation.read`, Vitest, existing UI (`Sheet`/`Dialog`, Button, Input)

**Storage**: No new Prisma models/migrations — session state is **client-only** (in-memory React state). Reads same sources as 035 (ProductItem, ProductOsfRop, OsfColumnConfig, orders/sales, ERP bins)

**Testing**: Vitest for walkthrough sequence builder (skip zeros, order, arrow index) and multi-item export sum validation; keep allocate unit tests; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS web dashboard — `/dashboard/store/allocation`

**Project Type**: Web application (Next.js app)

**Performance Goals**: Add 5 SKUs + enter take qtys under 2 minutes (SC-001); plan fetch for one SKU remains ~same as today; batching ≤50 SKUs with sequential/limited-parallel plan calls so UI stays responsive; walkthrough open/navigation instant (client-derived)

**Constraints**: Constitution — no `db:push` to shared DBs; no invented stock/sales/ROP; max **50** items/session; per-SKU location qtys must sum to take qty on export; scanners = keyboard wedge; arrow keys must not steal focus while editing qty inputs

**Scale/Scope**: Up to 50 SKUs × dozens of OSF ROP locations; walkthrough only visits locations with ≥1 item qty &gt; 0

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma schema/migration |
| II. Environment & Credential Isolation | **Pass** — same `companyId` + ERP scoping as 035 |
| III. Test & Typecheck Gates | **Pass** — Vitest for new pure helpers; CI unchanged |
| IV. Production Deployment Safety | **Pass** — code-only deploy |
| V. Simplicity & Scope Discipline | **Pass** — extend existing page/APIs; no ERP transfers; no durable drafts |

**Post-design re-check**: Still pass — client session + reuse of allocate/plan/export; optional thin batch plan API only if single-SKU fan-out is too slow (YAGNI until measured).

## Project Structure

### Documentation (this feature)

```text
specs/036-multi-sku-allocation/
├── plan.md              # This file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── multi-sku-allocation.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/store/allocation/
└── page.tsx                              # unchanged gate (store.allocation.read)

components/organisms/
└── store-location-allocation-panel.tsx   # session list + take qtys + walkthrough + export

components/molecules/                     # optional extract if panel grows
└── store-allocation-location-step.tsx    # one location popup content

lib/store-allocation/
├── allocate.ts                           # reuse
├── location-sales.ts                     # reuse (90d)
├── export-plan.ts                        # extend multi-SKU workbook
├── walkthrough.ts                        # buildNonEmptyLocationSteps(plans)
├── walkthrough.test.ts
└── auth.ts                               # reuse

app/api/admin/store-allocation/
├── lookup/route.ts                       # reuse (add-to-list from client)
├── plan/route.ts                         # reuse per SKU (client calls N times or later batch)
└── export/route.ts                       # accept multi-item body

lib/validation/store-allocation.ts        # multi export schema; MAX_SESSION_ITEMS = 50
```

**Structure Decision**: Single Next.js app — evolve the existing store allocation surface rather than a new route. Pure walkthrough/export helpers stay in `lib/store-allocation` for testability.

## Complexity Tracking

> No constitution violations requiring justification.
