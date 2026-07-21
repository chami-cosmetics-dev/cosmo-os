# Tasks: SKU Supplier Compare

**Input**: Design documents from `/specs/014-sku-supplier-compare/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for per-supplier aggregation, ranking, and recency helpers — included as helper tests (not full TDD)

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

- [X] T001 Confirm feature docs in `specs/014-sku-supplier-compare/plan.md`, `research.md`, `data-model.md`, `contracts/sku-supplier-compare.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/osf/erp-purchases.ts`, `lib/osf/erp-merge.ts`, `app/api/admin/purchasing/sku-pricing/route.ts`, `components/organisms/purchasing-sku-calculator.tsx`, `lib/validation` (LIMITS.sku), `lib/rbac.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Per-supplier ERP aggregation + ranking helpers — blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Add `SupplierPurchaseSummary` types and `accumulateSupplierPurchasesFromRows` in `lib/osf/erp-purchases.ts` per `specs/014-sku-supplier-compare/data-model.md` (group by `normalizeSupplierKey`; track `bestEverRate`/`bestEverDate`, `lastRate`/`lastDate`/`lastQty`; allowlist via `isAllowedSupplier`)
- [X] T004 Implement `fetchSupplierPurchasesBySku` in `lib/osf/erp-purchases.ts` — paginated Purchase Receipt walk (same `MAX_PAGES`/`PAGE_LENGTH`); try optional Frappe `item_code` child filter with unfiltered fallback per research R3
- [X] T005 [P] Add multi-ERP merge for supplier maps in `lib/osf/erp-merge.ts` (or adjacent helper) — min `bestEverRate` per supplier key; newest `lastDate` wins last rate/date
- [X] T006 [P] Implement `lib/osf/supplier-compare.ts` — `RECENTLY_DAYS = 30`, `isRecently`, `rankSupplierOptions` (sort best-ever asc → lastDate desc → displayName; labels `Best Option 1` / `Option 2`…; set `lastPurchasedFrom`)
- [X] T007 [P] Add Zod SKU query validation helper (or inline schema) in `lib/validation` / purchasing validation for `sku` trimmed + `LIMITS.sku` max
- [X] T008 [P] Add Vitest cases in `lib/osf/erp-purchases.test.ts` for `accumulateSupplierPurchasesFromRows` (two suppliers, allowlist skip, best-ever vs last, unpriced last)
- [X] T009 [P] Add Vitest in `lib/osf/supplier-compare.test.ts` covering rank order, price ties, `isRecently` 30-day window, single `lastPurchasedFrom`

**Checkpoint**: Aggregation + ranking helpers ready; stories can consume them

---

## Phase 3: User Story 1 - See all suppliers for a selected SKU (Priority: P1) 🎯 MVP

**Goal**: Selecting a SKU in the purchasing calculator loads and displays every allowlisted supplier with last (and best-ever) price/date fields

**Independent Test**: Select a SKU with purchase history from ≥2 suppliers; both appear with name, last price, last date (and best-ever fields); empty history shows clear empty state; no permission → 403

### Implementation for User Story 1

- [X] T010 [US1] Implement `GET` `app/api/admin/purchasing/sku-pricing/suppliers/route.ts` — require `purchasing.tools.read`; validate `sku`; load company Supplier allowlist + OSF ERP instances; return `{ sku, suppliers, erpAvailable }` per `contracts/sku-supplier-compare.md` (soft-fail ERP like existing sku-pricing)
- [X] T011 [US1] Ensure `GET /api/admin/purchasing/sku-pricing` search route in `app/api/admin/purchasing/sku-pricing/route.ts` remains unchanged (no `suppliers` on search responses)
- [X] T012 [US1] Extend `components/organisms/purchasing-sku-calculator.tsx` — on `selectItem`, lazy-fetch `/api/admin/purchasing/sku-pricing/suppliers?sku=`; show loading in supplier section only
- [X] T013 [US1] Render supplier list UI in `components/organisms/purchasing-sku-calculator.tsx` — display name, best-ever price + date, last price + date; empty “No purchase history for this SKU.”; ERP error “Supplier history unavailable”
- [X] T014 [P] [US1] Confirm disallowed suppliers never appear (allowlist path covered by helper tests + quickstart §8)

**Checkpoint**: US1 — supplier list visible for selected SKU end-to-end

---

## Phase 4: User Story 2 - Rank suppliers as Best Option 1, 2, 3 by best-ever price (Priority: P1)

**Goal**: Suppliers ordered and labeled by lowest best-ever unit price; ties broken by newer last purchase date

**Independent Test**: SKU where A best-ever 75, B 80, C 110 → Best Option 1/2/3; equal best-ever → newer lastDate ranks higher; API `optionRank`/`optionLabel` match UI

### Implementation for User Story 2

- [X] T015 [US2] Wire `rankSupplierOptions` into `app/api/admin/purchasing/sku-pricing/suppliers/route.ts` so response `suppliers` is pre-sorted with `optionRank` / `optionLabel`
- [X] T016 [US2] Display Best Option / Option N badges in `components/organisms/purchasing-sku-calculator.tsx` supplier rows (distinct from recency badges)
- [X] T017 [P] [US2] Extend `lib/osf/supplier-compare.test.ts` if needed — three-supplier ranking + best-ever vs last price divergence case from spec US2 independent test

