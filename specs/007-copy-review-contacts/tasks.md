# Tasks: Copy Review Contacts for Follow-up

**Input**: Design documents from `/specs/007-copy-review-contacts/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for pure eligibility/clipboard helpers — include those; no full TDD suite required by spec

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US3 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and existing Merchant Reviews code

- [x] T001 Confirm feature docs in `specs/007-copy-review-contacts/plan.md`, `research.md`, `data-model.md`, and `contracts/copy-review-contacts.md`
- [x] T002 [P] Skim reuse targets: `components/organisms/merchant-review-panel.tsx`, `lib/merchant-order-reviews.ts`, `app/api/admin/merchant-reviews/orders/[id]/route.ts`, `lib/audit-log.ts`, `lib/notify.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared eligibility helpers, audit action key, and bulk persistence API that all stories rely on

**CRITICAL**: No user story UI work until helpers + bulk endpoint + audit key land

- [x] T003 [P] Add pure helpers in `lib/merchant-review-copy-contacts.ts`: classify filtered queue rows (clipboard vs mark candidates), build one-phone-per-line clipboard text, summarize skip counts (missing phone / terminal status) per `research.md` R3 and `data-model.md`
- [x] T004 [P] Add Vitest coverage in `lib/merchant-review-copy-contacts.test.ts` for clipboard text, pending+phone eligibility, skip missing phone / reviewed / no_response, already-follow_up clipboard include without “new mark” expectation
- [x] T005 [P] Register audit action `merchant_review_bulk_follow_up` in `lib/audit-log.ts` (and label in `app/(dashboard)/dashboard/audit/page.tsx` if that map is required for display)
- [x] T006 Add optional batch max constant (e.g. 500) in `lib/validation.ts` or keep inline Zod `.max(500)` for `orderIds` per contract
- [x] T007 Implement `markManyMerchantReviewsFollowUp` (or equivalent) in `lib/merchant-order-reviews.ts`: company-scoped load, skip terminal statuses, idempotent `follow_up`, upsert missing/pending rows to `follow_up` without wiping existing call/reason fields on update
- [x] T008 Implement `POST` handler in `app/api/admin/merchant-reviews/mark-follow-up/route.ts` per `contracts/copy-review-contacts.md`: `requirePermission("merchant_reviews.manage")`, Zod `orderIds`, call T007 helper, single bulk audit log, return `updatedOrderIds` + `counts`

**Checkpoint**: Bulk API + helpers ready; UI can call copy-then-mark safely

---

## Phase 3: User Story 1 - Copy assigned contact numbers and mark Follow up (Priority: P1) 🎯 MVP

**Goal**: Reviewer copies all eligible phones from the filtered Assigned Review Queue and Pending contributors become Follow up

**Independent Test**: Filter to several Pending orders with phones → Copy all → clipboard has those numbers → queue badges show Follow up → refresh still Follow up; read-only user cannot use the action

### Implementation for User Story 1

- [x] T009 [US1] Add **Copy all contact numbers** control in Assigned Review Queue header of `components/organisms/merchant-review-panel.tsx` (only when `canManage`; disable when busy or no clipboard candidates)
- [x] T010 [US1] Wire handler in `components/organisms/merchant-review-panel.tsx`: run helpers on `filteredOrders` → `navigator.clipboard.writeText` → on success `POST /api/admin/merchant-reviews/mark-follow-up` with pending phone-contributor IDs only; on clipboard failure stop with no API (FR-009)
- [x] T011 [US1] On API success in `components/organisms/merchant-review-panel.tsx`, patch local `queueOrders` (and selected detail/form status if selected id updated) to `follow_up` for `updatedOrderIds`; `notify.success` with copied/updated/skipped counts; apply action-loading UX (`busyKey`, spinner “Copying…”, disable related controls)
- [x] T012 [US1] On API failure/partial after clipboard success in `components/organisms/merchant-review-panel.tsx`, `notify` warning/error with succeeded vs failed counts so user can retry

**Checkpoint**: US1 — copy-all + durable Follow up works for manage users; blocked for read-only

---

## Phase 4: User Story 2 - Call customers one-by-one and complete reviews in Cosmo OS (Priority: P1)

**Goal**: After bulk Follow up, existing Review Capture Form still finishes each order; Follow up filter shows remaining work

**Independent Test**: After copy-all, open one Follow up order → save Reviewed/No response with remarks → that order updates; siblings remain Follow up and visible under Follow up / All filters

### Implementation for User Story 2

- [x] T013 [US2] Verify existing Review Capture Form save path in `components/organisms/merchant-review-panel.tsx` + `app/api/admin/merchant-reviews/orders/[id]/route.ts` still updates status/remarks for orders that were bulk-marked `follow_up` (no contract change unless a bug is found)
- [x] T014 [US2] Ensure after per-order save, local `queueOrders` status + counts stay in sync when filtering by `follow_up` / `__all` in `components/organisms/merchant-review-panel.tsx` so remaining Follow up work stays visible
- [x] T015 [US2] If selected order was bulk-marked Follow up while detail form still shows Pending, sync `form.reviewStatus` / badge from updated queue item in `components/organisms/merchant-review-panel.tsx` so the form is not stale

