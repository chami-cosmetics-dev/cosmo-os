# Implementation Plan: OSF Full Column Access, Shop ROPs & ROP Import

**Branch**: `022-osf-rop-access-import` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-osf-rop-access-import/spec.md`

## Summary

Extend OSF so (1) column visibility is granted **per Excel column** via a per-user searchable **Access** multi-select (replacing the four-group checkbox matrix), (2) Cosmetics.lk **shop** OSF columns participate in item ROP editing and generate when `includeInRop` is on, (3) managers can **download/upload an all-SKU ROP template** (SKU, barcode, location + shop ROP columns) to bulk-update `ProductOsfRop`, and (4) **TOTAL ORDER QTY** / Common SKU Reorder use **signed sum floored at 0** instead of positives-only.

**Technical approach**: Evolve `OsfUserColumnAccess` from group ids → stable column access keys; shared catalog from workbook defs + active `OsfColumnConfig`; filter `build-workbook` by key (identity always on); enable shop ROP via column config; new `rop-template` GET + `rop-import` POST (xlsx, mirror product-status import patterns); replace `sumPositiveOrderQtys` with signed-floor helper.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod (`lib/validation`), `xlsx`, existing `lib/osf/*`, `lib/rbac.ts`, Vitest

**Storage**: Neon PostgreSQL via Prisma — migrate `OsfUserColumnAccess.columnGroups` → `columnKeys` (or equivalent); `ProductOsfRop` / `OsfColumnConfig` unchanged structurally; migrate via `db:migrate:create` + `db:deploy:all` (user confirmation)

**Testing**: Vitest for access-key resolution, TOTAL signed-floor math, ROP import parse/apply rules; workbook header filter tests; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing (company-scoped)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Access UI load &lt; 2s for tens of users + ~50–80 column options; ROP template generate acceptable for full catalog (stream/buffer xlsx like OSF generate); import completes with clear summary for full-catalog uploads

**Constraints**: Constitution multi-DB migrate; server-side auth + Zod; never invent stock/cost/ROP; blank import cell = no change; fail closed for unknown access keys; column marks ≠ download permission

**Scale/Scope**: Tens of purchasing users; dozens of assignable columns (static + per location/shop stock/ROP/order); one Access UX rewrite; two new ROP import routes; formula change on generate

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — schema change via `db:migrate:create` + `db:deploy:all` only with user confirmation |
| II. Environment & Credential Isolation | **Pass** — all marks/ROPs company-scoped; no cross-tenant |
| III. Test & Typecheck Gates | **Pass** — Vitest for formulas, visibility, import parse; lint/typecheck on touched files |
| IV. Production Deployment Safety | **Pass** — migrate/deploy/push only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — reuse `OsfUserColumnAccess`, `OsfColumnConfig`, `ProductOsfRop`, `xlsx`, existing OSF APIs; no new job queue for v1 |

**Post-design re-check**: Still pass — one field migration on existing access table; shop ROP is config flag (`includeInRop`), not a new entity; import is sync request with summary (same class as other admin imports).

## Project Structure

### Documentation (this feature)

```text
specs/022-osf-rop-access-import/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── osf-column-access.md
│   └── osf-rop-import.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma                              # OsfUserColumnAccess.columnKeys
prisma/migrations/<ts>_osf_user_column_keys/

lib/osf/
├── column-access-catalog.ts                      # stable ids + labels for Access UI / filter
├── column-visibility.ts                          # resolveEffectiveColumnKeys (evolve from groups)
├── column-groups.ts                              # retire or thin-wrap for migration map only
├── formulas.ts                                   # sumSignedOrderQtysFlooredAtZero
├── build-workbook.ts                             # filter by column keys; use new total helper
├── rop-import.ts                                 # parse template + apply updates
└── ...

lib/validation/osf.ts                             # PUT columnKeys; import validation helpers

app/api/admin/osf/
├── column-access/route.ts                        # GET catalog+users; PUT columnKeys
├── rop-template/route.ts                         # GET all-SKU xlsx template
├── rop-import/route.ts                           # POST multipart upload
└── generate/route.ts                             # unchanged auth; effective keys into workbook

components/organisms/
├── osf-column-access-panel.tsx                   # user list + searchable Access multi-select
├── osf-product-editor.tsx                        # already shows includeInRop columns (shops)
├── osf-columns-settings.tsx                      # ensure shop columns can toggle includeInRop
└── osf-hub-panel.tsx / osf-generate-panel.tsx    # ROP template download + upload controls
```

**Structure Decision**: Extend existing Cosmo Next.js + Prisma OSF stack; no new app package.

## Complexity Tracking

> No constitution violations requiring justification.
