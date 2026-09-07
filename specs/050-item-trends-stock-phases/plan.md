# Implementation Plan: Item Trends Stock Phases

**Branch**: `050-item-trends-stock-phases` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/050-item-trends-stock-phases/spec.md`

## Summary

Item Trends switches stock from live ERP to a nightly bin snapshot, adds per-tab filters (brand, common vs variant SKU, location, OOS), a 50% week-cover send list, online-first warehouse order, and ROP total + CSV export.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router, existing Cosmo OS)

**Primary Dependencies**: Prisma, Vitest, existing `lib/item-trends/*`, `lib/osf/erp-stock.ts`

**Storage**: PostgreSQL via Prisma — new `ErpStockSnapshot`

**Testing**: Vitest for cover math, SKU grouping, snapshot read helpers

**Target Platform**: Cosmo OS / Vault OS web dashboard

**Project Type**: Web application

**Performance Goals**: Page load must not call live ERP Bin. Snapshot capture is cron-only (maxDuration 300).

**Constraints**: Constitution — `npm run db:migrate:create` for schema; do not `db:deploy:all` without user ask. Simplicity: no live-ERP fallback on the page.

**Scale/Scope**: One dashboard page + cron + one new table. 90-day snapshot retention.

## Constitution Check

- Multi-DB migration: create migration SQL; do not deploy until user says so.
- Env isolation: cron uses existing `CRON_SECRET`.
- Tests/typecheck: Vitest for new lib; no mobile touch.
- Prod safety: no push / no prod migrate in this work.
- Scope: Item Trends only. No SMS, Dump 2, or unrelated district fixes.

## Project Structure

### Documentation (this feature)

```text
specs/050-item-trends-stock-phases/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code

```text
prisma/schema.prisma
prisma/migrations/<ts>_erp_stock_snapshot/migration.sql
lib/item-trends/cover.ts
lib/item-trends/cover.test.ts
lib/item-trends/sku-group.ts
lib/item-trends/sku-group.test.ts
lib/item-trends/catalog.ts
lib/item-trends/stock-snapshot.ts
lib/item-trends/types.ts
lib/item-trends/outlets.ts
lib/item-trends/aggregate.ts
lib/item-trends/rop-suggest.ts
lib/item-trends/export.ts
lib/validation.ts
app/api/cron/erp-stock-snapshot/route.ts
app/api/admin/purchasing/item-trends/stock-snapshot/route.ts
app/api/admin/purchasing/item-trends/cover/route.ts
app/api/admin/purchasing/item-trends/filter-options/route.ts
vercel.json
components/organisms/item-trends-panel.tsx
components/organisms/item-trends/*
```

## Complexity Tracking

None. Snapshot table + read path is the minimum for "one stock".
