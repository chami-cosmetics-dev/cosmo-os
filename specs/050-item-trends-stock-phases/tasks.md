# Tasks: Item Trends Stock Phases

**Input**: Design documents from `/specs/050-item-trends-stock-phases/`

## Phase 1: Cover math + SKU grouping

- [x] T001 Cover formula + tests in `lib/item-trends/cover.ts`
- [x] T002 Common SKU grouping + tests in `lib/item-trends/sku-group.ts`
- [x] T003 Catalog helper in `lib/item-trends/catalog.ts`
- [x] T004 Types in `lib/item-trends/types.ts`

## Phase 2: Snapshot

- [x] T005 Prisma `ErpStockSnapshot` + migration
- [x] T006 Capture/read/retention in `lib/item-trends/stock-snapshot.ts`
- [x] T007 Cron `app/api/cron/erp-stock-snapshot/route.ts` + `vercel.json`
- [x] T008 Admin GET/POST `app/api/admin/purchasing/item-trends/stock-snapshot/route.ts`

## Phase 3: APIs

- [x] T009 Outlets read snapshot; add `channelKind`; online first
- [x] T010 Cover API + validation
- [x] T011 Filter-options API
- [x] T012 Movement catalog fields + brand filter
- [x] T013 ROP total + CSV export helper

## Phase 4: UI

- [x] T014 Per-section filters, brand, SKU grain, location, OOS
- [x] T015 Cover / send / warehouse drill, snapshot banner, Capture now
- [x] T016 ROP total column + export

## Phase 5: Verify

- [x] T017 Vitest for cover + sku-group
- [ ] T018 Browser check Item Trends tabs (no browser tools / no running app in this session)
