# Implementation Plan: Item Trends Simple Rebuild

**Branch**: `051-item-trends-simple` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/051-item-trends-simple/spec.md`

## Summary

Rebuild Item Trends into a simple Location / Item / Districts / ROP page. One warehouse name. Stock from historical overnight snapshots (pick date, default yesterday). Keep 50% shop send, OOS, market gap, ROP export. Persist order district from shipping address when blank.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router, Cosmo OS)

**Primary Dependencies**: Prisma, Vitest, existing `lib/item-trends/*`, `lib/address-district.ts`, `lib/item-trends/market-gap.ts`

**Storage**: PostgreSQL — existing `ErpStockSnapshot` (history); new optional `Order.district`

**Testing**: Vitest for parent SKU stem, location display name, snapshot date resolve, district persist helper

**Target Platform**: Cosmo OS / Vault OS web dashboard

**Project Type**: Web application

**Performance Goals**: Page stock reads snapshot table only (no live Bin). Snapshot date list is a small groupBy. Cover scoped to selected locations.

**Constraints**: Constitution — `npm run db:migrate:create` / hand SQL for `Order.district`; do not `db:deploy:*` unless user asks. Keep snapshot cron. Do not invent stock.

**Scale/Scope**: One dashboard page restructure + order district column + snapshot date picker. 90-day snapshot retention stays.

## Constitution Check

- Multi-DB: add `Order.district` migration in-repo; do not deploy until user says so.
- Env isolation: no new secrets.
- Tests: Vitest for changed lib; no mobile touch.
- Prod safety: no push / no prod migrate in this work.
- Scope: Item Trends UI + order district mark. No SMS / Dump 2.

**Post-design**: Pass. Snapshot history already in schema; district is one nullable column; UI removes chrome rather than adding systems.

## Project Structure

### Documentation (this feature)

```text
specs/051-item-trends-simple/
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
prisma/migrations/<ts>_order_district/migration.sql
lib/item-trends/sku-group.ts
lib/item-trends/location-name.ts
lib/item-trends/stock-snapshot.ts
lib/item-trends/cover-rows.ts
lib/item-trends/district.ts
lib/address-district.ts
lib/order-webhook-process.ts
lib/validation.ts
scripts/backfill-order-district.ts
app/api/admin/purchasing/item-trends/cover/route.ts
app/api/admin/purchasing/item-trends/stock-snapshot/route.ts
components/organisms/item-trends-panel.tsx
components/organisms/item-trends/*
```

## Complexity Tracking

None. Rebuild simplifies the existing page.
