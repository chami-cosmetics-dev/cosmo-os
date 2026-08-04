# Implementation Plan: Dashboard Sales Filter Views

**Branch**: `030-dashboard-sales-filters` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-dashboard-sales-filters/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Replace the dashboard’s mixed/confusing Date Type radios with **plain-named filter groups** that show **total amounts** for each view. Default remains **today**. Primary clock is **order placed** (`createdAt`). Current-status partitions of **All orders** add up without double-counting **Bill done early**. Separate scoreboards cover dual-date “complete in range,” earlier-placed events in range, and any-day backlog. Reuse existing Cosmo OS dashboard sales aggregation (`lib/page-data/dashboard-sales.ts`, sales-by-location API, filters/overview UI)—extend filter enums, eligibility, summary totals endpoint/payload, and filter UI—**no Prisma schema change**.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: Prisma, Zod (`lib/validation.ts`), existing dashboard overview context + sales-by-location / brand-sales APIs, React client filter slot

**Storage**: Neon PostgreSQL — existing `Order` fields only (`createdAt`, `deliveryCompleteAt`, `invoiceCompleteAt`, `fulfillmentStage`, `financialStatus`, `sourceName`, `totalPrice`, location/merchant attribution). No new tables/columns.

**Testing**: Vitest unit tests for filter builders, eligibility, partition tally (no double-count); extend `lib/page-data/dashboard-sales.test.ts`; manual dashboard smoke for today + range totals

**Target Platform**: Cosmo OS admin/dashboard web (company-scoped)

**Project Type**: Web application (API routes + client dashboard organisms)

**Performance Goals**: Filter summary totals for the active date range visible within ~10s on typical company day volume (SC-002); prefer one overview refresh returning summaries + active chart data rather than N full chart fetches per chip

**Constraints**: Colombo day boundaries; voided excluded; POS excluded from delivery-focused filters; plain labels (FR-019); constitution simplicity—extend existing dashboard sales path, do not invent a parallel reporting stack

**Scale/Scope**: One dashboard surface; ~10–14 named filters across 3 groups; location/merchant/gateway charts keep current breakdown shape

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: No schema migration; Order fields already exist.
- **II. Environment & Credential Isolation — PASS**: No new secrets; company-scoped queries unchanged.
- **III. Test & Typecheck Gates — PASS**: Unit tests for filter math/eligibility; `npm test` before merge.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or run prod migrate.
- **V. Simplicity & Scope Discipline — PASS**: Extend `DashboardSalesDateType` + sales helpers + filter UI; one summary payload; no new analytics product.

**Post-design re-check**: Still PASS — contracts are API query/response extensions only; no new DB.

## Project Structure

### Documentation (this feature)

```text
specs/030-dashboard-sales-filters/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── dashboard-sales-filters.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/page-data/
├── dashboard-overview-shared.ts   # filter enum, labels, groups, initial state (+ summaries)
├── dashboard-sales.ts             # date filters, eligibility, partitions, optional summary aggregates
├── dashboard-sales.test.ts
├── dashboard-brand-sales.ts       # reuse same dateType filter
└── dashboard-overview.ts          # default today + initial summaries

lib/validation.ts                  # Zod date_type enum + legacy aliases

app/api/admin/dashboard/
├── sales-by-location/route.ts     # accept new date_type; optional include summaries
└── brand-sales/route.ts           # same date_type set

components/organisms/
├── dashboard-filters-slot.tsx     # grouped plain-name filters + total chips
├── dashboard-overview-context.tsx # hold summaries; refresh on range/filter
├── dashboard-location-merchant-charts.tsx  # copy/hints
└── dashboard-main-slot.tsx        # grand total from active filter
```

**Structure Decision**: Single Cosmo OS web app; extend existing dashboard page-data and API routes. No mobile or new package.

## Complexity Tracking

> No constitution violations requiring justification.
