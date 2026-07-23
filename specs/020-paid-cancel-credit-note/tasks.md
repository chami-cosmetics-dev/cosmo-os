# Tasks: Paid Return Cancel Creates Credit Note

**Input**: Design documents from `/specs/020-paid-cancel-credit-note/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan Phase D and Technical Context explicitly require Vitest coverage under `lib/**/*.test.ts`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single Next.js app at repository root: `app/`, `components/`, `lib/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared paid detection, audit labels, and sanitize helpers before completion work

- [x] T001 Export `isFullyPaidFinancialStatus` (exact trimmed lower-case `paid`) and `resolveReturnCancelCompletionMode` (`credit_note` | `cancel_si`) in `lib/return-cancel-completion.ts` per `contracts/return-cancel-completion.md`
- [x] T002 [P] Add/extend audit action summaries for return-cancel credit-note success, SI-cancel success, and completion failure in `lib/audit-log.ts` (keep existing `returned_order_cancel_*` action keys where possible)
- [x] T003 [P] Add a small sanitized error helper (no tokens/raw ERP bodies; bounded length) for approve responses in `lib/return-cancel-completion.ts` or reuse existing sanitize pattern from approvals/ERP sync

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Idempotent ERP credit-note ensure that flips original SI to Credit Note Issued — required by paid completion and shared by unpaid-mode routing

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Harden outbound credit-note create to set `update_outstanding_for_self: 0` on the return SI payload in `lib/erpnext-sync.ts` (`createErpnextCreditNote`)
- [x] T005 Implement `ensureErpnextCreditNote` in `lib/erpnext-sync.ts`: reuse OS `erpReturnSalesInvoiceIds` or ERP `return_against` list; else create; GET original SI and require status `Credit Note Issued`
- [x] T006 If original SI remains `Paid` after return create/reuse, implement reconcile/allocate fallback in `lib/erpnext-sync.ts` (Payment Reconciliation or tenant-proven method from research R2a), re-GET status; throw if still not credit-noted
- [x] T007 [P] Add Vitest coverage for ensure/create payload flag, reuse existing return SI, and fail-when-original-still-Paid in `lib/erpnext-sync.test.ts` (mock ERP GET/POST)
- [x] T008 Keep invoice-complete revert caller working with existing non-fatal semantics in `app/api/admin/orders/[id]/fulfillment/route.ts` (may call ensure or create; do not change revert UX unless required)

**Checkpoint**: Foundation ready — paid ERP credit note can be ensured with original Credit Note Issued verification

---

## Phase 3: User Story 1 - Paid Return Cancel Creates Credit Note (Priority: P1) ðŸŽ¯ MVP

**Goal**: Finance approve on a paid `return_cancel` creates/ensures ERP return credit note, original SI is Credit Note Issued, OS order voided/returned, return solved; approve stays pending on failure

