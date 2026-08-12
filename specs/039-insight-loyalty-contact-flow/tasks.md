# Tasks: Insight Filters, Merchant Dash & Loyalty Contact Flow

**Input**: Design documents from `/specs/039-insight-loyalty-contact-flow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Optional â€” plan expects Vitest for pure helpers; unit-test tasks included in Polish (not TDD-first). Manual validation via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label (US1â€“US6)
- Exact file paths in every task description

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `prisma/`, `components/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align worktree and feature docs before schema/RBAC changes

- [x] T001 Confirm feature dir and docs present under `specs/039-insight-loyalty-contact-flow/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
- [x] T002 [P] Note Constitution I migration rule in implement notes: use `npm run db:migrate:create` only; never `db push` on vault/cosmo-dev/cosmo-prod

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RBAC, audit modules, and shared types that ALL stories need

**âš ï¸ CRITICAL**: No user story work until this phase completes

- [x] T003 Extend `ContactMaster` and `ContactAllocationUpdate` in `prisma/schema.prisma` per `specs/039-insight-loyalty-contact-flow/data-model.md` (loyalty assignment fields; `remark`/`outcome` on updates; indexes; User relation for assignee)
- [x] T004 Create Prisma migration with `npm run db:migrate:create` for T003 schema; generate client with `npm run db:generate` (deploy to targets later per Constitution â€” do not `db push` shared DBs)
- [x] T005 [P] Add `contacts.merge` to `DEFAULT_PERMISSIONS` and admin role template in `lib/rbac.ts` (do not imply merge from `contacts.manage`)
- [x] T006 [P] Add audit modules `customer-insight` and `merchant-dashboard` plus actions (`contact_merged`, `insight_contacted`, `loyalty_responded`, `loyalty_assigned`, `merchant_loyalty_contacted`, etc.) in `lib/audit-log.ts`
- [x] T007 [P] Add shared types/constants for outreach status, outcomes, and assignment tiers in `lib/customer-insight/types.ts` (and export via `lib/customer-insight/index.ts` if needed)

**Checkpoint**: Migration created, RBAC + audit ready â€” user stories can start

---

## Phase 3: User Story 1 - Insight list filters (Priority: P1) ðŸŽ¯ MVP

**Goal**: Birthday range, min-only total, last-contacted range, brand Aâ€“Z + search, item Â± brand + search, loyalty registration date, no-purchase free range; remove push/loyalty quick filters; AND semantics + high-total sort

**Independent Test**: Apply each filter alone and common pairs on Customer Insight; push/loyalty controls gone; brand sorted + searchable; items work with/without brand

### Implementation for User Story 1

- [x] T008 [US1] Update filter Zod schema in `lib/validation/customer-insight.ts` â€” add birthday/lastContacted/loyaltyRegistered/noPurchase ranges + item; remove push/loyalty/`birthdayThisMonth` primary; keep `maxTotal` optional
- [x] T009 [US1] Implement birthday wrap, last-contacted range, no-purchase range, loyalty registration range, item purchase match, and min-only total behavior in `lib/customer-insight/filters.ts`
- [x] T010 [P] [US1] Extend brand/item options helper in `lib/customer-insight/filter-options.ts` (or new file) â€” brands Aâ€“Z + `q`; items all or brand-scoped + `q`
- [x] T011 [US1] Wire filter query parsing in `app/api/admin/customer-insight/filter/route.ts` to new Zod + `filters.ts`
- [x] T012 [US1] Extend `app/api/admin/customer-insight/filter-options/route.ts` for `type=brands|items`, optional `brand`, `q` per `contracts/insight-filters-merge.md`
- [x] T013 [US1] Update filter UI in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` â€” new controls, brand search, item filter, remove push/loyalty filters
- [x] T014 [US1] Ensure loyalty registration filter uses `loyaltyAssignedAt` once fields exist (empty results OK until US4 assigns)

**Checkpoint**: US1 filter MVP independently testable

---

## Phase 4: User Story 2 - Permission-gated merge contact (Priority: P1)

**Goal**: Merge Contact only for `contacts.merge`; audit under `customer-insight`

**Independent Test**: User without permission â€” no UI, POST 403; user with permission â€” merge succeeds + audit row

### Implementation for User Story 2

