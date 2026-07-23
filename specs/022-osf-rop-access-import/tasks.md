# Tasks: OSF Full Column Access, Shop ROPs & ROP Import

**Input**: Design documents from `/specs/022-osf-rop-access-import/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for access-key resolution, signed TOTAL helper, ROP import parse, and workbook filter — included as helper tests (not full TDD)

**Organization**: Tasks grouped by user story (US1–US4) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `prisma/`, `scripts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/022-osf-rop-access-import/plan.md`, `research.md`, `data-model.md`, `contracts/osf-column-access.md`, `contracts/osf-rop-import.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/osf/column-visibility.ts`, `lib/osf/column-groups.ts`, `lib/osf/build-workbook.ts`, `lib/osf/formulas.ts`, `lib/osf/column-config.ts`, `app/api/admin/osf/column-access/route.ts`, `components/organisms/osf-column-access-panel.tsx`, `components/organisms/osf-product-editor.tsx`, `lib/product-item-status-import.ts`, `scripts/seed-osf-cosmo-shop-columns.mjs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migrate access storage to per-column keys, catalog + resolver, TOTAL formula helper — blocks US1–US4 where shared

**CRITICAL**: No user story work until this phase completes

- [X] T003 Evolve `OsfUserColumnAccess` in `prisma/schema.prisma` — replace `columnGroups` with `columnKeys String[] @default([])` per `specs/022-osf-rop-access-import/data-model.md`
- [X] T004 Create migration with `npm run db:migrate:create` for columnKeys (include SQL/data step mapping legacy `pricing`/`cost`/`margins`/`sales` → static header ids per research R1); do **not** run `db:push` against shared DBs
- [X] T005 [P] Implement access catalog in `lib/osf/column-access-catalog.ts` — identity always-on headers; static assignable headers; `stock:{key}` / `rop:{key}` / `order:{key}` from active `OsfColumnConfig` per research R1 and `contracts/osf-column-access.md`
- [X] T006 [P] Evolve `lib/osf/column-visibility.ts` to `resolveEffectiveOsfColumnKeys` — manage or `purchasing.osf.permission` ⇒ all catalog keys; else identity ∪ DB `columnKeys`; ignore unknown ids; keep thin wrappers only if needed for migration
- [X] T007 [P] Add `sumSignedOrderQtysFlooredAtZero` in `lib/osf/formulas.ts` (`max(0, Σ finite signed qtys)`); keep `sumPositiveOrderQtys` only if still referenced elsewhere or remove after US4 call-site update
- [X] T008 [P] Extend Zod in `lib/validation/osf.ts` for column-access PUT (`userId` cuid, `columnKeys` string array; batch `assignments`) per `contracts/osf-column-access.md`
- [X] T009 [P] Add/update Vitest in `lib/osf/column-visibility.test.ts` and `lib/osf/column-access-catalog.test.ts` — full-access, unmarked identity-only, marked keys, unknown id ignored
- [X] T010 [P] Add Vitest in `lib/osf/formulas.test.ts` (or extend existing) — `[10,3,-15]→0`, `[10,3,-5]→8`, all-positive sum
- [X] T011 Document deploy gate: after user confirmation `npm run db:deploy:all` remains noted in `specs/022-osf-rop-access-import/quickstart.md`

**Checkpoint**: Schema + catalog + resolvers + TOTAL helper ready; stories can consume them

---

## Phase 3: User Story 1 - Per-user Access dropdown with searchable full column list (Priority: P1) 🎯 MVP

**Goal**: Assigners mark individual OSF columns per purchasing user via searchable Access control; downloads honor marks (+ identity always)

**Independent Test**: Mark Restricted A for a cost header + one location/shop column; leave B unmarked; A’s OSF includes those columns; B’s is identity-only; manage/permission users still get full set

### Implementation for User Story 1

