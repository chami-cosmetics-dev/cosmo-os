# Tasks: OSF Supplier Orders

**Input**: Design documents from `/specs/031-osf-supplier-orders/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan/quickstart call for Vitest on allocate + export helpers — included as helper tests (not full TDD). Manual UAT via quickstart.md.

**Organization**: Tasks grouped by user story (US1–US4) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/031-osf-supplier-orders/plan.md`, `research.md`, `data-model.md`, `contracts/osf-supplier-orders.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/osf/formulas.ts`, `lib/osf/catalog-rows.ts`, `lib/osf/erp-purchases.ts`, `lib/osf/supplier-compare.ts`, `lib/falcon-upload.ts` (`createZip`), `lib/product-items/erp-priority-options.ts`, `app/api/admin/osf/generate/route.ts`, `components/organisms/osf-hub-panel.tsx`, `components/organisms/osf-generate-panel.tsx`, sticker-batch localStorage draft pattern in `app/(dashboard)/dashboard/sticker-batch/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared Zod schemas, draft types, allocation validators, and TOTAL ORDER QTY compute helper — blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Add Zod schemas for supplier-orders query/body in `lib/validation/osf.ts` per `contracts/osf-supplier-orders.md` (page-data N/A; items query; suppliers `sku`; generate `rows`/`allocations`; cuid + LIMITS)
- [X] T004 [P] Add draft types + localStorage helpers in `lib/osf/supplier-orders-draft.ts` (`osf_supplier_orders_draft_v1`, load/save/clear, version/companyId/userId scoping per `data-model.md`)
- [X] T005 [P] Implement allocation validation in `lib/osf/supplier-orders-allocate.ts` (ignore qty ≤ 0; require ≥1 positive allocation for generate; block over-allocation when `reorderQty > 0`; allow under-allocation)
- [X] T006 [P] Add `computeTotalOrderQtyForSkus` (or equivalent) helper in `lib/osf/supplier-orders-reorder.ts` reusing `orderQty` + `sumSignedOrderQtysFlooredAtZero` from `lib/osf/formulas.ts` with Cosmo ROPs + ERP stock for a SKU batch
- [X] T007 [P] Add Vitest for allocate rules in `lib/osf/supplier-orders-allocate.test.ts` (under OK, over blocked, empty skipped, no positives fails)
- [X] T008 Implement `GET` `app/api/admin/osf/supplier-orders/page-data/route.ts` — auth like OSF generate; return `{ brands, priorities }` from vendors + `erp-priority-options`

**Checkpoint**: Schemas, draft helpers, allocate rules, reorder helper, page-data ready

---

## Phase 3: User Story 1 - Find OSF items by brand and SKU search (Priority: P1) 🎯 MVP

**Goal**: Optional brand + ERP priority filters; item search lists filtered SKUs (SKU + description) with empty query; typing narrows; select adds a row (no duplicates)

**Independent Test**: Open search with empty input → list shows; filter by brand → list narrows; type SKU fragment → matches; select → appears once; select again → no duplicate

### Implementation for User Story 1

- [X] T009 [US1] Implement `GET` `app/api/admin/osf/supplier-orders/items/route.ts` — validate query; filter ProductItems by optional `vendorId` + ERP `priority` + optional `q` on SKU/description; paginate (`page`/`pageSize`); attach `reorderQty` via T006 helper; response per contract
- [X] T010 [US1] Create `components/organisms/osf-supplier-orders-panel.tsx` — load page-data; priority select + optional brand (All brands default); searchable combobox/list that fetches `/items` on open (empty `q`) and on debounced type
- [X] T011 [US1] Wire search result rows (SKU + description) and on-select add-to-draft (unique by SKU) in `components/organisms/osf-supplier-orders-panel.tsx`
- [X] T012 [US1] Mount `OsfSupplierOrdersPanel` in `components/organisms/osf-hub-panel.tsx` (visible to users with OSF purchasing access, same class as generate)

**Checkpoint**: US1 — filter + search + add works on hub

---

## Phase 4: User Story 2 - Working order table with OSF reorder qty (Priority: P1)

**Goal**: Table shows SKU, description, read-only reorder qty; filter changes do not clear table; remove row + clear all; same-browser persistence

**Independent Test**: Add under brand A, switch brand B, add more — all rows remain with read-only qty; refresh restores draft; Clear empties

### Implementation for User Story 2

- [X] T013 [US2] Render working table in `components/organisms/osf-supplier-orders-panel.tsx` — columns SKU, description, read-only `reorderQty`; remove-row control
- [X] T014 [US2] Ensure brand/priority filter changes only refresh search list, never wipe table rows, in `components/organisms/osf-supplier-orders-panel.tsx`
- [X] T015 [US2] Persist draft via `lib/osf/supplier-orders-draft.ts` on mount/change; Clear button wipes UI + storage; scope by company/user when available from auth context props or page-data
- [X] T016 [P] [US2] Add Vitest for draft serialize/round-trip in `lib/osf/supplier-orders-draft.test.ts` (version, unique SKU invariant helpers if any)

**Checkpoint**: US2 — table + persistence solid

---

## Phase 5: User Story 3 - Split qty across multiple suppliers (Priority: P1)

**Goal**: Per-row supplier allocations; recent suppliers on top; empty suppliers skipped; under-allocation OK; over-allocation blocked (client + shared validator)

**Independent Test**: Row reorder 20 → allocate 5 and 10, leave others empty — valid; sum 25 → blocked with message; picker shows SKU-recent suppliers first

### Implementation for User Story 3

- [X] T017 [US3] Implement `GET` `app/api/admin/osf/supplier-orders/suppliers/route.ts` — allowlisted suppliers; `sortGroup` `sku_recent` then `other` using purchase history (`fetchSupplierPurchasesBySku` / erp-purchases patterns)
- [X] T018 [US3] Add per-row allocation UI in `components/organisms/osf-supplier-orders-panel.tsx` — load suppliers for SKU; enter qty per supplier; show remaining vs reorder qty; call `supplier-orders-allocate` before trusting state
- [X] T019 [US3] Surface over-allocation errors inline on the row in `components/organisms/osf-supplier-orders-panel.tsx` without requiring generate

**Checkpoint**: US3 — multi-supplier split usable

---

## Phase 6: User Story 4 - Generate supplier-wise Excel zip (Priority: P1)

**Goal**: Generate downloads one zip with one Excel per supplier (SKU, Description, Order Qty); empty suppliers omitted; validation on server

**Independent Test**: Two suppliers with positive qtys → one zip, two xlsx; columns correct; no positives / over-allocation → 400 JSON

### Implementation for User Story 4

- [X] T020 [P] [US4] Implement Excel+zip builder in `lib/osf/supplier-orders-export.ts` — one workbook per supplier via ExcelJS; columns SKU/Description/Order Qty; package with `createZip` from `lib/falcon-upload.ts`; safe filenames
- [X] T021 [P] [US4] Add Vitest for export grouping in `lib/osf/supplier-orders-export.test.ts` (two suppliers, skip zero qty, over-allocation not exported when validator used first)
- [X] T022 [US4] Implement `POST` `app/api/admin/osf/supplier-orders/generate/route.ts` — Zod body; run allocate validation; return `application/zip` + Content-Disposition per contract; JSON errors on failure
- [X] T023 [US4] Wire Generate button in `components/organisms/osf-supplier-orders-panel.tsx` — POST draft; download zip blob; show server/client validation errors

**Checkpoint**: US4 — end-to-end generate zip works

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and quickstart validation across stories

- [X] T024 [P] Confirm empty/error states (no items, ERP soft-fail messaging where applicable) in `components/organisms/osf-supplier-orders-panel.tsx`
- [X] T025 [P] Cap/paginate UX for large empty-`q` lists (load more or page controls) in `components/organisms/osf-supplier-orders-panel.tsx`
- [X] T026 Run `npm test -- lib/osf/supplier-orders` (or equivalent paths) and fix failures
- [ ] T027 Walk `specs/031-osf-supplier-orders/quickstart.md` scenarios 1–6 manually and fix gaps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on US1 panel + add path (extends same panel)
- **US3 (Phase 5)**: Depends on US2 table rows existing
- **US4 (Phase 6)**: Depends on US3 allocations (can stub allocations in API tests earlier)
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1**: After Foundational — MVP search/add
- **US2**: Builds on US1 panel (table + persistence)
- **US3**: Builds on US2 rows
- **US4**: Builds on US3 allocations; export helper [P] can start once T005 exists

### Parallel Opportunities

- T002, and within Phase 2: T004 / T005 / T006 / T007 in parallel after T003 schemas exist (T007 needs T005)
- T020 / T021 parallel once allocate rules exist
- T024 / T025 parallel in polish

### Parallel Example: Foundational helpers

```bash
# After T003 schemas:
Task: "Draft helpers in lib/osf/supplier-orders-draft.ts"
Task: "Allocate validators in lib/osf/supplier-orders-allocate.ts"
Task: "Reorder qty helper in lib/osf/supplier-orders-reorder.ts"
```

### Parallel Example: User Story 4

```bash
Task: "Export builder in lib/osf/supplier-orders-export.ts"
Task: "Export tests in lib/osf/supplier-orders-export.test.ts"
# Then generate route + UI button sequentially
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (page-data + items + search/add on hub)  
4. **STOP and VALIDATE** — empty search list + brand filter + add  

### Incremental Delivery

1. US1 → demo filter/search/add  
2. US2 → table + localStorage  
3. US3 → supplier split  
4. US4 → zip generate  
5. Polish → quickstart sign-off  

### Suggested MVP scope

**US1 only** (T001–T012): buyers can find and stage SKUs. Full value needs US2–US4 for ordering workflow.

---

## Notes

- No Prisma migrations for this feature
- Brand = Vendor; priority = ERP priority strings
- Reorder qty = TOTAL ORDER QTY (read-only)
- Zip via existing `createZip` — do not add jszip unless necessary
- Commit after each task or logical group
- Stop at checkpoints to validate independently