- [x] T015 [US2] Implement merge logic in `lib/customer-insight/merge.ts` (source â†’ target, same company, FK re-point / archive source)
- [x] T016 [US2] Add `POST` handler in `app/api/admin/customer-insight/merge/route.ts` gated by `requirePermission("contacts.merge")` + Zod body; write audit `customer-insight` / `contact_merged`
- [x] T017 [US2] Pass `canMergeContacts` from `app/(dashboard)/dashboard/customer-insight/page.tsx` via `hasPermission("contacts.merge")`
- [x] T018 [US2] Add Merge Contact UI (visible only when permitted) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US2 independently testable

---

## Phase 5: User Story 3 - Contact history with remarks (Priority: P1)

**Goal**: Append-only contact events with remark/outcome; last contacted derived; history visible

**Independent Test**: Two contacts with different remarks â†’ both rows remain; last contacted = newer

### Implementation for User Story 3

- [x] T019 [US3] Extend `markContactInsightContacted` and history helpers in `lib/customer-insight/contacted.ts` to persist `remark`/`outcome` on new `ContactAllocationUpdate` rows (never update old rows)
- [x] T020 [US3] Update `app/api/admin/customer-insight/[contactId]/contacted/route.ts` Zod body for `remark`/`outcome`; audit module `customer-insight`
- [x] T021 [US3] Add `GET` `app/api/admin/customer-insight/[contactId]/contact-history/route.ts` returning newest-first history per contract
- [x] T022 [US3] Persist remark on Contact Updates path in `app/api/admin/contacts/[id]/contact-updates/route.ts` when creating `ContactAllocationUpdate`
- [x] T023 [US3] Show contact history + remark in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [x] T024 [P] [US3] Show remark column in `components/organisms/contact-updates-panel.tsx` (and fetch path if needed)

**Checkpoint**: US3 independently testable

---

## Phase 6: User Story 4 - Loyalty outreach & master assignment (Priority: P1)

**Goal**: Merchant loyalty card â†’ contacted â†’ Responded/Not responded â†’ `contacts.master.manage` assigns Gold/Platinum â†’ insight badge who/when + audits

**Independent Test**: Happy path through queue to assigned badge; wrong tier band rejected; Not responded stays out of queue

### Implementation for User Story 4

