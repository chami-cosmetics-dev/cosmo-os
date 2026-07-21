# Tasks: OSF Column Visibility by User

**Input**: Design documents from `/specs/013-osf-column-visibility/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for column-group resolution and workbook header filtering — included as helper tests (not full TDD)

**Organization**: Tasks grouped by user story (US1–US3) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US3 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/013-osf-column-visibility/plan.md`, `research.md`, `data-model.md`, `contracts/osf-column-visibility.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/rbac.ts`, `lib/osf/build-workbook.ts`, `app/api/admin/osf/generate/route.ts`, `lib/validation/osf.ts`, `components/organisms/osf-hub-panel.tsx`, `app/(dashboard)/dashboard/purchasing/osf/page.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RBAC permission, column-group catalog + resolver — blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Add `OsfUserColumnAccess` model to `prisma/schema.prisma` per `specs/013-osf-column-visibility/data-model.md` (`companyId`, `userId`, `columnGroups String[]`, unique `(companyId, userId)`, relations)
- [X] T004 Create migration with `npm run db:migrate:create` for OSF user column access; do **not** run `db:push` against shared DBs
- [X] T005 [P] Add permission `purchasing.osf.permission` to `DEFAULT_PERMISSIONS` (and admin role keys as appropriate) in `lib/rbac.ts` per research R1
- [X] T006 [P] Implement column group catalog in `lib/osf/column-groups.ts` — group ids `core` | `pricing` | `cost` | `margins` | `sales`, labels, and header→group mapping for workbook columns per `contracts/osf-column-visibility.md`
- [X] T007 [P] Implement `resolveEffectiveOsfColumnGroups` in `lib/osf/column-visibility.ts` — manage or `purchasing.osf.permission` ⇒ all groups; else `{ core }` ∪ DB marks; ignore unknown ids
- [X] T008 [P] Extend Zod in `lib/validation/osf.ts` for column-access PUT body (`userId` cuid, `columnGroups` enum array; optional batch `assignments`) per contract
- [X] T009 [P] Add Vitest in `lib/osf/column-visibility.test.ts` (and/or `column-groups.test.ts`) covering full-access, unmarked core-only, marked margins, unknown id ignored
- [X] T010 Document deploy gate: after user confirmation `npm run db:deploy:all` remains in `specs/013-osf-column-visibility/quickstart.md`

**Checkpoint**: Schema + permission + helpers ready; stories can consume them

---

## Phase 3: User Story 1 - Assign OSF Excel columns per purchasing user (Priority: P1) 🎯 MVP

**Goal**: `purchasing.osf.permission` unlocks OSF-tab UI to mark column groups per purchasing user; downloads honor marks

**Independent Test**: Assigner marks User A for margins, leaves User B unmarked; A’s OSF/reorder Excel includes margins; B’s is core-only; user without `.permission` does not see the UI

### Implementation for User Story 1

- [X] T011 [US1] Implement `GET`/`PUT` `app/api/admin/osf/column-access/route.ts` — require `purchasing.osf.permission`; list company users with any purchasing OSF/tools permission + marks; upsert `OsfUserColumnAccess` per contract
- [X] T012 [US1] Extend `lib/osf/build-workbook.ts` — accept effective column groups (or allowed headers); filter Main column defs; keep `core` always; map groups via `column-groups.ts`
- [X] T013 [US1] Wire `app/api/admin/osf/generate/route.ts` to resolve effective groups for current user and pass into `buildOsfWorkbookBuffer` (full + `belowThresholdOnly` paths)
- [X] T014 [US1] Build `components/organisms/osf-column-access-panel.tsx` — compact user list + checkboxes for optional groups (`pricing`, `cost`, `margins`, `sales`) + Save
- [X] T015 [US1] Wire panel into `components/organisms/osf-hub-panel.tsx` and `app/(dashboard)/dashboard/purchasing/osf/page.tsx` when `canAssignColumns` (`purchasing.osf.permission`)
- [X] T016 [P] [US1] Update field-source legend note in `components/molecules/osf-field-source-legend.tsx` if margins note still says buyer-sheet-only

**Checkpoint**: US1 — assign UI + restricted downloads work end-to-end

---

## Phase 4: User Story 2 - Manage / permission holders get full columns; download rights unchanged (Priority: P1)

**Goal**: `purchasing.osf.manage` and `purchasing.osf.permission` always get full Excel columns; marks never replace download auth

**Independent Test**: Manage/permission user download has all standard columns while a marked-restricted user does not; user without generate permission still cannot download

### Implementation for User Story 2

- [X] T017 [US2] Confirm `resolveEffectiveOsfColumnGroups` returns all groups for `purchasing.osf.manage` and `purchasing.osf.permission` in `lib/osf/column-visibility.ts` (+ Vitest cases if missing)
- [X] T018 [US2] Verify `app/api/admin/osf/generate/route.ts` still gates full generate with `purchasing.osf.read` and reorder with tools permissions — column marks do not bypass auth
- [X] T019 [P] [US2] Add/adjust Vitest in `lib/osf/build-workbook.test.ts` — restricted groups omit cost/margins headers; full groups include them on Main
- [X] T020 [US2] Ensure unmarked restricted downloader gets core-only headers (no pricing/cost/margins/sales) via generate + workbook filter

**Checkpoint**: US2 — full vs restricted + auth boundaries verified

---

## Phase 5: User Story 3 - Retire hard-coded buyer-name column rules (Priority: P2)

**Goal**: Remove Inoka/Dilrukshi (and any buyer-name) hard-coding for margins; equivalent access via UI marks only

**Independent Test**: Codebase has no buyer-name margin hard-code; margins appear only via marks or manage/permission full access

### Implementation for User Story 3

- [X] T021 [US3] Remove `BUYERS_WITH_MARGIN_COLUMNS`, `buyerSeesMarginColumns`, `buyerMargin` flags, and related special-case sheet logic from `lib/osf/build-workbook.ts`
- [X] T022 [US3] Update `lib/osf/build-workbook.test.ts` — drop Inoka/Dilrukshi margin sheet expectations; assert buyer sheets stay non-pricing (stock/ROP/order) and Main margins follow column-group filter instead
- [X] T023 [P] [US3] Update copy in `components/organisms/osf-buyers-settings.tsx` if it still says margins appear only on Inoka/Dilrukshi sheets
- [X] T024 [US3] Grep for remaining hard-coded buyer margin names and clear any leftover references in OSF docs/comments under `lib/osf/` and purchasing OSF UI

**Checkpoint**: US3 — hard-coded name rules gone; marks are sole visibility control

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: UAT, lint, deploy gate

- [X] T025 [P] Run `npm test` covering `lib/osf/column-visibility.test.ts`, `column-groups` tests, and `build-workbook.test.ts`
- [X] T026 [P] Run quickstart scenarios in `specs/013-osf-column-visibility/quickstart.md` (permission chip, UI, restricted vs full, reorder-only)
- [X] T027 Confirm Roles UI shows `purchasing.osf.permission` for assignment
- [ ] T028 After explicit user confirmation only: `npm run db:deploy:all` for column-access migration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP (UI + generate filter)
- **US2 (Phase 4)**: After US1 generate wiring (or Foundational helpers) — validates full-access + auth
- **US3 (Phase 5)**: After workbook group filter exists (US1 T012+) — removes old hard-code path
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2/US3
- **US2 (P1)**: After T007 + generate wiring (T013); independently testable with manage vs marked users
- **US3 (P2)**: After T012 column-group filter; replaces hard-coded margin path

### Parallel Opportunities

- T002 with doc skim; T005–T009 after T003/T004 schema started (T005–T009 parallel across files)
- T016 parallel with T014/T015
- T019 parallel with T017/T018
- T023 parallel with T021/T022
- T025–T027 parallel in polish

---

## Parallel Example: Foundational

```bash
# After T003–T004 schema/migration:
Task: "Add purchasing.osf.permission in lib/rbac.ts"
Task: "Implement lib/osf/column-groups.ts"
Task: "Implement lib/osf/column-visibility.ts"
Task: "Extend lib/validation/osf.ts for column-access body"
Task: "Add lib/osf/column-visibility.test.ts"
```

## Parallel Example: User Story 1

```bash
# After foundational:
Task: "Implement app/api/admin/osf/column-access/route.ts"
# Then workbook + generate (ordered), then UI:
Task: "Build components/organisms/osf-column-access-panel.tsx"
Task: "Update osf-field-source-legend.tsx"  # [P]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (API + UI + generate filter)  
4. **STOP and VALIDATE** per US1 independent test / quickstart §2–3  
5. Demo assign + restricted download  

### Incremental Delivery

1. Setup + Foundational → helpers ready  
2. US1 → assign UI + filtered downloads (MVP)  
3. US2 → confirm full-access + auth boundaries  
4. US3 → delete hard-coded buyer margin rules  
5. Polish → tests + UAT + confirmed `db:deploy:all`  

### Suggested MVP scope

**US1 only** (T001–T016): permission, storage, assignment UI, generate applies marks.

---

## Notes

- [P] = different files, no wait on incomplete sibling tasks  
- Do not `db:push` to shared DBs; migrate create locally, deploy all only with user confirmation  
- Server-side column filter is mandatory — UI marks alone are not security  
- `core` is never optional in effective groups  
- Commit after each task or logical group  
