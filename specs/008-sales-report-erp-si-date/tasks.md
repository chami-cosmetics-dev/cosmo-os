# Tasks: Arrival-Time ERP SI for Finance-Approval Orders

**Input**: Design documents from `/specs/008-sales-report-erp-si-date/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan Phase G and research Decision 13 explicitly require focused Vitest coverage under `lib/**/*.test.ts`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single Next.js app at repository root: `app/`, `components/`, `lib/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature context and shared helpers before lifecycle changes

- [x] T001 Confirm no Prisma schema change is required for this feature in `prisma/schema.prisma` (reuse existing `Order` ERP fields and `ApprovalRequest.reviewNote`)
- [x] T002 [P] Add shared rejection-reason limits (trimmed 5–500) for order-payment rejection in `lib/validation.ts`
- [x] T003 [P] Add audit action constants for order-payment rejection success and ERP-cancel failure in `lib/audit-log.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared ERP cancellation and SI-state helpers that EVERY user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Extend `cancelErpnextSalesInvoice` with strict, idempotent outcomes (`cancelled` | `already_cancelled` | `not_found`) while preserving non-strict behavior for existing Shopify/order-cancel callers in `lib/erpnext-sync.ts`
- [x] T005 [P] Add shared helpers to detect real vs placeholder SI IDs (`null`, `"pending"`, legacy `"pending_approval"`) and active SI retry leases in `lib/erpnext-sync.ts` or `lib/approval-workflow.ts`
- [x] T006 [P] Write Vitest coverage for strict cancellation outcomes and placeholder/lease helpers in `lib/erpnext-sync.test.ts` (or adjacent focused test file under `lib/`)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Unpaid ERP SI at Arrival (Priority: P1) 🎯 MVP

**Goal**: KOKO/bank orders create one submitted, unpaid, stock-updating ERP SI during Shopify intake, with a pending finance approval and no Payment Entry yet

**Independent Test**: Process a KOKO/bank order; before any approval, confirm a real SI exists (outstanding, no PE), stock reduced, and exactly one SI under duplicate webhooks

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Add Vitest coverage for finance-order arrival creating pending approval + unpaid SI (no PE) and COD path unchanged in `lib/order-webhook-process.test.ts`
- [x] T008 [P] [US1] Add Vitest coverage for SI claim/lease/idempotency and SI-failure retry while approval remains pending in `lib/failed-erp-sync-auto-retry.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Await idempotent `ORDER_PAYMENT_APPROVAL` creation and stop writing `"pending_approval"` for new non-voided finance orders in `lib/order-webhook-process.ts`
- [x] T010 [US1] Allow finance-approval orders through the existing atomic `null → "pending"` SI claim and `syncOrderToERPNext` path (with lease metadata on claim) in `lib/order-webhook-process.ts`
- [x] T011 [US1] Preserve SI failure recording (`markOrderErpSyncFailed`) and keep the pending approval when arrival SI sync fails in `lib/order-webhook-process.ts`
- [x] T012 [US1] Remove pending-finance exclusion/wait that suppresses failed SI listing and auto-retry in `lib/failed-erp-sync-auto-retry.ts`
- [x] T013 [US1] Allow manual SI retry for pending-approval and legacy `"pending_approval"` orders (no PE while unpaid) in `app/api/admin/orders/[id]/retry-erp-sync/route.ts`
- [x] T014 [US1] Update failed-sync UI wording so `"pending_approval"` is treated as legacy backlog, not the new expected workflow, in `components/organisms/failed-erp-syncs-panel.tsx`

**Checkpoint**: User Story 1 is independently testable — arrival creates unpaid SI; retries recover failures; COD unchanged

---

## Phase 4: User Story 2 - Fulfilment Blocked Until Approved (Priority: P1)

**Goal**: Even with a real SI at arrival, finance-approval orders stay out of fulfilment queues and actions until the latest payment approval is approved

**Independent Test**: With unpaid SI + pending approval, queues exclude the order and print/dispatch/bulk actions are blocked; after approval, fulfilment is allowed under existing stage rules

### Tests for User Story 2

- [x] T015 [P] [US2] Add Vitest coverage for approval-state gating (pending/rejected/missing/cancelled blocked; approved allowed) with a real SI present in `lib/approval-workflow.test.ts`
- [x] T016 [P] [US2] Extend queue-filter regression coverage so pending real-SI finance orders remain excluded in `lib/fulfillment-queue-filters.test.ts` and/or `lib/page-data/orders`-related tests under `lib/`

### Implementation for User Story 2

