# Tasks: Delivery & CC Checkout Invoice Complete

**Input**: Design documents from `/specs/011-delivery-cc-invoice-complete/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included â€” plan Technical Context, research R8, and quickstart Â§8 explicitly require focused Vitest coverage under `lib/**/*.test.ts`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single Next.js app at repository root: `app/`, `components/`, `lib/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature context and shared touchpoints before behavioral changes

- [x] T001 Confirm no Prisma schema change is required for this feature in `prisma/schema.prisma` (reuse existing `invoiceCompleteAt`, `financialStatus`, `erpPeSync*`, and stage fields)
- [x] T002 [P] Inventory delivery-approval and CC Checkout touchpoints against `specs/011-delivery-cc-invoice-complete/contracts/payment-invoice-complete.md` in `app/api/admin/approvals/[id]/route.ts`, `lib/erpnext-sync.ts`, `lib/order-webhook-process.ts`, `lib/failed-erp-pe-sync.ts`, and `lib/fulfillment-queue-filters.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared gateway classification and payment-completion helpers that EVERY user story depends on

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add a canonical CC Checkout gateway predicate (case-insensitive; separators for `cc`, `cc checkout`, `cc_checkout`, `cc-checkout`) in `lib/delivery-payment-approval.ts` and/or `lib/erpnext-sync.ts`, and reuse it from existing prepaid/MOP resolvers
- [x] T004 [P] Add a shared early invoice-completion helper that sets `financialStatus = paid` + `invoiceCompleteAt` without forcing terminal `fulfillmentStage = invoice_complete` in `lib/mark-order-invoice-complete.ts` (or a small adjacent helper under `lib/`)
- [x] T005 [P] Extend PE failure list/retry eligibility predicates to include nonterminal orders with invoice-completion attempts (`invoiceCompleteAt` and/or `erpPeSyncError`) in `lib/failed-erp-pe-sync.ts`
- [x] T006 Write Vitest coverage for the CC Checkout predicate and early-completion/PE-eligibility helpers in `lib/delivery-payment-approval.test.ts`, `lib/failed-erp-pe-sync.test.ts`, and/or adjacent focused tests under `lib/`

**Checkpoint**: Foundation ready â€” user story implementation can now begin

---

## Phase 3: User Story 1 - Delivery payment approval completes invoice in OS (Priority: P1) ðŸŽ¯ MVP

**Goal**: Successful delivery-payment approval settles ERP (PE created or SI already paid) and marks the OS order invoice complete; failed ERP settlement does not claim OS invoice complete

**Independent Test**: Approve one pending delivery collection with a linked unpaid SI; confirm ERP SI is paid **and** OS is invoice complete. Retry a failed-config case and confirm OS is not falsely completed.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Add Vitest coverage for delivery-approval settlement outcomes (`created`, `already_paid`, ERP failure) and no false OS completion on failure in `lib/approval-workflow.test.ts` or a focused delivery-approval orchestration test under `lib/`
- [x] T008 [P] [US1] Add Vitest coverage proving concurrent/duplicate delivery approvals cannot create a second PE when SI outstanding is already 0 in `lib/erpnext-sync.test.ts` (or adjacent focused test under `lib/`)

### Implementation for User Story 1

- [x] T009 [US1] Reorder `delivery_payment_approval` approve orchestration so OS invoice completion happens only after `createDeliveryPaymentEntry` returns `created` or `already_paid` in `app/api/admin/approvals/[id]/route.ts`
- [x] T010 [US1] On successful delivery settlement, set `financialStatus = paid`, `invoiceCompleteAt`, reviewer audit, terminal `fulfillmentStage = invoice_complete`, and `fulfillmentStatus = fulfilled` for physically delivered orders in `app/api/admin/approvals/[id]/route.ts`
- [x] T011 [US1] On ERP settlement failure, persist `erpPeSync*` failure fields, return a user-facing ERP error, and do **not** mark OS paid/invoice complete from that failed attempt in `app/api/admin/approvals/[id]/route.ts`
- [x] T012 [US1] Stop treating a prior approved approval alone as proof of ERP settlement; require SI paid / PE outcome instead in `app/api/admin/approvals/[id]/route.ts` and `lib/approval-workflow.ts`
- [x] T013 [US1] Preserve concurrency-safe pending claim so concurrent reviewers cannot double-approve or double-create PEs in `app/api/admin/approvals/[id]/route.ts`
- [x] T014 [US1] Ensure delivery-approval PE failures appear in Failed ERP Syncs â†’ Payment Entry and are retryable via `lib/failed-erp-pe-sync.ts` and `app/api/admin/orders/[id]/retry-erp-pe-sync/route.ts`
- [x] T015 [US1] Surface clear success vs ERP-failure messaging for delivery approvals in `components/organisms/finance-approvals-panel.tsx`

**Checkpoint**: User Story 1 is independently testable â€” delivery approval = ERP settlement + OS invoice complete, or visible failure without false completion

---

## Phase 4: User Story 2 - CC Checkout invoice complete at order received with PE (Priority: P1)

**Goal**: Paid CC Checkout orders create/confirm ERP PE at order-received SI sync, set `invoiceCompleteAt` + paid, keep nonterminal physical stage, and never silently skip required PE

**Independent Test**: Process a paid CC Checkout test order through order received; confirm OS invoice complete marker, ERP PE (or visible failure), and stage still `order_received` (not terminal)

### Tests for User Story 2

- [x] T016 [P] [US2] Add Vitest coverage for CC Checkout PE outcomes (`created`, `already_paid`, missing MOP/SI, ERP error) and `invoiceCompleteAt` set only on success in `lib/erpnext-sync.test.ts` and/or `lib/order-webhook-process.test.ts`
- [x] T017 [P] [US2] Add Vitest coverage for gateway variants (`CC CHECKOUT`, `cc_checkout`, `cc-checkout`) mapping to WebXPay MOP without changing other gateways in `lib/erpnext-sync.test.ts` and `lib/delivery-payment-approval.test.ts`

### Implementation for User Story 2

- [x] T018 [US2] Wire the canonical CC Checkout predicate into prepaid MOP resolution (`resolvePrepaidMop` / `resolveErpPaymentType`) so CC Checkout uses configured `webxpayMop` in `lib/erpnext-sync.ts`
- [x] T019 [US2] After SI create/link for paid CC Checkout orders, require configured WebXPay MOP and call PE creation with strict no-silent-skip behavior in `lib/erpnext-sync.ts` (`syncOrderToERPNext` prepaid path)
- [x] T020 [US2] On PE `created` or `already_paid`, set `financialStatus = paid` and `invoiceCompleteAt` while retaining nonterminal `fulfillmentStage` and open `fulfillmentStatus` in `lib/erpnext-sync.ts` and/or `lib/order-webhook-process.ts`
- [x] T021 [US2] On missing SI, missing MOP/config, or ERP rejection, record visible `erpPeSync*` failure and do not claim clean invoice completion in `lib/erpnext-sync.ts`
- [x] T022 [US2] Keep CC Checkout skipped from delivery-payment approval creation (prepaid) using the shared predicate in `lib/delivery-payment-approval.ts`
- [x] T023 [US2] Ensure Failed PE list/retry includes nonterminal CC Checkout failures and retry establishes/retains early completion without forcing terminal stage in `lib/failed-erp-pe-sync.ts` and `app/api/admin/orders/[id]/retry-erp-pe-sync/route.ts`
- [x] T024 [US2] Confirm webhook reprocessing is idempotent (no duplicate PE; retain existing `invoiceCompleteAt`) in `lib/order-webhook-process.ts`

**Checkpoint**: User Story 2 is independently testable â€” CC Checkout financially completes at order received with PE integrity

---

## Phase 5: User Story 3 - Fulfilment continues after early invoice complete (Priority: P1)

**Goal**: Early `invoiceCompleteAt` (CC Checkout or settled delivery path) does not block physical fulfillment; orders stay out of the manual invoice-complete queue and do not require a second PE

**Independent Test**: Take an early-completed CC Checkout order through at least the next two fulfillment stages; confirm it never reappears in invoice-complete queue and no second PE is created

### Tests for User Story 3

- [x] T025 [P] [US3] Add Vitest coverage so early-completed CC Checkout orders remain eligible for order-received/sample (and subsequent physical) queues in `lib/fulfillment-queue-filters.test.ts`
- [x] T026 [P] [US3] Add Vitest coverage so manual invoice-complete queue excludes orders with `invoiceCompleteAt` set, and delivery closeout with prior completion does not create a second PE in `lib/page-data/orders`-related tests and/or `lib/mark-order-delivered.test.ts` / `lib/delivery-payment-approval.test.ts`

### Implementation for User Story 3

- [x] T027 [US3] Update order-received/sample queue predicates to allow targeted early-complete CC Checkout orders (`invoiceCompleteAt` set + nonterminal stage) in `lib/fulfillment-queue-filters.ts`
- [x] T028 [US3] Confirm page-data consumers for sample/order-received use the updated filters in `lib/page-data/orders.ts`
- [x] T029 [US3] Keep manual invoice-complete queue exclusion on `invoiceCompleteAt != null` in `lib/page-data/orders.ts` and reminder eligibility in `lib/task-reminders.ts`
- [x] T030 [US3] Ensure fulfillment stage actions (sample â†’ print â†’ ready â†’ dispatch â†’ deliver) remain allowed for early-completed nonterminal orders in `app/api/admin/orders/[id]/fulfillment/route.ts`
- [x] T031 [US3] On physical delivery when `invoiceCompleteAt` already exists, close to terminal `invoice_complete` without a second PE via `lib/mark-order-delivered.ts` and `lib/delivery-payment-approval.ts` (`resolvePostDeliveryInvoiceComplete`)
- [x] T032 [US3] Confirm COD/card-on-delivery/cash are **not** autoâ€“invoice-completed at order received (regression) in `lib/order-webhook-process.ts` and `lib/delivery-payment-approval.ts`

**Checkpoint**: User Story 3 is independently testable â€” early invoice complete â‰  fulfillment finished

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, regression, and constitution gates across all stories

- [x] T033 [P] Run and fix Vitest coverage for this feature (`npm test`) focusing on `lib/delivery-payment-approval.test.ts`, `lib/erpnext-sync.test.ts`, `lib/failed-erp-pe-sync.test.ts`, `lib/fulfillment-queue-filters.test.ts`, and any new adjacent tests under `lib/`
- [x] T034 [P] Confirm KOKO / bank transfer / WebXPay timing and MOP mappings remain unchanged outside the CC Checkout predicate in `lib/approval-workflow.ts` and `lib/erpnext-sync.ts`
- [x] T035 Validate end-to-end scenarios from `specs/011-delivery-cc-invoice-complete/quickstart.md` in a non-production environment (delivery approve success/failure, CC Checkout early complete + fulfillment advance, Failed PE retry)
- [x] T036 Run constitution gates: `npm test`, `npm run lint`, and `npm run mobile:typecheck` (no production deploy)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies â€” can start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational â€” MVP
- **User Story 2 (Phase 4)**: Depends on Foundational â€” can proceed in parallel with US1 after foundation (different primary files)
- **User Story 3 (Phase 5)**: Depends on Foundational; benefits from US2 early-complete behavior existing, but queue/predicate work can start once helpers exist
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational â€” no dependency on US2/US3
- **User Story 2 (P1)**: After Foundational â€” primarily `lib/erpnext-sync.ts` / webhook path; independent of delivery-approval UX
- **User Story 3 (P1)**: After Foundational â€” queue/fulfillment predicates; strongest value after US2 early-complete is in place

### Within Each User Story

- Tests (where listed) SHOULD be written and FAIL before implementation
- Shared helpers before route/webhook wiring
- Settlement integrity before UI messaging
- Story complete before moving to next priority when staffing is sequential

### Parallel Opportunities

- T002 can run beside T001
- T004 and T005 can run in parallel after T003 starts (different files)
- T007 / T008 in parallel; T016 / T017 in parallel; T025 / T026 in parallel
- After Foundational: US1 (approvals route) and US2 (ERP sync/webhook) can proceed in parallel by different owners
- T033 / T034 in parallel during polish

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Add Vitest coverage for delivery-approval settlement outcomes in lib/approval-workflow.test.ts or focused lib/ test"
Task: "Add Vitest coverage for already-paid / no duplicate PE in lib/erpnext-sync.test.ts"

# Then implement settlement boundary on the approval route:
Task: "Reorder delivery_payment_approval approve orchestration in app/api/admin/approvals/[id]/route.ts"
```

