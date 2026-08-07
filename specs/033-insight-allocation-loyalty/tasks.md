# Tasks: Customer Insight Allocation & Loyalty

**Input**: Design documents from `/specs/033-insight-allocation-loyalty/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan mandates Vitest for loyalty thresholds (75k/200k), Push bands, ownership/visibility, birthday-month, and brand helpers â€” include those unit tests. Full UI E2E is manual via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story (US1â€“US7)
- Include exact file paths in descriptions

## Path Conventions

- Lib: `lib/customer-insight/`, `lib/validation/`
- API: `app/api/admin/customer-insight/`
- UI: `app/(dashboard)/dashboard/customer-insight/`
- Allocation (reuse): `app/api/admin/contacts/allocation/`, contact-allocation UI

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align types/exports for the feature; no new packages or schema migrations

- [X] T001 Confirm feature pointer in `.specify/feature.json` targets `specs/033-insight-allocation-loyalty` and review contracts at `specs/033-insight-allocation-loyalty/contracts/insight-allocation-loyalty.md`
- [X] T002 [P] Extend insight DTOs for visibility / progress / lastContacted in `lib/customer-insight/types.ts`
- [X] T003 [P] Re-export new helpers from `lib/customer-insight/index.ts` (stubs OK until Phase 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers and thresholds every story needs â€” MUST complete before user stories

**âš ï¸ CRITICAL**: No user story work until this phase is complete

- [X] T004 Update Gold/Platinum thresholds to 75_000 / 200_000 inclusive platinum in `lib/customer-insight/loyalty-tier.ts`
- [X] T005 Update loyalty unit tests for boundaries (74999/75000/199999/200000) in `lib/customer-insight/loyalty-tier.test.ts`
- [X] T006 [P] Implement merchant label ownership matching in `lib/customer-insight/ownership.ts`
- [X] T007 [P] Implement owner vs limited DTO stripping in `lib/customer-insight/visibility.ts`
- [X] T008 [P] Implement purchasing progress bar model (`currentTotal`, milestones, `amountToNext`) in `lib/customer-insight/progress-bar.ts`
- [X] T009 [P] Add Zod schemas for profile PATCH and filter query in `lib/validation/customer-insight.ts` (or `lib/validation.ts` if that is the project pattern)
- [X] T010 [P] Add unit tests for ownership + visibility stripping in `lib/customer-insight/ownership.test.ts` and `lib/customer-insight/visibility.test.ts`
- [X] T011 [P] Add unit tests for progress-bar amounts in `lib/customer-insight/progress-bar.test.ts`

**Checkpoint**: Thresholds, ownership, visibility, progress helpers, and Zod ready â€” story work can begin

---

## Phase 3: User Story 1 â€” Exact phone search with visibility rules (Priority: P1) ðŸŽ¯ MVP

**Goal**: Any merchant can exact-phone search; non-owners get limited DTO (total + invoice headers + allocated merchant); owners/admins get full insight payload.

**Independent Test**: Merchant B searches Aâ€™s customer â†’ limited fields only; Merchant A or admin â†’ full page including line items / top items / series.

### Implementation for User Story 1

- [X] T012 [US1] Wire visibility into insight loader (`visibility`, strip limited fields, keep invoice headers) in `lib/customer-insight/load.ts`
- [X] T013 [US1] Update GET handler to pass viewer context and return visibility-aware JSON in `app/api/admin/customer-insight/[contactId]/route.ts`
- [X] T014 [US1] Omit invoice `lineItems` for limited viewers in `lib/customer-insight/invoices.ts` and/or `lib/customer-insight/serialize.ts`
- [X] T015 [US1] Gate owner-only UI sections (profile, charts, progress, contacted) on `visibility === "owner"` in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [X] T016 [US1] Ensure limited view still shows lifetime total, invoice headers, and allocated merchant label in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US1 independently testable via phone search as two merchants

---

## Phase 4: User Story 2 â€” Customer details card with edit (Priority: P1)

**Goal**: Owners/admins see profile card (name, email, phone, allocated merchant, DOB) and can PATCH; non-owners never see card/edit.

**Independent Test**: Owner edits DOB/email/name/phone â†’ persists; non-owner has no edit; PATCH returns 403.

### Implementation for User Story 2

- [X] T017 [US2] Implement owner-only profile update helper (ContactMaster + phone/email secondaries as needed) in `lib/customer-insight/profile.ts`
- [X] T018 [US2] Add PATCH handler with Zod + ownership check in `app/api/admin/customer-insight/[contactId]/route.ts`
- [X] T019 [US2] Add profile card + edit form for owner visibility in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US2 profile edit works for owners only

---

## Phase 5: User Story 3 â€” Loyalty milestones & purchasing progress bar (Priority: P1)

**Goal**: Owner insight shows progress bar with Gold/Platinum milestones and current lifetime total (currency), using updated thresholds; limited viewers never see the bar.

**Independent Test**: Totals &lt;75k / mid-band / â‰¥200k show correct tier + bar; limited view has no bar.

### Implementation for User Story 3

- [X] T020 [US3] Attach `progressBar` to owner payloads only in `lib/customer-insight/load.ts`
- [X] T021 [US3] Render purchasing performance bar (milestones + current total amount, not % primary) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [X] T022 [US3] Update any UI copy/labels still referencing 100k/250k thresholds in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` and related insight components

