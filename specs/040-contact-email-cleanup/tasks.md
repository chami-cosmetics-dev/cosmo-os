# Tasks: Contact Email Cleanup & Insight Display

**Input**: Design documents from `/specs/040-contact-email-cleanup/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Optional — plan expects Vitest for pure helpers; unit-test tasks in Polish (not TDD-first). Manual validation via quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: User story label (US1–US3)
- Exact file paths in every task description

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`, `components/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature docs and target paths before coding

- [x] T001 Confirm feature docs present under `specs/040-contact-email-cleanup/` (plan.md, spec.md, research.md, data-model.md, contracts/contact-email-cleanup.md, quickstart.md)
- [x] T002 [P] Note no Prisma migration for this feature; reuse `ContactMaster` / `ContactEmail` / `AuditLog` per `specs/040-contact-email-cleanup/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared validation, match helpers, clear+promote logic, and audit action that ALL cleanup stories need

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T003 [P] Add Zod schemas for list query (`reason`, `page`, `pageSize`) and clear body (`reason`, `contactIds` 1–50 cuids) in `lib/validation/contact-email-cleanup.ts` per `specs/040-contact-email-cleanup/contracts/contact-email-cleanup.md`
- [x] T004 [P] Add audit action `contact_email_cleared` to `AUDIT_LOG_ACTIONS` and the contacts action group in `lib/audit-log.ts`
- [x] T005 Implement pure helpers in `lib/contacts/email-cleanup.ts`: `isInvalidContactEmail` (format-only), `matchesCosmeticsPattern` (`cosmetic` / `cosmatics` case-insensitive), scan helpers for primary **and** secondary aliases, and types for `SuspectEmailReviewItem` / clear reason
- [x] T006 Extend `lib/contacts/email-cleanup.ts` with company-scoped `listSuspectEmails` (paginated; invalid + cosmetics both scan primary/secondary) and `clearSuspectEmails` (re-validate reason, clear **only matching** addresses, delete matching `ContactEmail` rows, promote oldest valid secondary to primary when primary cleared per FR-012, `writeAuditLog` per success)

**Checkpoint**: Helpers + validation + audit ready — user stories can start

---

## Phase 3: User Story 1 - Remove invalid / non-working emails (Priority: P1) 🎯 MVP

**Goal**: Staff review list of invalid-format emails (primary or secondary) and clear only matching bad addresses without deleting contacts

**Independent Test**: Seed contact with malformed primary **or** secondary email; open Invalid tab; select → confirm remove → only bad address cleared; if valid secondary remains after bad primary cleared, it becomes primary; cancel leaves data unchanged

### Implementation for User Story 1

- [x] T007 [US1] Implement `GET` handler for reason=`invalid` in `app/api/admin/contacts/email-cleanup/route.ts` using `requireAnyPermission(["contacts.master.manage", "contacts.manage"])` and `listSuspectEmails` (primary + secondary format failures)
- [x] T008 [US1] Implement `POST` clear for reason=`invalid` in `app/api/admin/contacts/email-cleanup/clear/route.ts` (Zod body, authZ, `clearSuspectEmails`, return `cleared` / `skipped`)
- [x] T009 [US1] Create page shell `app/(dashboard)/dashboard/contacts/email-cleanup/page.tsx` gated like other Contacts tools
- [x] T010 [US1] Build `app/(dashboard)/dashboard/contacts/email-cleanup/email-cleanup-panel.tsx` Invalid tab: paginated table (name, phone, email/matchedEmail), multi-select, confirm dialog before clear, busyKey + `notify` toasts, empty state
- [x] T011 [US1] Wire nav link for Email cleanup in `components/organisms/app-sidebar.tsx` and breadcrumb/prefix in `components/organisms/topbar.tsx` (same pattern as contact-updates)

**Checkpoint**: Invalid-format list + clear works end-to-end — MVP demoable

---

## Phase 4: User Story 2 - List and remove cosmetics-pattern emails (Priority: P1)

**Goal**: Staff list contacts whose primary or secondary email contains cosmetics/cosmatics and clear those matches

**Independent Test**: Seed `cosmetics@…` / `…cosmatics…` contacts; Cosmetics tab lists them; clear removes matching addresses; non-matching emails stay; empty list shows empty state not error

### Implementation for User Story 2