## Parallel Example: User Story 2

```bash
# Launch US2 tests together:
Task: "CC Checkout PE outcomes in lib/erpnext-sync.test.ts / lib/order-webhook-process.test.ts"
Task: "Gateway variant mapping in lib/erpnext-sync.test.ts and lib/delivery-payment-approval.test.ts"

# Then implement ingestion PE + early completion:
Task: "Strict prepaid PE + invoiceCompleteAt in lib/erpnext-sync.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL â€” blocks all stories)
3. Complete Phase 3: User Story 1 (delivery approval â†’ OS invoice complete)
4. **STOP and VALIDATE**: Approve a delivery payment; ERP paid + OS invoice complete
5. Demo/ship MVP if ready

### Incremental Delivery

1. Setup + Foundational â†’ shared helpers ready
2. Add US1 â†’ delivery approval integrity â†’ Demo (MVP)
3. Add US2 â†’ CC Checkout early PE + invoice complete â†’ Demo
4. Add US3 â†’ fulfillment queues/actions allow early complete â†’ Demo
5. Polish with quickstart + constitution gates

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (approvals route + finance UI)
   - Developer B: User Story 2 (ERP sync + webhook)
   - Developer C: User Story 3 (queue filters + fulfillment continuation)
3. Integrate and run polish together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new Prisma migration for this feature
- Do not set terminal `fulfillmentStage = invoice_complete` for CC Checkout at order received â€” use `invoiceCompleteAt`
- Never mark OS invoice complete after failed required ERP settlement
- Avoid changing KOKO/bank/WebXPay timing beyond shared CC Checkout classification reuse
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