**Checkpoint**: US3 progress bar + new tiers visible for owners

---

## Phase 6: User Story 6 â€” Auto- and manual allocation (Priority: P1)

**Goal**: Empty `assignedMerchant` auto-fills from recent-purchase merchant display label; permissioned users can manual-assign and bulk-transfer via existing allocation APIs/UI.

**Independent Test**: Unallocated purchase â†’ assigned; permissioned bulk Aâ†’B; already-allocated not overwritten by auto; unauthorized â†’ 403.

### Implementation for User Story 6

- [X] T023 [US6] Implement `getMerchantDisplayName` + auto-allocate-when-empty helper in `lib/customer-insight/auto-allocate.ts`
- [X] T024 [US6] Hook auto-allocate into order-assign / contact-sync path(s) where `recentMerchant` is set (locate call site under `lib/` or `app/api/` order/contact flows)
- [X] T025 [US6] Verify/extend bulk mode of `POST /api/admin/contacts/allocation` for merchant-label A→B transfer in `app/api/admin/contacts/allocation/route.ts`
- [X] T026 [US6] Ensure allocation UI path for individual + bulk transfer is usable with `contacts.allocation.manage` in contact-allocation panel (e.g. `app/(dashboard)/dashboard/.../contact-allocation-panel.tsx` or equivalent)
- [X] T027 [P] [US6] Add unit tests for auto-allocate no-overwrite behavior in `lib/customer-insight/auto-allocate.test.ts`

**Checkpoint**: Allocation unlocks ownership for US1â€“US3; bulk/manual paths work

---

## Phase 7: User Story 5 â€” Brand on purchase lines (Priority: P2)

**Goal**: Reliable brand from Shopify/ERP lines (`ProductItem.vendor.name` + Adapt fields) so brand filter does not invent brands.

**Independent Test**: Brand X buyers match filter; lines without brand excluded from brand match.

### Implementation for User Story 5

- [X] T028 [P] [US5] Implement brand resolution helper (Vendor.name + Adapt JSON fields) in `lib/customer-insight/brand.ts`
- [X] T029 [P] [US5] Add unit tests for brand resolution / unknown exclusion in `lib/customer-insight/brand.test.ts`
- [X] T030 [US5] Ensure Cosmo invoice/top-item loads can expose brand when needed for filters in `lib/customer-insight/invoices.ts` and/or `lib/customer-insight/top-items.ts`

**Checkpoint**: Brand helper ready for US4 filter

---

## Phase 8: User Story 4 â€” Filters for allocated customers (Priority: P2)

**Goal**: Filter allocated set by total range, loyalty, birthday this month, brand, Push Gold/Platinum; sort highest total first; paginate â‰¤50.

**Independent Test**: Push to Gold only own allocated in 75kâ€“&lt;200k band, highest first; birthday/brand narrow correctly; other merchantâ€™s contacts never appear.

### Implementation for User Story 4

- [X] T031 [US4] Implement allocated filter query (scope, push bands, birthday month, brand, sort, pagination) in `lib/customer-insight/filters.ts`
- [X] T032 [P] [US4] Add unit tests for Push Gold/Platinum bands and birthday-month match in `lib/customer-insight/filters.test.ts`
- [X] T033 [US4] Add `GET /api/admin/customer-insight/filter` route with Zod query + auth in `app/api/admin/customer-insight/filter/route.ts`
- [X] T034 [US4] Add filter UI (push Gold/Platinum, loyalty, total range, birthday, brand) + results list on insight page in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US4 filters work on allocated set only

---

## Phase 9: User Story 7 â€” Mark contacted & dashboard update (Priority: P2)

**Goal**: Owners/admins can remake Mark Contacted; last contacted shown; audit + `ContactAllocationUpdate` category Contacted feeds dashboard.

