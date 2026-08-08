# Tasks: Store Location Allocation

**Input**: Design documents from `/specs/035-store-location-allocation/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan calls for Vitest on allocate math — included as helper tests (not full TDD). Manual UAT via quickstart.md.

**Organization**: Tasks grouped by user story (US1–US4)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/035-store-location-allocation/plan.md`, `research.md`, `data-model.md`, `contracts/store-location-allocation.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/osf/supplier-orders-reorder.ts`, `lib/osf/column-config.ts`, `lib/osf/erp-stock.ts`, `lib/osf/assist-sales.ts`, `lib/osf/formulas.ts`, `lib/rbac.ts`, `components/organisms/app-sidebar.tsx`, `app/api/admin/outlet-reviews/export/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Permission, Zod schemas, allocate helper, location-sales helper — blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Register permission `store.allocation.read` in `lib/rbac.ts` (catalog + ensure-default / seed pattern used by other permissions; no Prisma schema migration)
- [X] T004 [P] Add Zod schemas in `lib/validation/store-allocation.ts` (or `lib/validation/osf.ts` sibling) for lookup `q`, plan `sku`+`takeQty`, export body per `contracts/store-location-allocation.md`
- [X] T005 [P] Implement `allocateTakeQty` in `lib/store-allocation/allocate.ts` — weight `need × (1 + sales)`, largest-remainder integers, cap at need while others need, all-zero-need fallback per Assumptions
- [X] T006 [P] Add Vitest in `lib/store-allocation/allocate.test.ts` (short shipment sum, zero-need gets 0, overflow redistribute, all-zero-need sales/equal fallback, takeQty 0)
- [X] T007 [P] Implement `salesByOsfColumnLast30d` in `lib/store-allocation/location-sales.ts` — Cosmo completed sales (assist-sales where), group by `Order.companyLocationId`, map to active `includeInRop` columns via `companyLocationId`
- [X] T008 Add shared auth helper (inline or small module) requiring `store.allocation.read` + `companyId` for store-allocation API routes

**Checkpoint**: Permission, validation, allocate + sales helpers ready

---

## Phase 3: User Story 1 - Find an item by SKU or barcode (Priority: P1) 🎯 MVP

**Goal**: Store user searches by SKU/barcode (scanner Enter); sees priority, SKU, barcode, description, TOTAL ORDER QTY

**Independent Test**: SKU and barcode lookup succeed; unknown code clear empty/not-found; partial SKU returns match list

### Implementation for User Story 1

- [X] T009 [US1] Implement `GET` `app/api/admin/store-allocation/lookup/route.ts` — exact barcode preferred; else SKU/title contains; return item + `companyReorderQty` via `computeTotalOrderQtyForSkus`; multi-match `matches[]` per contract
- [X] T010 [US1] Create `components/organisms/store-location-allocation-panel.tsx` — search input submits on Enter; show item card (priorities, SKU, barcode, description, TOTAL ORDER QTY) or match list / not-found
- [X] T011 [US1] Add `app/(dashboard)/dashboard/store/allocation/page.tsx` — require `store.allocation.read`; render panel or permission denied
- [X] T012 [US1] Add sidebar nav link in `components/organisms/app-sidebar.tsx` for users with `store.allocation.read`

**Checkpoint**: US1 — lookup works end-to-end on store allocation page

---

## Phase 4: User Story 2 - Enter take qty and see location split (Priority: P1)

**Goal**: Enter take qty; show all active OSF ROP locations with suggested qtys summing to take qty

**Independent Test**: takeQty Q → location table; sum(suggested)=Q; takeQty 0 → zeros/guidance; takeQty > TOTAL ORDER QTY shows warning

### Implementation for User Story 2

- [X] T013 [US2] Implement `GET` `app/api/admin/store-allocation/plan/route.ts` — active `includeInRop` columns; ROP from `ProductOsfRop`; stock via ERP `stockForColumn`; sales via T007; suggestions via T005; response per contract (`shortShipment` flag)
- [X] T014 [US2] Wire take-qty input + location table (label, ROP, stock, need, sales30d, suggestedQty) in `components/organisms/store-location-allocation-panel.tsx`; debounce/refetch plan on takeQty change
- [X] T015 [US2] Show warning when takeQty > companyReorderQty in `components/organisms/store-location-allocation-panel.tsx`

**Checkpoint**: US2 — location split visible for any take qty

---

## Phase 5: User Story 3 - Short shipment need × sales logic (Priority: P1)

**Goal**: When take &lt; TOTAL ORDER QTY, allocation favors unmet need weighted by location sales; zero-need locations get 0 while others still need

**Independent Test**: Fixture short take; verify weight behavior and caps match `allocate.test.ts` scenarios via API/UI

### Implementation for User Story 3

- [X] T016 [US3] Ensure `app/api/admin/store-allocation/plan/route.ts` passes `need = max(0, rop − stock)` and `sales30d` into `allocateTakeQty` (no ROP-proportion-only shortcut)
- [X] T017 [P] [US3] Extend `lib/store-allocation/allocate.test.ts` with a multi-location short-shipment case mirroring spec example shape (uneven need/sales)
- [X] T018 [US3] Surface `shortShipment` cue in `components/organisms/store-location-allocation-panel.tsx` when take &lt; companyReorderQty

**Checkpoint**: US3 — short-shipment weighting verified

---

## Phase 6: User Story 4 - Adjust shares and export/print (Priority: P2)

**Goal**: Edit location qtys; export/print only when sum equals take qty; no ERP stock transfers

**Independent Test**: Mismatched sum blocks export; matching sum downloads xlsx; print optional; no transfer side effects

### Implementation for User Story 4

- [X] T019 [P] [US4] Implement workbook builder in `lib/store-allocation/export-plan.ts` (SKU/barcode/description/take/company qty + location/qty rows)
- [X] T020 [US4] Implement `POST` `app/api/admin/store-allocation/export/route.ts` — Zod body; require sum(qty)===takeQty; return xlsx attachment
- [X] T021 [US4] Add editable qty columns + Export button (disabled/blocked when sum ≠ takeQty) in `components/organisms/store-location-allocation-panel.tsx`
- [X] T022 [P] [US4] Add browser print summary (printable section or `window.print`) in `components/organisms/store-location-allocation-panel.tsx` for valid plans

**Checkpoint**: US4 — export/print complete; still no stock transfers

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and quickstart validation

- [X] T023 [P] ERP soft-fail messaging when stock unavailable (`erpAvailable: false`) in plan API + panel
- [X] T024 [P] Debounce rapid barcode Enter submissions in `components/organisms/store-location-allocation-panel.tsx`
- [X] T025 Run `npm test -- lib/store-allocation` and fix failures
- [ ] T026 Walk `specs/035-store-location-allocation/quickstart.md` scenarios 1–5 and fix gaps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all stories
- **US1 (Phase 3)**: After Foundational
- **US2 (Phase 4)**: After US1 panel exists (extends same panel + plan API)
- **US3 (Phase 5)**: Refines plan API/allocate usage from US2
- **US4 (Phase 6)**: After US2 table (edits + export)
- **Polish (Phase 7)**: After desired stories

### User Story Dependencies

- **US1**: MVP lookup page
- **US2**: Needs US1 item selection context
- **US3**: Same plan pipeline as US2 (algorithm correctness)
- **US4**: Needs US2 location rows

### Parallel Opportunities

- Phase 2: T004 / T005 / T006 / T007 after T003 permission exists (T006 needs T005; T008 after T003)
- US4: T019 parallel with UI edit work once contract body known
- Polish: T023 / T024 parallel

### Parallel Example: Foundational

```bash
Task: "Zod schemas in lib/validation/store-allocation.ts"
Task: "allocateTakeQty in lib/store-allocation/allocate.ts"
Task: "location-sales in lib/store-allocation/location-sales.ts"
```

### Parallel Example: User Story 4

```bash
Task: "export-plan.ts workbook builder"
Task: "Print summary UI in store-location-allocation-panel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1–2  
2. Phase 3 US1 (permission, page, lookup, search UI)  
3. **STOP and VALIDATE** barcode/SKU lookup + TOTAL ORDER QTY  

### Incremental Delivery

1. US1 → lookup  
2. US2 → take qty + location table  
3. US3 → verify short-shipment weighting  
4. US4 → edit + export/print  
5. Polish → quickstart sign-off  

### Suggested MVP scope

**US1 only** (T001–T012): store users can find an item and see company TOTAL ORDER QTY.

---

## Notes

- No Prisma schema migration for allocation plans
- Do not create ERP stock transfers
- Permission is store-specific, not `purchasing.osf.*`
- Commit after each task or logical group
- Stop at checkpoints to validate independently
