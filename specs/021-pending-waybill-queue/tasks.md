# Tasks: Pending Waybill Queue

**Input**: Design documents from `/specs/021-pending-waybill-queue/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/pending-waybill-queue.md](./contracts/pending-waybill-queue.md)

**Tests**: Optional — not required by spec; Vitest for pure helpers included in Foundational because [plan.md](./plan.md) / [research.md](./research.md) R8 call for them.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label (`[US1]` â€¦ `[US4]`)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared types and route stubs for the waybill page-data surface.

- [X] T001 [P] Add page-data DTO/types in `lib/page-data/waybill-lookup-types.ts` (pending row, upload history row, pagination, rematch summary, `canImport` — match [contracts/pending-waybill-queue.md](./contracts/pending-waybill-queue.md))
- [X] T002 [P] Create stub route directory `app/api/admin/waybills/page-data/` (placeholder `route.ts` exporting nothing yet or a minimal 501 is fine until Phase 2/3 wires it)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared order-match + pending helpers that all stories use. No user story work until this phase completes.

**âš ï¸ CRITICAL**: Blocks US1â€“US4

- [X] T003 Extract `findOrderIdByInvoiceRef(companyId, invoiceInput)` in `lib/order-waybills.ts` from the existing candidate SQL in `findOrderWaybillsByInvoice` (same `name` / `orderNumber` / `shopifyOrderId` / `erpnextInvoiceId` + `#` normalization rules)
- [X] T004 [P] Add `isPendingWaybill({ orderId, deliveryCompleteAt })` helper in `lib/order-waybills.ts` per [data-model.md](./data-model.md) (unmatched OR `deliveryCompleteAt` null)
- [X] T005 [P] Add Zod query schema for waybill page-data in `lib/validation.ts` (`page`, `limit` with bounds, optional `rematch` flag) using existing `LIMITS` / pagination conventions
- [X] T006 Implement `listWaybillUploads(companyId, { take })` in `lib/order-waybills.ts` (or `lib/page-data/waybill-lookup.ts`) returning upload history rows with uploader name/email, newest first
- [X] T007 Implement `listPendingWaybills(companyId, { page, limit })` in `lib/order-waybills.ts` (or `lib/page-data/waybill-lookup.ts`): LEFT JOIN `Order` + `WaybillUpload`, pending filter, pagination `total`, order by `uploadedAt`/`createdAt` DESC; include `rawPayload`, match status, and display-ready order fields via `lib/fulfillment-order-reference.ts`
- [X] T008 Implement `rematchUnmatchedWaybills(companyId, { limit })` in `lib/order-waybills.ts` using `findOrderIdByInvoiceRef`; return `{ attempted, matched }`; never cross company
- [X] T009 [P] Add Vitest coverage in `lib/order-waybills.test.ts` for `normalizeInvoiceLookup` / invoice candidates, `isPendingWaybill`, and rematch skip-when-already-linked behavior (pure or lightly mocked)

**Checkpoint**: Helpers + types ready — user stories can proceed

---

## Phase 3: User Story 1 - Upload multiple waybill files without losing prior data (Priority: P1) ðŸŽ¯ MVP

**Goal**: Operators can upload file B after file A without losing Aâ€™s waybills; upload history lists each import separately.

**Independent Test**: Upload File A, then File B with different waybill numbers; search still finds Aâ€™s waybills; history shows both files (quickstart Â§2).

### Implementation for User Story 1

- [X] T010 [US1] Audit `app/api/admin/waybills/import/route.ts` to confirm it never deletes company `OrderWaybill` rows on new upload; keep `WaybillUpload` insert + upsert-on-`(companyId, waybillNo)` latest-wins; document in a short code comment if behavior is non-obvious
- [X] T011 [US1] Wire `GET` handler in `app/api/admin/waybills/page-data/route.ts` to return at least `uploads`, `canImport`, and empty/partial `pending` placeholder using `requireAnyPermission(["fulfillment.waybill_lookup.read", "fulfillment.waybill_lookup.import"])` + Zod from T005 + `listWaybillUploads`
- [X] T012 [US1] Add **Upload History** table UI in `components/organisms/fulfillment-pages/waybill-lookup.tsx` (columns per contract: file name, uploaded at, uploaded by, total/imported/invalid/unmatched, status); fetch via page-data; refresh after successful import
- [X] T013 [US1] Update import success path in `components/organisms/fulfillment-pages/waybill-lookup.tsx` to refetch page-data (history) and clear any "single file" messaging so copy states uploads are cumulative

