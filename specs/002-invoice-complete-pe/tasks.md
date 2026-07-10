# Tasks: Invoice Complete PE Integrity

**Input**: Design documents from `/specs/002-invoice-complete-pe/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included â€” plan.md calls for Vitest coverage of SI lookup / `requireMop` / approval stage guards

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 maps to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/api/admin/`, `components/organisms/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient implementers; no new project scaffold

- [x] T001 Confirm feature docs and touchpoints in `specs/002-invoice-complete-pe/plan.md`, `research.md`, and `contracts/invoice-complete-pe.md`
- [x] T002 [P] Skim current PE helpers in `lib/erpnext-sync.ts` (`createDeliveryPaymentEntry`, `syncFinanceApprovedPrepaidPaymentToERPNext`) and `lib/mark-order-invoice-complete.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared PE integrity helpers all stories depend on

**âš ï¸ CRITICAL**: Complete before US1â€“US3 implementation work that assumes correct SI lookup

- [x] T003 Update `createDeliveryPaymentEntry` in `lib/erpnext-sync.ts` to prefer `order.erpnextInvoiceId` for SI lookup (fallback to name / `po_no`)
- [x] T004 In `lib/erpnext-sync.ts`, when `requireMop` / invoice-complete retry path: throw (do not silent-return) if SI cannot be resolved or ERP credentials/company missing; keep `outstanding_amount <= 0` as success no-op
- [x] T005 [P] Add Vitest coverage for SI lookup + requireMop throw/no-op behavior in `lib/erpnext-sync` tests (new or existing `*.test.ts` beside helper patterns used in repo)
- [x] T006 Ensure `markOrderErpPeSyncFailed` / `clearOrderErpPeSyncFailure` in `lib/failed-erp-pe-sync.ts` remain the single write path for PE failure fields used by later stories

**Checkpoint**: Foundation ready â€” PE create either succeeds, already-paid no-ops, or throws for required-MOP paths

---

## Phase 3: User Story 1 - Invoice complete always creates or clearly fails ERP payment (Priority: P1) ðŸŽ¯ MVP

**Goal**: Normal (user) invoice complete never silently skips PE; UI shows created / already paid / failed

**Independent Test**: Mark invoice complete on unpaid SI â†’ PE in ERP or visible `erpPeError` + Failed PE tab; already-paid SI â†’ success without duplicate PE

### Tests for User Story 1

- [x] T007 [P] [US1] Extend/add Vitest for `markOrderInvoiceComplete` PE outcome handling in `lib/mark-order-invoice-complete.ts` (or colocated test) â€” clear failure only on confirmed PE / already paid

### Implementation for User Story 1

- [x] T008 [US1] Tighten `markOrderInvoiceComplete` in `lib/mark-order-invoice-complete.ts` to call `createDeliveryPaymentEntry` with `requireMop: true`, persist `erpPeSync*` on throw, and only clear failure after confirmed PE or already-paid
- [x] T009 [P] [US1] Align single-order `mark_invoice_complete` response messaging in `app/api/admin/orders/[id]/fulfillment/route.ts` with PE created / already paid / failed
- [x] T010 [P] [US1] Align bulk path in `app/api/admin/orders/bulk-invoice-complete/route.ts` with the same PE outcome semantics
- [x] T011 [US1] Update success/error toasts and row status in `components/organisms/fulfillment-bulk-invoice-complete.tsx` so UI never claims â€œPE createdâ€ on silent skip or failure
- [x] T012 [US1] Smoke-check invoice-complete page wiring in `components/organisms/fulfillment-pages/invoice-complete.tsx` still passes MOP into the completer

**Checkpoint**: US1 MVP â€” normal invoice complete is honest about PE

---

## Phase 4: User Story 2 - Find and repair silent missing PEs (Priority: P1)

**Goal**: Discover `invoice_complete` orders missing ERP PE (including SV1008360-class) and retry with MOP without redoing fulfillment

**Independent Test**: Silent-gap order appears in Failed ERP â†’ Payment Entry; retry creates PE / clears error; SV100-0695 style SI paid

### Tests for User Story 2

- [x] T013 [P] [US2] Add Vitest for PE gap where-clause / list filter helper (extract if needed) covering `erpPeSyncError` rows and silent-gap candidates

### Implementation for User Story 2

- [x] T014 [US2] Extend PE list query in `app/api/admin/orders/failed-erp-syncs/route.ts` (`kind=payment_entry`) to include silent gaps (`invoice_complete` + linked SI outstanding / missing PE), per `contracts/invoice-complete-pe.md`
- [x] T015 [US2] Allow repair retry without prior error (seed `erpPeSync*` or accept repair) in `app/api/admin/orders/[id]/retry-erp-pe-sync/route.ts`
- [x] T016 [P] [US2] Update `components/organisms/failed-erp-pe-syncs-tab.tsx` to show gap vs known-failure and MOP retry UX
- [x] T017 [P] [US2] Confirm tab entry in `components/organisms/failed-erp-syncs-panel.tsx` still routes to the PE tab for the extended list
- [x] T018 [US2] Manually verify repair path against Vault example order/SI documented in `specs/002-invoice-complete-pe/quickstart.md` (SV1008360 / SV100-0695 class)

**Checkpoint**: US2 â€” operators can find and fix historical missing PEs

---