**Checkpoint**: US2 — post-call capture workflow unchanged and usable after copy-all

---

## Phase 5: User Story 3 - Safe handling when the queue is empty or incomplete (Priority: P2)

**Goal**: Clear messaging when there is nothing to copy or some rows lack phones; no false success status changes

**Independent Test**: Empty queue → copy-all informs and no API/status change; mixed missing phones → only numbered rows copy/update with skip count; all phoneless → no clipboard success / no status change

### Implementation for User Story 3

- [x] T016 [US3] When clipboard candidates are empty (empty filtered queue or no usable phones) in `components/organisms/merchant-review-panel.tsx`, show clear `notify` message and do not call mark-follow-up
- [x] T017 [US3] Include skipped-missing-phone (and terminal-excluded) counts in success/info toasts in `components/organisms/merchant-review-panel.tsx` so reviewers know who was not copied
- [x] T018 [P] [US3] Extend Vitest in `lib/merchant-review-copy-contacts.test.ts` for empty list, all-missing-phone, and mixed skip summary cases from `quickstart.md` §4

**Checkpoint**: US3 — empty/incomplete queues are safe and transparent

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases and validation pass across stories

- [x] T019 [P] Confirm terminal statuses (`reviewed` / `no_response`) never enter clipboard text or bulk mark payload from helpers in `lib/merchant-review-copy-contacts.ts` (wide “All statuses” filter case)
- [x] T020 Harden bulk route edge cases in `app/api/admin/merchant-reviews/mark-follow-up/route.ts`: unknown IDs → `notFound` counts; batch >500 → 400; table unavailable → 503
- [x] T021 Run `npx vitest run lib/merchant-review-copy-contacts.test.ts` and `npm test`; fix regressions
- [x] T022 Manually walk `specs/007-copy-review-contacts/quickstart.md` scenarios 2–7 (happy path, capture form, empty/no-phone, terminal protection, clipboard fail, read-only)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — **MVP**
- **User Story 2 (Phase 4)**: Depends on US1 behavior existing (copy-all + Follow up); mostly verification/sync around existing form
- **User Story 3 (Phase 5)**: Can overlap with late US1 toast work; logically depends on copy handler existing
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 only — core MVP
- **US2 (P1)**: After US1 — validates existing capture form + queue sync on bulk-updated rows
- **US3 (P2)**: After US1 handler exists — empty/skip messaging (can land partially inside US1 toasts; this phase hardens)

### Within Each User Story

- Helpers/API (Phase 2) before panel wiring (US1)
- Clipboard success before API call
- Local queue patch after successful API
- US2 sync after US1 status updates work
- US3 empty-path messaging after happy path works

### Parallel Opportunities

- T003 / T004 / T005 / T006 can start in parallel after T001–T002
- T007 then T008 (helper before route, or route calls helper inline)
- T018 and T019 can run in parallel during polish
- US2 and US3 can be split across people after US1 checkpoint if staffing allows

---

## Parallel Example: Foundational

```bash
# After Setup, launch in parallel:
Task: "Add pure helpers in lib/merchant-review-copy-contacts.ts"
Task: "Add Vitest in lib/merchant-review-copy-contacts.test.ts"
Task: "Register audit action merchant_review_bulk_follow_up in lib/audit-log.ts"
Task: "Add batch max constant / Zod max(500) for orderIds"
```

## Parallel Example: User Story 1

```bash
# Sequential within same file preferred for panel, but prep in parallel:
Task: "Bulk POST route app/api/admin/merchant-reviews/mark-follow-up/route.ts"  # already Phase 2
Task: "Panel button + clipboard-then-POST handler in merchant-review-panel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (helpers + bulk API + audit)
3. Complete Phase 3: US1 (button + clipboard + mark + toast + queue refresh)
4. **STOP and VALIDATE** per Independent Test / quickstart §2
5. Demo to merchant reviewers

### Incremental Delivery

1. Setup + Foundational → API ready
2. US1 → MVP copy + Follow up
3. US2 → confirm capture-form continuation
4. US3 → empty/missing-phone polish
5. Phase 6 → quickstart + test gate

### Parallel Team Strategy

1. Dev A: T003–T004 helpers/tests; Dev B: T005–T008 audit + API
2. After Phase 2: Dev A wires US1 panel; Dev B starts US3 messaging + tests
3. US2 verification once US1 marks status correctly

---

## Notes

- No Prisma migration for this feature
- Combined copy + mark requires `merchant_reviews.manage`; hide/disable for read-only
- Do not loop `PUT .../orders/[id]` from the client for bulk mark
- Commit after each task or logical group
- Suggested MVP scope: **Phase 1–3 (US1 only)**
- T022: Logic covered by unit tests + implementation; browser UAT on live Merchant Reviews still recommended via quickstart.md
