# Tasks: Item Trends Location-Wise Sale Columns

**Input**: Design documents from `/specs/053-item-trends-location-sale/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Vitest required by plan/constitution for cover math + ROP resolve (included below).

**Organization**: Phases by user story (US1â€“US6). MVP = US1 after Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no incomplete deps)
- **[Story]**: [US1]â€¦[US6] on story-phase tasks only

## Phase 1: Setup

**Purpose**: Confirm feature workspace

- [x] T001 Confirm `specs/053-item-trends-location-sale/` artifacts and `.specify/feature.json` points at this feature

---

## Phase 2: Foundational (Blocking)

**Purpose**: Shared types + math + helpers all stories need

**âš ï¸ CRITICAL**: Finish before US1â€“US6

- [x] T002 Extend `CoverRow` in `lib/item-trends/types.ts` with `last30Units`, `last30AvgDaily`, `ropQty`; keep legacy send/gap fields optional unused or remove if safe
- [x] T003 [P] Add trailing-30 YMD window helper (Asia/Colombo today, 30 inclusive days) in `lib/item-trends/cover.ts` (or small sibling module under `lib/item-trends/`)
- [x] T004 [P] Update cover math so `weekNeed` stays range-based and `coverDays = stock / last30AvgDaily` (null if avg 0) in `lib/item-trends/cover.ts`
- [x] T005 Update Vitest fixtures for week need + 30d cover (14/7 â†’ weekNeed 14; last30=60 stock=10 â†’ coverDays 5) in `lib/item-trends/cover.test.ts`
- [x] T006 [P] Add `resolveLocationRopQty` (separate SKU + common parent rules, never sum) in `lib/item-trends/rop-resolve.ts`
- [x] T007 [P] Vitest for ROP resolve cases in `lib/item-trends/rop-resolve.test.ts`

**Checkpoint**: Types + math + ROP helper ready; no UI required yet

---

## Phase 3: User Story 1 â€” Location sale-focused columns (P1) ðŸŽ¯ MVP

**Goal**: Location table shows Item, Location, ROP, Sale, Stock, Week need, Last 30d avg sale, Cover days â€” not Stock/sale, Send, Market gap

**Independent Test**: Open Location mode; headers/cells match new set; removed columns gone

- [x] T008 [US1] Rebuild Location table headers/cells in `components/organisms/item-trends/cover-panel.tsx` (ROP, Sale, Stock, Week need, Last 30d avg, Cover days; drop Stock/sale, Send, Market gap + `MarketGapCell`)
- [x] T009 [US1] Remove send-only checkbox/props from `components/organisms/item-trends/section-filters.tsx`
- [x] T010 [US1] Stop passing `sendOnly` / market-gap UI wiring from `components/organisms/item-trends-panel.tsx`
- [x] T011 [US1] Common-grain parent ROP cell uses `resolveLocationRopQty` (not summed child ROPs) when grouping in `components/organisms/item-trends/cover-panel.tsx`

**Checkpoint**: UI columns correct even if some API fields still zero/null until later stories

---

## Phase 4: User Story 2 â€” Sale count follows selected range (P1)

**Goal**: Sale + week need refresh with From/To; last-30 avg independent of range length

**Independent Test**: Same SKU/shop; change range â†’ Sale/Week need change; Last 30d avg stable same day

- [x] T012 [US2] Keep range sale map on selected `from`/`to` and attach `trailing30From`/`trailing30To` on cover result in `lib/item-trends/cover-rows.ts`
- [x] T013 [US2] Return trailing window fields from `app/api/admin/purchasing/item-trends/cover/route.ts` per `contracts/item-trends-cover.md`
- [x] T014 [US2] Confirm Location UI binds Sale/Week need to `unitsInRange`/`weekNeed` (range) in `components/organisms/item-trends/cover-panel.tsx`

**Checkpoint**: Range change only affects Sale + Week need columns

---

## Phase 5: User Story 3 â€” Stock snapshot or live (P1)

**Goal**: Stock (+ cover days later) follow `stockSource` filter; clear live vs snapshot label

**Independent Test**: Toggle live â†” snapshot â†’ Stock changes; Sale unchanged

- [x] T015 [US3] Keep stock path live/snapshot unchanged and ensure `stockQty` used for cover math input in `lib/item-trends/cover-rows.ts`
- [x] T016 [US3] Keep stock-source banner (live vs snapshot date) accurate in `components/organisms/item-trends/cover-panel.tsx`
- [x] T017 [US3] When snapshot missing, do not silently fill live stock in `lib/item-trends/cover-rows.ts` (existing `stockReady` behavior)

**Checkpoint**: Stock column trusts filter source

---

## Phase 6: User Story 4 â€” Week need, 30d avg, cover days (P1)

**Goal**: Week need from range; last-30 avg + cover days from trailing 30 and stock

**Independent Test**: Fixture math on a known row; no Send / Market gap on Location rows

- [x] T018 [US4] Second `salesByOsfColumnInRange` pass for trailing-30 window; set `last30Units` / `last30AvgDaily` / `coverDays` per row in `lib/item-trends/cover-rows.ts`
- [x] T019 [US4] Stop sorting/filtering by `shouldSend`; ignore or no-op `sendOnly` in `lib/item-trends/cover-rows.ts`
- [x] T020 [US4] Display Last 30d avg + Cover days from new fields in `components/organisms/item-trends/cover-panel.tsx`

**Checkpoint**: Cover days use 30d pace, not range avg

---

## Phase 7: User Story 5 â€” Location-wise common SKU ROP (P1)

**Goal**: Each location row shows saved OSF ROP for SKU Ã— column (common rules in UI)

**Independent Test**: Known `ProductOsfRop` for ORD04 Ã— location â†’ ROP cell 25 in common grain

- [x] T021 [US5] Load `ProductOsfRop` for cover SKUs (+ common keys) and set `ropQty` per row in `lib/item-trends/cover-rows.ts`
- [x] T022 [US5] Show `ropQty` (or â€”) in Location table ROP column in `components/organisms/item-trends/cover-panel.tsx`
- [x] T023 [US5] Common-grain grouped row ROP via `resolveLocationRopQty` over children in `components/organisms/item-trends/cover-panel.tsx`

**Checkpoint**: ROP visible without leaving Location table

---

## Phase 8: User Story 6 â€” Item mode without gap/send/% (P2)

**Goal**: Item/warehouse compare matches sale-focus columns; no Market gap, Send, Stock/sale

**Independent Test**: Item mode for one SKU; removed columns absent; online before shops

- [x] T024 [US6] Align Item location-compare columns with ROP/Sale/Stock/Week need/Last 30d/Cover days; drop Send totals/gap in `components/organisms/item-trends/location-compare-panel.tsx`
- [x] T025 [US6] Remove `fetchMarketGapForSkus` from cover route in `app/api/admin/purchasing/item-trends/cover/route.ts`
- [x] T026 [US6] Ensure Item tab still uses cover rows without gap badge path in `components/organisms/item-trends-panel.tsx`

**Checkpoint**: Location + Item modes share sale-focus language

---

## Phase 9: Polish & Cross-Cutting

**Purpose**: Export, validation, cleanup, quickstart

- [x] T027 [P] Update cover CSV headers/fields (rop, last_30d_avg_sale, cover_days; drop send/stock_pct) in `lib/item-trends/export.ts`
- [x] T028 [P] Deprecate/remove `sendOnly` from cover query Zod schema in `lib/validation.ts` (or `lib/validation` item-trends schema file)
- [x] T029 Drop unused send/gap client types usage across `components/organisms/item-trends/*` if any remain
- [x] T030 Run Vitest for `lib/item-trends/cover.test.ts`, `lib/item-trends/rop-resolve.test.ts`, and related cover/export tests; fix failures
- [x] T031 Walk `specs/053-item-trends-location-sale/quickstart.md` manual/API checks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** â†’ none
- **Foundational (Phase 2)** â†’ after Setup; **blocks** all stories
- **US1â€“US5 (P1)** â†’ after Foundational; prefer US1 â†’ US2 â†’ US3 â†’ US4 â†’ US5 (shared `cover-rows` / panel files)
- **US6 (P2)** â†’ after US1 column contract; ideally after US4â€“US5 so Item mode shows full data
- **Polish** â†’ after desired stories

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|-------|
| US1 | Foundational | MVP UI shell |
| US2 | Foundational; touches cover-rows/route | Can start with US1 in parallel if split carefully |
| US3 | Foundational | Mostly verify existing stock path |
| US4 | T003â€“T005 + cover-rows | Needs trailing-30 math |
| US5 | T006â€“T007 + cover-rows | Needs ROP helper |
| US6 | US1 column set; better after US4â€“US5 | Item panel + drop gap API |

### Parallel Opportunities

- T003 âˆ¥ T004 âˆ¥ T006 (different concerns; T005 after T004; T007 after T006)
- T009 âˆ¥ T010 after T008 starts (filters vs panel)
- T027 âˆ¥ T028 in Polish
- US2 route fields âˆ¥ US3 banner check once cover-rows stock path stable

### Parallel Example: Foundational

```bash
Task: "Trailing-30 window helper in lib/item-trends/cover.ts"
Task: "ROP resolve helper in lib/item-trends/rop-resolve.ts"
# Then:
Task: "Cover math + cover.test.ts"
Task: "rop-resolve.test.ts"
```

### Parallel Example: Polish

```bash
Task: "Update export CSV in lib/item-trends/export.ts"
Task: "Deprecate sendOnly in lib/validation.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 (column chrome + remove send/gap UI)
4. **STOP** â€” validate Location headers/cells vs quickstart Â§ Manual UI 1â€“3

### Incremental Delivery

1. US2 â€” range sale independence signals  
2. US3 â€” stock source trust  
3. US4 â€” trailing-30 + cover days wired  
4. US5 â€” ROP column live from DB  
5. US6 â€” Item mode parity + gap API removal  
6. Polish â€” CSV, validation, Vitest, quickstart

### Suggested MVP Scope

**T001â€“T011** (Setup + Foundational + US1). Demo-able column layout; fill numbers with US2â€“US5 next.

---

## Notes

- No Prisma migration for this feature
- Do not invent ROP or stock; null/â€” when missing
- Cover days MUST NOT use selected-range avg daily
- Districts + ROP suggestion tab out of scope except shared filter chrome
- Format check: all tasks use `- [ ]`, Task ID, optional `[P]` / `[USn]`, and file paths
