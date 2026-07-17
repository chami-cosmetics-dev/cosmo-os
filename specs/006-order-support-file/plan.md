# Implementation Plan: Order Support File (OSF) Generator

**Branch**: `006-order-support-file` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-order-support-file/spec.md`

## Summary

Replace the manual Cosmetics **Order Support File** Excel with an in-OS workflow: maintain **Shop Availability** and per-column **ROP** in Cosmo UI (no Excel import in v1), map OSF location columns to Cosmo locations / ERP warehouses, and **generate** a Main-sheet XLSX on demand from Cosmo catalog + ERP Bin stock/cost/supplier + Cosmo monthly sales + calculated reorder guidance.

**Technical approach**: New company-scoped OSF profile + ROP tables (SKU-keyed, independent of per-location `ProductItem` rows); admin UI on Product Items / a dedicated OSF panel; generation service that batches ERP `Bin` + latest cost/supplier lookups and emits XLSX via existing `xlsx` dependency; RBAC permission for generate/edit.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod (`lib/validation`), existing ERPNext client patterns (`lib/erpnext-sync.ts` / resource fetch), `xlsx` (already used for merchant-reviews / dispatch-summary exports), Vitest

**Storage**: Neon PostgreSQL via Prisma — **new** models for OSF profile (shop availability), OSF ROP rows, OSF column mapping; migrate via `db:migrate:create` + `db:deploy:all`

**Testing**: Vitest for base-SKU grouping, reorder/70% formulas, monthly sales date attribution, column mapping; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS first (Cosmetics); Vault out of scope for v1

**Project Type**: Web application (Next.js app)

**Performance Goals**: Generate Main OSF for ~1–2k SKUs within 5 minutes (SC-001); prefer batched ERP list calls over per-SKU N+1; sync download acceptable for v1 if under that budget

**Constraints**: Constitution multi-DB migrate; never invent stock/cost/ROP; ERP stock authoritative; **OGF columns kept as in Excel** (independent price, not LWK-matched); no Excel import in v1; UI-only ROP + Shop Availability (+ OGF Price if set)

**Scale/Scope**: Catalog ~1k–2k variants; ~10–15 OSF location/ROP columns; one generate API + UI edit surfaces; filtered assignee sheets (Randil/Inoka) deferred to P3

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — new tables via `npm run db:migrate:create` + `db:deploy:all` (vault, cosmo-dev, cosmo-prod). No `db:push` on shared DBs |
| II. Environment & Credential Isolation | **Pass** — ERP Bin/cost calls use each company’s `ErpnextInstance` credentials; Cosmetics-first enablement |
| III. Test & Typecheck Gates | **Pass** — Vitest for pure OSF helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — migrate/deploy/push only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — reuse `xlsx` + product panel patterns; no import pipeline; no async job unless sync proves too slow |

**Post-design re-check**: Still pass — SKU-level OSF tables justified; column-config justified; OGF Price is optional UI field on OSF profile (not derived from LWK).

## Project Structure

### Documentation (this feature)

```text
specs/006-order-support-file/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── osf-generator.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<ts>_osf_profile_rop_columns/

lib/
├── osf/
│   ├── base-sku.ts                 # strip _N / -N → common group key
│   ├── formulas.ts                 # %, 70% ROP, availability label, order qty
│   ├── monthly-sales.ts            # aggregate OrderLineItem by sku + month rules
│   ├── erp-stock.ts                # batch Bin actual_qty by warehouse + item
│   ├── erp-cost-supplier.ts        # latest cost + supplier per item
│   ├── build-workbook.ts           # assemble rows + xlsx buffer
│   └── column-config.ts            # resolve OsfColumnConfig → warehouses
├── validation/osf.ts               # Zod for ROP / availability / generate body
└── rbac.ts                         # purchasing.osf.read / purchasing.osf.manage

app/api/admin/osf/
├── columns/route.ts                # GET/PUT column mapping (settings)
├── generate/route.ts               # POST → xlsx download
└── profiles/
    ├── route.ts                    # list/search profiles + rops
    └── [sku]/route.ts             # PATCH shopAvailability + ROP map

app/(dashboard)/dashboard/
├── products/…                      # extend product items UI OR
└── purchasing/osf/page.tsx         # OSF hub: edit + generate

components/organisms/
├── osf-generate-panel.tsx
├── osf-product-editor.tsx          # availability + per-column ROP
└── osf-columns-settings.tsx        # map labels → locations

app/api/admin/product-items/…       # optional PATCH hooks if editing inline
```

**Structure Decision**: Single Next.js app. Company-scoped OSF tables (not per `ProductItem` location row). Generation is a dedicated admin API returning XLSX. Product catalog identity continues to come from existing `ProductItem` / Vendor.

## Complexity Tracking

> No constitution violations requiring justification.