- [x] T017 [US2] Remove active fulfillment dependency on `erpnextInvoiceId === "pending_approval"` and gate by latest approval state in `lib/approval-workflow.ts` (`FINANCE_PENDING_FULFILLMENT_EXCLUSION`, `getFinancePaymentApprovalBlockReason`)
- [x] T018 [US2] Include recorded rejection reason in the rejected fulfillment block message via `getOrderPaymentApproval` / block helper in `lib/approval-workflow.ts`
- [X] T019 [US2] Apply the shared finance gate to all invoice rendering/printing paths (not only `?print=1`) in `app/api/admin/orders/[id]/invoice/route.ts`
- [X] T020 [P] [US2] Ensure individual fulfillment/dispatch paths continue to use the shared gate in `app/api/admin/orders/[id]/fulfillment/route.ts`
- [X] T021 [P] [US2] Ensure bulk dispatch continues to use the shared gate in `app/api/admin/orders/bulk-dispatch/route.ts`
- [X] T022 [P] [US2] Apply the shared finance gate to direct/bulk delivered and invoice-complete paths in `lib/mark-order-delivered.ts`, `lib/mark-order-invoice-complete.ts`, `app/api/admin/orders/bulk-delivery-complete/route.ts`, and `app/api/admin/orders/bulk-invoice-complete/route.ts`
- [x] T023 [US2] Confirm queue page-data consumers still exclude pending finance orders after gate changes in `lib/page-data/orders.ts`

**Checkpoint**: User Story 2 is independently testable — real SI does not unlock fulfilment

---

## Phase 5: User Story 3 - Approval Creates PE Only (Priority: P1)

**Goal**: Finance approval requires a real SI, creates only the Payment Entry against it, marks the order paid/invoice-complete, and unlocks fulfilment — never a second SI

**Independent Test**: Approve an order that already has an unpaid SI; PE is applied, outstanding → 0, no second SI, fulfilment unlocked; missing SI returns retryable `ERP_SI_NOT_READY`

### Tests for User Story 3

- [x] T024 [P] [US3] Add Vitest coverage for PE-only post-approval sync when a real SI exists (no second SI) in `lib/failed-erp-sync-auto-retry.test.ts`
- [x] T025 [P] [US3] Add Vitest coverage for approval blocked when SI is missing/in-progress (`ERP_SI_NOT_READY`) and decision serialization helpers in `lib/approval-workflow.test.ts` or a focused approval orchestration test under `lib/`

### Implementation for User Story 3

- [x] T026 [US3] Validate approval route IDs with `cuidSchema` and keep `finance.approvals.manage` + company/location scope in `app/api/admin/approvals/[id]/route.ts`
- [x] T027 [US3] Serialize concurrent approve/reject decisions for a pending approval (row lock or conditional claim) in `app/api/admin/approvals/[id]/route.ts`
- [x] T028 [US3] Before approving `ORDER_PAYMENT_APPROVAL`, require a real SI; return retryable `409`/`ERP_SI_NOT_READY` without creating a late SI in `app/api/admin/approvals/[id]/route.ts`
- [x] T029 [US3] On approval success, run existing finance-approved PE sync against the existing SI only and preserve PE failure recording in `app/api/admin/approvals/[id]/route.ts` and `lib/failed-erp-sync-auto-retry.ts`
- [x] T030 [US3] Preserve existing paid/invoice-complete/fulfillment-stage transitions on approval in `app/api/admin/approvals/[id]/route.ts`
- [x] T031 [US3] Narrow `runPostApprovalErpSync` so new orders assert real SI + create PE only; keep legacy placeholder recovery only if explicitly supported in `lib/failed-erp-sync-auto-retry.ts`

**Checkpoint**: User Story 3 is independently testable — approve = PE + unlock; missing SI cannot approve

---

## Phase 6: User Story 4 - Rejection Cancels SI (Priority: P1)

**Goal**: Rejection requires a 5–500 character reason, cancels the unpaid SI first, voids the OS order, and leaves approval pending on ERP cancel failure

**Independent Test**: Reject with valid reason → SI cancelled, stock restored, order voided, fulfilment blocked; invalid reason → 400; ERP cancel failure → pending + retryable `502`

### Tests for User Story 4

- [x] T032 [P] [US4] Add Vitest coverage for rejection-reason validation (5–500) and cancel-before-reject / cancel-failure-leaves-pending orchestration under `lib/` (e.g. `lib/approval-workflow.test.ts` or focused helper tests)
- [x] T033 [P] [US4] Add Vitest coverage for already-cancelled SI treated as success and known-SI missing as failure in `lib/erpnext-sync.test.ts`

