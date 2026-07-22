# Tasks: Unified Sticker Batch & Print

**Input**: Design documents from `/specs/018-sticker-batch-print/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for name/date/price helpers included (plan.md + quickstart.md). Manual UAT for page merge and print. Preserve `lib/sticker-print-quantity.test.ts`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Web app (Next.js): `app/`, `components/`, `lib/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature context and stub shared helper modules

- [x] T001 Confirm `.specify/feature.json` points to `specs/018-sticker-batch-print` and re-read `specs/018-sticker-batch-print/plan.md` + `contracts/sticker-batch-print.md`
- [x] T002 [P] Create stub `lib/sticker-item-name.ts` exporting `cleanStickerItemName`
- [x] T003 [P] Create stub `lib/sticker-dates.ts` exporting compact MFD normalize + `expireFromManufacture`
- [x] T004 [P] Create stub `lib/sticker-unit-price.ts` exporting `isLwkLocation` + `resolveStickerUnitPrice`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure helpers used across stories â€” MUST complete before UI wiring

**âš ï¸ CRITICAL**: No user story UI work that depends on helpers until this phase is complete

- [x] T005 Implement `cleanStickerItemName` in `lib/sticker-item-name.ts` per `contracts/sticker-batch-print.md`
- [x] T006 [P] Add Vitest cases in `lib/sticker-item-name.test.ts` (Default Title strip, unchanged names, empty placeholder)
- [x] T007 Implement compact MFD normalize (`YYYYMMDD`, `DDMMYYYY`, `DD/MM/YYYY`) and `expireFromManufacture` (+3 years) in `lib/sticker-dates.ts`
- [x] T008 [P] Add Vitest cases in `lib/sticker-dates.test.ts` (`20260703`, `03072026`, invalid dates, EPD +3y)
- [x] T009 Implement `isLwkLocation` and `resolveStickerUnitPrice` in `lib/sticker-unit-price.ts` (compareAt ?? price; LWK â†’ ogfPrice; missing OGF â†’ empty)
- [x] T010 [P] Add Vitest cases in `lib/sticker-unit-price.test.ts` (original vs discount, LWK with/without ogf, non-LWK)

**Checkpoint**: `npm test -- lib/sticker-item-name.test.ts lib/sticker-dates.test.ts lib/sticker-unit-price.test.ts` passes

---

## Phase 3: User Story 1 - Single Batch & Print Workspace (Priority: P1) ðŸŽ¯ MVP

**Goal**: One Batch & Print page with create/edit, preview, and print; old print URL redirects

**Independent Test**: Use only `/dashboard/sticker-batch` to edit a batch and print; `/dashboard/sticker-print` redirects; sidebar shows one Stickers entry

### Implementation for User Story 1

- [x] T011 [US1] Embed quantity-aware print sheet + `handlePrint` (reuse `lib/sticker-print-quantity.ts`) into `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`
- [x] T012 [US1] Wire Print Stickers control and batch-load-for-print UX on the combined client in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx` (preserve history tab + create/edit)
- [x] T013 [US1] Redirect `/dashboard/sticker-print` to `/dashboard/sticker-batch` preserving `batchId` in `app/(dashboard)/dashboard/sticker-print/page.tsx`
- [x] T014 [P] [US1] Collapse sidebar Stickers to one â€œBatch & Printâ€ nav item in `components/organisms/app-sidebar.tsx`
- [x] T015 [P] [US1] Update topbar title for combined sticker route in `components/organisms/topbar.tsx`
- [x] T016 [US1] Remove or retarget in-app links that send users to `/dashboard/sticker-print` (e.g. batch history â€œOpen Printâ€) inside `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`

**Checkpoint**: Full batch â†’ preview â†’ print on one page; old print URL redirects

---

## Phase 4: User Story 2 - Clean Item Names Without Default Suffix (Priority: P1)

**Goal**: Batch rows and Cosmo stickers omit â€œ(Default Title)â€ style suffixes

**Independent Test**: Add SKU with Default Title variant; row + Cosmo preview/print show cleaned name

### Implementation for User Story 2

- [x] T017 [US2] Apply `cleanStickerItemName` when building `itemName` on catalog select in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`
- [x] T018 [P] [US2] Apply `cleanStickerItemName` in Cosmo `components/organisms/sticker-preview-card.tsx` (or at call sites) so printed names stay clean even for older saved rows
- [x] T019 [P] [US2] Align Vault `components/organisms/vault-sticker-preview-card.tsx` to use shared `cleanStickerItemName` (replace local cleaner if equivalent)

**Checkpoint**: New and previewed names never show Default Title suffix

---

## Phase 5: User Story 3 - Cosmo Stickers Use Main Company Address (Priority: P1)

**Goal**: Cosmo sticker address = company Cosmetics.lk address; Vault unchanged

**Independent Test**: Cosmo preview/print shows company address, not location address

### Implementation for User Story 3

