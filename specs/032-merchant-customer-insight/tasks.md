# Tasks: Merchant Customer Insight

**Input**: Design documents from `/specs/032-merchant-customer-insight/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for loyalty-tier classifier, lifetime-total aggregation, and search-cap helpers are included (plan Testing + constitution gate). Not a full TDD/contract-test suite.

**Organization**: Phases by user story so each increment is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1–US5 maps to spec user stories
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create `lib/customer-insight/` layout and shared types used by all stories.

- [x] T001 Create `lib/customer-insight/` package layout with barrel `lib/customer-insight/index.ts` exporting public helpers only
- [x] T002 [P] Add shared insight DTO / loyalty / invoice types in `lib/customer-insight/types.ts` aligned with `contracts/customer-insight.md` and `data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: RBAC, validation, and pure helpers that MUST exist before any user story APIs/UI.

**⚠️ CRITICAL**: No user story work begins until this phase is complete

- [x] T003 Add `contacts.insight.read` to `DEFAULT_PERMISSIONS` and wire default roles in `lib/rbac.ts` per `research.md` R1 (merchant/shop-facing cohort alongside `book_notes.manage` where practical; admins already pass all checks)
- [x] T004 [P] Add customer-insight Zod schemas (search `phone` query, `contactId` cuid, `invoicesPage` / `invoicesPageSize`) in `lib/validation.ts` or `lib/validation/customer-insight.ts` re-exported from `lib/validation.ts` (use `cuidSchema`, `LIMITS`, trimmed phone rules)
- [x] T005 [P] Implement loyalty tier classifier in `lib/customer-insight/loyalty-tier.ts` (`standard` / `gold`+`loyalcs` / `platinum`+`loyalcs2`; Gold inclusive 100000–250000; thresholds + labels)
- [x] T006 [P] Implement lifetime total helper in `lib/customer-insight/lifetime-total.ts` (sum non-cancelled `Order.totalPrice` via phone-first contact lookup + Adapt `ttlAmount` for `contactId` per research R3)
- [x] T007 [P] Implement insight serializer stubs / shared builders in `lib/customer-insight/serialize.ts` (contact identity + loyalty block shape from contract)
- [x] T008 [P] Add Vitest unit tests for `loyalty-tier.ts` boundary totals (99999 / 100000 / 250000 / 250001) in `lib/customer-insight/loyalty-tier.test.ts`
- [x] T009 [P] Add Vitest unit tests for cancelled-order exclusion and Adapt inclusion rules in `lib/customer-insight/lifetime-total.test.ts` (mock inputs / pure reducers as designed)

**Checkpoint**: Foundation ready — permission, validation, tier/total helpers, and unit tests exist; stories can start

---

## Phase 3: User Story 1 - Search a customer by phone (Priority: P1) 🎯 MVP

**Goal**: Merchants open Customer Insight, search by phone, and see capped matches (or not-found) with identity — no contact directory.

**Independent Test**: User with `contacts.insight.read` searches a known phone and sees ≤10 matches with name/phone; unknown phone shows empty; no Import/Export/list controls; user without permission is denied.

### Implementation for User Story 1