**Checkpoint**: US1 independently verifiable — multi-upload + visible history

---

## Phase 4: User Story 2 - Map uploaded waybills to OS orders (Priority: P1)

**Goal**: Imported rows resolve `orderId` when invoice/reference matches; unmatched stay stored; rematch without re-upload.

**Independent Test**: Import one matching open-order invoice and one fake invoice; matched shows OS id; rematch after creating order links the unmatched row (quickstart Â§4â€“5).

### Implementation for User Story 2

- [X] T014 [US2] Update `saveOrderWaybill` call sites in `app/api/admin/waybills/import/route.ts` to set `orderId` via `findOrderIdByInvoiceRef` before save; count and persist accurate `unmatchedRows` on `WaybillUpload` + summary JSON
- [X] T015 [US2] Update manual save path in `app/api/admin/waybills/search/route.ts` (POST) to resolve `orderId` the same way when creating/updating a waybill
- [X] T016 [US2] On successful import in `app/api/admin/waybills/import/route.ts`, include `unmatchedRows` in the JSON `summary` response (contract delta)
- [X] T017 [US2] Invoke capped `rematchUnmatchedWaybills` from `app/api/admin/waybills/page-data/route.ts` when `rematch=1` (and/or automatically with a safe default cap on load per research R3); return `rematch` summary in response
- [X] T018 [P] [US2] Optional: add `POST` `app/api/admin/waybills/rematch/route.ts` with Zod body `{ limit? }` for an explicit **Re-check matches** button
- [X] T019 [US2] Show match status + OS display id in pending/history-adjacent UI once pending rows exist; until US3 lands, surface match counts in import summary toast/`importSummary` in `components/organisms/fulfillment-pages/waybill-lookup.tsx` (imported / invalid / unmatched)

**Checkpoint**: US2 independently verifiable — mapping + rematch work even if pending table is still minimal

---

## Phase 5: User Story 3 - Pending waybills list hides delivery-completed orders (Priority: P1)

**Goal**: Default pending list shows unmatched + matched nonâ€“delivery-complete only; completed remain searchable.

**Independent Test**: Seed pending matched, unmatched, and delivery-complete matched; pending shows first two only; search finds the completed one (quickstart Â§6â€“7).

### Implementation for User Story 3

- [X] T020 [US3] Complete `GET` `app/api/admin/waybills/page-data/route.ts` to return full `pending` + `pagination` via `listPendingWaybills` (exclude matched rows with non-null `Order.deliveryCompleteAt`)
- [X] T021 [US3] Optionally pass `initialData` from `app/(dashboard)/dashboard/fulfillment/waybill-lookup/page.tsx` using page-data helper to avoid client waterfalls (skip client fetch when `initialData` provided)
- [X] T022 [US3] Add **Pending Waybills** table in `components/organisms/fulfillment-pages/waybill-lookup.tsx` with contract columns, pagination controls, empty state, and loading/disabled UX per action-loading rules
- [X] T023 [US3] Confirm `app/api/admin/waybills/search/route.ts` still returns delivery-complete waybills on invoice/waybill search (no accidental pending-only filter on search)
- [X] T024 [US3] Add optional **Re-check matches** control on the pending section in `components/organisms/fulfillment-pages/waybill-lookup.tsx` calling rematch then refetching page-data

**Checkpoint**: US3 independently verifiable — working pending queue

---

## Phase 6: User Story 4 - Review waybill details from the pending list (Priority: P2)

**Goal**: Open full courier-row details (+ OS context) from a pending row without leaving Waybill Lookup.

**Independent Test**: Click pending row with `rawPayload`; see non-empty fields; matched shows order identity; unmatched shows clear no-match message (quickstart details behavior).

### Implementation for User Story 4

- [X] T025 [US4] Reuse or extract shared details dialog from search results in `components/organisms/fulfillment-pages/waybill-lookup.tsx` so pending rows open the same details (non-empty `rawPayload` entries)
- [X] T026 [US4] In pending details, show OS order summary when `matchStatus === "matched"` (display id + delivery-complete flag) and an explicit "No OS order match" state when unmatched
- [X] T027 [US4] Ensure keyboard/row click affordances match existing search table accessibility patterns in `components/organisms/fulfillment-pages/waybill-lookup.tsx`

**Checkpoint**: All stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story hardening and validation

