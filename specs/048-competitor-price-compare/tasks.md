# Tasks: Competitor Price Compare

**Input**: Design documents from `/specs/048-competitor-price-compare/`  
**Prerequisites**: `plan.md`, `spec.md`, `data-model.md`, `contracts/`, `research.md`, `quickstart.md`, `.specify/memory/constitution.md`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Exact file paths included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish base TypeScript types, competitor constants, and domain validation helpers.

- [X] T001 Define core market price compare interfaces and slot models in `lib/market-prices/types.ts`
- [X] T002 [P] Create competitor seed definitions, slugs, and website domain validation helpers in `lib/market-prices/competitors.ts`
- [X] T003 [P] Add unit tests for competitor slug resolution and URL host validation in `lib/market-prices/competitors.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data layer, database migration, RBAC permissions, validation schemas, and sidebar navigation required before user stories can execute.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [X] T004 Define `MarketCompetitor`, `MarketCompetitorLink`, and `MarketCompetitorPriceHistory` Prisma models with indexes and relations in `prisma/schema.prisma`
- [X] T005 Create database migration with competitor seed data using `npm run db:migrate:create` and run `npm run db:generate` in `prisma/migrations/`
- [X] T006 Register `purchasing.market_prices.read` and `purchasing.market_prices.manage` permissions and role mappings in `lib/rbac.ts`
- [X] T007 [P] Implement Zod query, mutation, and import schemas in `lib/validation/market-prices.ts`
- [X] T008 [P] Add unit tests for market price validation schemas in `lib/validation/market-prices.test.ts`
- [X] T009 Add Market Prices navigation item under Purchasing section with permission check in `components/organisms/app-sidebar.tsx`

**Checkpoint**: Foundation ready — database models, RBAC, navigation, and validation schemas in place.

---

## Phase 3: User Story 1 - View market price gap for our products (Priority: P1) 🎯 MVP

**Goal**: Purchasing staff can view a side-by-side comparison of Cosmo retail price layers (MRP, PROMO, OGF) against competitor prices (min, median, max) with gap percentages, price-layer toggles, stale data warnings, and cheapest/above-market color indicators.

**Independent Test**: Link SKUs to competitor prices; open `/dashboard/purchasing/market-prices`; verify MRP/PROMO/OGF columns display correctly, median and gap % calculate accurately, layer toggle switches sorting and highlighting, and stale warnings trigger for data older than 14 days.

### Implementation for User Story 1

- [ ] T010 [P] [US1] Implement catalog price loader for MRP, PROMO, and OGF from `ProductItem` and `ProductOsfProfile` in `lib/market-prices/catalog-prices.ts`
- [ ] T011 [P] [US1] Add unit tests for catalog price loader (promo active detection, compareAtPrice as MRP, OGF resolution) in `lib/market-prices/catalog-prices.test.ts`
- [ ] T012 [P] [US1] Implement gap calculation and summary math (median, min, max, layer gap %, cheapest flags) in `lib/market-prices/gap.ts`
- [ ] T013 [P] [US1] Implement 14-day stale check logic in `lib/market-prices/stale.ts`
- [ ] T014 [P] [US1] Add unit tests for gap math (even/odd count medians, null layers, negative/positive gaps, cheapest logic) and stale detection in `lib/market-prices/gap.test.ts`
- [ ] T015 [US1] Implement summary row builder combining catalog prices, competitor links, gap math, and stale status in `lib/market-prices/summary.ts`
- [ ] T016 [US1] Implement `GET /api/admin/purchasing/market-prices/page-data` endpoint per contract in `app/api/admin/purchasing/market-prices/page-data/route.ts`
- [ ] T017 [US1] Implement market price compare page server component with permission check in `app/(dashboard)/dashboard/purchasing/market-prices/page.tsx`
- [ ] T018 [US1] Implement compare list client panel with layer toggle (MRP/PROMO/OGF), KPI summary cards, color-coded gap badges, and stale warnings in `components/organisms/market-prices-panel.tsx`

**Checkpoint**: User Story 1 complete — core compare table functions as standalone MVP.

---

## Phase 4: User Story 2 - Link our SKU to competitor products (Priority: P1)

**Goal**: Purchasing coordinator can search for a Cosmo SKU and link it to competitor listings (URL, title, price, in-stock, check date), with pack-size mismatch warnings, upsert deduplication, and price history snapshots.

**Independent Test**: Search for a SKU, link to Liberty Store and Kiki Beauty, verify pack size warning override, confirm duplicate save updates existing row and writes to history.

### Implementation for User Story 2

- [ ] T019 [P] [US2] Implement pack size normalization and similarity check helper in `lib/market-prices/pack-size.ts`
- [ ] T020 [P] [US2] Add unit tests for pack size parsing and mismatch detection in `lib/market-prices/pack-size.test.ts`
- [ ] T021 [US2] Implement `GET /api/admin/purchasing/market-prices/links` and `POST /api/admin/purchasing/market-prices/links` with history snapshotting and pack size validation in `app/api/admin/purchasing/market-prices/links/route.ts`
- [ ] T022 [US2] Implement `PATCH` and `DELETE` endpoints for existing competitor links with cascade history in `app/api/admin/purchasing/market-prices/links/[id]/route.ts`
- [ ] T023 [US2] Implement SKU search and link modal/drawer component with pack-size confirmation prompt in `components/organisms/market-prices/link-dialog.tsx`
- [ ] T024 [US2] Integrate link creation/edit actions into main compare panel in `components/organisms/market-prices-panel.tsx`

**Checkpoint**: User Story 2 complete — staff can manually link SKUs to competitors and update prices with audit trail.

---

## Phase 5: User Story 3 - Bulk import competitor prices via spreadsheet (Priority: P1)

**Goal**: Purchasing team can download a CSV template and upload bulk competitor prices with a two-step preview and commit flow, validating rows, reporting line errors, and appending history.

**Independent Test**: Download template, upload a CSV with valid and invalid rows, verify preview shows accurate counts/errors, commit applies valid rows and refreshes compare view.

### Implementation for User Story 3

- [ ] T025 [P] [US3] Implement CSV template generator endpoint in `app/api/admin/purchasing/market-prices/template/route.ts`
- [ ] T026 [P] [US3] Implement CSV parse, validate, preview, and batch apply engine in `lib/market-prices/import.ts`
- [ ] T027 [P] [US3] Add unit tests for CSV import validation (competitor slug/name resolution, date parsing, price validation, error reporting) in `lib/market-prices/import.test.ts`
- [ ] T028 [US3] Implement `POST /api/admin/purchasing/market-prices/import` preview and commit endpoint with token verification in `app/api/admin/purchasing/market-prices/import/route.ts`
- [ ] T029 [US3] Implement import dialog component with file dropzone, validation error review table, and preview commit confirmation in `components/organisms/market-prices/import-dialog.tsx`
- [ ] T030 [US3] Connect import dialog and template download button to main toolbar in `components/organisms/market-prices-panel.tsx`

**Checkpoint**: User Story 3 complete — weekly bulk spreadsheet import workflow enabled.

---

## Phase 6: User Story 4 - Drill into competitor detail for one SKU (Priority: P2)

**Goal**: User can click any SKU to open a detailed breakdown drawer showing all six competitor slots (tracked and untracked), prices, gaps across MRP/PROMO/OGF, outbound PDP links, notes, and price history timeline.

**Independent Test**: Open detail for a SKU linked to 3 competitors; verify all 6 competitor slots appear (3 tracked, 3 untracked with add action), gaps match each layer, and external links open in new tab.

### Implementation for User Story 4

- [ ] T031 [US4] Implement detail drawer component displaying all six competitor slots, layer gap breakdown, and price history timeline in `components/organisms/market-prices/sku-detail-drawer.tsx`
- [ ] T032 [US4] Wire row click and "View details" action to open detail drawer in `components/organisms/market-prices-panel.tsx`

**Checkpoint**: User Story 4 complete — deep-dive SKU inspection and supplier negotiation view ready.

---

## Phase 7: User Story 5 - Filter and prioritize by business impact (Priority: P2)

**Goal**: Purchasing lead can filter the compare list by status (above market, cheapest, stale), brand, competitor, ERP priority, and optional fast-mover tier, and export filtered data to CSV.

**Independent Test**: Filter by "above market" on OGF layer and specific brand; export CSV; verify downloaded CSV matches filtered screen records and includes all layer gaps.

### Implementation for User Story 5

- [ ] T033 [P] [US5] Implement filtered CSV export builder in `lib/market-prices/export.ts`
- [ ] T034 [P] [US5] Add unit test for CSV export formatting in `lib/market-prices/export.test.ts`
- [ ] T035 [US5] Implement `GET /api/admin/purchasing/market-prices/export` streaming endpoint in `app/api/admin/purchasing/market-prices/export/route.ts`
- [ ] T036 [US5] Add filter controls (above market / cheapest / stale chips, brand dropdown, competitor filter, priority selector) and CSV export button in `components/organisms/market-prices-panel.tsx`

**Checkpoint**: User Story 5 complete — actionable filtering and offline pricing review exports ready.

---

## Phase 8: User Story 6 - See market gap on Item Trends movement rows (Priority: P3)

**Goal**: Purchasing team reviewing Item Trends movement leaderboard can see a compact market gap badge for SKUs that have competitor pricing on file, with quick navigation to Market Price Compare.

**Independent Test**: View Item Trends movement table; verify SKUs with competitor links display compact market gap badge and SKUs without links show nothing; click badge to view price compare.

### Implementation for User Story 6

- [ ] T037 [P] [US6] Implement compact market gap badge helper for catalog SKUs in `lib/item-trends/market-gap.ts`
- [ ] T038 [P] [US6] Add unit test for item-trends market gap badge helper in `lib/item-trends/market-gap.test.ts`
- [ ] T039 [US6] Integrate market gap badge column into Item Trends movement table in `components/organisms/item-trends/movement-table.tsx`

**Checkpoint**: User Story 6 complete — cross-feature intelligence linking movement and competitor pricing.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verification against project constitution, linting, test suites, and end-to-end acceptance flow.

- [ ] T040 Run unit test suite `npx vitest run lib/market-prices/` and typecheck `npm run mobile:typecheck` per Constitution Principle III
- [ ] T041 Verify multi-database migration status across Neon databases per Constitution Principle I
- [ ] T042 Validate complete user acceptance flow against `specs/048-competitor-price-compare/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1: Setup (T001-T003)
   ↓
