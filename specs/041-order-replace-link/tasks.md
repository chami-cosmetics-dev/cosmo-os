# Tasks: Order Cancel Replace Link

**Input**: Design documents from `/specs/041-order-replace-link/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Optional — plan expects Vitest for resolve/validation helpers; unit-test tasks in Polish (not TDD-first). Manual validation via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label (US1–US3)
- Exact file paths in every task description

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `components/`, `prisma/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature docs and target paths before coding

- [x] T001 Confirm feature docs present under `specs/041-order-replace-link/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
- [x] T002 [P] Confirm touch points from plan: `prisma/schema.prisma`, `lib/order-replace-link.ts` (new), `app/api/admin/orders/[id]/replaced-by/route.ts` (new), `app/api/admin/orders/[id]/route.ts`, `lib/page-data/orders-quick-search.ts`, `lib/page-data/orders.ts`, `components/organisms/order-fulfillment-detail.tsx`, `components/molecules/dashboard-order-search.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + shared resolve/validate helpers that ALL stories need

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T003 Add `Order.replacedByOrderId` self-FK, `replacedByOrder` / `replacedFromOrders` relations, and `@@index([companyId, replacedByOrderId])` in `prisma/schema.prisma` per `specs/041-order-replace-link/data-model.md`
- [ ] T004 Create migration with `npm run db:migrate:create` for the replace-link FK (do **not** use `prisma migrate dev` / `db push` on shared DBs); apply to active non-prod target via `npm run db:deploy:<target>` and `npm run db:generate`
- [x] T005 [P] Add Zod body schema for `{ replacedByOrderNumber: string | null }` in `lib/validation/` (new or extend existing order validation module) per `specs/041-order-replace-link/contracts/admin-orders-replaced-by.md`
- [x] T006 Implement `lib/order-replace-link.ts`: exact CI resolve of order number against company `name` / `orderNumber` / `erpnextInvoiceId` (exactly one match); helpers to set/clear `replacedByOrderId` with rules cancelled-only, not-self, company-scoped; reuse `formatBusinessOrderNumber` from `lib/order-display-label.ts`

**Checkpoint**: Schema + helpers ready — user stories can start

---

## Phase 3: User Story 1 - Record replacement order on cancelled order (Priority: P1) 🎯 MVP

**Goal**: After cancel, authorized Cosmo staff set a replacement order number on the cancelled order detail; system validates and stores FK; cancel confirmation stays free of this field

**Independent Test**: Cancelled order A + existing Cosmo order B; open A detail; enter B’s visible number; save; A shows replaced-by B. Unknown/self/non-cancelled rejected. Vault mutate blocked.

### Implementation for User Story 1

- [x] T007 [US1] Implement `PATCH` in `app/api/admin/orders/[id]/replaced-by/route.ts` per `contracts/admin-orders-replaced-by.md`: `cuidSchema`, `requirePermission("orders.cancel")`, `!isVaultOsDeployment()` gate, company scope, call `lib/order-replace-link.ts`, return `replacedByOrder` summary
- [x] T008 [US1] Enrich `GET` in `app/api/admin/orders/[id]/route.ts` to include `replacedByOrder` select/summary per `contracts/admin-orders-detail-replace-link.md` (outgoing link only is enough for US1 MVP UI)
- [x] T009 [US1] Add Cosmo-only editable “Replaced by order number” field + save on cancelled orders in `components/organisms/order-fulfillment-detail.tsx` (wire types through `components/organisms/order-invoice-view-modal.tsx` if detail props pass there); hide on non-cancelled; do **not** add field to cancel confirmation / fulfillment `cancel_order` UI
- [x] T010 [US1] Gate edit UI with cancel permission + `!isVaultOsDeployment()` (reuse `lib/falcon-waybill-brand.ts` / fulfillment permission helpers as appropriate) so Vault builds omit the control

**Checkpoint**: Staff can set replacement link on cancelled Cosmo order detail — MVP demoable

---

## Phase 4: User Story 2 - Search surfaces cancelled order and its replacement (Priority: P1)

**Goal**: Searching by either order surfaces the linked counterpart; replacement order detail shows cancelled predecessor(s) read-only

**Independent Test**: Link A→B; quick-search and orders list search for A show B; search for B show A; open B detail shows A read-only with navigation

