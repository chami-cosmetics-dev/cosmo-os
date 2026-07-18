# Tasks: Cosmo Return Cancel by Payment Status

**Input**: Design documents from `/specs/010-cosmo-return-cancel/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan Phase F and research Decision 10 explicitly require focused Vitest coverage under `lib/**/*.test.ts`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single Next.js app at repository root: `app/`, `components/`, `lib/`, `prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared constants, validation, and environment docs before policy/orchestration work

- [ ] T001 Add `OS_VARIANT=cosmo|vault` documentation to `.env.cosmo-dev.example`, `.env.cosmo-prod.example`, and `.env.vault.example` (no secrets; fail-closed guidance)
- [ ] T002 [P] Add cancel-remark / direct-cancel-error limits and shared Zod helpers in `lib/validation.ts` (remark required trimmed max 5000; error sanitized max 2000)
- [ ] T003 [P] Add audit action constants for direct cancel start, provider outcomes, completion, and partial failure in `lib/audit-log.ts` (keep existing `returned_order_cancel_*` actions)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, fail-closed deployment policy, and reusable Shopify/ERP outcome adapters that EVERY cancel story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add six nullable `OrderReturn` direct-cancel fields from `data-model.md` to `prisma/schema.prisma` (`directCancelStatus`, `shopifyCancelStatus`, `erpCancelStatus`, `directCancelError`, `directCancelStartedAt`, `directCancelCompletedAt`)
- [ ] T005 Create the migration ONLY via `npm run db:migrate:create` and inspect SQL under `prisma/migrations/` (nullable/defaulted columns only; no destructive rewrite)
- [ ] T006 Run `npm run db:generate` and deploy the migration to a selected non-production target (`npm run db:deploy:cosmo-dev` and/or `npm run db:deploy:vault`); do NOT run cosmo-prod/`db:deploy:all` without explicit user confirmation
- [ ] T007 [P] Implement fail-closed `resolveOsVariant()` and `resolveReturnCancelPolicy()` in `lib/return-cancel-policy.ts` per `contracts/return-cancel-workflow.md` (unknown/missing → finance; Cosmo exact `paid` → finance; Cosmo non-paid + capability → direct)
- [ ] T008 [P] Write Vitest payment/deployment matrix coverage in `lib/return-cancel-policy.test.ts` (Vault any; Cosmo paid/non-paid/null/partial/refunded/whitespace; capability unavailable → finance)
- [ ] T009 [P] Extend Shopify cancel helper to return structured outcomes (`cancelled` | `already_cancelled` | `not_applicable`) with confirmed already-cancelled handling in `lib/shopify-admin.ts`
- [ ] T010 [P] Add a strict/reusable ERP cancel outcome wrapper for return direct-cancel (map `cancelled` / `already_cancelled` / definitive `not_applicable`; throw on config/ambiguous/provider failure) in `lib/erpnext-sync.ts`
- [ ] T011 Refactor `createOrGetReturnCancelApproval` to accept an optional Prisma transaction client so return claim + approval can commit atomically in `lib/approval-workflow.ts` (notifications remain post-commit)

**Checkpoint**: Foundation ready — policy, schema, adapters, and atomic approval helper available

---

## Phase 3: User Story 1 - Cancel Unpaid Returned Orders Directly in Cosmo OS (Priority: P1) 🎯 MVP

**Goal**: Cosmo unpaid returned orders cancel in OS + Shopify + ERP without a finance approval, with durable partial-failure recovery and retry

**Independent Test**: On Cosmo, cancel an unpaid returned order with a remark; no `return_cancel` approval is created; Shopify/ERP/OS cancel complete (or retry recovers partial failure); return becomes solved

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T012 [P] [US1] Add Vitest orchestrator coverage for success, Shopify-ok/ERP-fail, ERP-ok/Shopify-fail, already-cancelled skip, and local-finalization-only retry in `lib/return-cancel-orchestrator.test.ts`
- [ ] T013 [P] [US1] Add Vitest coverage that Cosmo non-paid policy selects `direct_cancel` and never creates an approval path in `lib/return-cancel-policy.test.ts`

### Implementation for User Story 1

- [ ] T014 [US1] Implement direct-cancel claim/persist/finalize state machine with injectable Shopify/ERP adapters in `lib/return-cancel-orchestrator.ts` (no external HTTP inside DB transactions; persist each provider outcome immediately)
- [ ] T015 [US1] Extend `PUT /api/admin/returns/[id]` with neutral `cancel` intent, server-side policy recompute, cancel-remark validation, and conflict guards in `app/api/admin/returns/[id]/route.ts`
- [ ] T016 [US1] Wire Cosmo non-paid cancel through the orchestrator (claim → providers → OS void + return solved only on terminal success) and return contract statuses/errors in `app/api/admin/returns/[id]/route.ts`
- [ ] T017 [US1] Expose `cancelAction`, `cancelActionReason`, and direct-cancel progress fields from `lib/page-data/order-returns.ts` using server-computed policy
- [ ] T018 [US1] Render **Cancel** / processing / partial-failure / **Retry Cancel** for `direct_cancel` rows (required remark + confirm OS/Shopify/ERP impact) in `components/organisms/returned-orders-panel.tsx`
- [ ] T019 [US1] Write direct-cancel audit events (start, provider outcomes, completed/partial failure) using the new actions in `app/api/admin/returns/[id]/route.ts` / orchestrator and `lib/audit-log.ts`

