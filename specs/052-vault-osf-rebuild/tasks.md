# Tasks: Supplement Vault Order Support File (OSF)

**Input**: Design documents from `/specs/052-vault-osf-rebuild/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan + constitution require Vitest on pure reducers/formulas under `lib/vault-osf/` — included, not full TDD (no FAIL-first gate)

**Organization**: Tasks grouped by user story (US1–US4) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `prisma/`, `scripts/`
- Vault-only code lives in `lib/vault-osf/` — do not change Cosmo behaviour in `lib/osf/build-workbook.ts` or `app/api/admin/osf/generate/route.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and create the Vault OSF module shell

- [X] T001 Confirm feature docs in `specs/052-vault-osf-rebuild/plan.md`, `research.md`, `data-model.md`, `contracts/vault-osf-generate.md`, `contracts/vault-osf-sales-import.md`, `contracts/vault-osf-workbook.md`, and `quickstart.md`
- [X] T002 [P] Create `lib/vault-osf/` module shell (empty `months.ts`, `columns.ts`, `catalog.ts`, `erp-sales.ts`, `erp-pricing.ts`, `erp-purchases-monthly.ts`, `formulas.ts`, `build-workbook.ts`, `sales-history-import.ts`) exporting nothing until later tasks fill them

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, column mapping, month window, Zod — MUST complete before any user story

**⚠️ CRITICAL**: No user story work until this phase completes

- [X] T003 Add nullable `OsfColumnConfig.erpCompany` and model `OsfMonthlySalesHistory` (unique `[companyId, sku, columnKey, month]`, indexes, `Company` relation) in `prisma/schema.prisma` per `specs/052-vault-osf-rebuild/data-model.md`
- [X] T004 Create the Prisma migration with `npm run db:migrate:create` only — do **not** run `npm run db:deploy:all` without explicit user confirmation (constitution IV)
- [X] T005 Extend `lib/osf/column-config.ts` `OsfResolvedColumn` + `resolveOsfColumns` to pass through `erpCompany` (null-safe; Cosmo rows stay null)
- [X] T006 [P] Implement April→as-of reporting window helpers in `lib/vault-osf/months.ts` (Colombo `YYYY-MM`, wrap Jan–Mar to previous April, last month truncated to `asOfDate`) per research R-011 / data-model
- [X] T007 [P] Add Vitest for month window edge cases in `lib/vault-osf/months.test.ts` (Sep as-of, 1st-of-month, 15 Mar wrap)
- [X] T008 Implement `resolveVaultBusinessUnits` in `lib/vault-osf/columns.ts` — require active `sv` / `ori` / `ae` with `erpCompany` + warehouses; drop Origins Online; map ERP instance ids
- [X] T009 [P] Add Zod `vaultOsfGenerateBodySchema` (`asOfDate` optional `YYYY-MM-DD`) and `vaultOsfSalesHistoryQuerySchema` (`month` `YYYY-MM`) in `lib/validation/osf.ts`
- [X] T010 [P] Write `scripts/seed-vault-osf-columns.mjs` upserting `sv` / `ori` / `ae` (`erpCompany`, `directWarehouses`, `erpnextInstanceId`) per data-model seed table — never touch Cosmo seed scripts

**Checkpoint**: Schema + window + three business units resolvable; stories can consume them

---

## Phase 3: User Story 1 - Generate Vault OSF stock, sales, reorder (Priority: P1) 🎯 MVP

**Goal**: Buyer downloads a workbook with ERP1 catalog rows, SV/ORI/AE stock, April→MTD sales groups, max sale, AVE, ROP and signed reorder qty. Price and purchase cells may be blank until US2/US3.

**Independent Test**: Generate for an as-of date in June+; reconcile SV/ORI/AE stock and monthly sale counts to ERP Bin / Sales Invoice registers. April/May sales blank. Unset ROP → blank ROP and reorder qty.

### Implementation for User Story 1

