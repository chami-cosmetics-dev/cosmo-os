# Implementation Plan: Item Trends Location-Wise Sale Columns

**Branch**: `053-item-trends-location-sale` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/053-item-trends-location-sale/spec.md`

## Summary

Rebuild Item Trends Location (and Item) cover table around location-wise sale: show **ROP**, **range Sale**, **Stock** (live/snapshot), **Week need**, **Last 30d avg sale**, **Cover days** (stock ÷ 30d avg). Remove **Stock/sale %**, **Send**, and **Market gap**. Extend `fetchCoverRows` / cover math; drop gap fetch and send-only UI; keep filters, Districts, ROP export panel.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router, Cosmo OS)

**Primary Dependencies**: Prisma, Vitest, existing `lib/item-trends/*`, `ProductOsfRop`, `salesByOsfColumnInRange`

**Storage**: PostgreSQL — no new tables. Reuse `ProductOsfRop`, order sales aggregates, `ErpStockSnapshot` / live bins

**Testing**: Vitest for cover math (week need vs 30d cover), ROP resolve for common/separate grain, CSV column set

**Target Platform**: Cosmo OS / Vault OS web dashboard

**Project Type**: Web application

**Performance Goals**: One extra trailing-30 sales pass + one `ProductOsfRop` read per cover load; no live Bin when snapshot mode; no market-gap query on cover

**Constraints**: Constitution — no schema migrate unless proven necessary (none expected). No `db:deploy:*` / push to main. Do not invent ROP or stock. Cover days MUST NOT use selected-range avg daily.

**Scale/Scope**: Cover API + types + Location/Item panels + export CSV + filter cleanup. Districts / ROP suggestion panel unchanged except shared chrome that embeds removed columns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Multi-DB**: No Prisma schema change expected → no migration / no `db:deploy:*`.
- **Env isolation**: No new secrets.
- **Tests**: Vitest for `lib/item-trends` math + ROP resolve; no mobile touch → no `mobile:typecheck` required for this feature alone.
- **Prod safety**: Plan/implement only; no push to `main`, no prod migrate.
- **Scope**: Column/API/UI cleanup on Item Trends cover only. No SMS, Dump 2, Market Price Compare rebuild.

**Post-design**: Pass. Design stays in existing cover pipeline; trailing-30 sale reuses `salesByOsfColumnInRange`; ROP from `ProductOsfRop`. No new systems.

## Project Structure

### Documentation (this feature)

```text
specs/053-item-trends-location-sale/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── item-trends-cover.md
└── tasks.md             # /speckit-tasks — not this command
```

### Source Code (repository root)

```text
lib/item-trends/cover.ts
lib/item-trends/cover.test.ts
lib/item-trends/cover-rows.ts
lib/item-trends/types.ts
lib/item-trends/export.ts
lib/item-trends/rop-resolve.ts          # new small helper (optional; may live in cover-rows)
lib/item-trends/rop-resolve.test.ts
app/api/admin/purchasing/item-trends/cover/route.ts
lib/validation.ts                       # drop/deprecate sendOnly if unused
components/organisms/item-trends/cover-panel.tsx
components/organisms/item-trends/location-compare-panel.tsx
components/organisms/item-trends/section-filters.tsx
components/organisms/item-trends-panel.tsx
```

**Structure Decision**: Single Next.js app. Change cover domain lib + cover API + Location/Item UI. No new apps or packages.

## Complexity Tracking

None. Simplifies the cover table; removes market-gap dependency from this path.