Phase 2: Foundational (T004-T009) [CRITICAL GATE]
   ↓
Phase 3: User Story 1 - Core Compare MVP (T010-T018)
   ↓
Phase 4: User Story 2 - Manual Linking (T019-T024)
   ↓
Phase 5: User Story 3 - Bulk CSV Import (T025-T030)
   ↓
Phase 6: User Story 4 - Single SKU Detail (T031-T032)
   ↓
Phase 7: User Story 5 - Filter & Export (T033-T036)
   ↓
Phase 8: User Story 6 - Item Trends Badge (T037-T039)
   ↓
Phase 9: Polish & Cross-Cutting (T040-T042)
```

### User Story Dependencies

- **US1 (MVP)** depends on: Phase 2 Foundational (T004-T009)
- **US2 (Linking)** depends on: US1 data structures and page layout (T015, T018)
- **US3 (Import)** depends on: US2 link validation and persistence patterns (T021)
- **US4 (Detail)** depends on: US2 link models and UI panel (T018, T021)
- **US5 (Filter & Export)** depends on: US1 summary row builder (T015) and US4 detail
- **US6 (Item Trends Badge)** depends on: US1 summary data helper (T012, T015)

---

## Parallel Execution Opportunities

- **Phase 1**: T002 and T003 can run in parallel after T001
- **Phase 2**: T007 and T008 can run in parallel with T006 and T009
- **Phase 3 (US1)**: T010/T011 (catalog loader) and T012/T013/T014 (gap math/stale) can be implemented in parallel before T015
- **Phase 4 (US2)**: T019/T020 (pack size helper) can run in parallel with T021
- **Phase 5 (US3)**: T025 (template endpoint) and T026/T027 (import engine) can run in parallel
- **Phase 7 (US5)**: T033/T034 (export helper) can run in parallel with T035
- **Phase 8 (US6)**: T037/T038 can be developed independently of UI integration T039

---

## Implementation Strategy & MVP Guidance

1. **MVP First**: Implement Phase 1, Phase 2, and Phase 3 (T001-T018). At this stage, the purchasing team can already view market price compare data with seeded or directly inserted links, compare MRP/PROMO/OGF side-by-side, toggle price layers, and detect stale listings.
2. **Interactive Management**: Implement Phase 4 (US2, T019-T024) to enable coordinators to add and edit competitor links directly from the UI with pack-size warnings.
3. **Operational Scale**: Implement Phase 5 (US3, T025-T030) to unlock bulk weekly spreadsheet uploads.
4. **Deep Dive & Decision Support**: Implement Phase 6 & Phase 7 (US4, US5, T031-T036) for 6-competitor detail inspection and filtered CSV exports.
5. **Cross-Feature Synergy**: Implement Phase 8 (US6, T037-T039) to surface market gaps directly on Item Trends movement rows.