- [x] T025 [US4] Implement eligibility, status transitions, and tier-band validation in `lib/customer-insight/loyalty-outreach.ts` (Gold â‰¥ 100k / Platinum â‰¥ 250k per research R2)
- [x] T026 [US4] Build loyalty outreach list loader in `lib/page-data/merchant-dashboard-loyalty.ts`
- [x] T027 [US4] Add `POST` `app/api/admin/merchant-dashboard/loyalty-outreach/route.ts` for `loyalty_informed` / `responded` / `not_responded` + remark; audit `merchant-dashboard`
- [x] T028 [P] [US4] Add `GET` `app/api/admin/customer-insight/loyalty-queue/route.ts` for `contacts.master.read` / `.manage`
- [x] T029 [US4] Add `POST` `app/api/admin/customer-insight/[contactId]/loyalty-assign/route.ts` for `contacts.master.manage`; set assignment fields; audit `loyalty_assigned`
- [x] T030 [US4] Include `loyaltyAssignment` on insight GET payload in `lib/customer-insight/load.ts` / `serialize.ts` and show who/when on detail card in `customer-insight-panel.tsx`
- [x] T031 [US4] Render loyalty-outreach card + actions in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx` (nearest-birthdays style)
- [x] T032 [US4] Add master assignment queue UI (insight panel section or adjacent page under customer-insight) wired to loyalty-queue + loyalty-assign APIs

**Checkpoint**: US4 independently testable (uses US3 history rows)

---

## Phase 7: User Story 5 - Contacts permissions wiring (Priority: P1)

**Goal**: No new roles; verify `contacts.merge` / `contacts.master.*` / `contacts.updates.*` gates; permission UI shows new key

**Independent Test**: Toggle only `contacts.merge` â†’ merge appears/disappears; master without merge can assign but not merge

### Implementation for User Story 5

- [x] T033 [US5] Verify Users/Roles permission UI lists `contacts.merge` from `ensureDefaultRbacSetup` (smoke via `lib/rbac.ts` + existing `user-management-panel.tsx` â€” fix labels if missing)
- [x] T034 [US5] Audit all new routes use correct `requirePermission` / `requireAnyPermission` keys per contracts (merge, master queue/assign, updates history) â€” fix any over-broad `contacts.manage` implications

**Checkpoint**: US5 independently verifiable

---

## Phase 8: User Story 6 - Merchant dash cards, call center, date range (Priority: P2)

**Goal**: Hide Daily/Top Lifetime by default (opt-in); merchant-scoped call center; from/to for merchant (+ main already ranged)

**Independent Test**: Default dash hides list cards; opt-in restores; call-center for merchant updates with date range

### Implementation for User Story 6

- [x] T035 [US6] Extend query Zod / loader in `lib/validation/merchant-dashboard.ts` and `lib/page-data/merchant-dashboard.ts` for `showCustomerLists` (default false) and `fromDate`/`toDate`
- [x] T036 [US6] Skip or empty daily/lifetime top customer payloads when `showCustomerLists` false in `lib/page-data/merchant-dashboard-sales.ts` / `merchant-dashboard.ts`
- [x] T037 [US6] Attach merchant-scoped call-center performance slice to page-data (reuse `app/api/admin/contacts/allocation/performance/route.ts` logic or shared lib) with from/to
- [x] T038 [US6] Wire `showCustomerLists`, date range, and `CallCenterPerformanceChart` in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- [x] T039 [US6] Confirm main dashboard Overview from/to still drives call-center in `components/organisms/dashboard-main-slot.tsx` (fix only if broken)

**Checkpoint**: US6 independently testable

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Tests, lint, quickstart, deploy discipline

- [x] T040 [P] Add Vitest coverage for filter helpers in `lib/customer-insight/filters.test.ts` (birthday wrap, min-only, ranges)
- [x] T041 [P] Add Vitest for loyalty outreach transitions / assignment bands in `lib/customer-insight/loyalty-outreach.test.ts`
- [x] T042 Run `npm test` for touched `lib/customer-insight` tests and `npm run lint` on changed files
- [x] T043 Walk `specs/039-insight-loyalty-contact-flow/quickstart.md` scenarios on cosmo-dev (or local) and fix gaps
- [ ] T044 Deploy migration with `npm run db:deploy:all` only after explicit user approval (Constitution I/IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup â€” **BLOCKS** all stories
- **US1â€“US6 (Phases 3â€“8)**: After Foundational; prefer P1 order; US4 benefits from US3 history; US1 registration filter fully useful after US4
- **Polish (Phase 9)**: After desired stories complete

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|--------|
| US1 Filters | Phase 2 | MVP; registration filter empty until US4 |
| US2 Merge | Phase 2 (T005) | Independent of US1 |
| US3 History | Phase 2 (remark columns) | Independent; feeds US4 |
| US4 Loyalty | Phase 2 + ideally US3 | Uses history + merchant panel |
| US5 Permissions | Phase 2 (T005) | Verification after US2/US4 routes exist |
| US6 Merchant dash | Phase 2; loyalty card UI may share panel with US4 | Opt-in cards + call-center can ship without US4 queue |

### Parallel Opportunities

- T005, T006, T007 after T003/T004 schema direction clear
- US1 vs US2 after Phase 2 (different files)
- T028 parallel with T027 within US4
- T040 / T041 in Polish parallel

### Parallel Example: After Foundational

```bash
# Developer A â€” MVP filters
Task: T008â€“T014 in lib/customer-insight/filters.ts + customer-insight-panel.tsx

# Developer B â€” Merge
Task: T015â€“T018 in lib/customer-insight/merge.ts + merge/route.ts

# Developer C â€” History remarks
Task: T019â€“T024 in contacted.ts + contact-history route
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (migration + RBAC + audit)
3. Phase 3 US1 filters
4. **STOP** â€” validate filters via Independent Test / quickstart Â§1
5. Then US2 â†’ US3 â†’ US4 â†’ US5 â†’ US6 â†’ Polish

### Incremental Delivery

1. Setup + Foundational â†’ ready
2. US1 â†’ demo filter MVP
3. US2 â†’ gated merge
4. US3 â†’ remark history
5. US4 â†’ loyalty flow end-to-end
6. US5 â†’ permission audit
7. US6 â†’ merchant dash cleanup + call center
8. Polish + migrate deploy (with approval)

### Suggested MVP scope

**US1 only** (T001â€“T014) after foundational T003â€“T007 â€” highest daily merchant value.

---

## Notes

- Thresholds: Gold **100_000** / Platinum **250_000** (research R2) â€” do not switch to 75k/200k in this feature
- No new roles â€” only `contacts.merge` + existing Contacts keys
- [P] = different files, no incomplete deps
- Commit after each task or logical group when user asks
- Skip vague work; every task has a path