**Independent Test**: Pending return-cancel on a paid returned order → finance approve → Return SI exists, original SI Credit Note Issued (not Paid), OS voided/returned, return solved; no SI cancel

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Add Vitest paid-path coverage in `lib/return-cancel-completion.test.ts` (calls ensure CN not cancel; fails if original still Paid; missing SI → failed; idempotent already-done)
- [x] T010 [P] [US1] Add Vitest coverage that `resolveReturnCancelCompletionMode` maps exact `paid` (incl. whitespace/case) to `credit_note` in `lib/return-cancel-completion.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Implement paid branch of `completeReturnCancelAfterFinanceApprove` in `lib/return-cancel-completion.ts` (ensure CN → Cosmo Shopify cancel when allowed → return structured result; no DB writes yet except via caller finalize)
- [x] T012 [US1] Add finalize helper to apply `ERP_CREDIT_NOTE_ORDER_PATCH`, append Return SI ids, set cancel metadata, solve `OrderReturn` in `lib/return-cancel-completion.ts` (reuse `lib/erp-credit-note-order-sync.ts` / `lib/erp-return-si.ts`)
- [x] T013 [US1] Rewire `RETURN_CANCEL_APPROVAL` approve in `app/api/admin/approvals/[id]/route.ts`: load order+location; run completion **outside** tx; on success tx approve+finalize; on failure leave pending + safe `422`/`502` error (do not solve return early)
- [x] T014 [US1] Update success audit text for paid return-cancel approve to include credit note name (remove acknowledgement-only "process in ERPNext") in `app/api/admin/approvals/[id]/route.ts`
- [x] T015 [US1] Return optional `completionMode` / `creditNoteName` on successful paid approve response per contract in `app/api/admin/approvals/[id]/route.ts`

**Checkpoint**: User Story 1 independently testable — paid finance approve credit-notes correctly

---

## Phase 4: User Story 2 - Unpaid Return Cancel Still Cancels (Priority: P1)

**Goal**: Non-paid return-cancel finance approve cancels the unpaid SI (no credit note), voids/returns OS order, solves return

**Independent Test**: Pending return-cancel on unpaid/non-paid returned order → finance approve → SI cancelled, no return credit note, OS voided/returned, return solved

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T016 [P] [US2] Add Vitest unpaid/non-paid matrix in `lib/return-cancel-completion.test.ts` (`pending`/`null`/`partial`/`refunded` → `cancel_si`; never calls ensure CN; cancel `not_found` → failed)
- [x] T017 [P] [US2] Add Vitest Vault Shopify skip (`skipped_vault` / `not_applicable`) without failing unpaid completion in `lib/return-cancel-completion.test.ts`

### Implementation for User Story 2

- [x] T018 [US2] Implement unpaid/`cancel_si` branch in `lib/return-cancel-completion.ts` using strict `cancelErpnextSalesInvoice` then Cosmo Shopify cancel / Vault skip; never create credit note
- [x] T019 [US2] Finalize unpaid success in `lib/return-cancel-completion.ts` (void/returned OS + solve return; no Return SI append required)
- [x] T020 [US2] Ensure approvals route uses shared completion helper for both modes (paid vs unpaid) in `app/api/admin/approvals/[id]/route.ts` and returns `completionMode: cancel_si` + `invoiceName` on unpaid success
- [x] T021 [US2] Update unpaid success audit summary (SI cancel, not credit note) in `app/api/admin/approvals/[id]/route.ts`

**Checkpoint**: User Stories 1 and 2 both work — payment status selects CN vs cancel

---

## Phase 5: User Story 3 - Request / Reject / UI Unchanged Entry (Priority: P2)

**Goal**: Request cancel and finance reject stay intact (no ERP side effects on reject); finance UI copy reflects auto credit-note vs cancel; entry rules unchanged

**Independent Test**: Request cancel creates pending approval without CN; reject resets return with no ERP mutation; UI no longer says "mark processed then cancel manually" as primary path

### Tests for User Story 3

- [x] T022 [P] [US3] Add Vitest (or route-level) assertion that reject path does not invoke ensure CN / cancel SI — cover via completion helper not called on reject, or focused test stub in `lib/return-cancel-completion.test.ts` documenting reject is route-only

### Implementation for User Story 3

- [x] T023 [US3] Confirm `RETURN_CANCEL_APPROVAL` reject path in `app/api/admin/approvals/[id]/route.ts` remains reset-return-only (no ERP/Shopify); fix only if accidentally wired
- [x] T024 [US3] Expose `completionMode` on return_cancel rows from `app/api/admin/approvals/route.ts` (and/or page-data) using linked order `financialStatus`
- [x] T025 [US3] Update finance UI copy/button labels for return_cancel in `components/organisms/finance-approvals-panel.tsx` (paid → credit note; unpaid → cancel SI; remove primary "complete cancellation manually in ERPNext" wording)
- [x] T026 [P] [US3] Soften/update return-cancel request notify body in `lib/approval-workflow.ts` so it no longer implies finance must only process manually in ERPNext
- [x] T027 [P] [US3] Optional help-text tweak only (no entry-rule change) in `components/organisms/returned-orders-panel.tsx` if copy still says credit note is always manual

**Checkpoint**: Request/reject UX intact; finance UI matches automated completion

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Webhook coexistence, gates, and non-prod UAT

- [x] T028 [P] Verify inbound credit-note webhook after OS-created CN stays idempotent (already voided + Return SI append) in `lib/erp-credit-note-order-sync.ts` / existing tests; add a focused case in `lib/erp-credit-note-order-sync.test.ts` if gap found
- [x] T029 [P] Sanitize all new user-facing ERP/Shopify errors in `app/api/admin/approvals/[id]/route.ts` and `lib/return-cancel-completion.ts`
- [x] T030 Run `npm test` for `lib/return-cancel-completion.test.ts` and `lib/erpnext-sync.test.ts`, plus lint on touched files
- [ ] T031 Execute non-production scenarios A–E from `specs/020-paid-cancel-credit-note/quickstart.md` (Cosmo and/or Vault); do not mutate production ERP without explicit approval
- [x] T032 Confirm rearrange / other approval types and Cosmo unpaid **direct** cancel (unimplemented `010`) were not accidentally changed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; shares completion helper/route with US1 (implement after or carefully beside US1)
- **User Story 3 (Phase 5)**: Depends on US1/US2 approve wiring for accurate UI copy; reject confirmation can start earlier
- **Polish (Phase 6)**: Depends on desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2/US3
- **US2 (P1)**: After Foundational — extends same helper; independently testable with unpaid fixtures
- **US3 (P2)**: After US1 (and ideally US2) for accurate finance copy; reject path independent

### Within Each User Story

- Tests marked first MUST fail before implementation
- Helper/lib before route wiring
- Route before UI copy
- Story complete before next priority when sharing the same route file

### Parallel Opportunities

- T002, T003 in Setup
- T007 in Foundational (after T005/T006 APIs exist enough to mock)
- T009/T010 (US1 tests), T016/T017 (US2 tests), T022 (US3 test)
- T026/T027 UI/notify copy after API exposes `completionMode`
- T028/T029 in Polish

---

## Parallel Example: User Story 1

```bash
# Tests in parallel:
Task: "Paid-path Vitest in lib/return-cancel-completion.test.ts"
Task: "completionMode paid mapping Vitest in lib/return-cancel-completion.test.ts"