- [X] T012 [US1] Update `GET`/`PUT` `app/api/admin/osf/column-access/route.ts` — return `columns: {id,label}[]` + `users[].columnKeys`; persist `columnKeys`; reject unknown keys per `contracts/osf-column-access.md`
- [X] T013 [US1] Extend `lib/osf/build-workbook.ts` — attach `accessKey` on each ColDef; filter defs by effective keys; identity always included
- [X] T014 [US1] Wire `app/api/admin/osf/generate/route.ts` to resolve effective column keys for current user and pass into workbook builder (full + reorder-only)
- [X] T015 [US1] Rewrite `components/organisms/osf-column-access-panel.tsx` — keep user list; replace group checkboxes with per-user searchable Access multi-select of all catalog columns; Save batch PUT `columnKeys`
- [X] T016 [P] [US1] Update copy in `components/organisms/osf-hub-panel.tsx` / panel help text to describe per-column Access (not four groups)
- [X] T017 [P] [US1] Adjust `lib/osf/build-workbook.test.ts` — restricted keys omit unmarked headers; full-access includes them; identity always present

**Checkpoint**: US1 — Access UI + per-column download filter work end-to-end

---

## Phase 4: User Story 2 - Set per-SKU ROP for Cosmetics.lk shops (Priority: P1)

**Goal**: Cosmetics.lk shop OSF columns appear in item-wise ROP-by-column and participate in generate when configured

**Independent Test**: Open known SKU; shop ROP inputs visible; save shop ROP; regenerate OSF and verify shop ROP/order columns

### Implementation for User Story 2

- [X] T018 [US2] Update `scripts/seed-osf-cosmo-shop-columns.mjs` so shop upserts default/set `includeInRop: true` (and document re-run for existing companies)
- [X] T019 [US2] Ensure active Cosmetics.lk shop columns with `includeInRop` appear in `components/organisms/osf-product-editor.tsx` ROP-by-column list (verify filter `active && includeInRop`; fix only if shops missing)
- [X] T020 [P] [US2] Confirm `components/organisms/osf-columns-settings.tsx` can toggle `includeInRop` for shop columns; fix UI/API if shop rows cannot enable ROP
- [X] T021 [US2] Verify generate path already emits stock/ROP/order for shop `OsfColumnConfig` keys via `lib/osf/column-config.ts` + `build-workbook.ts`; fix gaps so saved `ProductOsfRop` for shop keys appear on OSF

**Checkpoint**: US2 — shop ROPs editable and present on generated OSF

---

## Phase 5: User Story 3 - Download ROP template, edit offline, upload (Priority: P1)

**Goal**: Manage users download all-SKU ROP xlsx (SKU, barcode, location + shop ROP columns), upload updates; blank = no change

**Independent Test**: Download template → change location + shop ROPs → upload → those ROPs updated; blanks unchanged; non-manage gets 403

### Implementation for User Story 3

- [X] T022 [P] [US3] Implement parse/apply helpers in `lib/osf/rop-import.ts` — header→columnKey resolve, blank skip, non-negative int, unknown SKU errors, duplicate SKU reject per `contracts/osf-rop-import.md`
- [X] T023 [P] [US3] Add Vitest in `lib/osf/rop-import.test.ts` covering blank skip, duplicate SKU, unknown SKU, invalid ROP
- [X] T024 [US3] Implement `GET` `app/api/admin/osf/rop-template/route.ts` — require `purchasing.osf.manage`; xlsx all OSF-scope SKUs with SKU, Barcode, active `includeInRop` columns prefilled from `ProductOsfRop`
- [X] T025 [US3] Implement `POST` `app/api/admin/osf/rop-import/route.ts` — require `purchasing.osf.manage`; multipart `file`; return `{ updatedCells, skippedBlank, rowsProcessed, errors }`
- [X] T026 [US3] Add Download ROP template + Upload ROP controls to OSF hub UI (`components/organisms/osf-hub-panel.tsx` and/or `components/organisms/osf-generate-panel.tsx` / product editor area) with busy spinner + `notify` summary per action-loading UX

**Checkpoint**: US3 — template round-trip updates OSF ROPs

---

## Phase 6: User Story 4 - TOTAL ORDER QTY signed sum floored at zero (Priority: P1)

**Goal**: TOTAL ORDER QTY and Common SKU Reorder use signed sum then floor at 0 (not positives-only)

