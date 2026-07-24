# Implementation Plan: OSF Live Refresh & ROP Assist

**Branch**: `023-osf-rop-assist` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-osf-rop-assist/spec.md`

## Summary

When a user opens the OSF page, Cosmo refreshes **Product Priority from both ERPs** and loads **live stock** for OSF columns. A new **ROP Assist** work list defaults to **Top Priority** items (all items filterable). For each SKU, sales are counted from **last purchase date → today** (else **last 30 days → today**). **Suggested ROP = that sales total** (Option A). Managers review, edit, and **explicitly save**; no silent overwrite. Existing OSF generate continues to use saved `ProductOsfRop` + live ERP stock on download.

**Technical approach**: Reuse `syncErpProductPriorities`, OSF column/stock helpers, and ERP last-purchase fetch; add date-range sales aggregation (generalize monthly-sales pattern); new assist page-data + batch ROP save APIs; hub panel with Top Priority filter, refresh status, accept/edit/save.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, Zod, existing `lib/osf/*`, `lib/product-items/erp-priority-sync.ts`, Vitest

**Storage**: Neon PostgreSQL via Prisma — **no new tables** for suggestions (computed); persist only via existing `ProductOsfRop` / `ProductItem` priority fields

**Testing**: Vitest for assist window bounds, suggested ROP rounding, sales-in-window aggregation helpers; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS purchasing (company-scoped)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Priority sync + first assist page (&lt;50–100 Top Priority rows) usable within ~30–60s when ERPs healthy; show progress for long sync; paginate assist list

**Constraints**: Constitution multi-DB discipline (no schema change expected); never invent stock/sales/ROP; partial ERP failure surfaced; `purchasing.osf.manage` to save; Colombo business dates

**Scale/Scope**: Full catalog filterable; default Top Priority subset; bulk accept for tens–hundreds of rows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no Prisma model change expected; if any appears, `db:migrate:create` + user-confirmed deploy |
| II. Environment & Credential Isolation | **Pass** — company-scoped ERP + Cosmo data |
| III. Test & Typecheck Gates | **Pass** — Vitest for window/suggestion helpers |
| IV. Production Deployment Safety | **Pass** — no prod deploy without confirmation |
| V. Simplicity & Scope Discipline | **Pass** — reuse sync/stock/purchase/sales patterns; computed suggestions; no auto-ROP job |

**Post-design re-check**: Still pass — endpoints + UI + pure helpers; ROP write path reuses existing upsert semantics.

## Project Structure

### Documentation (this feature)

```text
specs/023-osf-rop-assist/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── osf-rop-assist.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
lib/osf/
├── assist-window.ts          # purchase→today / 30-day fallback; suggested ROP
├── assist-sales.ts           # sales units by SKU for [start, end) Colombo
├── monthly-sales.ts          # keep; share completion filters with assist-sales
├── erp-stock.ts              # reuse bin fetch
└── erp-purchases.ts          # reuse last purchase date

lib/product-items/erp-priority-sync.ts   # reuse on OSF open

app/api/admin/osf/assist/
├── refresh/route.ts          # POST: sync priorities (+ optional warm)
├── page-data/route.ts        # GET: work list metrics
└── rops/route.ts             # PUT: batch accept/edit save

components/organisms/
├── osf-hub-panel.tsx         # mount assist panel
└── osf-rop-assist-panel.tsx  # list, refresh, accept/save
```

**Structure Decision**: Extend existing OSF hub; no new app package.

## Complexity Tracking

> No constitution violations requiring justification.
