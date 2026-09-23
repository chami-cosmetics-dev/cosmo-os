# Tasks: OSF VAT Variants

**Input**: Design documents from `/specs/056-osf-vat-variants/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan calls for Vitest on VAT membership + VAT ROP column/Total ROP helpers â€” included. Manual UAT via `quickstart.md`.

**Organization**: Tasks grouped by user story (US1â€“US3) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1â€“US3 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/056-osf-vat-variants/plan.md`, `research.md`, `data-model.md`, `contracts/osf-generate-variants.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/osf/catalog-rows.ts`, `lib/osf/build-workbook.ts`, `lib/osf/build-workbook.test.ts`, `lib/validation/osf.ts`, `app/api/admin/osf/generate/route.ts`, `components/organisms/osf-generate-panel.tsx`, `lib/item-trends/physical-shops.ts`, `lib/store-allocation/osf-columns.ts`, `lib/cosmetics-lk-location.ts`, `lib/product-items/erp-priority-options.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared variant enum, VAT membership helpers, VAT ROP column helpers, and Zod field â€” blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Add `osfVariant` enum (`main` | `vat` | `non_vat`, default `main`) to `osfGenerateBodySchema` in `lib/validation/osf.ts` per `contracts/osf-generate-variants.md`
- [X] T004 [P] Implement VAT membership helpers in `lib/osf/vat-membership.ts` (`isVatErpPriority`, `filterCatalogByOsfVariant` using ERP1/ERP2 Product Priority `Vat`, case-insensitive)
- [X] T005 [P] Implement VAT ROP column helpers in `lib/osf/vat-rop-columns.ts` (select Cosmetics.lk + shop `includeInRop` columns via existing classifiers; `totalRopForVat` = Cosmetics.lk ROP only)
- [X] T006 [P] Add Vitest for membership in `lib/osf/vat-membership.test.ts` (Vat on erp1 only / erp2 only / both / neither; main keeps all; non_vat excludes Vat)
- [X] T007 [P] Add Vitest for ROP helpers in `lib/osf/vat-rop-columns.test.ts` (shop ROPs excluded from total; other company columns omitted from VAT ROP set; missing Cosmetics.lk ROP -> blank/zero total)

**Checkpoint**: Zod + pure helpers + unit tests ready

---

## Phase 3: User Story 1 - Generate one of three OSF workbooks (Priority: P1) ðŸŽ¯ MVP

**Goal**: Purchasing can choose Main / VAT / Non-VAT and download the matching catalog slice with identifiable filenames

**Independent Test**: Catalog with Vat and non-Vat SKUs â†’ VAT file only Vat; Non-VAT excludes Vat; Main has both; filenames `OSF-â€¦` / `OSF-vat-â€¦` / `OSF-non-vat-â€¦`

### Implementation for User Story 1

- [X] T008 [US1] Apply `filterCatalogByOsfVariant` after `buildCatalogRows` in `app/api/admin/osf/generate/route.ts` using parsed `osfVariant`
- [X] T009 [US1] Set download filename + `X-OSF-Variant` response header in `app/api/admin/osf/generate/route.ts` per contract (including reorder + variant names)
- [X] T010 [US1] Add Main / VAT / Non-VAT selector and send `osfVariant` in POST body from `components/organisms/osf-generate-panel.tsx` (default Main; action-loading UX unchanged)
- [X] T011 [US1] When variant is `vat` or `non_vat`, treat membership as authoritative in `components/organisms/osf-generate-panel.tsx` (do not require ERP priority dropdown = Vat; leave dropdown All or ignore for those variants)

**Checkpoint**: US1 â€” three downloads with correct SKU membership

---

## Phase 4: User Story 2 - VAT OSF ROP columns and Total ROP (Priority: P1)

**Goal**: VAT workbook ROP headers = Cosmetics.lk + shops only; Total ROP = Cosmetics.lk ROP; Main/Non-VAT unchanged; threshold/% of ROP use VAT total

**Independent Test**: VAT SKU Cosmetics.lk ROP 100 + shop ROPs 60 â†’ Total ROP 100; no other company ROP headers on VAT file; Main still sums all ROP columns

### Implementation for User Story 2

- [X] T012 [US2] Parameterize `lib/osf/build-workbook.ts` for `osfVariant` (or equivalent options): VAT restricts ROP columns via `vat-rop-columns`; Total ROP / % / 70% use Cosmetics.lk-only total; stock columns unchanged
- [X] T013 [US2] Pass variant into `buildOsfWorkbookBuffer` from `app/api/admin/osf/generate/route.ts`
- [X] T014 [US2] Use Cosmetics.lk-only Total ROP when evaluating `belowThresholdOnly` / `maxStockPctOfRop` for `osfVariant === "vat"` in `app/api/admin/osf/generate/route.ts`
- [X] T015 [P] [US2] Extend Vitest in `lib/osf/build-workbook.test.ts` for VAT ROP headers + Total ROP = Cosmetics.lk only; assert Main path still sums includeInRop columns

**Checkpoint**: US2 â€” VAT ROP layout + totals correct; Main/Non-VAT regressions covered

---

## Phase 5: User Story 3 - Maintain Cosmetics.lk and shop ROPs for VAT items (Priority: P2)

**Goal**: Confirm existing ROP edit/import paths cover Cosmetics.lk + shop columns so VAT OSF shows updated values (no new ROP API)

**Independent Test**: Save Cosmetics.lk + one shop ROP for a Vat SKU â†’ regenerate VAT OSF â†’ both values appear; Total ROP tracks Cosmetics.lk

### Implementation for User Story 3

- [X] T016 [US3] Verify product OSF ROP editor lists Cosmetics.lk + shop columns when `includeInRop` in `components/organisms/osf-product-editor.tsx` (fix only if shops missing due to flag/filter bugs)
- [X] T017 [US3] Verify ROP template/import includes those columns via existing `app/api/admin/osf/rop-template` and `app/api/admin/osf/rop-import` flows (no API change unless a bug blocks Cosmetics.lk/shop keys)
- [X] T018 [US3] Add a short note on the generate panel or ROP import panel in `components/organisms/osf-generate-panel.tsx` or `components/organisms/osf-rop-import-panel.tsx` that VAT OSF Total ROP uses Cosmetics.lk ROP only (shop ROPs for planning)

**Checkpoint**: US3 â€” ROP maintenance path validated for VAT columns

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression + quickstart validation

- [X] T019 [P] Run `npm test -- lib/osf/vat-membership.test.ts lib/osf/vat-rop-columns.test.ts lib/osf/build-workbook.test.ts` and fix failures
- [X] T020 Walk manual scenarios in `specs/056-osf-vat-variants/quickstart.md` (Main / VAT / Non-VAT / ROP update / empty VAT)
- [X] T021 [P] Confirm Vault OS still rejects Cosmo OSF generate unchanged in `app/api/admin/osf/generate/route.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational â€” MVP
- **US2 (Phase 4)**: After Foundational; ideally after US1 so generate already passes `osfVariant` (T013 depends on route wiring from US1)
- **US3 (Phase 5)**: After US2 (needs VAT workbook to verify ROP display)
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: No dependency on US2/US3 â€” membership + filenames alone are valuable
- **US2 (P1)**: Needs `osfVariant` plumbed (US1) to exercise VAT ROP path end-to-end
- **US3 (P2)**: Needs US2 VAT ROP columns so regenerated file proves maintenance

