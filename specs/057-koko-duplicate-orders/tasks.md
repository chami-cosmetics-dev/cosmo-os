# Tasks: KOKO Duplicate Order Minimization

**Input**: Design documents from `/specs/057-koko-duplicate-orders/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Vitest for `lib/koko-order` + `lib/koko-duplicate-group` included (plan Technical Context + quickstart). No full TDD/contract-test suite requested in spec.

**Organization**: Tasks grouped by user story for independent implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1â€“US4)
- Include exact file paths in descriptions

## Path Conventions

- Next.js monolith at repo root: `prisma/`, `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + shared constants/types scaffolding

- [X] T001 Create/switch git branch `057-koko-duplicate-orders` from an up-to-date base suitable for this feature
- [X] T002 [P] Add `KOKO_DUPLICATE_LOOKBACK_DAYS = 30` and related labels/helpers in `lib/koko-order.ts` (constants section; file may start as constants-only)
- [X] T003 [P] Add Zod schemas for link-time confirm body and cancel-duplicate reason in `lib/validation.ts` per `specs/057-koko-duplicate-orders/contracts/koko-duplicate-orders.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RBAC permission, ERP KOKO predicates, fingerprint/group helpers â€” MUST finish before story UI/API work

**âš ï¸ CRITICAL**: No user story phase starts until this phase completes

- [X] T004 Extend `Order` in `prisma/schema.prisma` with `kokoLinkGeneratedAt`, `kokoLinkTimeConfirmedAt`, `kokoLinkTimeConfirmedById` (+ User relation) per `specs/057-koko-duplicate-orders/data-model.md`
- [X] T005 Create migration via `npm run db:migrate:create` (never `prisma migrate dev` / `db push` on shared DBs); document deploy with `npm run db:deploy:<target>` / `db:deploy:all`
- [X] T006 Add permission `finance.approvals.cancel_koko_duplicate` to `DEFAULT_PERMISSIONS` and appropriate role maps in `lib/rbac.ts`
- [X] T007 Implement `isErpKokoOrder`, link-time gate helpers, and Asia/Colombo datetime parse/display helpers in `lib/koko-order.ts`
- [X] T008 [P] Implement order item fingerprint + phone-key + lookback grouping helpers in `lib/koko-duplicate-group.ts` (reuse `canonicalPhoneForErpCustomerId` from `lib/phone-lookup.ts`; pattern from `lib/abandoned-checkout-cart.ts`)
- [X] T009 [P] Add Vitest coverage for ERP KOKO predicates and link-time gate rules in `lib/koko-order.test.ts`
- [X] T010 [P] Add Vitest coverage for fingerprint equality, phone mismatch, lookback window, approved+pending siblings in `lib/koko-duplicate-group.test.ts`
- [X] T011 Skip `createOrGetOrderPaymentApproval` for ERP KOKO when `kokoLinkTimeConfirmedAt` is null in `lib/erp-sales-invoice-ingest.ts` (bank/Mintpay/other gateways unchanged)
- [X] T012 Ensure sample / merchant queues still include ERP KOKO awaiting link-time (no pending approval yet) in `lib/page-data/orders.ts` and related `FINANCE_PENDING_*` usage

**Checkpoint**: Foundation ready â€” schema, permission, defer-ingest, helpers + unit tests; stories can proceed

---

## Phase 3: User Story 1 - Capture KOKO link generated time before finance (Priority: P1) ðŸŽ¯ MVP

**Goal**: ERP KOKO orders stay in merchant sample handling until link generated time is confirmed; then finance approval is created with that time visible

**Independent Test**: Ingest ERP KOKO â†’ no finance approval yet â†’ confirm time in sample UI â†’ approval appears with link time; advance to print blocked before confirm

### Implementation for User Story 1

- [X] T013 [US1] Implement `POST /api/admin/orders/[id]/koko-link-time` (set time + confirmedBy/At + `createOrGetOrderPaymentApproval`) in `app/api/admin/orders/[id]/koko-link-time/route.ts`
- [X] T014 [US1] Block `advance_to_print` (and later stage advances as needed) for ERP KOKO without `kokoLinkTimeConfirmedAt` in `app/api/admin/orders/[id]/fulfillment/route.ts`
- [X] T015 [US1] Expose link-time fields on order detail GET mapping in `app/api/admin/orders/[id]/route.ts` (and page-data types if required in `lib/page-data/orders.ts`)
- [X] T016 [US1] Add KOKO link generated time input + Confirm UI on sample/order detail in `components/organisms/fulfillment-sample-free-issue-panel.tsx` and/or `components/organisms/order-fulfillment-detail.tsx`
- [X] T017 [US1] Show `kokoLinkGeneratedAt` on finance approval detail for KOKO `order_payment_approval` in `components/organisms/finance-approvals-panel.tsx` and wire field through `app/api/admin/approvals/route.ts` + `app/(dashboard)/dashboard/approvals/page.tsx`

**Checkpoint**: US1 independently testable (defer â†’ confirm â†’ finance sees time)

---

## Phase 4: User Story 2 - Group suspected duplicate KOKO approvals for finance (Priority: P1)

**Goal**: Finance Approvals groups same-phone + identical item-set KOKO orders within 30 days, including already-approved siblings; approve one does not approve others

**Independent Test**: Two same-phone same-items KOKO approvals (different merchants/days) appear in one group with both link times; different item sets not forced together

### Implementation for User Story 2

- [X] T018 [US2] Compute `duplicateGroupId`, `duplicateGroupSize`, `duplicateGroupMembers` for KOKO payment approvals in list/SSR loaders (`app/api/admin/approvals/route.ts` and/or `app/(dashboard)/dashboard/approvals/page.tsx`) using `lib/koko-duplicate-group.ts`
- [X] T019 [US2] Extend `FinanceApprovalItem` type + mapping to carry group + link-time fields in `components/organisms/finance-approvals-panel.tsx` (and page query types)
- [X] T020 [US2] Render duplicate groups (card/section) for KOKO payment approvals without changing non-KOKO approval UX in `components/organisms/finance-approvals-panel.tsx`
- [X] T021 [US2] Verify approve action still targets only selected approval (no sibling auto-approve) in `app/api/admin/approvals/[id]/route.ts` + panel approve flow

**Checkpoint**: US2 independently testable on top of US1 confirm path

---

## Phase 5: User Story 3 - Finance cancel duplicate with dedicated permission (Priority: P1)

**Goal**: Finance users with new permission cancel surplus duplicate from group view in OS + ERP; users without permission cannot

**Independent Test**: With permission, cancel pending sibling in group â†’ cancelled in OS + ERP; without permission, cancel action hidden/403

### Implementation for User Story 3

- [X] T022 [US3] Implement `POST /api/admin/approvals/[id]/cancel-koko-duplicate` (cancel pending approval if any + OS/ERP cancel via existing cancel SI family) in `app/api/admin/approvals/[id]/cancel-koko-duplicate/route.ts` (or extend `app/api/admin/approvals/[id]/route.ts` if preferred â€” keep one clear entry)
- [X] T023 [US3] Enforce `requirePermission("finance.approvals.cancel_koko_duplicate")`, reason validation, group-size/sibling checks, and audit metadata in that cancel route
- [X] T024 [US3] Surface Cancel duplicate action only when `canCancelKokoDuplicate` in `components/organisms/finance-approvals-panel.tsx`
- [X] T025 [US3] Pass `canCancelKokoDuplicate` from `app/(dashboard)/dashboard/approvals/page.tsx` (permission check alongside existing finance flags)
- [X] T026 [US3] On ERP cancel failure, return clear failure without silent OS-only success (match existing cancel semantics) in the cancel-duplicate route + panel error handling

**Checkpoint**: US3 independently testable; US1/US2 still work

---

## Phase 6: User Story 4 - Duplicate notice when confirming link time in OS (Priority: P2)

**Goal**: Soft duplicate notice at OS link-time confirm when same-phone KOKO siblings exist; does not hard-block confirm; no ERP/portal pre-create warning

**Independent Test**: With order A in OS, open link-time confirm on order B same phone â†’ notice shown; confirm still succeeds

### Implementation for User Story 4

- [X] T027 [US4] Return `duplicateNotice` / sibling candidates from `POST` (and optional GET) in `app/api/admin/orders/[id]/koko-link-time/route.ts` using `lib/koko-duplicate-group.ts`
- [X] T028 [US4] Render soft duplicate notice on confirm UI (non-blocking) in `components/organisms/fulfillment-sample-free-issue-panel.tsx` and/or `components/organisms/order-fulfillment-detail.tsx`
- [X] T029 [US4] Confirm notice does not appear for bank-only / non-matching item-set cases that should not warn (same helpers + UI conditions)

**Checkpoint**: All four stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, regression, docs hygiene

- [X] T030 [P] Run `npm test` for `lib/koko-order.test.ts` and `lib/koko-duplicate-group.test.ts`; fix failures
- [X] T031 [P] Lint touched files (`lib/koko-*.ts`, approvals routes/panel, sample panel, ingest, rbac, schema)
- [X] T032 Walk `specs/057-koko-duplicate-orders/quickstart.md` scenarios 1â€“6 (or document blockers) and update quickstart notes if paths differ
- [X] T033 Confirm non-KOKO (bank) immediate-approval path still works via smoke on `lib/erp-sales-invoice-ingest.ts` behavior / manual check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies â€” start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational â€” MVP
- **US2 (Phase 4)**: Depends on Foundational; practically needs US1 confirm so groups have link times (can stub times in tests)
- **US3 (Phase 5)**: Depends on Foundational + benefits from US2 group UI; cancel API can ship without fancy UI first
- **US4 (Phase 6)**: Depends on US1 link-time API/UI; uses US2 grouping helpers
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 â€” no other story dependency â€” **MVP**
- **US2 (P1)**: After Phase 2; best after US1 for real link times
- **US3 (P1)**: After Phase 2; best after US2 for group entry point
- **US4 (P2)**: After US1; uses `lib/koko-duplicate-group.ts` from Phase 2

### Within Each User Story

- Helpers/schema before routes
- Routes before UI
- Permission checks on cancel before exposing button
- Story complete before next priority when sequencing alone

### Parallel Opportunities

- T002 / T003 in Setup
- T008 / T009 / T010 in Foundational (after T007 exists for shared types if needed â€” T008â€“T010 parallel once T007 predicates exist; T009/T010 can follow T007/T008)
- US2 list mapping (T018) can start while US1 UI (T016) finishes if API fields ready
- T030 / T031 in Polish

---

## Parallel Example: Foundational

```bash
# After T004â€“T007:
Task: "Implement fingerprint/group helpers in lib/koko-duplicate-group.ts"
Task: "Add Vitest in lib/koko-order.test.ts"
Task: "Add Vitest in lib/koko-duplicate-group.test.ts"
```

## Parallel Example: User Story 1

```bash
# After T013 route exists:
Task: "Block advance_to_print in app/api/admin/orders/[id]/fulfillment/route.ts"
Task: "Expose link-time fields on order GET in app/api/admin/orders/[id]/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 (link time â†’ finance)
4. **STOP and VALIDATE** via quickstart scenario 1
5. Demo/deploy readiness for MVP

### Incremental Delivery

1. Setup + Foundational â†’ defer ingest + helpers
2. US1 â†’ merchants confirm time; finance sees it (**MVP**)
3. US2 â†’ grouped finance view
4. US3 â†’ cancel duplicate permission + action
5. US4 â†’ soft notice at confirm
6. Polish â†’ tests/lint/quickstart

### Parallel Team Strategy

1. Team finishes Setup + Foundational together
2. Then:
   - Dev A: US1 API + sample UI
   - Dev B: US2 grouping on approvals list (mock link times if needed)
   - Dev C: US3 cancel route + RBAC (after permission seeded)
3. US4 after US1 confirm UI exists

---

## Notes

- [P] = different files, no incomplete-task dependencies
- [USn] maps to spec user stories
- Do **not** warn inside ERP or KOKO portal (out of scope)
- Migrations: `npm run db:migrate:create` only; deploy all DBs before calling done
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