## Phase 5: User Story 3 - Prepaid vs normal payment-path rules (Priority: P1)

**Goal**: KOKO/bank/WebXPay â†’ PE on finance approval + no stage regress if already invoice complete; normal orders â†’ PE only at user invoice complete after delivery

**Independent Test**: Approve prepaid â†’ PE at approval, no re-queue if already complete; COD deliver â†’ invoice complete creates PE; late approval on already-complete prepaid stays `invoice_complete`

### Tests for User Story 3

- [x] T019 [P] [US3] Add Vitest for approval stage-guard helper (already `invoice_complete` must not map to `print`) colocated with approval workflow tests or new `lib/*.test.ts`

### Implementation for User Story 3

- [x] T020 [US3] In `app/api/admin/approvals/[id]/route.ts`, on `ORDER_PAYMENT_APPROVAL` approve: if order `fulfillmentStage === "invoice_complete"`, do not `orderStageUpdate("print")`; keep stage; still run prepaid PE sync if outstanding > 0
- [x] T021 [US3] In `app/api/admin/approvals/[id]/route.ts`, on `PAYMENT_METHOD_CHANGE_APPROVAL` approve: treat `invoice_complete` as post-delivery (do not force `print`)
- [x] T022 [US3] Harden finance-approval PE path (`syncFinanceApprovedPrepaidPaymentToERPNext` in `lib/erpnext-sync.ts` + approve handler) so required PE failures persist via `markOrderErpPeSyncFailed` (no silent approval success without PE/failure)
- [x] T023 [P] [US3] On `DELIVERY_PAYMENT_APPROVAL` PE failure in `app/api/admin/approvals/[id]/route.ts`, call `markOrderErpPeSyncFailed` in `lib/failed-erp-pe-sync.ts`
- [x] T024 [US3] Review `lib/delivery-payment-approval.ts` / `lib/mark-order-delivered.ts` early-finance auto-complete so prepaid path does not skip PE when SI still outstanding (align with PE-on-approval product rule)
- [x] T025 [US3] Confirm normal (non-prepaid) orders still reach invoice-complete queue only after delivery and use US1 completer for PE (no finance gate) via fulfillment filters in `lib/page-data/orders.ts` / invoice-complete page

**Checkpoint**: US3 â€” dual PE timings and no prepaid re-queue regression

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Both tenants, docs, CI gate

- [x] T026 [P] Run `npm test` and fix regressions from new Vitest cases
- [x] T027 [P] Walk `specs/002-invoice-complete-pe/quickstart.md` scenarios on Vault (and Cosmo smoke if available)
- [x] T028 Mark completed checklist notes in `specs/002-invoice-complete-pe/checklists/requirements.md` if any implementation deltas need recording
- [x] T029 Spot-check UI copy on Failed ERP PE tab + invoice complete toasts for both OS deployments

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup â€” **blocks** US1â€“US3 PE correctness
- **US1 (Phase 3)**: After Foundational â€” MVP
- **US2 (Phase 4)**: After Foundational; benefits from T003â€“T004; can follow US1
- **US3 (Phase 5)**: After Foundational; can parallel US2 once T003â€“T004 done; overlaps approve route with PE failure persistence
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1**: Depends on Phase 2 only
- **US2**: Depends on Phase 2 (SI lookup + failure fields); list/retry independent of US3
- **US3**: Depends on Phase 2; approval PE integrity shares `createDeliveryPaymentEntry` / `erpPeSync*` with US1/US2

### Parallel Opportunities

- T001 âˆ¥ T002
- T005 âˆ¥ T006 (after T003â€“T004)
- T009 âˆ¥ T010 (after T008)
- T013 âˆ¥ T016 âˆ¥ T017 (after list/retry API direction clear)
- T019 âˆ¥ early US2 UI once foundation done
- T020 and T021 touch same file â€” **sequential**
- T026 âˆ¥ T027 in polish if environments allow

---

## Parallel Example: User Story 1

```bash
# After T008:
Task: "Align fulfillment route PE messaging in app/api/admin/orders/[id]/fulfillment/route.ts"
Task: "Align bulk-invoice-complete PE semantics in app/api/admin/orders/bulk-invoice-complete/route.ts"
```

## Parallel Example: User Story 2

```bash
# After T014â€“T015:
Task: "Update failed-erp-pe-syncs-tab.tsx gap UX"
Task: "Confirm failed-erp-syncs-panel.tsx PE tab routing"
```

---

## Implementation Strategy

### MVP First (User Story 1 + Foundation)

1. Phase 1 Setup  
2. Phase 2 Foundational (SI lookup + requireMop throws)  
3. Phase 3 US1 (completer + UI honesty)  
4. **STOP** â€” validate normal invoice complete PE integrity  

### Incremental Delivery

1. Foundation + US1 â†’ stop silent skips on new completes  
2. US2 â†’ repair SV1008360-class backlog  
3. US3 â†’ prepaid PE-on-approval + no re-queue  
4. Polish / quickstart on Vault + Cosmo  

### Suggested MVP scope

**T001â€“T012** (Setup + Foundation + US1)

---

## Notes

- No Prisma migration planned; reuse `erpPeSyncError` / `erpPeSyncFailedAt` / `erpPeSyncMop`
- Do not mass-auto-create PEs; operator retry only for backlog
- Commit after each logical group; ask before prod deploy (constitution IV)
