# Implementation Plan: OSF Supplier Orders

**Branch**: `031-osf-supplier-orders` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-osf-supplier-orders/spec.md`

## Summary

Add an **OSF Supplier Orders** builder on the OSF purchasing hub: optional brand (vendor) + existing ERP priority filters, SKU search that lists filtered items with empty query (SKU + description), add rows to a working table with **read-only TOTAL ORDER QTY**, split quantities across suppliers (empty skipped; under-allocation OK; over-allocation blocked), persist the draft in **same-browser storage**, and **Generate** a **zip** of one Excel per supplier (SKU, description, order qty).

**Technical approach**: New hub panel + `page-data` / search / suppliers / generate APIs under `/api/admin/osf/supplier-orders/`. Reuse OSF catalog filters, `orderQty` / `sumSignedOrderQtysFlooredAtZero`, supplier allowlist + purchase recency (014 patterns), ExcelJS workbooks, and existing hand-rolled `createZip`. No Prisma schema changes — draft lives in `localStorage`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma (read-only for this feature), ExcelJS, Zod (`lib/validation`), existing `lib/osf/*` (catalog, formulas, erp stock/purchases, supplier-compare), RBAC (`requirePermission`), Vitest

**Storage**: No new tables. Working draft in browser `localStorage`. Product/vendor/ROP/supplier data from Cosmo DB; stock + purchase history from ERP at read time

**Testing**: Vitest for allocation validation, supplier sort, zip packaging helpers, reorder-qty wiring; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS web dashboard — `/dashboard/purchasing/osf`

**Project Type**: Web application (Next.js app)

**Performance Goals**: Filtered item search first page (&lt;200 rows) usable within ~3s under normal ERP/DB latency when reorder qty is precomputed for the page; supplier list for one SKU within ~5s (reuse 014 lazy pattern); generate zip for typical drafts (&lt;100 lines, &lt;10 suppliers) under ~10s

**Constraints**: Constitution — no `db:push` to shared DBs; no migration for v1; same OSF purchasing permission class as generate; never invent stock/ROP/suppliers; empty suppliers skipped; sum(supplier qty) ≤ read-only TOTAL ORDER QTY when TOTAL ORDER QTY &gt; 0

**Scale/Scope**: One purchasing user draft per browser; catalogs may be thousands of SKUs (paginate search); typically few dozen table rows and a handful of suppliers per generate

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma schema / migration |
| II. Environment & Credential Isolation | **Pass** — `companyId` + existing ERP instance scoping |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure helpers + generate validation; CI gates unchanged |
| IV. Production Deployment Safety | **Pass** — code-only deploy; no `db:deploy:all` |
| V. Simplicity & Scope Discipline | **Pass** — hub panel + focused APIs; reuse formulas, allowlist, ExcelJS, `createZip`; localStorage not server drafts |

**Post-design re-check**: Still pass — no new persistence schema; zip via existing `createZip`; reorder qty = existing TOTAL ORDER QTY pipeline; brand = Vendor.

## Project Structure

### Documentation (this feature)

```text
specs/031-osf-supplier-orders/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── osf-supplier-orders.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/purchasing/osf/
└── page.tsx                          # pass flags / mount via hub (unchanged route)

components/organisms/
├── osf-hub-panel.tsx                 # mount supplier-orders panel
└── osf-supplier-orders-panel.tsx     # filters, search, table, allocate, generate, clear

lib/osf/
├── formulas.ts                       # reuse TOTAL ORDER QTY helpers
├── catalog-rows.ts                   # reuse / thin wrap for filtered SKU list
├── supplier-orders-draft.ts          # localStorage key, load/save/clear types
├── supplier-orders-allocate.ts       # validate under/over allocation
├── supplier-orders-export.ts         # build per-supplier Excel buffers + zip
└── *.test.ts                         # unit tests for allocate + export

app/api/admin/osf/supplier-orders/
├── page-data/route.ts                # vendors (brands), priority options, permission
├── items/route.ts                    # GET filtered items (q, brand, priority) + TOTAL ORDER QTY
├── suppliers/route.ts                # GET suppliers for SKU (recent-first)
└── generate/route.ts                 # POST draft → zip of supplier Excels

lib/validation/
└── osf.ts                            # extend with supplier-orders Zod schemas

lib/falcon-upload.ts                  # reuse createZip (or thin re-export from lib/zip if extracted later)
```

**Structure Decision**: Single Next.js app — new OSF hub panel + `/api/admin/osf/supplier-orders/*` routes; no new packages required (ExcelJS + existing `createZip`).

## Complexity Tracking

> No constitution violations requiring justification.
