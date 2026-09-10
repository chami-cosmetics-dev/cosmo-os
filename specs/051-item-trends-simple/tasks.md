# Tasks: Item Trends Simple Rebuild

**Input**: Design documents from `/specs/051-item-trends-simple/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup

- [x] T001 Confirm feature dir `specs/051-item-trends-simple/` and `.specify/feature.json`

---

## Phase 2: Foundational

- [x] T002 Add `Order.district` to `prisma/schema.prisma` and `prisma/migrations/20260907100000_order_district/migration.sql`
- [x] T003 [P] Parent SKU stem + tests in `lib/item-trends/sku-group.ts` and `lib/item-trends/sku-group.test.ts`
- [x] T004 [P] Warehouse display name + tests in `lib/item-trends/location-name.ts` and `lib/item-trends/location-name.test.ts`
- [x] T005 Snapshot date list/resolve (default yesterday) in `lib/item-trends/stock-snapshot.ts`
- [x] T006 Cover query `snapshotDate` + SKU search expand in `lib/validation.ts` and `lib/item-trends/cover-rows.ts`

---

## Phase 3: User Story 1 — Simple page + filters (P1)

- [x] T007 [US1] Rebuild shared filters and tabs (Location / Item / Districts / ROP) in `components/organisms/item-trends-panel.tsx`
- [x] T008 [US1] Apply display names in `lib/item-trends/cover-rows.ts` filter locations

---

## Phase 4: User Story 2 — Location cover / send / OOS (P1)

- [x] T009 [US2] Location tab uses CoverPanel only in `components/organisms/item-trends/cover-panel.tsx`
- [x] T010 [US2] Pass selected snapshotDate on cover GET in `app/api/admin/purchasing/item-trends/cover/route.ts`

---

## Phase 5: User Story 3 — Item warehouses + market gap (P1)

- [x] T011 [US3] Item tab = SKU picker + location compare in `components/organisms/item-trends-panel.tsx`
- [x] T012 [US3] Market gap on cover/item rows in cover route

---

## Phase 6: User Story 4 — Snapshot history (P1)

- [x] T013 [US4] GET stock-snapshot returns dates + defaultDate in `app/api/admin/purchasing/item-trends/stock-snapshot/route.ts`
- [x] T014 [US4] Snapshot date select on the page in `components/organisms/item-trends-panel.tsx`

---

## Phase 7: User Story 5 — Order district (P1)

- [x] T015 [US5] Set district on order upsert in `lib/order-webhook-process.ts`
- [x] T016 [US5] Districts read stored then shipping in `lib/item-trends/district.ts`
- [x] T017 [US5] Backfill script `scripts/backfill-order-district.ts`

---

## Phase 8: User Story 6 — ROP export (P2)

- [x] T018 [US6] Keep ROP tab + CSV in `components/organisms/item-trends/rop-panel.tsx`

---

## Phase 9: Polish

- [x] T019 Drop KPI/charts/focus/patterns/outlets-transfer chrome in `components/organisms/item-trends-panel.tsx`
- [x] T020 Run Vitest for sku-group, location-name, cover, district, location-compare, csv-address