### Parallel Opportunities

- T002 with T001
- T004, T005, T006, T007 in parallel after T003 (tests can start once helper APIs sketched)
- T015 parallel with route work once build-workbook API shape known
- T019 / T021 in parallel during polish

---

## Parallel Example: Foundational

```bash
# After T003 schema:
Task: "Implement lib/osf/vat-membership.ts"
Task: "Implement lib/osf/vat-rop-columns.ts"
Task: "Vitest lib/osf/vat-membership.test.ts"
Task: "Vitest lib/osf/vat-rop-columns.test.ts"
```

---

## Parallel Example: User Story 1

```bash
# After foundational:
Task: "Filter catalog by variant in generate/route.ts"
Task: "UI selector in osf-generate-panel.tsx"  # can draft UI while route finishes
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 â€” three variants with correct membership + filenames
4. **STOP and VALIDATE** before VAT ROP math

### Incremental Delivery

1. Setup + Foundational
2. US1 â†’ demo three downloads
3. US2 â†’ VAT ROP rules + Total ROP
4. US3 â†’ confirm ROP maintain path
5. Polish / quickstart

### Suggested MVP scope

**US1 only** (plus Foundational): Main / VAT / Non-VAT catalog slices. US2 required before calling VAT OSF â€œcompleteâ€ for purchasing math.

---

## Notes

- No Prisma migration
- Vault OSF out of scope
- Do not use Cosmo `itemStatusCategory` / `VAT_TOP_PRIORITY_BRAND` for membership
- [P] = different files, no incomplete-task dependency
- Commit after each task or logical group when asked