### Implementation for User Story 2

- [x] T011 [US2] Extend `GET` enrichment in `app/api/admin/orders/[id]/route.ts` with `replacedFromOrders` summaries per `contracts/admin-orders-detail-replace-link.md`
- [x] T012 [P] [US2] Enrich hits in `lib/page-data/orders-quick-search.ts` with one-hop `replacedByOrder` / `replacedFromOrders` (batch-load, no N+1) per `contracts/admin-orders-search-replace-link.md`
- [x] T013 [P] [US2] Enrich search results in `lib/page-data/orders.ts` (orders page-data search path) with the same one-hop replace-link metadata per `contracts/admin-orders-search-replace-link.md`
- [x] T014 [US2] Show related counterpart badge/link in `components/molecules/dashboard-order-search.tsx` (and orders panel list row if search results render there) so staff can open either order
- [x] T015 [US2] Show read-only “Supersedes cancelled order(s)” on replacement detail in `components/organisms/order-fulfillment-detail.tsx` with navigation to each predecessor

**Checkpoint**: Bidirectional search + reverse detail work with US1 link data

---

## Phase 5: User Story 3 - Clear or correct a mistaken replacement link (Priority: P2)

**Goal**: Authorized staff update or clear the link from the cancelled order only; viewers without edit rights see link but cannot change it

**Independent Test**: Clear A’s field → B loses predecessor list; search unpaired. Update A to C → B/C reverse displays follow. Read-only user cannot PATCH/edit.

### Implementation for User Story 3

- [x] T016 [US3] Ensure `PATCH` clear (`replacedByOrderNumber: null`) and update paths in `app/api/admin/orders/[id]/replaced-by/route.ts` fully persist and return cleared/updated summaries (audit log if project pattern expects Order mutations)
- [x] T017 [US3] Add clear + change controls on cancelled-order replace field in `components/organisms/order-fulfillment-detail.tsx`; keep replacement-side list read-only (no edit/clear from B)
- [x] T018 [US3] Enforce read-only display for users lacking `orders.cancel` (or existing cancel-capable flag) while still showing link when `orders.read` / fulfillment read allows detail view

**Checkpoint**: Mistaken links correctable; unauthorized users cannot mutate

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tests, regression hygiene, UAT

- [x] T019 [P] Add Vitest coverage for resolve/validate rules in `lib/order-replace-link.test.ts` (exact match, ambiguous, self, not cancelled, clear)
- [x] T020 [P] Confirm cancel confirmation / `cancel_order` path in `components/organisms/order-fulfillment-detail.tsx` and `app/api/admin/orders/[id]/fulfillment/route.ts` has **no** replace-link field or side effect
- [x] T021 Run `npm test` and lint/typecheck on touched files; fix regressions
- [ ] T022 Manual Cosmo UAT against `specs/041-order-replace-link/quickstart.md` (set/search/clear/Vault gate if available)
- [ ] T023 Before merge: ensure migration deployed to all three DBs via `npm run db:deploy:all` with explicit prod confirmation when touching cosmo-prod (constitution I + IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP
- **US2 (Phase 4)**: Depends on Foundational; needs US1 link data for real UAT (can stub FK in DB for API-only test)
- **US3 (Phase 5)**: Depends on US1 PATCH + UI field existing
- **Polish (Phase 6)**: Depends on stories intended for release (US1+US2 minimum; US3 recommended)

### User Story Dependencies

- **US1 (P1)**: After Foundational only
- **US2 (P1)**: After Foundational; integrates with US1 GET/UI surfaces
- **US3 (P2)**: After US1 mutate/UI; extends clear/permissions

### Parallel Opportunities

- T001–T002 parallel in Setup
- T005 parallel with T003–T004 once schema direction known (T005 Zod file-independent)
- After Foundational: T012 and T013 parallel; T014/T015 can follow enrichment
- T019–T020 parallel in Polish

---

## Notes

- Migration file created: `prisma/migrations/20260814045042_add_order_replaced_by/`
- **T004 / T022 / T023 still open**: run `npm run db:deploy:cosmo-dev` (then vault / all with prod confirmation), then UAT per quickstart
- Shared UI: `components/molecules/order-replace-link-panel.tsx`