### Implementation for User Story 4

- [x] T034 [US4] Conditionally require trimmed 5–500 character `reviewNote` for `order_payment_approval` reject in `app/api/admin/approvals/[id]/route.ts` (using limits from `lib/validation.ts`)
- [x] T035 [US4] Under the serialized pending-decision boundary, strictly cancel/confirm-cancelled the SI before committing rejection in `app/api/admin/approvals/[id]/route.ts`
- [x] T036 [US4] On cancel success, set order `financialStatus` to `voided`, mark approval `rejected` with reason/reviewer/time, and notify only after commit in `app/api/admin/approvals/[id]/route.ts`
- [x] T037 [US4] On cancel failure, return safe retryable `502`/`ERP_SI_CANCEL_FAILED`, leave approval pending, and write sanitized audit/log entries in `app/api/admin/approvals/[id]/route.ts` and `lib/audit-log.ts`
- [X] T038 [P] [US4] Require rejection reason UX (label, 5–500 limit, disable until valid, preserve text on retryable failure, cancellation progress) in `components/organisms/finance-approvals-panel.tsx`
- [X] T039 [P] [US4] Mirror rejection-reason UX and show recorded reason in order details in `components/organisms/order-invoice-view-modal.tsx`

**Checkpoint**: User Story 4 is independently testable — reject cleans ERP + voids OS; failure is retryable

---

## Phase 7: User Story 5 - Sales Reports Reconcile Without OS Report Changes (Priority: P1)

**Goal**: OS dashboards, Daily Sales SMS, and dumps stay on arrival-day logic; reconciliation comes from ERP SI at arrival and voided/cancelled rejected orders

**Independent Test**: For a day with finance-approval orders, OS dashboard/SMS/dump totals match ERP within 1 currency unit; reporting source files are unchanged in computation

### Tests for User Story 5

- [x] T040 [P] [US5] Add/extend Vitest eligibility coverage: pending/paid count; voided rejected orders do not count in `lib/page-data/dashboard-sales.ts` tests and `lib/daily-sales-sms.test.ts`

### Implementation for User Story 5

- [x] T041 [US5] Confirm no computation changes to sales aggregation, SMS body builders, or dump generators in `lib/page-data/dashboard-sales.ts`, `lib/daily-sales-sms.ts`, `lib/reports/order-dump.ts`, and `app/api/admin/reports/orders/route.ts` (regression-only verification)
- [x] T042 [US5] Document/verify that successful rejection voiding (US4) plus arrival SI (US1) is the sole reconciliation mechanism per `specs/008-sales-report-erp-si-date/quickstart.md` §8

**Checkpoint**: User Story 5 is independently verifiable — reporting code untouched; totals reconcile via ERP lifecycle

---

## Phase 8: User Story 6 - Existing Working Functions Unaffected (Priority: P2)

**Goal**: COD sync, other approval types, returns, Shopify-cancel voiding, SMS/dumps/dashboards remain unchanged

**Independent Test**: Exercise COD arrival, a return/credit-note path, Shopify cancel of a finance SI, and SMS/dump preview; each matches pre-change behavior

### Tests for User Story 6

- [x] T043 [P] [US6] Add/extend Vitest regressions for COD SI path unchanged and Shopify-cancel/idempotent already-cancelled SI safety in `lib/order-webhook-process.test.ts` and `lib/erpnext-sync.test.ts`
- [x] T044 [P] [US6] Confirm other approval types retain optional-note / non-SI-cancel rejection behavior via route validation coverage under `lib/` or documented regression checks against `app/api/admin/approvals/[id]/route.ts`

### Implementation for User Story 6

- [x] T045 [US6] Keep non-strict cancellation callers (Shopify cancel / order cancel) behavior intact unless a shared tightening is regression-proven in `lib/order-webhook-process.ts` and `app/api/admin/orders/[id]/fulfillment/route.ts`
- [x] T046 [US6] Retain legacy placeholder recognition wherever real SI links are rendered so old `"pending_approval"` rows are not treated as invoice names in `lib/erp-order-link.ts`, `lib/erp-admin-url.ts`, and related display helpers
- [x] T047 [US6] Spot-check return/credit-note and payment-method-change approval paths remain functionally unchanged (no intentional edits unless a compile break forces a minimal fix)

**Checkpoint**: All user stories independently functional; regressions covered

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Full validation across both tenants and CI gates