**Checkpoint**: User Story 1 is independently testable — Cosmo unpaid returns direct-cancel with visible recoverable failures

---

## Phase 4: User Story 2 - Paid Cosmo Returns Still Require Finance Approval (Priority: P1)

**Goal**: Cosmo paid returned orders keep **Request Cancel** → finance approval; no direct Shopify/ERP cancel from the merchant action

**Independent Test**: On Cosmo, a paid returned order shows Request Cancel; submitting creates one pending `return_cancel` approval and leaves the order uncancelled until finance approves

### Tests for User Story 2

- [ ] T020 [P] [US2] Add Vitest coverage that Cosmo exact `paid` (including mixed case/whitespace) resolves to `request_cancel` in `lib/return-cancel-policy.test.ts`
- [ ] T021 [P] [US2] Add Vitest coverage that finance-path claim creates/reuses one pending approval and leaves direct-cancel fields null (transaction-client path) in `lib/approval-workflow.test.ts` or a focused helper test under `lib/`

### Implementation for User Story 2

- [ ] T022 [US2] Route Cosmo paid cancel through atomic return update + `createOrGetReturnCancelApproval` (no orchestrator/Shopify/ERP calls) in `app/api/admin/returns/[id]/route.ts`
- [ ] T023 [US2] Ensure page data reports `cancelAction: "request_cancel"` for Cosmo paid returns in `lib/page-data/order-returns.ts`
- [ ] T024 [US2] Render **Request Cancel** (not Cancel) for paid Cosmo rows and keep existing finance-pending messaging in `components/organisms/returned-orders-panel.tsx`
- [ ] T025 [US2] Confirm existing finance approve/reject for `RETURN_CANCEL_APPROVAL` remains unchanged in `app/api/admin/approvals/[id]/route.ts` and `components/organisms/finance-approvals-panel.tsx`

**Checkpoint**: User Story 2 is independently testable — Cosmo paid returns still go through finance

---

## Phase 5: User Story 3 - Vault OS Keeps Finance Approval for Every Return Cancel (Priority: P1)

**Goal**: Vault (and unknown/misconfigured variant) never offers or executes Cosmo-style direct cancel; every return cancel creates/reuses finance approval

**Independent Test**: On Vault, paid and unpaid returned orders both show Request Cancel and create finance approvals; direct Cancel is unavailable even if financial status is unpaid

### Tests for User Story 3

- [ ] T026 [P] [US3] Add Vitest coverage that Vault and unknown/missing `OS_VARIANT` always resolve to `request_cancel` regardless of financial status in `lib/return-cancel-policy.test.ts`
- [ ] T027 [P] [US3] Add Vitest coverage that Cosmo non-paid without integration capability fails closed to `request_cancel` in `lib/return-cancel-policy.test.ts`

### Implementation for User Story 3

- [ ] T028 [US3] Enforce Vault/unknown/capability-unavailable cancel path as finance-only in `app/api/admin/returns/[id]/route.ts` (reject any attempt to force direct cancel)
- [ ] T029 [US3] Ensure Vault page data always returns `cancelAction: "request_cancel"` (never `direct_cancel`) in `lib/page-data/order-returns.ts`
- [ ] T030 [US3] Ensure Vault UI never renders **Cancel** / Retry direct-cancel controls in `components/organisms/returned-orders-panel.tsx`
- [ ] T031 [US3] Verify `shouldBlockShopifyCancelInOs` / Vault Shopify-block behavior remains consistent for non-return cancellation paths in `lib/shopify-admin.ts` (regression only; no Vault Admin cancel token usage)

**Checkpoint**: User Story 3 is independently testable — Vault cancel path unchanged and fail-closed

---

## Phase 6: User Story 4 - Rearrange and Store Return Marking Unchanged (Priority: P2)

**Goal**: Confirm rearrange, return-to-store marking, and related non-cancel return actions are untouched by the cancel-policy change

**Independent Test**: Mark a return and rearrange (including bank-transfer rearrange gates) in Cosmo and Vault; behavior matches pre-feature behavior

### Tests for User Story 4

- [ ] T032 [P] [US4] Add/extend Vitest regression coverage that rearrange/bank-transfer helpers are unaffected by return-cancel policy modules in existing courier/return helper tests under `lib/` (or a focused no-op import smoke test)

### Implementation for User Story 4

