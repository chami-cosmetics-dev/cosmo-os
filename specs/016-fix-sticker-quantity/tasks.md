# Tasks: Fix Sticker Batch Quantity Print

**Input**: Design documents from `/specs/016-fix-sticker-quantity/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for expand/sum helpers are included (called out in plan.md and quickstart.md). No full E2E suite — manual UAT via quickstart.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Web app (Next.js): `app/`, `components/`, `lib/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature scope and create helper module stubs from the plan

- [x] T001 Confirm active feature dir is `specs/016-fix-sticker-quantity` in `.specify/feature.json` and re-read `specs/016-fix-sticker-quantity/plan.md` + `contracts/sticker-quantity-print.md`
- [x] T002 Create stub module `lib/sticker-print-quantity.ts` exporting `expandItemsByQuantity` and `totalStickerCount` (empty implementations returning safe defaults)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure quantity helpers used by preview count and print expansion — MUST complete before user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Implement `expandItemsByQuantity` and `totalStickerCount` in `lib/sticker-print-quantity.ts` per `specs/016-fix-sticker-quantity/contracts/sticker-quantity-print.md` (flat list length === sum of quantities; defensive clamp for non-positive qty)
- [x] T004 [P] Add Vitest coverage in `lib/sticker-print-quantity.test.ts` for qty 1, qty N, mixed lines, empty list, and total count

**Checkpoint**: Helpers pass `npm test -- lib/sticker-print-quantity.test.ts` — user story UI work can begin

---

## Phase 3: User Story 1 - Print Multiple Stickers per Quantity (Priority: P1) 🎯 MVP

**Goal**: Printing a batch produces Quantity N identical labels per line item (mixed batches sum correctly)

**Independent Test**: Batch with one item qty 5 → Print Stickers yields 5 labels; mixed 5+2+1 → 8 labels; qty 1 → 1 label

### Implementation for User Story 1

- [x] T005 [US1] Update print path in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx` so `handlePrint` builds/clones an expanded sticker sheet using `expandItemsByQuantity` (do not print the 1:1 preview sheet as-is)
- [x] T006 [US1] Ensure Cosmo (`StickerPreviewCard`) and Vault (`VaultStickerPreviewCard`) both expand by quantity in the same print flow in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx`
- [x] T007 [US1] Verify printed sticker faces exclude any quantity badge / screen-only chrome (print document contains only `.sticker-card` label content) in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx`

**Checkpoint**: Print produces correct label counts for qty 1, N, and mixed batches (MVP)

---

## Phase 4: User Story 2 - Preview Shows One Card Plus Quantity Number (Priority: P1)

**Goal**: On-screen preview shows one card per line item with a visible quantity number; Sticker Count equals sum of quantities

**Independent Test**: Qty 5 → one preview card + number “5”, Sticker Count 5; mixed 5+2+1 → three cards with numbers, count 8; never N duplicate preview cards

### Implementation for User Story 2

- [x] T008 [US2] Keep on-screen `.sticker-sheet` (or preview container) as one card per `detail.items` entry in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx` (no expand-by-quantity in preview map)
- [x] T009 [US2] Add screen-only per-item quantity number (badge/label with `no-print`) beside each preview card in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx` without changing yellow sticker artwork in `components/organisms/sticker-preview-card.tsx` / `vault-sticker-preview-card.tsx`
- [x] T010 [US2] Change Sticker Count display to `totalStickerCount(detail.items)` instead of `stickers.length` in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx`

**Checkpoint**: Preview is 1:1 with quantity numbers; count matches labels that will print

---

## Phase 5: User Story 3 - Batch Entry Quantity Still Means Labels Needed (Priority: P2)

**Goal**: Confirm Sticker Batch quantity create/edit remains the source of truth; print/preview pick up saved quantity changes with no batch-UI redesign

**Independent Test**: Edit item qty 2 → 4 on Sticker Batch, save, reload Sticker Print → preview shows 4, print yields 4 labels

### Implementation for User Story 3

- [x] T011 [US3] Smoke-verify existing quantity save on Sticker Batch still persists `quantity` via current APIs (no code change unless a regression is found) in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx` and `app/api/admin/sticker-batches/`
- [x] T012 [US3] Confirm print client reloads latest `quantity` from `GET /api/admin/sticker-batches/[id]` after batch edit (re-select batch / remount) in `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx`

**Checkpoint**: Batch entry unchanged; edited quantities flow through to preview number and print count

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation across Cosmo/Vault and quickstart sign-off

- [x] T013 [P] Run `npm test -- lib/sticker-print-quantity.test.ts` and fix any failures
- [ ] T014 Execute manual scenarios in `specs/016-fix-sticker-quantity/quickstart.md` (qty 5, mixed, qty 1, edit-then-reprint, Cosmo vs Vault if available)
- [x] T015 [P] Lint changed files (`lib/sticker-print-quantity.ts`, `lib/sticker-print-quantity.test.ts`, `app/(dashboard)/dashboard/sticker-print/sticker-print-client.tsx`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP print fix
- **User Story 2 (Phase 4)**: Depends on Foundational; shares print client with US1 (prefer US1 first to avoid same-file conflict, or combine carefully)
- **User Story 3 (Phase 5)**: Depends on US1 + US2 being demonstrable
- **Polish (Phase 6)**: Depends on stories marked complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2/US3 for print correctness
- **User Story 2 (P1)**: After Foundational — preview/count UX; touches same client file as US1
- **User Story 3 (P2)**: Validation that batch save + reload still drive quantity; minimal/no code if US1/US2 done

### Within Each User Story

- Helpers before print/preview wiring
- Print expansion before preview polish when editing the same file sequentially
- Story complete before polish

### Parallel Opportunities

- T004 can run in parallel with finalizing T003 once signatures are stable
- T013 and T015 are parallelizable after implementation
- US1 and US2 both edit `sticker-print-client.tsx` — **do not parallelize** those implementation tasks on the same file; run sequentially (US1 then US2) or as one developer pass
- US3 verification is mostly manual and can follow US1+US2

---

## Parallel Example: Foundational

```bash
# After T003 signatures exist:
Task: "Add Vitest coverage in lib/sticker-print-quantity.test.ts"
```

## Parallel Example: Avoid for US1 + US2

```bash
# NOT recommended in parallel (same file):
# T005–T007 sticker-print-client.tsx
# T008–T010 sticker-print-client.tsx
# Prefer sequential: finish US1 print path, then US2 preview/count UI
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational helpers + tests
3. Complete Phase 3: User Story 1 (print expands by quantity)
4. **STOP and VALIDATE**: Print qty 5 / mixed / qty 1
5. Demo print fix even before preview badges land

### Incremental Delivery

1. Setup + Foundational → helpers ready
2. US1 → correct print counts (MVP!)
3. US2 → one-card preview + quantity number + correct Sticker Count
4. US3 → confirm batch edit still drives print/preview
5. Polish → quickstart + lint

### Parallel Team Strategy

With multiple developers:

1. One owner for `lib/sticker-print-quantity.ts` + tests (Phase 2)
2. One owner for `sticker-print-client.tsx` implementing US1 then US2 sequentially
3. Second person runs quickstart UAT (Phase 6) while lint/tests run

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No Prisma/API changes expected; investigate only if US3 finds quantity not persisted
- Quantity badge must stay screen-only (`no-print`) per research.md
- Commit after each phase or logical group
- Avoid: expanding preview by quantity; putting qty text inside printed sticker artwork
