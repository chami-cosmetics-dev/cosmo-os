# Implementation Plan: SKU Supplier Compare

**Branch**: `014-sku-supplier-compare` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-sku-supplier-compare/spec.md`

## Summary

When a buyer selects a SKU in the **purchasing SKU calculator**, show every **allowlisted supplier** the company has purchased that SKU from, ranked **Best Option 1, 2, 3…** by **lowest best-ever unit price**, with **best-ever date**, **last purchase price/date**, a **Recently** tag (last purchase within 30 days), and **Last purchased from** highlight. Data comes from ERP **Purchase Receipt** history (same source as OSF latest cost). **No new DB tables** — computed on demand. Margin calculator **unchanged** (global latest cost only).

**Technical approach**: Extend `lib/osf/erp-purchases.ts` with per-SKU/per-supplier aggregation (best-ever + last purchase); add `lib/osf/supplier-compare.ts` for ranking and recency tags; new lazy `GET /api/admin/purchasing/sku-pricing/suppliers?sku=`; supplier list UI in `purchasing-sku-calculator.tsx`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, existing `lib/osf/erp-purchases.ts`, `erp-merge.ts`, `erp-cost-supplier.ts`, `lib/rbac.ts`, Zod (`lib/validation`), Vitest

**Storage**: N/A — no Prisma changes; ERP is source of truth at read time

**Testing**: Vitest for `accumulateSupplierPurchasesFromRows`, `rankSupplierOptions`, recency helpers; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing tools (`purchasing.tools.read`)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Supplier list for one SKU loads within ~5s under normal ERP latency (single-SKU lazy fetch, not on search keystroke); paginated ERP walk reuses existing `MAX_PAGES` / `PAGE_LENGTH` guards

**Constraints**: Constitution — no `db:push` to shared DBs; no schema migration required; supplier allowlist same as OSF; never invent prices; margin calculator cost not overridden on row click

**Scale/Scope**: One SKU at a time; typically 2–8 suppliers per SKU; full ERP receipt history scan per request (acceptable for calculator UX; optional item_code ERP filter if supported)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma schema change |
| II. Environment & Credential Isolation | **Pass** — `companyId` + ERP instance scoping unchanged |
| III. Test & Typecheck Gates | **Pass** — Vitest for aggregation + ranking pure helpers |
| IV. Production Deployment Safety | **Pass** — code-only deploy; no `db:deploy:all` |
| V. Simplicity & Scope Discipline | **Pass** — extend existing ERP purchase module; one lazy API; one UI panel |

**Post-design re-check**: Still pass — read-only ERP aggregation; no persistence layer; reuses OSF supplier allowlist and multi-instance merge patterns.

## Project Structure

### Documentation (this feature)

```text
specs/014-sku-supplier-compare/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── sku-supplier-compare.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/osf/
├── erp-purchases.ts              # accumulateSupplierPurchasesFromRows, fetchSupplierPurchasesBySku
├── supplier-compare.ts           # rankSupplierOptions, RECENTLY_DAYS, isRecently, labels
├── supplier-compare.test.ts
└── erp-purchases.test.ts         # extend with per-supplier cases

app/api/admin/purchasing/sku-pricing/
├── route.ts                      # unchanged search
└── suppliers/route.ts            # GET ?sku= lazy supplier list

components/organisms/
└── purchasing-sku-calculator.tsx # supplier compare panel + fetch on select
```

**Structure Decision**: Extend existing Cosmo Next.js OSF/purchasing stack; no new packages or tables.

## Complexity Tracking

> No constitution violations requiring justification.
