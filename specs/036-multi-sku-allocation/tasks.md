# Tasks: Multi-SKU Location Allocation

**Input**: Design documents from `/specs/036-multi-sku-allocation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Vitest for walkthrough helper (called out in plan.md); allocate tests already exist

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm extension points on the existing store allocation surface

- [x] T001 Review existing single-SKU flow in `components/organisms/store-location-allocation-panel.tsx`, `app/api/admin/store-allocation/{lookup,plan,export}/route.ts`, and `lib/store-allocation/*` against `specs/036-multi-sku-allocation/plan.md`
- [x] T002 [P] Add session constants `MAX_STORE_ALLOCATION_SESSION_ITEMS = 50` (and export if needed) in `lib/store-allocation/session.ts` or `lib/validation/store-allocation.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, walkthrough pure helper, and multi-item validation used by all stories

**âš ï¸ CRITICAL**: No user story UI work depends on unfinished foundation helpers

- [x] T003 Define client session types (`SessionItem`, `SessionLocationQty`, walkthrough step shapes) in `lib/store-allocation/session-types.ts` per `specs/036-multi-sku-allocation/data-model.md`
- [x] T004 [P] Implement `buildNonEmptyLocationSteps` in `lib/store-allocation/walkthrough.ts` (stable OSF column order; skip locations where all item qtys are 0)
- [x] T005 [P] Add Vitest coverage for skip-zeros, ordering, and index bounds in `lib/store-allocation/walkthrough.test.ts`
- [x] T006 Extend Zod with multi-item export schema (items 1â€¦50, per-item sum rules documented) in `lib/validation/store-allocation.ts` per `specs/036-multi-sku-allocation/contracts/multi-sku-allocation.md`

**Checkpoint**: Foundation ready â€” session types + walkthrough helper + multi export schema available

---

## Phase 3: User Story 1 - Build a multi-item allocation list (Priority: P1) ðŸŽ¯ MVP

**Goal**: Scan/search adds multiple distinct SKUs to a session list; duplicates focus existing row; remove works; max 50 enforced

**Independent Test**: Add three SKUs via search/scan; re-scan first â†’ no duplicate; remove one â†’ two remain; unknown code does not change list

### Implementation for User Story 1

- [x] T007 [US1] Refactor `components/organisms/store-location-allocation-panel.tsx` from single `item` state to an ordered `items[]` session list (keep lookup/search UX)
- [x] T008 [US1] Wire lookup success to append-or-focus-by-SKU in `components/organisms/store-location-allocation-panel.tsx` (toast on duplicate; take qty starts blank/zero)
- [x] T009 [US1] Add per-row identity display (priority, SKU, barcode, description, companyReorderQty) and remove-item control in `components/organisms/store-location-allocation-panel.tsx`
- [x] T010 [US1] Enforce max 50 items with clear message when limit reached in `components/organisms/store-location-allocation-panel.tsx` using `MAX_STORE_ALLOCATION_SESSION_ITEMS`

**Checkpoint**: Multi-item cart works without take-qty planning or walkthrough

---

## Phase 4: User Story 2 - Enter take qtys and plan per SKU (Priority: P1)

**Goal**: Independent take qty per list item; debounced plan fan-out to existing plan API; suggestions sum to take qty; short-shipment / ERP flags per item

**Independent Test**: Two SKUs with different take qtys; each plan isolates; changing A does not change B

### Implementation for User Story 2

- [x] T011 [US2] Add per-row take qty input (blank/zero default) in `components/organisms/store-location-allocation-panel.tsx`
- [x] T012 [US2] Debounce and fetch `GET /api/admin/store-allocation/plan` per SKU when takeQty &gt; 0; store locations/suggestedQty/planStatus on each session item in `components/organisms/store-location-allocation-panel.tsx`
- [x] T013 [US2] Show per-item short-shipment and above-reorder warnings plus plan loading/error states in `components/organisms/store-location-allocation-panel.tsx`
- [x] T014 [US2] Ensure takeQty blank/0 clears that itemâ€™s location plan and omits it from later walkthrough/export eligibility in `components/organisms/store-location-allocation-panel.tsx`

**Checkpoint**: Multi-SKU planning works; walkthrough UI not required yet

---

## Phase 5: User Story 4 - Location walkthrough packing view (Priority: P1)

**Goal**: One location at a time (popup/sheet) listing all allocated itemsâ€™ qtys; arrow keys + Prev/Next; skip all-zero locations; edit qty on step; progress indicator

**Independent Test**: Three planned SKUs; open walkthrough; right/left arrows visit only non-empty locations; edit a qty and return; progress shows i/n

### Implementation for User Story 4

- [x] T015 [P] [US4] Add location-step presentation component in `components/molecules/store-allocation-location-step.tsx` (location label, item rows, editable qty)
- [x] T016 [US4] Open walkthrough dialog/sheet from `components/organisms/store-location-allocation-panel.tsx` using `buildNonEmptyLocationSteps` from `lib/store-allocation/walkthrough.ts`
- [x] T017 [US4] Implement Prev/Next and Left/Right keyboard navigation that skips empty locations; do not steal arrows while a number input is focused (Esc returns to chrome) in `components/organisms/store-location-allocation-panel.tsx`
- [x] T018 [US4] Sync qty edits from the current location step back into the owning session itemâ€™s `locations[].qty` in `components/organisms/store-location-allocation-panel.tsx`
- [x] T019 [US4] Show walkthrough progress (`label` + `index/total`) in the location step UI (`components/molecules/store-allocation-location-step.tsx` and/or panel)

**Checkpoint**: Location-oriented packing review works end-to-end for the session list

---

## Phase 6: User Story 3 - Adjust, validate, and export multi-SKU plan (Priority: P1)

**Goal**: Validate per-SKU sums; block invalid export; download one xlsx with by-location summary + per-SKU detail; no ERP transfers

**Independent Test**: Two valid SKUs export succeeds; break one sum â†’ blocked; workbook has location-oriented and per-SKU content

### Implementation for User Story 3

- [x] T020 [P] [US3] Extend `buildStoreAllocationWorkbookBuffer` (or add `buildMultiStoreAllocationWorkbookBuffer`) for multi-item + by-location summary in `lib/store-allocation/export-plan.ts`
- [x] T021 [US3] Update `POST` handler in `app/api/admin/store-allocation/export/route.ts` to accept multi-item body, validate each itemâ€™s Î£ qty === takeQty, return xlsx
- [x] T022 [US3] Wire panel export/print to multi-item payload; enable only when every takeQty&gt;0 item has valid sum; show clear error otherwise in `components/organisms/store-location-allocation-panel.tsx`
- [x] T023 [US3] Keep single-SKU session (list of one) export path working via the same multi-item contract in `components/organisms/store-location-allocation-panel.tsx` and `app/api/admin/store-allocation/export/route.ts`

**Checkpoint**: Full multi-SKU advisor: list â†’ take qtys â†’ walkthrough â†’ export

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Regression, UX polish, UAT

- [x] T024 [P] Confirm single-item regression (add one SKU, plan, walkthrough, export) on `/dashboard/store/allocation` via `app/(dashboard)/dashboard/store/allocation/page.tsx` gate unchanged
- [x] T025 Run `npx vitest run lib/store-allocation` and fix any failures in `lib/store-allocation/*.test.ts`
- [x] T026 Execute manual scenarios in `specs/036-multi-sku-allocation/quickstart.md` and note results
- [x] T027 [P] Remove dead single-item-only UI paths and tighten loading/disabled states in `components/organisms/store-location-allocation-panel.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup â€” **blocks** all user stories that need walkthrough/types/schema
- **US1 (Phase 3)**: After Foundational (types/constants); MVP cart
- **US2 (Phase 4)**: After US1 (needs session list)
- **US4 (Phase 5)**: After US2 (needs per-item location plans) + T004/T005
- **US3 (Phase 6)**: After US2 (needs plans); can parallelize export helper T020 with US4 UI if desired
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1**: After Phase 2 constants/types â€” no dependency on walkthrough/export
- **US2**: Depends on US1 list
- **US4**: Depends on US2 plans + foundational walkthrough helper
- **US3**: Depends on US2 plans; walkthrough not strictly required for export but recommended before polish

### Parallel Opportunities

- T002 || T001 (review vs constants)
- T004 || T005 || T006 after T003 (or T005 after T004)
- T015 [P] can start once T004 exists, in parallel with T012â€“T014
- T020 [P] can start once T006 exists, in parallel with US4 UI

---

## Parallel Example: Foundational + US4 prep

```text
Task: "Implement buildNonEmptyLocationSteps in lib/store-allocation/walkthrough.ts"
Task: "Add Vitest in lib/store-allocation/walkthrough.test.ts"
Task: "Extend Zod multi-item export schema in lib/validation/store-allocation.ts"
```

## Parallel Example: Export while walkthrough UI

```text
Task: "Extend multi workbook in lib/store-allocation/export-plan.ts"
Task: "Add location-step molecule in components/molecules/store-allocation-location-step.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1â€“2 foundation
2. Phase 3 US1 multi-item cart
3. **STOP and VALIDATE** quickstart scenario 1
4. Demo cart before planning/walkthrough

### Incremental Delivery

1. US1 cart â†’ demo scan-many
2. US2 take qty + plans â†’ demo isolated planning
3. US4 walkthrough â†’ demo location packing
4. US3 multi export â†’ full UAT per quickstart.md

### Suggested MVP scope

**US1 only** (multi-add list) is the smallest demoable increment; ship **US1+US2+US4+US3** for production-ready multi-SKU allocation.

---

## Notes

- Reuse `store.allocation.read`, lookup/plan routes; no Prisma migration
- Sales lookback remains 90d via existing `location-sales.ts`
- Format: all tasks use `- [ ]`, Task ID, optional `[P]` / `[Story]`, and file paths