# Then sequential implementation:
Task: "Paid branch completeReturnCancelAfterFinanceApprove"
Task: "Finalize OS void + Return SI + solve return"
Task: "Wire approvals PATCH for return_cancel approve"
```

---

## Parallel Example: User Story 2

```bash
# Tests in parallel:
Task: "Unpaid/non-paid matrix Vitest"
Task: "Vault Shopify skip Vitest"

# Then implementation:
Task: "Unpaid cancel_si branch in return-cancel-completion.ts"
Task: "Route returns cancel_si + invoiceName"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (`ensureErpnextCreditNote` + Credit Note Issued verify)
3. Complete Phase 3: User Story 1 (paid approve → credit note)
4. **STOP and VALIDATE** with quickstart Scenario A (+ D fail path)
5. Demo/ship MVP if ready

### Incremental Delivery

1. Setup + Foundational → ERP ensure ready
2. US1 paid credit note → MVP
3. US2 unpaid SI cancel → full payment matrix
4. US3 UI/reject/copy → operator clarity
5. Polish + quickstart A–E

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Then:
   - Dev A: US1 paid path + approve wiring
   - Dev B: US2 unpaid tests/branch (merge carefully in shared helper/route)
   - Dev C: US3 UI/notify copy after `completionMode` exists

---

## Notes

- [P] = different files, no incomplete dependencies
- No Prisma migration required for this feature
- Do **not** implement Cosmo unpaid direct-cancel orchestrator from `010` here
- Paid success = Return SI **and** original SI **Credit Note Issued** (not left Paid)
- Format validation: all tasks use `- [ ]`, Task ID, optional `[P]`/`[US#]`, and file paths
