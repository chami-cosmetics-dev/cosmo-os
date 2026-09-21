# Tasks: VAT OSF Column Access & Shop Columns

**Input**: Design documents from `/specs/058-vat-osf-column-access/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan requires Vitest for variant access, VAT stock filter, and shop sync helpers â€” unit test tasks included below.

**Organization**: Phases by user story (US1â€“US4) for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1â€“US4 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `prisma/`, `lib/osf/`, `app/api/admin/osf/`, `components/organisms/`

---

## Phase 1: Setup

**Purpose**: Align feature branch / confirm design artifacts (no greenfield app)

- [X] T001 Confirm feature docs present under `specs/058-vat-osf-column-access/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md) and create/switch git branch `058-vat-osf-column-access` if not already on it

---

## Phase 2: Foundational (Blocking)

**Purpose**: Schema + shared helpers every story needs. **Blocks all user stories.**

- [X] T002 Add `osfVariant` to `OsfUserColumnAccess` in `prisma/schema.prisma` with `@@unique([companyId, userId, osfVariant])` per `specs/058-vat-osf-column-access/data-model.md`
- [X] T003 Create migration via `npm run db:migrate:create` (name e.g. `osf_user_column_access_variant`) that backfills existing rows to `osfVariant = 'main'` and does **not** copy Main marks into `vat` / `non_vat`
- [X] T004 [P] Extend Zod in `lib/validation/osf.ts` so column-access GET query / PUT body require or accept `osfVariant` (`main` | `vat` | `non_vat`) per `contracts/osf-column-access-variants.md`
- [X] T005 [P] Add `buildOsfAccessCatalog(columns, variant?)` (or equivalent) in `lib/osf/column-access-catalog.ts` so `vat` omits nonâ€“Cosmetics.lk / non-shop location access keys while keeping static non-location columns
- [X] T006 Update `resolveEffectiveOsfColumnKeys` / loaders in `lib/osf/column-visibility.ts` to take `osfVariant` and read `OsfUserColumnAccess` for `(companyId, userId, osfVariant)` (missing row â†’ empty marks)
- [X] T007 [P] Add Vitest coverage for variant catalog filter + empty default marks in `lib/osf/column-visibility.test.ts` and/or `lib/osf/column-access-catalog` tests

**Checkpoint**: Migration ready (deploy only with user confirmation); helpers resolve per-variant marks; VAT catalog excludes other-location keys

---

## Phase 3: User Story 1 â€” Per-user column access for VAT Items / Others (P1) ðŸŽ¯ MVP

**Goal**: Assigners configure Access separately for Main, VAT Items, and Others; generate applies that variantâ€™s marks (Main marks not copied).

**Independent Test**: Mark User A on VAT Items only; User B unmarked; VAT Items downloads differ; Main still uses Main marks.

### Implementation

- [X] T008 [US1] Update `GET`/`PUT` in `app/api/admin/osf/column-access/route.ts` to scope catalog + upserts by `osfVariant` and return `osfVariant` in JSON per `contracts/osf-column-access-variants.md`
- [X] T009 [US1] Wire `POST` `app/api/admin/osf/generate/route.ts` to call `resolveEffectiveOsfColumnKeys(..., osfVariant)` for the requestâ€™s variant (not Main-only)
- [X] T010 [US1] Add variant selector (Main / VAT Items OSF / Others) and per-variant load/save in `components/organisms/osf-column-access-panel.tsx`
- [X] T011 [P] [US1] Extend Vitest in `lib/osf/column-visibility.test.ts` proving Main marks do not apply when resolving `vat` / `non_vat` without rows

**Checkpoint**: MVP â€” per-variant Access UI + generate filter works; restricted users without VAT/Others marks get core identity only

---

## Phase 4: User Story 2 â€” Rename to VAT Items OSF (P1)

**Goal**: User-facing labels/filenames say **VAT Items OSF**; keep enum `vat`.

**Independent Test**: Generate chooser + download identity + Access variant option all say VAT Items OSF.

### Implementation

- [X] T012 [P] [US2] Update labels, toasts, and `fallbackFilename` / copy in `components/organisms/osf-generate-panel.tsx` to **VAT Items OSF**
- [X] T013 [P] [US2] Update `osfDownloadFilename` (and any user-facing strings) in `app/api/admin/osf/generate/route.ts` to include a VAT Items token
- [X] T014 [US2] Ensure Access panel variant option text uses **VAT Items OSF** in `components/organisms/osf-column-access-panel.tsx` (align with T010)

**Checkpoint**: No primary UI still labels the variant only â€œVAT OSFâ€

---

## Phase 5: User Story 3 â€” VAT Items location columns = Cosmetics.lk + shops only (P1)

**Goal**: VAT Items workbook omits other company/location stock/ROP/order columns; keeps shared non-location columns; Total ROP rule unchanged.

**Independent Test**: VAT Items headers: Cosmetics.lk + shops present; LMJ/LWK/etc. absent; Main unchanged; pricing still present for full-access.

### Implementation