**Checkpoint**: US2 — ranking labels correct in API and UI

---

## Phase 5: User Story 3 - Visual recency cues (Priority: P2)

**Goal**: **Recently** tag (last purchase within 30 days) and **Last purchased from** highlight on the newest last-purchase supplier

**Independent Test**: Supplier bought 2 days ago shows Recently; 90 days ago does not; exactly one Last purchased from among dated suppliers

### Implementation for User Story 3

- [X] T018 [US3] Ensure API sets `recently` and `lastPurchasedFrom` via `lib/osf/supplier-compare.ts` in `app/api/admin/purchasing/sku-pricing/suppliers/route.ts` (server date, 30 calendar days inclusive)
- [X] T019 [US3] Add colored **Recently** and **Last purchased from** badges/tags in `components/organisms/purchasing-sku-calculator.tsx` supplier list (visually distinct from Best Option labels)
- [X] T020 [P] [US3] Add/confirm Vitest edge cases in `lib/osf/supplier-compare.test.ts` — missing lastDate → no Recently; tie on lastDate → stable single lastPurchasedFrom

**Checkpoint**: US3 — recency tags visible and rule-correct

---

## Phase 6: User Story 4 - Supplier list independent of margin calculator (Priority: P2)

**Goal**: Clicking/reviewing supplier rows does not change margin calculator purchase/cost; global latest cost unchanged

**Independent Test**: Note cost → interact with supplier rows → cost and margin baseline unchanged; after new ERP purchase, refresh shows updated global cost and supplier list

### Implementation for User Story 4

- [X] T021 [US4] Ensure supplier rows in `components/organisms/purchasing-sku-calculator.tsx` do not call setters that overwrite cost / `selected.latestCost` / selling-margin baseline (display-only; no click-to-apply cost)
- [X] T022 [US4] Verify purchase/cost block still uses search-response `latestCost` only (global latest) — no dependency on selected supplier row
- [X] T023 [P] [US4] Add brief helper copy near supplier list in `components/organisms/purchasing-sku-calculator.tsx` clarifying compare is informational and margin uses latest purchase cost

**Checkpoint**: US4 — margin isolation verified

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Tests, lint, UAT

- [X] T024 [P] Run `npm test -- lib/osf/supplier-compare.test.ts lib/osf/erp-purchases.test.ts` and fix failures
- [X] T025 [P] Lint changed files (`lib/osf/erp-purchases.ts`, `lib/osf/supplier-compare.ts`, `app/api/admin/purchasing/sku-pricing/suppliers/route.ts`, `components/organisms/purchasing-sku-calculator.tsx`)
- [X] T026 Run quickstart scenarios in `specs/014-sku-supplier-compare/quickstart.md` (access, multi-supplier, ranking, Recently, Last purchased from, margin isolation, empty/ERP error, allowlist)
- [X] T027 Confirm no Prisma/schema changes were introduced for this feature (code-only)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP (API + list UI)
- **US2 (Phase 4)**: After US1 API/UI shell (or Foundational ranking helpers) — badges on list
- **US3 (Phase 5)**: After US1 list rendering — recency badges
- **US4 (Phase 6)**: After US1 UI wired — isolation check
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2–US4
- **US2 (P1)**: Needs ranking helper (T006) + list UI (T013); independently testable via option labels
- **US3 (P2)**: Needs ranking helper recency flags + list UI; independently testable via badges
- **US4 (P2)**: Needs list UI; independently testable without changing ranking rules

### Parallel Opportunities

- T002 with doc skim; T005–T009 after T003/T004 aggregation core (T005–T009 parallel across files)
- T014 parallel with T012/T013
- T017 parallel with T015/T016
- T020 parallel with T018/T019
- T023 parallel with T021/T022
- T024–T025 parallel in polish

---

## Parallel Example: Foundational

```bash
# After T003–T004 aggregation fetch:
Task: "Multi-ERP merge for supplier maps in lib/osf/erp-merge.ts"
Task: "Implement lib/osf/supplier-compare.ts ranking helpers"
Task: "Zod SKU query validation"
Task: "Vitest erp-purchases per-supplier cases"
Task: "Vitest supplier-compare.test.ts"
```

## Parallel Example: User Story 1

```bash
# After foundational:
Task: "Implement suppliers/route.ts"
# Then UI (ordered after API):
Task: "Lazy-fetch on selectItem in purchasing-sku-calculator.tsx"
Task: "Render supplier list UI"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (API + list UI)  
4. **STOP and VALIDATE** per US1 independent test / quickstart §1–2  
5. Demo multi-supplier list  

### Incremental Delivery

1. Setup + Foundational → helpers ready  
2. US1 → list visible (MVP)  
3. US2 → Best Option labels  
4. US3 → Recently + Last purchased from  
5. US4 → confirm margin isolation  
6. Polish → tests + UAT  

### Suggested MVP scope

**US1 only** (T001–T014): fetch + display all suppliers for selected SKU.

---

## Notes

- [P] = different files, no wait on incomplete sibling tasks  
- No Prisma migration / `db:deploy:all` for this feature  
- Server-side ranking and allowlist are mandatory — UI badges alone are not security  
- Do not attach suppliers to search `?q=` responses  
- Commit after each task or logical group  
