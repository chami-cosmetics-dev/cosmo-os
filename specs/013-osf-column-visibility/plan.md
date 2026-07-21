# Implementation Plan: OSF Column Visibility by User

**Branch**: `013-osf-column-visibility` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-osf-column-visibility/spec.md`

## Summary

Replace hard-coded OSF Excel column rules (e.g. Cosmetics/OGF margins for named buyer sheets) with a **proper per-Cosmo-user method**: new permission `purchasing.osf.permission` unlocks a small UI on the OSF tab listing purchasing users; assigners mark which **column groups** each user may receive. On **full OSF** and **reorder-only** download, the workbook columns follow those marks. Holders of `purchasing.osf.manage` or `purchasing.osf.permission` always get the full standard column set. Buyer sheets are not used for visibility control.

**Technical approach**: Seed `purchasing.osf.permission` in RBAC; persist per-user column-group marks (company-scoped); define a fixed column-group catalog mapped to workbook headers; resolve effective groups for the downloading user in `POST /api/admin/osf/generate`; filter sheet column defs in `build-workbook`; remove `BUYERS_WITH_MARGIN_COLUMNS` / `buyerMargin` hard-coding; OSF hub panel for assignment UI.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod (`lib/validation`), existing `lib/osf/build-workbook.ts`, `lib/rbac.ts`, Vitest

**Storage**: Neon PostgreSQL via Prisma — new table for per-user OSF column-group marks; migrate via `db:migrate:create` + `db:deploy:all` (user confirmation)

**Testing**: Vitest for column-group resolution (full vs marked vs default core) and workbook header filtering; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing (company-scoped)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Assignment UI list of purchasing users &lt; 2s; generate column filter is in-memory on already-built rows (negligible vs ERP fetch)

**Constraints**: Constitution multi-DB migrate; never invent stock/cost; column marks are not a substitute for download permissions; fail closed for unknown groups; server-side enforcement only

**Scale/Scope**: Tens of purchasing users; ~5–8 column groups; one OSF-tab UI section; generate path change only (no new job queue)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — new Prisma model via `db:migrate:create` + `db:deploy:all` |
| II. Environment & Credential Isolation | **Pass** — companyId on marks; no cross-tenant |
| III. Test & Typecheck Gates | **Pass** — Vitest for visibility helpers + workbook filter |
| IV. Production Deployment Safety | **Pass** — migrate/deploy/push only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — fixed column-group catalog (not per-header UI); one table; reuse generate + build-workbook |

**Post-design re-check**: Still pass — one table + one permission + generate filter; no buyer-sheet visibility redesign beyond removing hard-coded margin names.

## Project Structure

### Documentation (this feature)

```text
specs/013-osf-column-visibility/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── osf-column-visibility.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma                              # OsfUserColumnAccess (or equiv.)
prisma/migrations/<ts>_osf_user_column_access/

lib/
├── rbac.ts                                       # purchasing.osf.permission
├── osf/
│   ├── column-groups.ts                          # group ids → workbook headers
│   ├── column-visibility.ts                      # resolveEffectiveColumnGroups(user)
│   └── build-workbook.ts                         # filter defs by groups; remove buyerMargin hardcode
├── validation/osf.ts                             # PUT body for marks
└── ...

app/api/admin/osf/
├── generate/route.ts                             # pass effective groups into workbook
└── column-access/route.ts                        # GET list + PUT marks (permission-gated)

app/(dashboard)/dashboard/purchasing/osf/page.tsx # pass canAssignColumns
components/organisms/
├── osf-hub-panel.tsx
└── osf-column-access-panel.tsx                   # small UI on OSF tab
```

**Structure Decision**: Extend existing Cosmo Next.js + Prisma OSF stack; no new app package.

## Complexity Tracking

> No constitution violations requiring justification.