- [X] T028 [P] Align import summary cards in `components/organisms/fulfillment-pages/waybill-lookup.tsx` with `unmatchedRows` and clarify helper text that new uploads add to the queue (do not replace prior files wholesale)
- [X] T029 Run `npm test -- order-waybills` and fix failures in `lib/order-waybills.test.ts` / related helpers
- [X] T030 [P] Lint changed files (`waybill-lookup.tsx`, `lib/order-waybills.ts`, `app/api/admin/waybills/**`) clean
- [ ] T031 Execute manual scenarios in [quickstart.md](./quickstart.md) and record sign-off
- [X] T032 Skipped — no new index migration; existing `OrderWaybill` indexes used for v1 (revisit only if pending-list EXPLAIN shows need)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational; benefits from US1 page-data shell but mapping can be verified via import summary/API alone
- **US3 (Phase 5)**: After Foundational; strongest after US1 page-data + US2 `orderId` population
- **US4 (Phase 6)**: After US3 pending table exists (needs rows to click)
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

```text
Phase 2 Foundational
        â”œâ”€â”€ US1 (history + cumulative upload UX)  â† MVP
        â”œâ”€â”€ US2 (order mapping + rematch)
        â”‚         â””â”€â”€ US3 (pending list filter) â”€â”€â–º US4 (details)
        â””â”€â”€ (US3 can stub with unmatched-only if US2 not done, but full acceptance needs mapping)
```

- **US1**: No dependency on US2â€“US4
- **US2**: No hard dependency on US1 UI; share page-data route
- **US3**: Needs T007 pending query; ideally US2 so matched/completed filtering is meaningful
- **US4**: Needs US3 pending list UI

### Parallel Opportunities

- T001 âˆ¥ T002 (Setup)
- T004 âˆ¥ T005 âˆ¥ T009 after T003 exists for shared module edits — prefer T003 first, then T004/T005/T006â€“T008 sequenced carefully in same file (`lib/order-waybills.ts`); mark only truly separate-file work `[P]`
- T018 (optional rematch route) âˆ¥ T019 UI summary once T008 exists
- T028 âˆ¥ T030 in Polish

---

## Parallel Example: Foundational + US1

```bash
# After T003 lands in lib/order-waybills.ts:
Task: "T005 Add Zod query schema in lib/validation.ts"
Task: "T001 Add DTOs in lib/page-data/waybill-lookup-types.ts"  # if not done in Setup

# US1 UI + route once listWaybillUploads exists:
Task: "T011 Wire page-data uploads in app/api/admin/waybills/page-data/route.ts"
Task: "T012 Upload History table in components/organisms/fulfillment-pages/waybill-lookup.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational (at least T003â€“T006, T009; T007â€“T008 can slip if MVP is history-only)  
3. Phase 3 US1  
4. **STOP and VALIDATE** multi-upload retention + history  

### Incremental Delivery (recommended product path)

1. MVP = US1 (history proves files are not wiped)  
2. US2 mapping + rematch  
3. US3 pending queue (primary operator value)  
4. US4 details polish  
5. Quickstart sign-off  

### Parallel Team Strategy

- Dev A: Foundational helpers in `lib/order-waybills.ts`  
- Dev B: page-data route + types (after T001/T005)  
- After Foundational: Dev A â†’ US2 import mapping; Dev B â†’ US1/US3 UI  

---

## Notes

- No new RBAC keys — reuse `fulfillment.waybill_lookup.read` / `.import`
- No new Prisma models for v1; migration only if T032 proves necessary
- Do not hard-delete delivery-complete waybills
- Prefer one `page-data` fetch over multiple client API calls
- Commit after each task or logical group; stop at checkpoints to validate

---

## Task Summary

| Phase | Story | Task IDs | Count |
|-------|-------|----------|-------|
| 1 Setup | — | T001â€“T002 | 2 |
| 2 Foundational | — | T003â€“T009 | 7 |
| 3 | US1 | T010â€“T013 | 4 |
| 4 | US2 | T014â€“T019 | 6 |
| 5 | US3 | T020â€“T024 | 5 |
| 6 | US4 | T025â€“T027 | 3 |
| 7 Polish | — | T028â€“T032 | 5 |
| **Total** | | **T001â€“T032** | **32** |

**Per story**: US1: 4 Â· US2: 6 Â· US3: 5 Â· US4: 3  

**MVP scope**: Phase 1â€“2 (minimal) + **US1** (T010â€“T013)  

**Format validation**: All tasks use `- [ ]`, sequential `Txxx` IDs, optional `[P]`, story labels on US phases only, and explicit file paths.