- [ ] T033 [US4] Keep rearrange / `request_finance_approval` / `confirm_rearrange_paid` / `mark_returned_to_store` / `resend_void_approval` branches behaviorally unchanged in `app/api/admin/returns/[id]/route.ts`
- [ ] T034 [US4] Keep rearrange and finance-reverted UI actions unchanged while cancel buttons become policy-driven in `components/organisms/returned-orders-panel.tsx`
- [ ] T035 [US4] Confirm returned-orders list filters/counts/merchant visibility and voided auto-solve sweep remain intact in `lib/page-data/order-returns.ts`

**Checkpoint**: User Story 4 regressions pass — cancel-path changes do not break rearrange/intake

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification gates, security hardening, and quickstart evidence

- [ ] T036 [P] Sanitize all API/UI cancel errors (no tokens, credentials, or unbounded raw provider bodies) in `app/api/admin/returns/[id]/route.ts` and `lib/return-cancel-orchestrator.ts`
- [ ] T037 Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run mobile:typecheck`, and `npm run build`
- [ ] T038 Execute non-production Cosmo + Vault scenarios from `specs/010-cosmo-return-cancel/quickstart.md` and record evidence (order/return IDs, policy decisions, provider outcomes)
- [ ] T039 Confirm concurrent cancel claims return `409` conflict/in-progress and do not create duplicate approvals or duplicate provider cancels
- [ ] T040 Only after explicit user confirmation: deploy migration to remaining databases (`npm run db:deploy:vault` / `npm run db:deploy:cosmo-prod` / `npm run db:deploy:all` as directed)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP direct-cancel path
- **User Story 2 (Phase 4)**: Depends on Foundational; shares route/UI with US1 but independently testable with paid fixtures
- **User Story 3 (Phase 5)**: Depends on Foundational; can proceed after policy exists even before Cosmo direct UX polish
- **User Story 4 (Phase 6)**: Depends on cancel route/UI changes from US1–US3 so regressions are meaningful
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — core MVP
- **User Story 2 (P1)**: After Foundational — can run largely in parallel with US1 once policy + approval helper exist; route/UI files may serialize
- **User Story 3 (P1)**: After Foundational — primarily policy + UI/API enforcement; parallelizable with US2
- **User Story 4 (P2)**: After US1–US3 cancel changes land — regression validation

### Within Each User Story

- Tests (listed) SHOULD be written and fail before implementation where practical
- Policy/adapters before route wiring
- Page-data policy exposure before UI label changes
- Story complete before moving to next priority when files conflict

### Parallel Opportunities

- Phase 1: T002 and T003 in parallel after T001 starts/env docs
- Phase 2: T007+T008, T009, T010 in parallel after schema/migration tasks; T011 after approval refactor target is clear
- Phase 3: T012 and T013 in parallel; T017 page-data and T018 UI after orchestrator+route basics
- Phase 4/5: policy tests and finance-path wiring can proceed in parallel across different test files
- Phase 7: T036 can start while UAT fixtures are prepared

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Add Vitest orchestrator coverage in lib/return-cancel-orchestrator.test.ts"
Task: "Add Vitest Cosmo non-paid direct_cancel policy coverage in lib/return-cancel-policy.test.ts"

# After tests fail, implement orchestrator then route/UI:
Task: "Implement lib/return-cancel-orchestrator.ts"
Task: "Wire PUT /api/admin/returns/[id] direct path"
Task: "Expose cancelAction in lib/page-data/order-returns.ts"
Task: "Render Cancel/Retry in components/organisms/returned-orders-panel.tsx"
```

---

## Parallel Example: User Stories 2 + 3

```bash
# After Foundational policy helper exists:
Task: "Cosmo paid → request_cancel tests in lib/return-cancel-policy.test.ts"
Task: "Vault/unknown → request_cancel tests in lib/return-cancel-policy.test.ts"
Task: "Finance-path atomic approval tests under lib/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Cosmo unpaid direct cancel)
4. **STOP and VALIDATE** with Cosmo unpaid UAT from `quickstart.md`
5. Demo/deploy non-production if ready

### Incremental Delivery

1. Setup + Foundational → policy/schema/adapters ready
2. US1 → Cosmo unpaid direct cancel (MVP)
3. US2 → Cosmo paid finance path confirmed
4. US3 → Vault fail-closed invariant confirmed
5. US4 → rearrange/intake regression sign-off
6. Polish → full gates + dual-OS quickstart evidence

### Parallel Team Strategy

With multiple developers after Foundational:

- Developer A: US1 orchestrator + Cosmo direct route/UI
- Developer B: US2 paid finance path + approval atomicity tests
- Developer C: US3 Vault/fail-closed enforcement + policy matrix expansion
- Serialize edits to `app/api/admin/returns/[id]/route.ts` and `returned-orders-panel.tsx`

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work
- [Story] label maps task to US1–US4 for traceability
- Clients never choose direct vs finance; server recomputes policy on every cancel
- Migration creation must use `npm run db:migrate:create` only
- Production DB deploy requires explicit in-the-moment user confirmation (T040)
- Suggested MVP scope: Phases 1–3 (US1)