**Independent Test**: Mark twice â†’ last contacted updates; dashboard Contacted series updates; non-owner no button; POST 403.

### Implementation for User Story 7

- [X] T035 [US7] Implement mark-contacted service (audit `contact_follow_up_contacted` + ContactAllocationUpdate `Contacted` + lastContactedAt) in `lib/customer-insight/contacted.ts`
- [X] T036 [US7] Load `lastContactedAt` for owner payloads in `lib/customer-insight/load.ts`
- [X] T037 [US7] Add `POST /api/admin/customer-insight/[contactId]/contacted` with ownership check in `app/api/admin/customer-insight/[contactId]/contacted/route.ts`
- [X] T038 [US7] Add Contacted button + last-contacted display for owners in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [X] T039 [US7] Confirm call-center / allocation performance chart includes Contacted category from ContactAllocationUpdate (existing dashboard consumer under `app/api/admin/contacts/allocation/performance` or related UI)

**Checkpoint**: US7 contacted loop closed with dashboard

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Consistency, regression, quickstart validation

- [X] T040 [P] Audit limited DTO never leaks owner fields across serialize/load paths in `lib/customer-insight/serialize.ts` and `lib/customer-insight/visibility.ts`
- [X] T041 [P] Update nav/copy if needed for filters or allocation entry points under Contacts in dashboard nav config
- [X] T042 Run `npx vitest run lib/customer-insight` and fix failures
- [X] T043 Walk `specs/033-insight-allocation-loyalty/quickstart.md` scenarios (visibility, edit, bar, filters, allocation, contacted)
- [X] T044 Mark completed tasks in `specs/033-insight-allocation-loyalty/tasks.md` as work finishes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Immediate
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all stories
- **US1 (Phase 3)**: After Foundational â€” MVP
- **US2 (Phase 4)**: After Foundational; builds on US1 GET visibility
- **US3 (Phase 5)**: After Foundational; builds on US1 owner UI
- **US6 (Phase 6)**: After Foundational; unlocks realistic ownership for demos (can parallel with US2/US3)
- **US5 (Phase 7)**: After Foundational; prerequisite for brand filter in US4
- **US4 (Phase 8)**: After US5 brand helper (+ ideally US6 for allocated data)
- **US7 (Phase 9)**: After Foundational (+ US1 owner UI)
- **Polish (Phase 10)**: After desired stories

### User Story Dependencies

- **US1**: Foundational only
- **US2**: US1 GET/load preferred
- **US3**: US1 owner shell preferred
- **US6**: Independent of US1â€“US3; recommended early so ownership tests are realistic
- **US5**: Independent; before US4
- **US4**: Needs US5; benefits from US6
- **US7**: Needs US1 owner view; independent of filters

### Parallel Opportunities

- T002â€“T003 in Setup
- T006â€“T011 in Foundational (after T004/T005)
- US2 + US3 + US6 after US1 (different concerns; watch `customer-insight-panel.tsx` conflicts)
- T028â€“T029 in US5
- T032 parallel with T031 after helper sketched

---

## Parallel Example: Foundational

```text
Task: "Implement ownership matching in lib/customer-insight/ownership.ts"
Task: "Implement visibility stripping in lib/customer-insight/visibility.ts"
Task: "Implement progress-bar model in lib/customer-insight/progress-bar.ts"
Task: "Add Zod schemas in lib/validation/customer-insight.ts"
```

## Parallel Example: After US1

```text
Task: "US2 profile PATCH in app/api/admin/customer-insight/[contactId]/route.ts"
Task: "US6 auto-allocate in lib/customer-insight/auto-allocate.ts"
Task: "US5 brand helper in lib/customer-insight/brand.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 visibility
4. **STOP** â€” validate limited vs owner phone search
5. Demo privacy rules

### Incremental Delivery

1. Setup + Foundational
2. US1 â†’ visibility MVP
3. US6 â†’ allocation realism
4. US2 + US3 â†’ profile + progress bar
5. US5 + US4 â†’ brand + filters
6. US7 â†’ contacted + dashboard
7. Polish + quickstart

### Suggested MVP Scope

**US1 only** (exact phone + server-enforced limited vs owner DTO). Next highest value: **US6** (allocation) then **US2/US3**.

---

## Notes

- No Prisma migration expected for v1
- Reuse `contacts.allocation.manage` for manual/bulk; `contacts.insight.read` + ownership for insight mutates
- Do not invent brands; unknown lines fail brand filter match
- Auto-allocate never overwrites non-empty `assignedMerchant`
- All tasks use checklist format with IDs and file paths