- [x] T010 [US1] Implement phone search helper in `lib/customer-insight/search.ts` (reuse `buildPhoneLookupVariants` / `buildContactPhoneSearchOrFilters` from `lib/phone-lookup.ts`; company-scoped `ContactMaster`; hard-cap 10 matches; set `truncated` when more exist)
- [x] T011 [US1] Implement GET `app/api/admin/customer-insight/search/route.ts` gated by `requirePermission("contacts.insight.read")` per `contracts/customer-insight.md` (400 invalid phone; 404 no company; never page-all contacts)
- [x] T012 [US1] Create server page `app/(dashboard)/dashboard/customer-insight/page.tsx` gated with `contacts.insight.read` (`redirect` login / `PermissionDeniedCard` pattern like book-notes)
- [x] T013 [US1] Build client search UI in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`: phone input, submit/debounce search, match list / not-found, no directory table, no Import/Export buttons
- [x] T014 [US1] Add sidebar NavItem for Customer Insight gated by `contacts.insight.read` in `components/organisms/app-sidebar.tsx` (near Book Notes / merchant tools)

**Checkpoint**: Merchant can search by phone and see matches only — MVP demoable

---

## Phase 4: User Story 2 - View invoice history (Priority: P1)

**Goal**: After selecting a contact, merchants see paginated unified invoice/order history (Cosmo `Order` + Adapt `AdaptPurchaseHistory`).

**Independent Test**: Open a contact with multiple Cosmo + Adapt invoices; list shows date, reference, status, amount; empty history shows empty state; pagination works for large histories.

### Implementation for User Story 2

- [x] T015 [US2] Implement unified invoice merge + pagination helper in `lib/customer-insight/invoices.ts` (`source: order|adapt`, reference/status/amount/date, `includedInLoyaltyTotal`, newest-first) per research R6 and `data-model.md`
- [x] T016 [US2] Implement GET `app/api/admin/customer-insight/[contactId]/route.ts` (`contacts.insight.read`): load company-scoped contact, return identity + paginated `invoices` / `invoicePagination` per contract (loyalty/frequency/charts may be stubs until later stories)
- [x] T017 [US2] Extend `customer-insight-panel.tsx` to select a match (or auto-open single match), fetch insight by `contactId`, render invoice table with pagination and empty state
- [x] T018 [US2] Ensure cancelled Cosmo orders appear in history with visible cancelled status and `includedInLoyaltyTotal: false` in `lib/customer-insight/invoices.ts` + API response

**Checkpoint**: Merchant can review full invoice history for a searched contact

---

## Phase 5: User Story 5 - View-only merchant access (Priority: P1)

**Goal**: Merchants with insight permission can only search/view; no full contact list, export, or import via this feature; Contact Master tools stay separate.

**Independent Test**: Merchant session has no export/import/list on insight UI/API; `GET …/search` never returns unfiltered directory; missing permission → 403; Contact Master unchanged for admins.

### Implementation for User Story 5

- [x] T019 [US5] Audit `app/api/admin/customer-insight/**` routes: GET-only; only `contacts.insight.read`; no re-export of `contacts/page-data`, export, or import handlers
- [x] T020 [US5] Harden `customer-insight-panel.tsx` + `page.tsx`: explicitly omit Import/Export/bulk actions; do not link to `/dashboard/contacts` as a directory browser from this page
- [x] T021 [P] [US5] Add Vitest (or small helper test) for search cap / truncate flag behavior in `lib/customer-insight/search.test.ts`

**Checkpoint**: Privacy boundary enforced for merchant insight surface

---

## Phase 6: User Story 4 - Loyalty group visibility (Priority: P2)

**Goal**: Insight shows Standard / Gold (`loyalcs`) / Platinum (`loyalcs2`) from lifetime total with threshold legend.

**Independent Test**: Contacts below 100k / mid-band / above 250k show correct badges; UI explains thresholds in plain language.

### Implementation for User Story 4

- [x] T022 [US4] Wire `lifetime-total.ts` + `loyalty-tier.ts` into GET `app/api/admin/customer-insight/[contactId]/route.ts` so response includes full `loyalty` object (`key`, `label`, `code`, `lifetimeTotal`, `currency`, `thresholds`) per contract
- [x] T023 [US4] Add customer header UI in `customer-insight-panel.tsx`: group badge (Standard/Gold/Platinum), optional code subtitle (`loyalcs` / `loyalcs2`), lifetime total, short threshold legend
- [x] T024 [P] [US4] Export threshold constants from `lib/customer-insight/loyalty-tier.ts` for UI legend consistency (single source of truth)

**Checkpoint**: Merchants can answer “what group is this customer?” from the UI alone

---

## Phase 7: User Story 3 - What they buy & how often (Priority: P2)

**Goal**: Show top purchased items, buying frequency KPIs, and Recharts visualizations when history is sufficient.

**Independent Test**: Customer with repeated purchases shows top items + frequency + charts; thin history shows factual KPIs without misleading empty charts (`chartsAvailable: false` when &lt;3 loyalty-eligible docs).

### Implementation for User Story 3

- [x] T025 [P] [US3] Implement frequency metrics helper in `lib/customer-insight/frequency.ts` (orderCount, first/last dates, avgDaysBetweenOrders when count ≥ 2) per research R7
- [x] T026 [P] [US3] Implement top-items aggregator in `lib/customer-insight/top-items.ts` (non-cancelled `OrderLineItem` + Adapt `lineItems` via `adaptLineItemsForPurchaseUi`; top N ~10)
- [x] T027 [US3] Implement monthly spend/order series builder in `lib/customer-insight/series.ts` (loyalty-eligible amounts only; set `chartsAvailable` when count ≥ 3)
- [x] T028 [US3] Extend GET `app/api/admin/customer-insight/[contactId]/route.ts` to include `frequency`, `topItems`, `series`, `chartsAvailable` per contract
- [x] T029 [US3] Add KPI cards + top-items list in `customer-insight-panel.tsx`
- [x] T030 [US3] Add Recharts spend/orders-over-time and top-items charts via `components/ui/chart.tsx` in `customer-insight-panel.tsx` (or small child components under `app/(dashboard)/dashboard/customer-insight/`); hide trend chart when `chartsAvailable` is false

**Checkpoint**: Merchants get a clear behavioral explanation of the searched customer

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, UX polish, and CI gates across stories.

- [x] T031 [P] Re-export public API from `lib/customer-insight/index.ts` and remove any accidental exports of internal-only helpers
- [x] T032 Run `npm test` for `lib/customer-insight/*.test.ts` and fix failures; ensure changed files lint clean
- [x] T033 Walk `specs/032-merchant-customer-insight/quickstart.md` manual checks (permission deny, search, loyalty boundaries, charts, isolation) and note gaps if any
- [x] T034 [P] Mobile-responsive pass on `customer-insight-panel.tsx` (search + invoice table + charts readable on narrow viewports)
- [x] T035 Confirm no Prisma schema/migration was introduced for v1 (Constitution I); document in PR if deferred caching is proposed later

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP search
- **US2 (Phase 4)**: After US1 (needs panel + contact selection); can start API helpers in parallel with US1 UI once foundation done
- **US5 (Phase 5)**: After US1–US2 routes/UI exist (hardens the surface); permission choice already in Phase 2
- **US4 (Phase 6)**: After US2 insight route exists (extends response + header UI); helpers already in Phase 2
- **US3 (Phase 7)**: After US2 insight route; builds on loyalty-eligible document set from Phase 2/4
- **Polish (Phase 8)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on other stories
- **US2 (P1)**: Needs US1 selection UX (or can deep-link by `contactId` for API-only test)
- **US5 (P1)**: Cross-cuts US1/US2 surfaces; foundational permission is prerequisite
- **US4 (P2)**: Needs insight GET from US2; tier/total helpers from Foundational
- **US3 (P2)**: Needs insight GET from US2; independent of US4 UI but shares loyalty-eligible filters

### Parallel Opportunities

- T001 then T002; Phase 2: T004–T009 in parallel after T003 (or T003 parallel with T004–T007 if careful)
- After Foundational: T010–T011 (API) parallel with early page shell T012
- US3: T025–T026 parallel before T027–T028
- Polish: T031, T034, T035 parallel

### Parallel Example: Foundational helpers

```bash
# After T001–T003:
Task: "Zod schemas in lib/validation.ts"
Task: "loyalty-tier.ts"
Task: "lifetime-total.ts"
Task: "serialize.ts"
Task: "loyalty-tier.test.ts"
Task: "lifetime-total.test.ts"
```

### Parallel Example: User Story 3

```bash
Task: "frequency.ts"
Task: "top-items.ts"
# then series + API + UI sequentially
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1–2 (Setup + Foundational)
2. Complete Phase 3 (US1 search + page + sidebar)
3. **STOP and VALIDATE**: phone search works; permission deny works; no directory/export
4. Demo MVP

### Incremental Delivery

1. Setup + Foundational → helpers + RBAC ready
2. US1 → search MVP
3. US2 → invoice history
4. US5 → harden view-only boundary
5. US4 → loyalty badge + legend
6. US3 → items, frequency, charts
7. Polish → quickstart + tests green

### Suggested MVP scope

**US1 only** (Phases 1–3): merchants can find a customer by phone with capped matches under `contacts.insight.read`.

---

## Notes

- [P] = different files, no incomplete-task dependencies
- Do **not** grant merchants `contacts.master.*` / `contacts.read` / `contacts.manage`
- Do **not** add Prisma migrations in v1
- Reuse `lib/phone-lookup.ts`, `lib/contact-purchase-lookup.ts`, `lib/contact-identifiers.ts`, `adaptLineItemsForPurchaseUi`
- Charts: existing `recharts` + `components/ui/chart.tsx` only
- Commit after each task or logical group; stop at checkpoints to validate independently
