# Tasks: Loyalty Eligible Ops & Call Queue Enhancements

**Input**: Design documents from `/specs/055-loyalty-eligible-ops/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan/quickstart call for Vitest on counters, multi-brand OR, and queue-history filters â€” include focused unit-test tasks (not full TDD contract suite).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label (US1â€“US8)
- Exact file paths in every task description

## Path Conventions

Cosmo OS Next.js app root: `prisma/`, `lib/`, `app/`, `vercel.json`, `scripts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align feature branch / docs pointers; no new package

- [X] T001 Confirm `.specify/feature.json` points at `specs/055-loyalty-eligible-ops` and skim `specs/055-loyalty-eligible-ops/plan.md` + `contracts/` before coding
- [X] T002 [P] Add empty module stubs `lib/customer-insight/loyalty-eligible-summary.ts` and `lib/loyalty-eligible-weekly-email.ts` (exports TBD) so routes can import without circular thrash

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + stamp writes + shared counter helpers â€” MUST finish before story UIs/APIs

**âš ï¸ CRITICAL**: No user-story UI/API work until this phase completes

- [X] T003 Add `loyaltyOutreachUpdatedAt DateTime?` and `loyaltyEligibleAt DateTime?` on `ContactMaster` in `prisma/schema.prisma` per `specs/055-loyalty-eligible-ops/data-model.md`
- [X] T004 Create migration with `npm run db:migrate:create` (name e.g. `loyalty_outreach_timestamps`); do **not** `prisma db push` on shared DBs; deploy later via `db:deploy:*` when user asks
- [X] T005 [P] Stamp `loyaltyEligibleAt` (once) + `loyaltyOutreachUpdatedAt` in `lib/page-data/merchant-dashboard-loyalty.ts` when auto-marking `eligible`
- [X] T006 [P] Stamp `loyaltyOutreachUpdatedAt` (and `loyaltyEligibleAt` if first eligible) in `app/api/admin/merchant-dashboard/loyalty-outreach/route.ts` on status changes
- [X] T007 Stamp `loyaltyOutreachUpdatedAt` on loyalty tier assign / respond paths that set `loyaltyOutreachStatus` or `loyaltyAssignedAt` (search `loyaltyOutreachStatus` / `loyaltyAssignedAt` writers under `app/api/admin/` and `lib/customer-insight/`)
- [X] T008 Implement Colombo window helpers + pending/newly/updated counter pure functions in `lib/customer-insight/loyalty-eligible-summary.ts` per research R1
- [X] T009 [P] Add Vitest for counter helpers in `lib/customer-insight/loyalty-eligible-summary.test.ts` (pending vs newly vs updated windows)

**Checkpoint**: Migration exists; stamps on write paths; counters unit-tested â€” story work can start

---

## Phase 3: User Story 1 â€” Admin loyalty-eligible count + list (Priority: P1) ðŸŽ¯ MVP

**Goal**: Insight admins see company-scoped pending eligible **count** and paginated **list**

**Independent Test**: Seed known eligible vs ineligible â†’ admin list/total match hand count; non-admin denied

- [X] T010 [US1] Implement `listLoyaltyEligiblePending` (paginated) in `lib/customer-insight/loyalty-eligible-summary.ts` using same pending rules as `fetchMerchantLoyaltyOutreach`
- [X] T011 [US1] Add Zod query schemas for loyalty-eligible list/summary in `lib/validation/customer-insight.ts`
- [X] T012 [US1] Add `GET` `app/api/admin/customer-insight/loyalty-eligible/list/route.ts` per `contracts/loyalty-eligible-summary.md` (`hasInsightAdminView`)
- [X] T013 [US1] Show company pending count + list/drill-down on Customer Insight in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US1 usable without merchant-wise table or email

---

## Phase 4: User Story 2 â€” Merchant Dashboard loyalty-eligible count (Priority: P1)

**Goal**: Merchant Loyalty eligible card shows accurate **total count** (not capped list length)

**Independent Test**: Merchant with >`take` eligible â†’ header count > list length; other merchant sees own count

- [X] T014 [US2] Change `fetchMerchantLoyaltyOutreach` in `lib/page-data/merchant-dashboard-loyalty.ts` to return `{ items, totalCount }` (items still capped)
- [X] T015 [US2] Thread `loyaltyEligibleCount` through `lib/page-data/merchant-dashboard.ts` page-data DTO
- [X] T016 [US2] Display count on Loyalty eligible card header in `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx` (keep existing cards)

**Checkpoint**: US2 complete independently of admin Insight list

---

## Phase 5: User Story 3 â€” Admin merchant-wise pending + MTD updated (Priority: P1)