- [X] T011 [P] [US1] Fetch ERP1 enabled `is_stock_item` items and map `VaultCatalogRow` (join `ProductItem` on SKU for Priority Status only) in `lib/vault-osf/catalog.ts` — exclude `DELIVERY-CHARGES` / non-stock
- [X] T012 [P] [US1] Add Vitest for catalog filters / row mapping in `lib/vault-osf/catalog.test.ts`
- [X] T013 [P] [US1] Implement Sales Invoice parent+child fetch + reducer in `lib/vault-osf/erp-sales.ts` — month×company pages, `docstatus=1`, signed qty nets returns, skip Origins Online, blank vs 0 per research R-002/R-003/R-004
- [X] T014 [P] [US1] Add Vitest for sales reducer (returns, cancelled skipped, Origins Online dropped, empty month → null) in `lib/vault-osf/erp-sales.test.ts`
- [X] T015 [P] [US1] Implement `maxSale`, `monthsOfCover` (AVE), `reorderQty` (signed, not floored), totals with blank-if-unset in `lib/vault-osf/formulas.ts`
- [X] T016 [P] [US1] Add Vitest using sample `NW004-2` / `RE001-1` figures in `lib/vault-osf/formulas.test.ts`
- [X] T017 [US1] Emit workbook layout (identity, ROP, stock, remark/AK1/AK2, per-month sales groups, placeholder purchase pair + pricing + latest-supplier columns, Max sale, AVE, reorder qty) in `lib/vault-osf/build-workbook.ts` per `specs/052-vault-osf-rebuild/contracts/vault-osf-workbook.md` — no Cosmo columns
- [X] T018 [P] [US1] Add Vitest for header order / absent Cosmo columns / blank vs 0 in `lib/vault-osf/build-workbook.test.ts`
- [X] T019 [US1] Implement `POST` `app/api/admin/osf/vault/generate/route.ts` — `purchasing.osf.read`, 409 if no `erpCompany` columns, 502 `ERP_UNAVAILABLE` naming the failed instance, reuse `fetchBinActualQty` / `getAllOsfErpInstances` from `lib/osf/erp-stock.ts`, overlay `ProductOsfRop` (never invent 0)
- [X] T020 [US1] Create `components/organisms/vault-osf-generate-panel.tsx` (as-of date, Generate with spinner, `notify` errors) and mount it from `components/organisms/osf-hub-panel.tsx` / `app/(dashboard)/dashboard/purchasing/osf/page.tsx` without removing Cosmo generate UI

**Checkpoint**: US1 — Vault file downloads with stock + monthly sales + derived columns; Cosmo generate still works

---

## Phase 4: User Story 2 - MRP, discounted price, latest supplier (Priority: P2)

**Goal**: Fill MRP, Discounted Price (item-code pricing rules only), Latest price and Latest price supplier from both ERPs.

**Independent Test**: `NW004-2` with Tabloid 10% → MRP 9500 / Discounted 8550; SKU with no item-code rule → Discounted blank; newer Purchase Invoice across ERPs wins latest price/supplier.

### Implementation for User Story 2

- [X] T021 [P] [US2] Resolve ERP1 Standard Selling + applicable item-code `Pricing Rule` (skip transaction/coupon/group/brand, disabled, out-of-date; largest discount on overlap) in `lib/vault-osf/erp-pricing.ts`
- [X] T022 [P] [US2] Add Vitest for pricing-rule selection in `lib/vault-osf/erp-pricing.test.ts`
- [X] T023 [P] [US2] Reduce allowlisted Purchase Invoice lines (newest posting_date wins across instances) into `LatestPurchase` in `lib/vault-osf/erp-purchases-monthly.ts` reusing `buildSupplierAllowlist` / `isAllowedSupplier` from `lib/osf/erp-purchases.ts`
- [X] T024 [P] [US2] Add Vitest for latest-purchase winner + allowlist skip in `lib/vault-osf/erp-purchases-monthly.test.ts`
- [X] T025 [US2] Wire pricing + latest purchase into `app/api/admin/osf/vault/generate/route.ts` and fill MRP / Discounted Price / Latest price / Latest price suppliers in `lib/vault-osf/build-workbook.ts`

**Checkpoint**: US2 — selling prices and last external supplier cost present; US1 columns unchanged

---

## Phase 5: User Story 3 - Monthly purchase qty and value (Priority: P2)

**Goal**: Each month group includes Purch Qty and Purch Value (net, ex-tax) from allowlisted Purchase Invoices.

**Independent Test**: July double-buy sums qty and `net_amount`; intercompany / non-allowlisted supplier → blank; no purchase → blank not 0.

### Implementation for User Story 3

- [X] T026 [US3] Extend month×company Purchase Invoice accumulation (qty + `net_amount`) in `lib/vault-osf/erp-purchases-monthly.ts` using the same pager as latest-purchase
- [X] T027 [P] [US3] Add Vitest for monthly purch blank vs 0, tax excluded, allowlist in `lib/vault-osf/erp-purchases-monthly.test.ts`
- [X] T028 [US3] Place Purch Qty / Purch Value immediately after each month's sales group in `lib/vault-osf/build-workbook.ts` and populate from generate in `app/api/admin/osf/vault/generate/route.ts`

**Checkpoint**: US3 — purchase pace visible beside sales; internal transfers never counted

---

## Phase 6: User Story 4 - ROP upload and April/May sales import (Priority: P3)

**Goal**: ROP stays blank until existing ROP template/import (now SV/ORI/AE). April/May fill via sales-history template/upload; Max sale then includes those months.

**Independent Test**: Download ROP template, fill three SKUs, upload, regenerate — only those show ROP/reorder. Download April template, fill, regenerate — April cells populate; untouched SKUs stay blank.

### Implementation for User Story 4

