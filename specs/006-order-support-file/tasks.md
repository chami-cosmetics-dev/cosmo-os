# Tasks: Order Support File (OSF) Generator

**Input**: Design documents from `/specs/006-order-support-file/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for pure helpers (`baseSku`, formulas, monthly sales) — included as optional helper tests, not full TDD

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/006-order-support-file/plan.md`, `research.md`, `data-model.md`, `contracts/osf-generator.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `prisma/schema.prisma` (`ProductItem`, `CompanyLocation`, `CompanyLocationWarehouse`), `lib/rbac.ts`, `lib/product-item-status.ts`, `app/api/admin/merchant-reviews/export/route.ts` (`xlsx` pattern), `lib/product-item-barcode.server.ts` (ERP fetch pattern)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RBAC, pure OSF libs, Zod validation — blocks all user stories

**CRITICAL**: No user story work until this phase completes

- [X] T003 Add Prisma models `ProductOsfProfile`, `ProductOsfRop`, and `OsfColumnConfig` in `prisma/schema.prisma` per `specs/006-order-support-file/data-model.md` (include optional `ogfPrice` on profile; wire Company relations)
- [X] T004 Create migration with `npm run db:migrate:create` for OSF tables; do **not** run `db:push` against shared DBs
- [X] T005 [P] Add permissions `purchasing.osf.read` and `purchasing.osf.manage` in `lib/rbac.ts` (DEFAULT_PERMISSIONS + admin role keys as appropriate)
- [X] T006 [P] Add Zod schemas in `lib/validation/osf.ts` for column upsert, profile PATCH, and generate body (`salesMonth`, `asOfDate`) per `contracts/osf-generator.md`
- [X] T007 [P] Implement `lib/osf/base-sku.ts` — strip trailing `_N` / `-N` for Common SKU grouping
- [X] T008 [P] Implement `lib/osf/formulas.ts` — `%`, 70% ROP threshold label, order qty `(ROP - stock)`, Cosmetics Margin `(MRP - cost)/MRP`, OGF Margin `(ogfPrice - cost)/ogfPrice` (blank when inputs missing; **no LWK↔OGF mapping**)
- [X] T009 [P] Add Vitest in `lib/osf/base-sku.test.ts` and `lib/osf/formulas.test.ts` for grouping + margin/order-qty edge cases
- [X] T010 Document deploy gate: after user confirmation `npm run db:deploy:all` in `specs/006-order-support-file/quickstart.md`

**Checkpoint**: Schema + helpers + permissions ready; stories can consume them

---

## Phase 3: User Story 2 - Maintain ROP, Shop Availability, OGF Price in Cosmo UI (Priority: P1)

**Goal**: Authorized users edit Shop Availability, per-column ROP, and independent OGF Price in OS UI (no Excel import)

**Independent Test**: Save availability + ROP + OGF Price for a SKU in UI → refresh → values persist; user without `purchasing.osf.manage` gets 403

### Implementation for User Story 2

- [X] T011 [US2] Implement `GET`/`PUT` column config in `app/api/admin/osf/columns/route.ts` (`requirePermission` manage for PUT, read for GET) per `contracts/osf-generator.md`
- [X] T012 [US2] Implement `GET` profiles list/search in `app/api/admin/osf/profiles/route.ts` joining catalog identity from `ProductItem` / Vendor
- [X] T013 [US2] Implement `PATCH` in `app/api/admin/osf/profiles/[sku]/route.ts` to upsert `shopAvailability`, `ogfPrice`, and `rops` map (`ProductOsfRop`)
- [X] T014 [P] [US2] Build `components/organisms/osf-columns-settings.tsx` — map label ↔ location, stock/ROP flags, sort order, save
- [X] T015 [P] [US2] Build `components/organisms/osf-product-editor.tsx` — search SKU, Shop Availability toggle, OGF Price input, ROP inputs per active ROP column, save
- [X] T016 [US2] Add dashboard page `app/(dashboard)/dashboard/purchasing/osf/page.tsx` (or settings subsection) wiring columns settings + product editor; gate with OSF permissions
- [X] T017 [US2] Add nav/sidebar entry for OSF maintenance (match existing dashboard nav patterns) visible when user has `purchasing.osf.read` or `purchasing.osf.manage`

**Checkpoint**: US2 — ROP / availability / OGF Price editable in Cosmo without Excel import

---

## Phase 4: User Story 1 - Generate the Main OSF workbook (Priority: P1) 🎯 MVP

**Goal**: One-click Main-sheet XLSX download using Excel headers only (fill existing columns; no invented headers except agreed monthly sales later)

**Independent Test**: Configure columns + set ROP on sample SKUs → Generate → open XLSX → identity/stock/ROP/calc/pricing columns match Excel Main headers; stock matches ERP Bin; missing sources blank; OGF Price from profile (not LWK)

### Implementation for User Story 1

- [X] T018 [US1] Implement `lib/osf/column-config.ts` — resolve active `OsfColumnConfig` → warehouse list via `CompanyLocation.erpnextWarehouse` + `CompanyLocationWarehouse`
- [X] T019 [US1] Implement `lib/osf/erp-stock.ts` — batch ERP Bin `actual_qty` by warehouse + item_code (reuse ERP auth patterns from `lib/product-item-barcode.server.ts` / `lib/erpnext-sync.ts`)
- [X] T020 [P] [US1] Implement `lib/osf/erp-cost-supplier.ts` — latest cost + supplier per item from ERP; blank if missing
- [X] T021 [US1] Implement catalog row builder in `lib/osf/catalog-rows.ts` — one row per distinct company SKU from `ProductItem` (identity, MRP/compareAt, discounted/price, item status, image, barcode)
- [X] T022 [US1] Implement `lib/osf/build-workbook.ts` — assemble Main sheet columns in reference Excel order (stock, ROP, 70% labels, order qty, pricing with independent OGF + margins, Common SKU via `baseSku`); emit via `xlsx`
- [X] T023 [US1] Implement `POST` `app/api/admin/osf/generate/route.ts` — validate body, `purchasing.osf.read`, return XLSX attachment; 502 if ERP unreachable without inventing stock/cost
- [X] T024 [US1] Build `components/organisms/osf-generate-panel.tsx` — as-of date, generate button, progress/error; wire into OSF page from T016
- [X] T025 [P] [US1] Add Vitest for workbook column presence / Common SKU aggregation helpers in `lib/osf/build-workbook.test.ts` (pure fixtures, no live ERP)

**Checkpoint**: US1 — Main OSF downloads and matches Excel column set with live Cosmo/ERP data

---

## Phase 5: User Story 3 - Field source clarity (Priority: P1)

**Goal**: Ops can see where each OSF column group comes from (Cosmo / ERP / Calc / UI)

**Independent Test**: Open OSF hub help/legend → each major column group lists source matching Field Source Catalog; generate still works

### Implementation for User Story 3

- [X] T026 [US3] Add in-app Field Source legend component `components/molecules/osf-field-source-legend.tsx` summarizing catalog from `specs/006-order-support-file/spec.md` (identity Cosmo, stock ERP, ROP UI, OGF UI independent, margins calc, cost ERP)
- [X] T027 [US3] Surface legend on OSF page (`app/(dashboard)/dashboard/purchasing/osf/page.tsx`) near Generate panel
- [X] T028 [P] [US3] Ensure generate error messages distinguish ERP failure vs missing ROP/OGF (no silent invent) in `app/api/admin/osf/generate/route.ts`

**Checkpoint**: US3 — source clarity visible without reading the spec repo

---

## Phase 6: User Story 4 - Monthly sales per item (Priority: P2)

**Goal**: Main sheet includes monthly units sold per SKU for selected calendar month

**Independent Test**: Pick month with known delivered/invoiced lines → generate → sales column matches manual Cosmo count (non-voided, delivery_complete|invoice_complete, date = deliveryCompleteAt ?? invoiceCompleteAt, Asia/Colombo)

### Implementation for User Story 4

- [X] T029 [US4] Implement `lib/osf/monthly-sales.ts` — aggregate `OrderLineItem.quantity` by SKU with FR-009 / FR-009a rules (no return netting)
- [X] T030 [P] [US4] Add Vitest in `lib/osf/monthly-sales.test.ts` for month bucketing and void/stage exclusions
- [X] T031 [US4] Extend generate body + `osf-generate-panel.tsx` with required `salesMonth` (`YYYY-MM`)
- [X] T032 [US4] Append monthly sales column(s) in `lib/osf/build-workbook.ts` after existing Excel pricing columns (agreed extension only — do not reorder Excel headers)
- [X] T033 [US4] Wire monthly sales into `POST` `app/api/admin/osf/generate/route.ts` assembly path

**Checkpoint**: US4 — sales month column present and accurate on generated file

---

## Phase 7: User Story 5 - Assignee / filtered sheets (Priority: P3)

**Goal**: Optional filtered export (Randil/Inoka-style) by brand/status/saved filter without parallel Excel masters

**Independent Test**: Apply brand filter → export → only matching SKUs; columns still match Main

### Implementation for User Story 5

- [X] T034 [US5] Extend generate body with optional filters (`vendorIds`, `itemStatusCategories`, `skuPrefix`) in `lib/validation/osf.ts` + `contracts` notes
- [X] T035 [US5] Apply filters in catalog row builder / generate route before workbook build
- [X] T036 [US5] Add filter controls to `components/organisms/osf-generate-panel.tsx` (reuse vendor/status patterns from `components/organisms/product-items-panel.tsx`)

**Checkpoint**: US5 — filtered Main-equivalent download works

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Hardening across stories

- [X] T037 [P] Seed default `OsfColumnConfig` rows for Cosmetics labels (Cosmetics.lk, LMJ, LWK, …) via one-time script `scripts/seed-osf-columns.mjs` or admin “reset defaults” — map locations by name/shortName carefully (no hard-coded IDs in app code)
- [X] T038 Confirm Country column emitted blank (or profile field if added) — no title parsing in v1
- [X] T039 Run `npm test` for `lib/osf/**` and fix regressions
- [ ] T040 Manual UAT against `specs/006-order-support-file/quickstart.md` on cosmo-dev after `db:deploy` (user-confirmed)
- [X] T041 [P] Update Roles UI labels so `purchasing.osf.*` appear clearly in `components/organisms/user-management-panel.tsx` permission list if permissions are auto-discovered from `lib/rbac.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US2 (Phase 3)**: After Foundational — recommended before/alongside US1 so ROP/OGF can be set
- **US1 (Phase 4)**: After Foundational; uses column config + profiles from US2 when present (blank ROP/OGF still allowed)
- **US3 (Phase 5)**: After OSF page exists (T016)
- **US4 (Phase 6)**: After US1 generate path exists
- **US5 (Phase 7)**: After US1 generate path exists
- **Polish (Phase 8)**: After desired stories complete

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|--------|
| US2 Maintain UI | Foundational | No dependency on generate |
| US1 Generate | Foundational (+ US2 data optional) | MVP download |
| US3 Legend | OSF page (US2/US1 shell) | Documentation UX |
| US4 Monthly sales | US1 generate | Extends workbook |
| US5 Filters | US1 generate | Extends generate body/UI |

### Parallel Opportunities

- T005–T009 after T003/T004 schema
- T014 + T015 UI components after APIs T011–T013
- T019 + T020 ERP helpers in parallel
- T026 legend vs T028 error messaging
- T029/T030 monthly sales helper while US1 UI polish continues

---

## Parallel Example: Foundational helpers

```bash
# After schema migration tasks T003–T004:
Task: "Add permissions in lib/rbac.ts"
Task: "Add Zod in lib/validation/osf.ts"
Task: "Implement lib/osf/base-sku.ts"
Task: "Implement lib/osf/formulas.ts"
```

## Parallel Example: User Story 1 ERP + catalog

```bash
Task: "Implement lib/osf/erp-stock.ts"
Task: "Implement lib/osf/erp-cost-supplier.ts"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Phase 1 Setup  
2. Phase 2 Foundational (schema, RBAC, helpers)  
3. Phase 3 US2 — edit ROP / availability / OGF in UI  
4. Phase 4 US1 — generate Main XLSX  
5. **STOP and VALIDATE** via quickstart  
6. Then US3 legend → US4 monthly sales → US5 filters  

### Incremental Delivery

1. Foundation ready  
2. US2 → demo UI maintenance  
3. US1 → demo full OSF download (MVP!)  
4. US3 → source clarity  
5. US4 → sales column  
6. US5 → filtered exports  

---

## Notes

- Column set = reference Excel Main headers; **OGF ≠ LWK**
- No Excel import in v1
- Migration: `db:migrate:create` + user-confirmed `db:deploy:all`
- Tests optional except helper Vitest listed above
- Commit after each task or logical group