**Goal**: Admin merchant-wise table with distinct **pending** and **MTD updated** (plus newly eligible for email reuse)

**Independent Test**: Two merchants with known MTD status stamps â†’ table matches hand audit

- [X] T017 [US3] Implement `buildLoyaltyEligibleMerchantSummary` in `lib/customer-insight/loyalty-eligible-summary.ts` (company + per-merchant pending / mtdNewlyEligible / mtdUpdated; week fields OK to compute here for US4 reuse)
- [X] T018 [US3] Add `GET` `app/api/admin/customer-insight/loyalty-eligible/summary/route.ts` per `contracts/loyalty-eligible-summary.md`
- [X] T019 [US3] Render merchant-wise pending + MTD updated table on Customer Insight in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US1 list + US3 table both work for admins

---

## Phase 6: User Story 5 â€” Call queue filter by assigned date (Priority: P1)

**Goal**: Assign panel filters by call-queue `assignedAt` range (queue-history mode)

**Independent Test**: Known assign dates â†’ from/to returns only those assignment contacts

- [X] T020 [US5] Extend `customerInsightCallQueueCandidatesQuerySchema` + eligible-ids schema in `lib/validation/customer-insight.ts` with `assignedFrom` / `assignedTo`
- [X] T021 [US5] Implement queue-history candidate path by `ContactInsightCallQueue.assignedAt` in `lib/customer-insight/call-queue.ts` when assigned-date filters set (else keep allocated-candidate mode)
- [X] T022 [US5] Wire assigned-from/to controls on Assign merchant call queue in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` (validate to â‰¥ from)

**Checkpoint**: US5 works without not-contacted / multi-brand

---

## Phase 7: User Story 6 â€” Not-contacted in date range (Priority: P1)

**Goal**: Filter queue-history load to assignments still without post-assign contact

**Independent Test**: Assign 5 on day D, contact 2 â†’ not-contacted + range returns 3

- [X] T023 [US6] Add `notContacted` optional bool to call-queue Zod schemas in `lib/validation/customer-insight.ts`
- [X] T024 [US6] Apply not-contacted filter in `lib/customer-insight/call-queue.ts` (reuse first-contact-after-assign logic from `lib/customer-insight/call-queue-report.ts`)
- [X] T025 [P] [US6] Add `notContacted` to report query in `lib/validation/customer-insight.ts` + filter in `lib/customer-insight/call-queue-report.ts`
- [X] T026 [US6] Add not-contacted control on Assign panel (and report filters if exposed) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [X] T027 [P] [US6] Extend Vitest in `lib/customer-insight/call-queue.test.ts` for assigned-date + not-contacted queue-history cases

**Checkpoint**: US5+US6 follow-up load complete; hide rules unchanged

---

## Phase 8: User Story 8 â€” Sales report Assigned date + export (Priority: P1)

**Goal**: Detail rows show Assigned date; Excel export of report rows

**Independent Test**: On-screen assigned dates match export for â‰¥30-row sample

- [X] T028 [US8] Render sales-report **detail** table with Assigned date (`rows[].assignedAt`) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` (keep byMerchant summary)
- [X] T029 [US8] Implement Excel builder for report rows (new `lib/customer-insight/call-queue-report-export.ts` or extend report module) using `xlsx`
- [X] T030 [US8] Add `GET` `app/api/admin/customer-insight/call-queue/report/export/route.ts` per `contracts/call-queue-filters-extend.md`
- [X] T031 [US8] Add Export button with busy/loading UX on sales report in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US8 deliverable without weekly email

---

## Phase 9: User Story 7 â€” Multiple brand selection (Priority: P2)

**Goal**: Call-queue brand filter accepts multiple brands (OR), AND with other filters

**Independent Test**: Brands X+Y â†’ union; X+Y + Push Gold â†’ AND with push

- [X] T032 [US7] Change call-queue `brand` Zod to multi-value list (preprocess like Insight `brands`) in `lib/validation/customer-insight.ts`
- [X] T033 [US7] Union brand ID sets (OR) in `lib/customer-insight/call-queue.ts` (mirror `lib/customer-insight/filters.ts` pattern)
- [X] T034 [US7] Replace single brand control with multi-select on Assign panel in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [X] T035 [P] [US7] Vitest multi-brand OR (+ push AND) in `lib/customer-insight/call-queue.test.ts`

**Checkpoint**: US7 independent of email

---

## Phase 10: User Story 4 â€” Weekly admin loyalty email (Priority: P2)

**Goal**: Monday cron emails full merchant-wise week + MTD showdown to call-center recipient list (incl. careers@)

**Independent Test**: Preview shows correct table; To = `CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS` only