- [x] T012 [US2] Ensure `listSuspectEmails` / `GET` in `app/api/admin/contacts/email-cleanup/route.ts` fully supports `reason=cosmetics_pattern` (primary + `ContactEmail` secondary contains match)
- [x] T013 [US2] Ensure `clearSuspectEmails` / `POST` in `app/api/admin/contacts/email-cleanup/clear/route.ts` clears only cosmetics matches for selected ids and skips when reason no longer applies
- [x] T014 [US2] Add Cosmetics pattern tab/filter to `app/(dashboard)/dashboard/contacts/email-cleanup/email-cleanup-panel.tsx` reusing select/confirm/clear UX from Invalid tab

**Checkpoint**: Both Invalid and Cosmetics cleanup paths work independently on the same page

---

## Phase 5: User Story 3 - Insight email presence display (Priority: P2)

**Goal**: Customer Insight always shows email field — Mail icon **and full address** when present, `-` when absent

**Independent Test**: Open insight for contact with email (icon + address) and without (row visible with `-`); after selective cleanup that leaves a valid email, refresh shows icon + remaining address; after all emails cleared, shows `-`

### Implementation for User Story 3

- [x] T015 [US3] Update contact header email row in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` to always render: non-empty → `Mail` icon + email; empty/null → `-` (do not omit the row)

**Checkpoint**: Insight display matches FR-006–008 regardless of cleanup tool

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tests, lint, and quickstart validation across stories

- [x] T016 [P] Add Vitest coverage in `lib/contacts/email-cleanup.test.ts` for: invalid detection on primary+secondary, cosmetics match, selective clear (keep valid email on same contact), and secondary promotion when primary cleared
- [x] T017 [P] Lint/typecheck changed files (`lib/contacts/email-cleanup.ts`, API routes, panels, `lib/audit-log.ts`)
- [ ] T018 Run manual scenarios in `specs/040-contact-email-cleanup/quickstart.md` (invalid clear incl. secondary, cosmetics selective clear, insight icon+address/`-`, authZ 403, cancel path)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational; shares page/API with US1 (prefer after T009–T010 so tab reuses panel)
- **US3 (Phase 5)**: After Foundational only — independent of US1/US2
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP cleanup path
- **US2 (P1)**: Foundational; UI ideally after US1 panel shell; API cosmetics branch can parallelize with US1 once T005–T006 exist
- **US3 (P2)**: Foundational only — no dependency on cleanup APIs

### Parallel Opportunities

- T003 + T004 in parallel during Foundational
- After T006: US3 (T015) can run parallel with US1 API/UI
- T016 + T017 in parallel during Polish

---

## Parallel Example: After Foundational

```bash
# Developer A — US1 MVP APIs + panel
Task: "GET invalid list in app/api/admin/contacts/email-cleanup/route.ts"
Task: "POST clear in app/api/admin/contacts/email-cleanup/clear/route.ts"
Task: "email-cleanup-panel Invalid tab"

# Developer B — US3 insight display (no API wait)
Task: "Always show email row in customer-insight-panel.tsx"
```

---

## Parallel Example: User Story 2

```bash
# After US1 panel exists:
Task: "Cosmetics list path in listSuspectEmails + GET route"
Task: "Cosmetics clear path in clearSuspectEmails + POST route"
Task: "Cosmetics tab in email-cleanup-panel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (helpers, Zod, audit)
3. Phase 3 US1 — Invalid list + clear + nav
4. **STOP and VALIDATE** per Independent Test / quickstart §2
5. Demo cleanup MVP

### Incremental Delivery

1. Setup + Foundational
2. US1 Invalid cleanup → demo
3. US2 Cosmetics tab → demo
4. US3 Insight `-`/icon (can ship earlier in parallel)
5. Polish: unit tests + quickstart pass

### Parallel Team Strategy

1. Team finishes Foundational together
2. Then:
   - A: US1 APIs + panel + nav
   - B: US3 insight display
   - A or C: US2 cosmetics tab after panel shell exists

---

## Notes

- Clarify session 2026-08-12: format-only invalid; insight icon+address; selective clear; invalid scans primary+secondary; promote valid secondary when primary cleared
- [P] = different files, no incomplete-task dependency
- No schema migration — do not run `db:migrate:create` for this feature
- Clear never deletes `ContactMaster`; clear only matching address(es) for the list reason
- Server must re-check `reason` before mutate (stale selection)
- Commit after each task or logical group
- Suggested MVP = US1 only (T001–T011)
