# Implementation Plan: Unified Sticker Batch & Print

**Branch**: `018-sticker-batch-print` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-sticker-batch-print/spec.md`

## Summary

Unify Sticker Batch and Sticker Print into one Batch & Print workspace, and fix Cosmo sticker data quality: strip “(Default Title)” from names, print main Cosmetics.lk company address (not location address), auto-normalize compact MFD inputs and default EPD to MFD + 3 years (editable), use original/list price (`compareAtPrice ?? price`) instead of discounted `price`, and when location is LWK use `ProductOsfProfile.ogfPrice`. Preserve feature 016 quantity expand/print behavior.

**Technical approach**: Evolve `sticker-batch` into the primary workspace (embed print sheet + print handler from print client). Redirect `/dashboard/sticker-print` → batch page. Extract shared helpers for name cleaning, compact date parse/normalize, and sticker unit-price resolution. Extend batch page catalog load with `compareAtPrice` + OGF price map by SKU. Cosmo `StickerPreviewCard` prefers `companyAddress`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, React, Prisma, Zod (`@/lib/validation`), Auth0 RBAC (`requirePermission`), existing sticker cards, `lib/sticker-print-quantity.ts` (016), Vitest

**Storage**: Existing Prisma models only (`StickerBatch`, `StickerBatchItem`, `ProductItem`, `ProductOsfProfile`, `Company`, `CompanyLocation`) — no new tables/migrations expected

**Testing**: Vitest for date normalize, name clean, price resolve (incl. LWK); manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS / Vault OS web admin (unified `/dashboard/sticker-batch`)

**Project Type**: Web application (Next.js App Router + admin APIs)

**Performance Goals**: Combined page remains usable for typical batch sizes; print expansion stays on Print click (016 pattern)

**Constraints**: Server-side auth + Zod on mutations; Cosmo vs Vault layout differences preserved; Constitution simplicity — merge UI, extract small pure helpers, no speculative redesign of label art

**Scale/Scope**: One primary page/client merge, redirects + nav, ~3 lib helpers + tests, Cosmo preview address tweak, catalog/page-data enrichment for prices

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no schema/migration changes expected |
| II. Environment & Credential Isolation | **Pass** — no new secrets; Cosmo vs Vault via existing `NEXT_PUBLIC_APP_NAME` |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy |
| V. Simplicity & Scope Discipline | **Pass** — unify into existing batch page; redirect print; small helpers; reuse 016 print quantity |

**Post-design re-check**: Still pass — no new tables; OGF price read from existing `ProductOsfProfile`; address fix is Cosmo card preference only.

## Project Structure

### Documentation (this feature)

```text
specs/018-sticker-batch-print/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sticker-batch-print.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/
├── sticker-print-quantity.ts          # preserve (016)
├── sticker-item-name.ts               # strip Default Title
├── sticker-dates.ts                   # compact MFD parse + EPD = MFD+3y
├── sticker-unit-price.ts              # compareAt ?? price; LWK → ogfPrice
└── *.test.ts                          # Vitest for the three new helpers

app/(dashboard)/dashboard/sticker-batch/
├── page.tsx                           # load compareAtPrice + ogf map; widen auth as needed
└── sticker-batch-client.tsx           # unified UI: batch + print sheet/handler

app/(dashboard)/dashboard/sticker-print/
└── page.tsx                           # redirect → /dashboard/sticker-batch?...

components/organisms/
├── sticker-preview-card.tsx           # Cosmo: prefer companyAddress
├── vault-sticker-preview-card.tsx     # unchanged address; already cleans Default Title
├── app-sidebar.tsx                    # single Batch & Print nav
└── topbar.tsx                         # title for combined route

app/api/admin/sticker-batches/         # keep contracts; dates remain DD/MM/YYYY on wire
```

**Structure Decision**: Make `sticker-batch` the unified workspace; soft-retire dedicated print page via redirect. Extract pure helpers under `lib/` for testability. Do not fork Vault address behavior.

## Complexity Tracking

> No constitution violations requiring justification.
