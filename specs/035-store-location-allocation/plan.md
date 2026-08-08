# Implementation Plan: Store Location Allocation

**Branch**: `035-store-location-allocation` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-store-location-allocation/spec.md`

## Summary

Build a **store-support allocation advisor**: search items by SKU/barcode (scanner-friendly), show priority + company **TOTAL ORDER QTY**, let the user enter **take qty**, suggest a split across **all active OSF ROP locations** using weight `need × (1 + sales)` (need = ROP − stock; sales = Cosmo completed units last 30 days per location), allow manual edits, and **export/print** the plan — **no** automatic stock transfers.

**Technical approach**: New dashboard page + APIs under store allocation; reuse `computeTotalOrderQtyForSkus`, `resolveOsfColumns`, ERP stock bins, and OSF completed-sales filters; add SKU×location sales aggregation and a dedicated permission (not purchasing OSF). Pure allocate math in a Vitest-covered helper.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma, Zod (`lib/validation`), existing `lib/osf/*` (formulas, column-config, erp-stock, assist-sales / monthly-sales patterns), ExcelJS or `xlsx` for export, RBAC (`requirePermission`), Vitest

**Storage**: No new business tables for v1 plans (export/print only). Read: `ProductItem`, `ProductOsfRop`, `OsfColumnConfig`, `Order`/`OrderLine`, `CompanyLocation`, ERP bins. New **Permission** row (data seed / ensure-default), not a Prisma schema migration unless permission bootstrap requires it

**Testing**: Vitest for allocate math (need×sales, caps, integer remainder); manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS web dashboard — store-support page (Fulfillment or Store nav)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Item lookup + TOTAL ORDER QTY + location table for one SKU under ~5s under normal ERP/DB latency; export instant after plan is valid

**Constraints**: Constitution — no `db:push` to shared DBs; no invented stock/sales/ROP; take qty whole numbers; location qtys sum to take qty on export; scanners = keyboard wedge

**Scale/Scope**: One SKU at a time; typically dozens of OSF ROP locations; 30-day sales window

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma model migration for allocation plans; permission ensure via existing RBAC seed/upsert pattern (no schema change) |
| II. Environment & Credential Isolation | **Pass** — `companyId` + ERP instance scoping unchanged |
| III. Test & Typecheck Gates | **Pass** — Vitest for allocate helper; CI unchanged |
| IV. Production Deployment Safety | **Pass** — code deploy; no forced prod DB deploy beyond normal permission seed if used |
| V. Simplicity & Scope Discipline | **Pass** — advisor + export only; reuse OSF helpers; no ERP transfer automation |

**Post-design re-check**: Still pass — read-mostly feature; zip/export thin; allocate pure function.

## Project Structure

### Documentation (this feature)

```text
specs/035-store-location-allocation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── store-location-allocation.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/store/allocation/
└── page.tsx                              # server gate + panel

components/organisms/
└── store-location-allocation-panel.tsx   # search, take qty, table, export/print

lib/store-allocation/
├── allocate.ts                           # need×(1+sales), caps, largest remainder
├── allocate.test.ts
├── location-sales.ts                     # SKU × OSF column, last 30d Cosmo completed
└── export-plan.ts                        # xlsx or printable rows

app/api/admin/store-allocation/
├── lookup/route.ts                       # GET q= SKU/barcode → item + TOTAL ORDER QTY + priorities
├── plan/route.ts                         # GET sku + takeQty → location rows (rop, stock, sales, suggested)
└── export/route.ts                       # POST validated plan → xlsx download

lib/rbac.ts                               # store.allocation.read (or store.support.allocate)
lib/validation/                           # Zod for lookup/plan/export
components/organisms/app-sidebar.tsx      # nav link for permitted users
```

**Structure Decision**: New store allocation area separate from purchasing OSF hub; reuse OSF computation libraries without exposing full OSF manage UI to store users.

## Complexity Tracking

> No constitution violations requiring justification.
