# Implementation Plan: OSF VAT Variants

**Branch**: `056-osf-vat-variants` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/056-osf-vat-variants/spec.md`

## Summary

Cosmo OSF generate gains three variants — **Main**, **VAT**, **Non-VAT**. VAT membership comes from synced ERP Product Priority **Vat** (ERP1 and/or ERP2). VAT workbooks show Cosmetics.lk + shop ROP columns only, with **Total ROP = Cosmetics.lk ROP** (shop ROPs visible but not summed). Main and Non-VAT keep today’s ROP summing and company columns. No schema migration; extend generate API, workbook builder, and generate UI.

**Technical approach**: Add `osfVariant` to Zod + POST `/api/admin/osf/generate`; filter catalog by ERP priority; parameterize `build-workbook` (and generate-route threshold prefilter) for VAT ROP column set + Total ROP rule; reuse Cosmetics.lk / shop column detectors; UI variant selector + distinct download filenames. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod, existing `lib/osf/*`, `lib/item-trends/physical-shops.ts` / `lib/store-allocation/osf-columns.ts`, Vitest

**Storage**: Neon PostgreSQL via Prisma — **no new tables**; reuse `ProductItem` ERP priority fields, `OsfColumnConfig`, `ProductOsfRop`

**Testing**: Vitest for VAT membership helper, VAT ROP column selection, Total ROP = Cosmetics.lk only; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing (company-scoped); Vault OS out of scope

**Project Type**: Web application (Next.js app)

**Performance Goals**: Same order as current OSF generate; VAT/Non-VAT only shrink catalog before ERP bin fetch

**Constraints**: Constitution multi-DB discipline (no schema change); never invent ROP; VAT Total ROP must not sum shops; existing permissions

**Scale/Scope**: One generate panel + one API; full catalog partitioned by priority; column count as configured today

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma model / migration |
| II. Environment & Credential Isolation | **Pass** — company-scoped ERP priorities + OSF data |
| III. Test & Typecheck Gates | **Pass** — Vitest for membership + workbook ROP rules |
| IV. Production Deployment Safety | **Pass** — no prod deploy without confirmation |
| V. Simplicity & Scope Discipline | **Pass** — extend generate path; reuse column classifiers; no new column-role enum |

**Post-design re-check**: Still pass — API field + pure helpers + UI selector; ROP write paths unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/056-osf-vat-variants/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── osf-generate-variants.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
lib/osf/
├── catalog-rows.ts              # optional: variant filter helper or keep filter in route
├── vat-membership.ts            # NEW: isVatErpPriority / filterCatalogByOsfVariant
├── vat-rop-columns.ts           # NEW: pick Cosmetics.lk + shop ROP cols; totalRop for VAT
├── build-workbook.ts            # accept variant / restricted ropCols + totalRop mode
├── build-workbook.test.ts
├── vat-membership.test.ts       # NEW
└── vat-rop-columns.test.ts      # NEW

lib/validation/osf.ts            # osfVariant on osfGenerateBodySchema

app/api/admin/osf/generate/route.ts   # apply variant membership + VAT total for threshold

components/organisms/
└── osf-generate-panel.tsx       # Main / VAT / Non-VAT selector; pass osfVariant

lib/item-trends/physical-shops.ts     # reuse classifiers
lib/store-allocation/osf-columns.ts   # reuse isShopOsfColumn
lib/cosmetics-lk-location.ts          # reuse name match
```

**Structure Decision**: Extend existing Cosmo OSF generate stack; no new app package or DB models.

## Complexity Tracking

> No constitution violations requiring justification.