- [x] T048 [P] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run mobile:typecheck`, and `npm run build` for the changed surface
- [ ] T049 Execute non-production Cosmo and Vault UAT scenarios from `specs/008-sales-report-erp-si-date/quickstart.md` (arrival SI, pending gate, approve PE, reject cancel, SI-not-ready, cancel-failure retry, sales reconciliation) — pending manual ERP UAT
- [x] T050 [P] Update feature checklist notes if any acceptance gaps remain in `specs/008-sales-report-erp-si-date/checklists/requirements.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP core
- **User Story 2 (Phase 4)**: Depends on Foundational; should follow US1 so real-SI pending orders exist to gate
- **User Story 3 (Phase 5)**: Depends on US1 (real SI at arrival) and benefits from US2 gate semantics
- **User Story 4 (Phase 6)**: Depends on US1 (SI exists to cancel) and Foundational strict cancel helper; shares approval-route serialization with US3
- **User Story 5 (Phase 7)**: Depends on US1 + US4 (arrival SI + voided rejected orders); no reporting code changes
- **User Story 6 (Phase 8)**: Can proceed after Foundational; best run after US1–US4 to avoid fighting mid-flight API changes
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on other stories — **MVP**
- **US2 (P1)**: After Foundational; strongest value after US1 creates real SIs at arrival
- **US3 (P1)**: After US1 (needs real SI); shares approve/reject serialization with US4
- **US4 (P1)**: After US1 + T004; coordinate with US3 on `app/api/admin/approvals/[id]/route.ts`
- **US5 (P1)**: After US1 + US4 lifecycle outcomes; reporting files are regression-only
- **US6 (P2)**: After Foundational; finalize after primary lifecycle stories to lock regressions

### Within Each User Story

- Tests (listed) SHOULD be written and FAIL before implementation
- Shared helpers before route/UI wiring
- Core orchestration before UI polish
- Story complete before moving to next priority when staffing is sequential

### Parallel Opportunities

- T002 and T003 in Setup can run in parallel
- T005 and T006 in Foundational can run in parallel after T004 starts (T006 depends on T004 API shape)
- Within a story, all `[P]` test tasks can run in parallel
- US2 action-gate file updates (T020–T022) can run in parallel after T017
- US4 UI tasks (T038–T039) can run in parallel after API contract is stable
- US5 and parts of US6 can proceed in parallel once US1/US4 outcomes exist

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Add Vitest coverage for finance-order arrival in lib/order-webhook-process.test.ts"
Task: "Add Vitest coverage for SI retry eligibility in lib/failed-erp-sync-auto-retry.test.ts"

# After tests fail, implement sequentially in the webhook then retry modules:
Task: "Await approval + stop pending_approval placeholder in lib/order-webhook-process.ts"
Task: "Allow SI claim/sync for finance orders in lib/order-webhook-process.ts"
Task: "Remove pending-finance SI retry exclusion in lib/failed-erp-sync-auto-retry.ts"
```

## Parallel Example: User Story 4

```bash
# After T034–T037 API path is sketched:
Task: "Rejection reason UX in components/organisms/finance-approvals-panel.tsx"
Task: "Rejection reason UX + display in components/organisms/order-invoice-view-modal.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (arrival unpaid SI + retry)
4. **STOP and VALIDATE**: Process a KOKO/bank order; confirm unpaid SI + no PE
5. Demo ERP day-sales alignment for pending finance orders

### Incremental Delivery

1. Setup + Foundational → helpers ready
2. US1 → arrival SI (MVP)
3. US2 → fulfilment stays locked
4. US3 → approve creates PE only
5. US4 → reject cancels SI + voids OS
6. US5 → confirm reporting untouched and totals reconcile
7. US6 → regression lock
8. Polish → CI + Cosmo/Vault UAT via `quickstart.md`

### Parallel Team Strategy

With multiple developers after Foundational:

- Developer A: US1 (webhook + retry)
- Developer B: US2 (gates + queue/action surfaces)
- Developer C: US3/US4 on the approvals route (serialize carefully — avoid conflicting edits; prefer sequential US3 then US4 on that file)

---

## Notes

- [P] tasks = different files, no incomplete dependencies
- [Story] label maps task to US1–US6 from `spec.md`
- No Prisma migration is expected; if one becomes necessary, stop and follow constitution migration discipline with explicit confirmation
- Do not change Daily Sales SMS / dump / dashboard computation — US5 is verification-only
- Client rejection UX is secondary; server validation in `app/api/admin/approvals/[id]/route.ts` is authoritative
- Commit after each task or logical group; stop at any checkpoint to validate the story independently