- [X] T036 [US4] Build HTML/text email from summary DTO in `lib/loyalty-eligible-weekly-email.ts` per spec Appendix A; import recipients from `lib/call-center-weekly-email.ts`
- [X] T037 [US4] Add Maileroo send wrapper (reuse multi-to pattern) in `lib/maileroo.ts` or call existing helper from `lib/loyalty-eligible-weekly-email.ts`
- [X] T038 [US4] Add `GET` `app/api/cron/loyalty-eligible-weekly-email/route.ts` with `CRON_SECRET` + `preview` per `contracts/loyalty-eligible-weekly-email.md`
- [X] T039 [US4] Register cron `"30 3 * * 1"` for `/api/cron/loyalty-eligible-weekly-email` in `vercel.json`
- [X] T040 [P] [US4] Add optional `scripts/send-loyalty-eligible-weekly-email.ts` dry-run/send mirror of call-center script
- [X] T041 [P] [US4] Vitest for week/MTD window + HTML contains merchant rows in `lib/loyalty-eligible-weekly-email.test.ts`

**Checkpoint**: US4 complete; merchants never on To list

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Validation across stories

- [X] T042 [P] Run `npx vitest run lib/customer-insight/loyalty-eligible-summary.test.ts lib/customer-insight/call-queue.test.ts lib/loyalty-eligible-weekly-email.test.ts` and fix failures
- [X] T043 Walk `specs/055-loyalty-eligible-ops/quickstart.md` manual checks; fix gaps
- [X] T044 [P] Lint/typecheck touched files (`customer-insight-panel.tsx`, merchant dashboard, new routes)
- [X] T045 Remind: deploy migration with `npm run db:deploy:all` only after explicit user approval (Constitution I/IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** â†’ no deps
- **Phase 2 Foundational** â†’ blocks all stories (migration + stamps + counter helpers)
- **US1, US2** â†’ after Phase 2; parallel OK
- **US3** â†’ after T008/T009; benefits from US1 UI mount point but API-testable alone
- **US5** â†’ after Phase 2; independent of loyalty summary
- **US6** â†’ after US5 schemas/path (T020â€“T021)
- **US8** â†’ independent of US5â€“US7 (report already exists); parallel with US1â€“US3 OK
- **US7** â†’ after call-queue filter plumbing; can parallel US8
- **US4** â†’ needs T017 summary builder (week/MTD fields); after US3 core preferred
- **Polish** â†’ after desired stories

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|--------|
| US1 | Phase 2 | MVP admin list |
| US2 | Phase 2 stamps + pending rules | Merchant count |
| US3 | T008â€“T009 | Merchant-wise table |
| US5 | Phase 2 | Assigned-date queue mode |
| US6 | US5 | Not-contacted |
| US8 | none beyond Phase 2 | Report UI + export |
| US7 | call-queue module | Multi-brand |
| US4 | US3 summary builder | Weekly email |

### Parallel Opportunities

- T005 âˆ¥ T006 after T003â€“T004
- US1 âˆ¥ US2 âˆ¥ US8 after Phase 2
- T025 âˆ¥ T027 within US6
- T035 âˆ¥ T034 after T033
- T040 âˆ¥ T041 after T036

---

## Parallel Example: After Foundational

```bash
# Developer A â€” MVP admin list
Task: T010â€“T013 [US1]

# Developer B â€” merchant count
Task: T014â€“T016 [US2]

# Developer C â€” sales report export
Task: T028â€“T031 [US8]
```

---

## Parallel Example: Call-queue filters

```bash
# After T021 queue-history path exists:
Task: T023â€“T024 [US6] notContacted on candidates
Task: T025 [US6] notContacted on report
Task: T032â€“T033 [US7] multi-brand (can start once Zod/call-queue free)
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1â€“2 (migration + stamps + counters)
2. Phase 3 US1 (admin count + list)
3. **STOP** â€” validate quickstart admin list section
4. Then US2 count (high visibility) â†’ US3 table â†’ call-queue US5/US6/US8 â†’ US7 â†’ US4 email

### Incremental Delivery

1. Setup + Foundational
2. US1 MVP
3. US2 merchant count
4. US3 merchant-wise
5. US5 â†’ US6 assign follow-up filters
6. US8 report export
7. US7 multi-brand
8. US4 weekly email + cron
9. Polish / quickstart

### Suggested MVP scope

**US1 + Phase 2** (admin eligible list/count). Strong second slice: **US2** (merchant count badge).

---

## Notes

- [P] = different files / no incomplete-task dependency
- Do not weaken Black List / Wrong Number / hide windows (FR-013)
- Recipients: only `CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS` â€” no merchant To
- Format validation: all tasks use `- [ ]`, Task ID, optional `[P]`, story label on US tasks, file paths
