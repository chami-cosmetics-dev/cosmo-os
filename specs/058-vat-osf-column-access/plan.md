# Implementation Plan: VAT OSF Column Access & Shop Columns

**Branch**: `058-vat-osf-column-access` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/058-vat-osf-column-access/spec.md`

## Summary

Extend Cosmo OSF so (1) per-user Excel column Access is **per variant** (Main / VAT Items / Others), with new variants starting **empty** (fail closed); (2) rename UI/download identity from “VAT OSF” to **VAT Items OSF**; (3) VAT Items workbooks omit non–Cosmetics.lk **location** columns for stock/ROP/order (shared non-location columns stay); (4) qualifying new Cosmetics ERP1 **shop warehouses** auto-create `OsfColumnConfig` shop columns (stock+ROP on) and appear on all three variants where shops apply.

**Technical approach**: Migrate `OsfUserColumnAccess` to include `osfVariant`; variant-scoped GET/PUT column-access + generate filter; extend VAT column selectors beyond ROP to stock/order; sync helper from ERP1 warehouses using `isShopWarehouseName`; rename labels/filenames only (keep enum `vat`). Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod, ExcelJS (existing OSF generate), existing `lib/osf/*`, `lib/item-trends/physical-shops.ts`, ERPNext warehouse list patterns (`lib/store-stock-count/erp.ts`), Vitest

**Storage**: Neon PostgreSQL via Prisma — migrate `OsfUserColumnAccess` to add `osfVariant` + new unique `(companyId, userId, osfVariant)`; reuse `OsfColumnConfig` for auto shop columns; migrate via `db:migrate:create` + `db:deploy:all` (user confirmation)

**Testing**: Vitest for variant access resolution, VAT stock/ROP column filter, shop warehouse → column key upsert rules; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing (company-scoped); Vault OS out of scope

**Project Type**: Web application (Next.js app)

**Performance Goals**: Access UI load same order as today with variant switch; shop sync adds one ERP warehouse list call before generate/columns refresh (cacheable short-term if needed); generate latency unchanged beyond existing bin fetch for new shop warehouses

**Constraints**: Constitution multi-DB migrate; fail closed Access; never invent stock/ROP; VAT Total ROP remains Cosmetics.lk only; shop auto-create Cosmetics ERP1 + shop-name rules only; Access marks ≠ download permission

**Scale/Scope**: Three Access profiles per purchasing user; tens of location/shop access keys; auto-create on the order of Cosmetics shop warehouses (single digits → low tens)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — schema change via `db:migrate:create` + `db:deploy:all` only with explicit user confirmation |
| II. Environment & Credential Isolation | **Pass** — company-scoped access + OSF columns; ERP1 Cosmetics instance only for shop sync |
| III. Test & Typecheck Gates | **Pass** — Vitest for access/variant filters + shop sync helpers; lint on touched files |
| IV. Production Deployment Safety | **Pass** — no prod migrate/deploy/push without confirmation |
| V. Simplicity & Scope Discipline | **Pass** — extend existing access table + VAT helpers + one sync module; no new job queue |

**Post-design re-check**: Still pass — one migration on `OsfUserColumnAccess`; shop columns stay `OsfColumnConfig` rows; sync reuses shop-name heuristics and Cosmetics.lk ERP instance mapping from seed script patterns.

## Project Structure

### Documentation (this feature)

```text
specs/058-vat-osf-column-access/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── osf-column-access-variants.md
│   └── osf-shop-column-sync.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<ts>_osf_user_column_access_variant/

lib/osf/
├── column-access-catalog.ts       # build catalog filtered by OsfVariant (VAT: no other-location keys)
├── column-visibility.ts           # resolveEffectiveOsfColumnKeys(…, variant); load marks by variant
├── vat-rop-columns.ts             # extend / sibling: selectVatStockColumns (Cosmetics.lk + shops)
├── vat-membership.ts              # OsfVariant unchanged (main | vat | non_vat)
├── build-workbook.ts              # VAT: filter stockCols + order like ROP; Total Stock over VAT set
├── shop-column-sync.ts            # NEW: ensure Cosmetics shop columns from ERP1 warehouses
└── *.test.ts

lib/validation/osf.ts              # osfVariant on column-access PUT/GET; keep generate schema

app/api/admin/osf/
├── column-access/route.ts         # ?osfVariant=; persist per-variant marks
├── generate/route.ts              # resolve access for request osfVariant; optional ensure shops
└── columns/route.ts               # optional: ensure shops on GET manage path

components/organisms/
├── osf-column-access-panel.tsx    # variant selector (Main / VAT Items / Others)
└── osf-generate-panel.tsx         # “VAT Items OSF” labels + filenames

lib/item-trends/physical-shops.ts  # reuse isShopWarehouseName
scripts/seed-osf-cosmo-shop-columns.mjs  # pattern reference; sync replaces manual adds going forward
```

**Structure Decision**: Extend existing Cosmo Next.js + Prisma OSF stack; no new app package.

## Complexity Tracking

> No constitution violations requiring justification.