- [x] T020 [US3] Change Cosmo address line to prefer/use `companyAddress` only in `components/organisms/sticker-preview-card.tsx`
- [x] T021 [US3] Ensure combined batch preview passes `companyAddress` from company/batch meta (not location address) in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`

**Checkpoint**: Cosmo labels show main company address; Vault preview unaffected

---

## Phase 6: User Story 4 - MFD Auto-Format and EPD = MFD + 3 Years (Priority: P1)

**Goal**: Compact MFD inputs normalize; EPD defaults to MFD + 3 years and remains editable

**Independent Test**: Enter `20260703` and `03072026`; EPD auto +3y; manual EPD edit kept until MFD changes

### Implementation for User Story 4

- [x] T022 [US4] Replace/extend MFD/EPD typing handlers to use `lib/sticker-dates.ts` in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`
- [x] T023 [US4] On valid MFD change, auto-set EPD via `expireFromManufacture` while still allowing manual EPD edits in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`
- [x] T024 [US4] Confirm save/API payloads still send `DD/MM/YYYY` compatible with `app/api/admin/sticker-batches/route.ts` and `app/api/admin/sticker-batches/[id]/items/route.ts`

**Checkpoint**: Compact MFD works; auto EPD + editable override behavior matches spec

---

## Phase 7: User Story 5 - Unit Price Uses Original Price (Priority: P1)

**Goal**: Non-LWK sticker unit price uses compare-at/list price, not discounted sell price

**Independent Test**: Item with compare-at > sell price fills unit price with compare-at on non-LWK location

### Implementation for User Story 5

- [x] T025 [US5] Load `compareAtPrice` on catalog product items in `app/(dashboard)/dashboard/sticker-batch/page.tsx`
- [x] T026 [US5] On item select, set unit price via `resolveStickerUnitPrice` (non-LWK path) in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`

**Checkpoint**: Non-LWK lines use original/list price

---

## Phase 8: User Story 6 - LWK Location Uses LWK/OGF Price (Priority: P1)

**Goal**: Selecting LWK switches unit price to OGF price; leaving LWK restores original-price rule

**Independent Test**: Toggle location LWK â†” other; unit price switches to ogfPrice / original accordingly; missing ogf does not use discount price

### Implementation for User Story 6

- [x] T027 [US6] Load SKU â†’ `ogfPrice` map from `ProductOsfProfile` in `app/(dashboard)/dashboard/sticker-batch/page.tsx` and pass into the client
- [x] T028 [US6] On location change and item match, detect LWK via `isLwkLocation` and apply `resolveStickerUnitPrice` in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`
- [x] T029 [US6] When LWK and ogfPrice missing, leave unit price empty (or clear) rather than applying discounted `price` in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`

**Checkpoint**: LWK price path correct; non-LWK still uses US5 rule

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Regression, quantity preserve, quickstart sign-off

- [x] T030 [P] Run `npm test -- lib/sticker-item-name.test.ts lib/sticker-dates.test.ts lib/sticker-unit-price.test.ts lib/sticker-print-quantity.test.ts` and fix failures
- [x] T031 Verify quantity 5 still prints 5 labels / one preview card + badge on combined page (016 behavior) in `app/(dashboard)/dashboard/sticker-batch/sticker-batch-client.tsx`
- [ ] T032 Execute manual scenarios in `specs/018-sticker-batch-print/quickstart.md`
- [x] T033 [P] Lint changed files under `lib/`, `app/(dashboard)/dashboard/sticker-batch/`, `app/(dashboard)/dashboard/sticker-print/`, `components/organisms/sticker-preview-card.tsx`, `app-sidebar.tsx`, `topbar.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” BLOCKS helper-dependent stories
- **US1 (Phase 3)**: Can start after Setup for redirect/nav; print embed should follow Foundational if it only needs 016 helpers (already present) â€” prefer after T001
- **US2â€“US6**: Depend on Foundational helpers; US5 catalog load before US6 OGF map preferred
- **Polish**: After desired stories complete

### User Story Dependencies

- **US1**: Independent MVP (page unify + redirect + nav); uses existing 016 quantity helpers
- **US2**: Needs `cleanStickerItemName` (Phase 2)
- **US3**: Mostly Cosmo card; light coupling to batch preview props
- **US4**: Needs `sticker-dates` (Phase 2)
- **US5**: Needs `sticker-unit-price` + catalog `compareAtPrice`
- **US6**: Depends on US5 catalog/client price wiring + OGF map

### Parallel Opportunities

- T002â€“T004 stubs in parallel
- T006, T008, T010 tests in parallel after their implementations
- T014â€“T015 nav/topbar in parallel with US1 client work (different files)
- T018â€“T019 card cleaners in parallel
- T030 and T033 in parallel during polish
- **Avoid** parallel edits to `sticker-batch-client.tsx` across US1/US2/US4/US5/US6 â€” sequence those tasks

---

## Parallel Example: Foundational helpers

```bash
# After stubs exist, implement then test in parallel pairs:
Task: "Implement cleanStickerItemName in lib/sticker-item-name.ts"
Task: "Implement sticker-dates in lib/sticker-dates.ts"
Task: "Implement sticker-unit-price in lib/sticker-unit-price.ts"
# Then parallel tests T006, T008, T010
```

## Parallel Example: US1 nav

```bash
Task: "Collapse sidebar in components/organisms/app-sidebar.tsx"
Task: "Update topbar in components/organisms/topbar.tsx"
Task: "Redirect sticker-print page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 3 US1 â€” unified workspace + redirect + nav
3. **STOP and VALIDATE** one-page print flow
4. Then Foundational (if not done) + US2â€“US6 incrementally

*(Recommended alternate: finish Phase 2 helpers first, then US1, then US2â€“US6 â€” reduces rework in the fat client.)*

### Incremental Delivery

1. Helpers (Phase 2) â†’ green unit tests
2. US1 unify page â†’ demo MVP
3. US2 names â†’ US3 address â†’ US4 dates â†’ US5 price â†’ US6 LWK
4. Polish + quickstart

### Parallel Team Strategy

1. Dev A: `lib/sticker-*.ts` + tests
2. Dev B: US1 merge print into batch client + redirect
3. Dev C: nav/topbar + Cosmo address card (US3)
4. After helpers merge: one owner sequences US2/US4/US5/US6 on `sticker-batch-client.tsx`

---

## Notes

- [P] = different files, no incomplete dependencies
- No Prisma migrations expected
- Preserve 016 quantity expand/print behavior
- API date wire format stays `DD/MM/YYYY`
- Commit after each story checkpoint when possible
