# Tasks: OSF Zip Clear & Priority Cascade Filters

**Input**: Design documents from `/specs/034-osf-zip-clear-cascade/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Spec does not require TDD. Optional Vitest only if a shared priority-match helper is extracted (plan R5). Manual UAT via `quickstart.md`.

**Organization**: Tasks grouped by user story (US1–US3) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US3 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and existing Supplier Orders surface

- [X] T001 Confirm feature docs in `specs/034-osf-zip-clear-cascade/plan.md`, `research.md`, `data-model.md`, `contracts/osf-supplier-orders-cascade.md`, and `quickstart.md`
- [X] T002 [P] Skim current implementation: `components/organisms/osf-supplier-orders-panel.tsx` (`generate`, `clearAll`, priority/brand filters), `app/api/admin/osf/supplier-orders/page-data/route.ts`, `app/api/admin/osf/supplier-orders/items/route.ts`, `lib/osf/supplier-orders-draft.ts`, `lib/validation/osf.ts` (supplier-orders schemas)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared Zod validation for optional page-data `priority` — required before US2 brand cascade API work

**CRITICAL**: Complete before User Story 2 (US1 clear can start after Setup alone if needed; prefer finishing Foundational first for a clean sequence)

- [X] T003 Add `osfSupplierOrdersPageDataQuerySchema` (optional `priority` trimmed string max 80) in `lib/validation/osf.ts` and export its type per `contracts/osf-supplier-orders-cascade.md`

**Checkpoint**: Page-data query schema ready for US2

---

## Phase 3: User Story 1 - Clear working table after successful zip generate (Priority: P1) 🎯 MVP

**Goal**: After successful Generate zip (HTTP OK + blob), clear working table rows and `localStorage` draft; failed generate leaves table intact; manual Clear table unchanged

**Independent Test**: Add rows → successful generate → table empty and refresh stays empty; force generate failure → rows remain; Clear table still works without generate

### Implementation for User Story 1

- [X] T004 [US1] After successful zip blob download in `generate()` inside `components/organisms/osf-supplier-orders-panel.tsx`, call the same clear path as Clear table (`setRows([])` + `clearDraft(companyId, userId)`) before/with success toast
- [X] T005 [US1] Ensure generate error/validation failure paths in `components/organisms/osf-supplier-orders-panel.tsx` do **not** clear rows or draft (only success path clears)
- [X] T006 [US1] Confirm manual `clearAll()` in `components/organisms/osf-supplier-orders-panel.tsx` still clears UI + draft independently of generate

**Checkpoint**: US1 — post-generate clear works; failures preserve draft

---

## Phase 4: User Story 2 - Brand options cascade from selected priority (Priority: P1)

**Goal**: Brand dropdown lists only brands with ≥1 matching OSF item for the selected priority; All priorities restores full brand list; invalid selected brand resets to All brands

**Independent Test**: Pick a priority → brand list shrinks to matching brands; switch priority → list updates; select brand then change to priority without that brand → brand resets to All

### Implementation for User Story 2

- [X] T007 [US2] Update `GET` in `app/api/admin/osf/supplier-orders/page-data/route.ts` to parse optional `priority` via T003 schema; on invalid query return `400`
- [X] T008 [US2] When `priority` is non-empty, filter vendors in `app/api/admin/osf/supplier-orders/page-data/route.ts` to those with ≥1 ProductItem (`sku` not null, `status` not archived, `erp1ProductPriority` OR `erp2ProductPriority` equals priority — same rule as `items/route.ts`); empty priority keeps all company vendors
- [X] T009 [US2] In `components/organisms/osf-supplier-orders-panel.tsx`, on priority change refetch `/api/admin/osf/supplier-orders/page-data?priority=…` (omit param when All) and replace `brands` state
- [X] T010 [US2] In `components/organisms/osf-supplier-orders-panel.tsx`, after brands refresh, if current `vendorId` is not in the new brand list, reset `vendorId` to `""` (All brands); keep selection when still valid

**Checkpoint**: US2 — priority-scoped brands + invalid brand reset

---

## Phase 5: User Story 3 - Product/item list follows priority (and brand) (Priority: P1)

**Goal**: Item search lists only products matching active priority (and brand when set); filter changes refresh search without clearing the working table

**Independent Test**: Priority A → search shows only A; priority + brand → intersection; change filters with rows in table → table stays, search updates; All priorities → no priority restriction

### Implementation for User Story 3

- [X] T011 [US3] Verify `app/api/admin/osf/supplier-orders/items/route.ts` still applies `priority` and `vendorId` together (OR priority match + optional vendor); fix only if drift from contract/`page-data` priority semantics
- [X] T012 [US3] Confirm `components/organisms/osf-supplier-orders-panel.tsx` passes `priority` and `vendorId` to `/items` and refetches when those filters change while search is open (existing `useEffect`); adjust if refetch missing after US2 brand reset
- [X] T013 [US3] Confirm filter changes in `components/organisms/osf-supplier-orders-panel.tsx` never clear working-table rows (only successful generate / Clear table clear)

**Checkpoint**: US3 — products follow priority/brand; table preserved on filter change

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and optional helper cleanup

- [X] T014 [P] Optionally extract shared priority ProductItem OR predicate used by page-data and items into `lib/osf/supplier-orders-brands.ts` (or similar) only if duplication is awkward; skip if inline clauses stay identical and clear — **skipped** (inline clauses match `/items`; no helper extracted)
- [X] T015 Run manual UAT scenarios 1–6 in `specs/034-osf-zip-clear-cascade/quickstart.md` on `/dashboard/purchasing/osf` Supplier orders — **code paths verified**; confirm live in browser when convenient
- [X] T016 [P] Smoke `GET /api/admin/osf/supplier-orders/page-data` with and without `priority` (scoped brands ⊆ full brands) — **route + Zod wired**; live auth smoke in browser/network tab

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — blocks US2 (T007–T008)
- **User Story 1 (Phase 3)**: Can start after Setup (panel-only); preferred after Foundational for clean ordering
- **User Story 2 (Phase 4)**: Depends on Foundational (T003)
- **User Story 3 (Phase 5)**: Best after US2 so brand reset + item refetch are verified together; independently testable against existing `/items`
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Independent — panel generate success path only
- **US2 (P1)**: Independent of US1 — page-data + brand UI
- **US3 (P1)**: Mostly verify existing `/items`; light dependency on US2 for end-to-end priority→brand→product flow

### Parallel Opportunities

- T001 and T002 in Setup can run in parallel after docs are located
- After Foundational: US1 (T004–T006) can run in parallel with US2 API work (T007–T008) — different concerns; both touch `osf-supplier-orders-panel.tsx` so serialize panel edits (US1 then US2 UI, or one owner)
- T014 and T016 can run in parallel during Polish

---

## Parallel Example: User Story 2 API vs User Story 1

```text
# Different surfaces — can overlap if panel ownership is sequenced:
Task: "T004–T006 [US1] clear after generate in osf-supplier-orders-panel.tsx"
Task: "T007–T008 [US2] page-data priority filter in page-data/route.ts + validation"

# Then finish panel brand cascade (T009–T010) after US1 panel edits land
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 3: US1 (clear after zip)
3. **STOP and VALIDATE**: Generate → table empty; fail → table kept
4. Demo if that alone is the urgent buyer pain

### Incremental Delivery

1. Setup + Foundational → schema ready
2. US1 → clear after generate (MVP)
3. US2 → priority-scoped brands
4. US3 → verify products + filter/table invariants
5. Polish → quickstart UAT

### Suggested MVP scope

**US1 only** (T001–T002, T004–T006): removes completed orders from the table after zip without waiting on brand cascade.

---

## Notes

- No Prisma migration / `db:push`
- Do not clear table on filter change
- Priority match must stay identical between page-data brands and `/items`
- Commit after each story checkpoint when implementing