- [X] T015 [US3] Add `selectVatStockColumns` (reuse Cosmetics.lk + shop classifiers) in `lib/osf/vat-rop-columns.ts`
- [X] T016 [US3] Use VAT stock column set in `lib/osf/build-workbook.ts` for `stockCols` / order qty / Total Stock when `osfVariant === "vat"`; keep ROP via `selectVatRopColumns` + `totalRopForVat`
- [X] T017 [P] [US3] Add/extend Vitest in `lib/osf/vat-rop-columns.test.ts` and `lib/osf/build-workbook.test.ts` asserting VAT workbook excludes other-location headers and keeps static pricing columns
- [X] T018 [US3] Confirm VAT Access catalog (T005) matches workbook location set so assigners cannot mark ghost other-location keys for `vat`

**Checkpoint**: VAT Items location layout matches FR-006; Main/Others multi-location unchanged

---

## Phase 6: User Story 4 â€” Auto-create Cosmetics shop columns from ERP1 (P2)

**Goal**: Qualifying Cosmetics ERP1 shop warehouses upsert `OsfColumnConfig` (stock+ROP on); appear on Main / VAT Items / Others; Access fail-closed for new keys.

**Independent Test**: New shop warehouse â†’ generate â†’ `cosmo_shop_*` column with ERP stock on all three variants; unmarked restricted user omits it.

### Implementation

- [X] T019 [US4] Implement `ensureCosmeticsShopOsfColumns` in `lib/osf/shop-column-sync.ts` per `contracts/osf-shop-column-sync.md` (list Cosmetics ERP warehouses; `isShopWarehouseName`; upsert `cosmo_shop_*` with `includeInStock`/`includeInRop` true; deactivate out-of-scope)
- [X] T020 [US4] Call ensure from `app/api/admin/osf/generate/route.ts` before resolving columns / fetching bins
- [X] T021 [P] [US4] Optionally call ensure from `app/api/admin/osf/columns/route.ts` GET (or manage refresh) so operators see new shops without generating
- [X] T022 [P] [US4] Add Vitest for slug/key rules + qualify/deactivate behavior in `lib/osf/shop-column-sync.test.ts` (mock warehouse list; no live ERP required)
- [X] T023 [US4] Verify new shop access keys appear in `buildOsfAccessCatalog` for variants that include shops and remain unmarked for restricted users (extend `lib/osf/column-access-catalog` / visibility tests if needed)

**Checkpoint**: New Cosmetics shop warehouses auto-appear on OSF without seed script; fail-closed Access

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Gates, UAT, cleanup

- [X] T024 [P] Grep UI/copy for leftover primary â€œVAT OSFâ€ labels (keep internal `vat` enum) and fix stragglers in `components/` / `app/api/admin/osf/`
- [X] T025 Run targeted Vitest: `npm test -- lib/osf/column-visibility.test.ts lib/osf/vat-rop-columns.test.ts lib/osf/build-workbook.test.ts lib/osf/shop-column-sync.test.ts`
- [ ] T026 Walk manual scenarios in `specs/058-vat-osf-column-access/quickstart.md` (Access empty start, VAT location set, shop sync)
- [X] T027 Lint touched files; only after **explicit user confirmation** run `npm run db:deploy:all` (or target env) for the new migration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** â†’ **Phase 2 Foundational** (blocks all stories)
- **US1 (Phase 3)** â†’ MVP; can ship Access alone
- **US2 (Phase 4)** â€” parallelizable with US1 after T010 exists for Access label; mostly independent of US3/US4
- **US3 (Phase 5)** â€” needs T005 catalog filter; workbook changes independent of US4
- **US4 (Phase 6)** â€” independent of Access UI after foundational catalog rebuilds include new columns
- **Polish** â€” after desired stories complete

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|--------|
| US1 | Phase 2 | MVP |
| US2 | Phase 2 (T010 for Access label) | Rename only |
| US3 | Phase 2 (T005) | VAT stock filter |
| US4 | Phase 2 | Shop sync; works with US3 VAT set |

### Parallel Opportunities

- T004 âˆ¥ T005 âˆ¥ T007 after T002/T003 started
- T012 âˆ¥ T013 (US2)
- T017 âˆ¥ T018 after T015/T016
- T021 âˆ¥ T022 after T019
- US2 and US4 can proceed in parallel once Phase 2 done (different files)

### Parallel Example: After Foundational

```text
Dev A: T008â€“T011 (US1 Access API + UI)
Dev B: T015â€“T017 (US3 VAT stock filter)  # after T005
Dev C: T019â€“T022 (US4 shop sync)
Dev D: T012â€“T014 (US2 rename)
```

---

## Implementation Strategy

### MVP First (US1 only)

1. T001 â†’ T002â€“T007 (foundation + migration create)
2. T008â€“T011 (variant Access + generate)
3. **STOP** â€” validate Independent Test for US1
4. Deploy migration only with user confirmation

### Incremental Delivery

1. MVP US1 â†’ per-variant Access
2. US2 â†’ VAT Items naming
3. US3 â†’ VAT location column set (closes current ROP-only gap)
4. US4 â†’ auto shop columns
5. Polish + quickstart UAT

### Suggested MVP Scope

**US1 only** (T001â€“T011): assigners can set VAT Items / Others Access; downloads honor variant marks.

---

## Notes

- Do **not** `db:deploy` / push `main` without explicit user confirmation (constitution IV)
- Internal enum stays `vat`; product string **VAT Items OSF**
- Fail closed: no Mainâ†’VAT mark copy; new shop columns unmarked for restricted users
- [P] = different files; avoid parallel edits to the same route/panel without sequencing
