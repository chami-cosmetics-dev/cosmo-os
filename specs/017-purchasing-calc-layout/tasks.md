# Tasks: Purchasing Calculator Stacked Layout

**Input**: Design documents from `/specs/017-purchasing-calc-layout/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ui-layout.md, quickstart.md

**Tests**: Manual UAT only (per plan â€” layout-only; no new Vitest)

**Organization**: Tasks grouped by user story (US1â€“US3)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1â€“US3 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `components/organisms/purchasing-sku-calculator.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm design docs and target file

- [X] T001 Confirm feature docs in `specs/017-purchasing-calc-layout/plan.md`, `research.md`, `data-model.md`, `contracts/ui-layout.md`, and `quickstart.md`
- [X] T002 [P] Skim current layout shell in `components/organisms/purchasing-sku-calculator.tsx` (search controls, `md:grid-cols-2` list/detail wrapper, `runSearch` / `selectItem`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Minimal shared prep before story work

**CRITICAL**: Complete before user story layout edits

- [X] T003 Add a small helper (inline in `components/organisms/purchasing-sku-calculator.tsx`) to clear selection-related state (`selected`, `sellingPrice`, `marginPercent`, `newSupplierPrice`, `suppliers`, `suppliersLoading`, `suppliersError`) for reuse on new search (FR-007 / research R3)

**Checkpoint**: Clear-selection helper ready; layout stories can proceed

---

## Phase 3: User Story 1 - Search results under the search bar (Priority: P1) ðŸŽ¯ MVP

**Goal**: Matching SKUs appear in a full-width list directly below search controls â€” not in a left column beside detail

**Independent Test**: Search a known term; result list sits under the search bar across content width; no side-by-side split with detail

### Implementation for User Story 1

- [X] T004 [US1] In `components/organisms/purchasing-sku-calculator.tsx`, replace the list/detail `grid gap-4 md:grid-cols-2` shell with a vertical stack (`space-y-4` or equivalent) so the result list renders immediately under the search row
- [X] T005 [US1] Keep the result list full-width with existing `max-h-72 overflow-y-auto rounded-md border` scrolling in `components/organisms/purchasing-sku-calculator.tsx` (FR-006)
- [X] T006 [US1] Preserve empty/prompt copy for the list ("Search to load catalog SKUs.") under search in `components/organisms/purchasing-sku-calculator.tsx`

**Checkpoint**: US1 â€” list is under search, full width, scrollable

---

## Phase 4: User Story 2 - Full-width detail below the list (Priority: P1)

**Goal**: Clicking a result loads cost/margin/supplier detail below the list at full content width

**Independent Test**: Click a SKU; detail appears under the list full-width; clicking another SKU updates the same detail region; no right-column half-width layout

### Implementation for User Story 2

- [X] T007 [US2] Place the existing detail panel markup below the result list in the stacked layout in `components/organisms/purchasing-sku-calculator.tsx` (identity, purchase/cost, prices, supplier compare, margin, quote compare unchanged)
- [X] T008 [US2] Keep "Select a SKU to calculate." empty state in the full-width detail region when results exist but nothing is selected in `components/organisms/purchasing-sku-calculator.tsx`
- [X] T009 [US2] Confirm selected row highlight still works (`selected?.sku === item.sku`) in the top list in `components/organisms/purchasing-sku-calculator.tsx` (FR-004)
- [X] T010 [P] [US2] Confirm no persistent list|detail side-by-side classes remain for the shell in `components/organisms/purchasing-sku-calculator.tsx` (contracts L-3 / X-1); nested grids inside detail (e.g. supplier meta) may remain

**Checkpoint**: US2 â€” stacked full-width detail under list

---

## Phase 5: User Story 3 - Preserve calculator behavior + clear on search (Priority: P2)

**Goal**: Layout-only change; search/select/margin/supplier/quote still work; new search clears selection so detail is not stale

**Independent Test**: Select SKU â†’ margin + suppliers load; new search clears detail; unauthorized users still blocked

### Implementation for User Story 3

- [X] T011 [US3] Call the clear-selection helper from T003 at the start of qualifying `runSearch` (and when query is below min length and items are cleared) in `components/organisms/purchasing-sku-calculator.tsx` (FR-007)
- [X] T012 [US3] Verify `selectItem` / `loadSuppliers` / margin math / quote compare paths are untouched aside from layout and clear-on-search in `components/organisms/purchasing-sku-calculator.tsx` (FR-005)
- [X] T013 [P] [US3] Spot-check that APIs `app/api/admin/purchasing/sku-pricing/route.ts` and `app/api/admin/purchasing/sku-pricing/suppliers/route.ts` were not modified for this feature

**Checkpoint**: US3 â€” behavior preserved; selection clears on new search

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Manual UAT and lint

- [X] T014 Run quickstart scenarios 1–6 in `specs/017-purchasing-calc-layout/quickstart.md` (desktop ≥1200px + narrow viewport)
- [X] T015 [P] Lint `components/organisms/purchasing-sku-calculator.tsx` and fix any issues introduced by the layout change
- [X] T016 Mark completed tasks in `specs/017-purchasing-calc-layout/tasks.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1** â†’ **Phase 2** â†’ **US1 (Phase 3)** â†’ **US2 (Phase 4)** â†’ **US3 (Phase 5)** â†’ **Polish**
- US1 and US2 both edit the same file shell; do **not** parallelize US1/US2 across agents â€” sequential in one file
- US3 depends on T003 helper + stacked layout from US1/US2

### User story dependency graph

```text
T001â€“T002 (setup)
    â†’ T003 (clear helper)
        â†’ T004â€“T006 [US1] stacked list
            â†’ T007â€“T010 [US2] full-width detail
                â†’ T011â€“T013 [US3] clear-on-search + regression
                    â†’ T014â€“T016 polish
```

### Parallel opportunities

- T001 âˆ¥ T002 (setup skim)
- T010 âˆ¥ T009 after detail placed (verify-only)
- T013 âˆ¥ T012 (API untouched check vs behavior verify)
- T015 âˆ¥ after T014 starts (lint while finishing UAT notes)

### Parallel example

```text
# Setup only:
T001, T002 in parallel
# Then sequential single-file work T003 â†’ T004 â†’ â€¦ â†’ T012
# Polish:
T014 then T015
```

---

## Implementation Strategy

### MVP (User Story 1)

Deliver stacked list under search (T001â€“T006). Detail may still need US2 placement if both were in one grid â€” prefer completing T004â€“T008 together in one edit pass since they share the same wrapper.

### Incremental delivery

1. Setup + clear helper  
2. Stack list + detail (US1+US2 in one PR-sized edit)  
3. Wire clear-on-search (US3)  
4. Quickstart UAT + lint  

### Suggested single-pass implement order

Because almost all work is one file: **T003 â†’ T004â€“T009 â†’ T011 â†’ T014â€“T015** in one session.

---

## Task summary

| Metric | Count |
|--------|-------|
| Total tasks | 16 |
| US1 | 3 (T004â€“T006) |
| US2 | 4 (T007â€“T010) |
| US3 | 3 (T011â€“T013) |
| Setup / Foundation / Polish | 6 (T001â€“T003, T014â€“T016) |
| Parallelizable marked [P] | 5 |
| New automated tests | 0 (manual quickstart only) |

**MVP scope**: Phase 1â€“3 (through US1); practically ship US1+US2 together for a usable calculator.

**Format validation**: All tasks use `- [ ]`, Task IDs T001â€“T016, story labels on US phases only, and include file paths.