**Independent Test**: Order qtys +10,+3,−15 → TOTAL 0; +10,+3,−5 → TOTAL 8; per-column signed cells unchanged

### Implementation for User Story 4

- [X] T027 [US4] Replace `sumPositiveOrderQtys` call sites for TOTAL ORDER QTY and Common SKU Reorder in `lib/osf/build-workbook.ts` with `sumSignedOrderQtysFlooredAtZero` from `lib/osf/formulas.ts`
- [X] T028 [P] [US4] Update expectations in `lib/osf/build-workbook.test.ts` for TOTAL / Common aggregates to match signed-floor behavior
- [X] T029 [P] [US4] Grep/remove stale positives-only comments or docs in `lib/osf/` that contradict the new rule

**Checkpoint**: US4 — totals match spec US4 / contract totals section

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, retire group-only paths, validate quickstart

- [X] T030 [P] Retire or thin-wrap obsolete group-only exports in `lib/osf/column-groups.ts` and any dead `columnGroups` API fields so callers use `columnKeys` / catalog only
- [X] T031 [P] Run `npm test -- lib/osf` covering visibility, catalog, formulas, rop-import, build-workbook tests
- [X] T032 Run quickstart scenarios in `specs/022-osf-rop-access-import/quickstart.md` (Access marks, shop ROP, template import, TOTAL cases)
- [X] T033 [P] Lint/typecheck touched files; ensure no `db:push` against shared DBs in docs/scripts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational — independent of US1 (catalog may list shop keys once `includeInRop` on)
- **US3 (Phase 5)**: After Foundational; stronger with US2 shop `includeInRop` so template includes shop columns
- **US4 (Phase 6)**: After Foundational (needs T007); independent of Access UI; touches `build-workbook.ts` — coordinate with US1 if parallel
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1**: No dependency on US2–US4
- **US2**: No dependency on US1; unlocks shop columns for US3 template completeness
- **US3**: Prefers US2 complete for shop ROP columns in template; can ship location-only ROPs earlier
- **US4**: Independent formula change; file overlap with US1 on `build-workbook.ts`

### Parallel Opportunities

- T002, and within Phase 2: T005–T010 after T003/T004 schema direction is clear
- After Foundational: US2 can run parallel to US1 if different owners; US4 parallel only if `build-workbook` merge coordinated
- US3 T022/T023 parallel before routes T024/T025
- Polish T030/T031/T033 parallel after stories

---

## Parallel Example: User Story 1

```bash
# After foundational catalog + resolver:
Task: "Update column-access API route for columnKeys"
Task: "Rewrite osf-column-access-panel searchable Access UI"
# Then sequentially:
Task: "Filter build-workbook by accessKey"
Task: "Wire generate route effective keys"
```

## Parallel Example: User Story 3

```bash
Task: "Implement lib/osf/rop-import.ts"
Task: "Add lib/osf/rop-import.test.ts"
# Then:
Task: "GET rop-template route"
Task: "POST rop-import route"
Task: "Hub UI download/upload controls"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1–2 (migration + catalog + resolver)
2. Complete Phase 3 (US1 Access dropdown + download filter)
3. **STOP and VALIDATE** quickstart §2
4. Demo per-column Access before shop/import/TOTAL work

### Incremental Delivery

1. Setup + Foundational → foundation ready  
2. US1 → Access MVP  
3. US2 → shop ROPs  
4. US3 → bulk ROP import (best after US2)  
5. US4 → TOTAL formula (can slip earlier if `build-workbook` free)  
6. Polish → retire groups, quickstart pass  

### Parallel Team Strategy

- Dev A: US1 (`column-access`, panel, generate filter)  
- Dev B: US2 + US3 (shop flag, rop-import, template routes)  
- Dev C: US4 formulas + workbook tests (merge carefully with A)

---

## Notes

- [P] = different files, no incomplete dependencies
- Deploy migrations only with explicit user confirmation (`db:deploy:all`)
- Blank ROP import cell = no change; never invent stock/cost/ROP
- Format validation: all tasks use `- [X] Tnnn ...` with file paths; story tasks include `[USn]`