- [X] T029 [P] [US4] Parse/upsert sales-history xlsx (SKU required, blank = no change, non-negative int, unknown SKU row error) in `lib/vault-osf/sales-history-import.ts`
- [X] T030 [P] [US4] Add Vitest for import parse/upsert rules in `lib/vault-osf/sales-history-import.test.ts`
- [X] T031 [US4] Implement `GET`+`POST` `app/api/admin/osf/vault/sales-history/route.ts` per `specs/052-vault-osf-rebuild/contracts/vault-osf-sales-import.md` (`purchasing.osf.manage`, 409 if Vault OSF not configured)
- [X] T032 [US4] Overlay `OsfMonthlySalesHistory` onto months with no ERP sales cell in `app/api/admin/osf/vault/generate/route.ts` (ERP wins when present)
- [X] T033 [US4] Add sales-history download/upload controls (busy spinner, `notify` summary) on `components/organisms/vault-osf-generate-panel.tsx`
- [X] T034 [P] [US4] Confirm existing `app/api/admin/osf/rop-template/route.ts` and `app/api/admin/osf/rop-import/route.ts` resolve headers to `sv`/`ori`/`ae` after seed — fix header map in `lib/osf/rop-import.ts` only if labels fail to match

**Checkpoint**: US4 — ROP and missing months load without developer help; generate still works with both tables empty

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Isolation, failure mode, quickstart

- [X] T035 [P] Assert Cosmo `POST /api/admin/osf/generate` still emits Cosmo columns (identity extras, `% of ROP`, OGF) — smoke via existing `lib/osf/build-workbook.test.ts` (add a regression assertion if missing)
- [X] T036 [P] Add/extend Vitest proving Origins Online company/warehouse never enters stock, sales, or purchase maps in `lib/vault-osf/columns.test.ts` and reducer tests
- [X] T037 Verify generate returns 502 `ERP_UNAVAILABLE` with instance detail when one ERP fails — handle in `app/api/admin/osf/vault/generate/route.ts` and error toast in `components/organisms/vault-osf-generate-panel.tsx`
- [X] T038 Walk `specs/052-vault-osf-rebuild/quickstart.md` on Vault env (generate, import, ROP); record any gap as a follow-up task rather than silently skipping
- [X] T039 Run `npm test` for `lib/vault-osf` and `npm run lint` on changed files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP
- **US2 (Phase 4)**: Depends on Foundational; fills columns US1 already reserved
- **US3 (Phase 5)**: Depends on Foundational; shares `erp-purchases-monthly.ts` with US2 (if US2 landed first, extend it; if parallel, agree the file owner is US2 then US3 extends)
- **US4 (Phase 6)**: Depends on Foundational + US1 generate path (overlay)
- **Polish (Phase 7)**: After stories intended for the release

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no other stories
- **US2 (P2)**: After Phase 2 — independently testable with blank purchase qty/value
- **US3 (P2)**: After Phase 2 — independently testable with prices already filled or still blank
- **US4 (P3)**: After US1 generate exists; ROP import reuses existing routes

### Parallel Opportunities

- T006/T007 and T009/T010 after T003–T005
- US1: T011–T016 in parallel (different files), then T017 → T019 → T020
- US2: T021–T024 in parallel, then T025
- US3 after US2's `erp-purchases-monthly.ts` exists (or sequential on that file)
- Polish T035/T036 in parallel

---

## Parallel Example: User Story 1

```text
T011 lib/vault-osf/catalog.ts
T013 lib/vault-osf/erp-sales.ts
T015 lib/vault-osf/formulas.ts
T012 / T014 / T016 matching *.test.ts
then T017 build-workbook.ts
then T019 generate route + T020 UI
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (migration created, not deployed until user says so)
3. Phase 3 US1 — generate stock/sales/reorder workbook
4. **STOP and VALIDATE** against ERP Bin + Sales Invoice for a June+ as-of date
5. Demo to buyer; April/May stay empty; prices/purchases blank until US2/US3

### Incremental Delivery

1. Setup + Foundational
2. US1 → MVP download
3. US2 → live MRP/discount/latest supplier
4. US3 → monthly purch qty/value
5. US4 → ROP + April/May import
6. Polish / Cosmo isolation

### Parallel Team Strategy

- Shared: Phase 1–2
- Dev A: US1 workbook + generate
- Dev B: US2 pricing (after US1 column placeholders exist)
- Dev C: US4 import (after generate overlay hook exists)
- US3 waits on the purchase-invoice module file with US2

---

## Notes

- [P] = different files, no wait on incomplete sibling tasks
- Do not edit Cosmo generate route or Cosmo workbook builder except a regression test assertion
- Blank cell ≠ `0` (R-011)
- Reorder qty signed (manual sheet negatives are overstock signal)
- `db:deploy:all` needs explicit user OK even though feature is Vault-only
