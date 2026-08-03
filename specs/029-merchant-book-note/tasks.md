# Tasks: Merchant Daily Book Note

**Input**: Design documents from `/specs/029-merchant-book-note/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for payment-column mapper, Colombo lock, and Zod schemas are included (plan Testing + constitution gate). Not full TDD / contract-test suite.

**Organization**: Phases by user story so each increment is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1 / US2 / US3 / US4 maps to spec user stories
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create `lib/book-notes/` layout and shared types used by all stories.

- [x] T001 Create `lib/book-notes/` package layout with barrel `lib/book-notes/index.ts` exporting public helpers only
- [x] T002 [P] Add shared book-note DTO / row types in `lib/book-notes/types.ts` aligned with `contracts/book-notes.md` and `data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RBAC, validation, and pure helpers that MUST exist before any user story APIs/UI.

**âš ï¸ CRITICAL**: No user story work begins until this phase is complete

- [x] T003 Add Prisma models `BookNoteDay` and `BookNoteRow` plus `Company` / `CompanyLocation` / `User` / optional `Order` relations in `prisma/schema.prisma` per `data-model.md` (`@@unique([companyLocationId, postingDate])`, cascade delete rows)
- [x] T004 Create migration with `npm run db:migrate:create` for book notes; document deploy via `npm run db:deploy:<target>` / `db:deploy:all` (prod only with explicit user confirmation) â€” never `db push` on shared DBs
- [x] T005 [P] Add `book_notes.manage` and `book_notes.read` to `DEFAULT_PERMISSIONS` and wire default roles in `lib/rbac.ts` per `research.md` R2 (manage â†’ shop/manager-facing roles; read â†’ admin/super_admin/finance/manager)
- [x] T006 [P] Add book-note LIMITS + Zod schemas (page-data query, suggestions query, PUT body, finance GET query) in `lib/validation.ts` (or `lib/validation/book-notes.ts` re-exported from `lib/validation.ts`)
- [x] T007 [P] Implement Colombo same-day write gate in `lib/book-notes/lock.ts` using `formatAppIsoDate` / `APP_TIME_ZONE` from `lib/format-datetime.ts` (`isBookNoteWritable`, `DAY_LOCKED`)
- [x] T008 [P] Implement payment-column mapper in `lib/book-notes/payment-columns.ts` (`rawPayload.payments[]` + gateway/primary + `totalPrice` â†’ cash/card/koko/bankTransfer per research R4)
- [x] T009 [P] Implement day/row serializer in `lib/book-notes/serialize.ts` (intern fields: `company`, `posting_date`, `idx_no`, `sales_invoice`, `cash`, `card`, `koko`, `bank_transfer`, `row_total`, `is_multi_method`, `locked`)
- [x] T010 Implement invoice identity helper for suggestions in `lib/book-notes/invoice-identity.ts` (prefer non-pending `erpnextInvoiceId`, else `name`, else `orderNumber`, else `shopifyOrderId`)

**Checkpoint**: Foundation ready â€” schema, permissions, validation, and pure helpers exist; stories can start

---

## Phase 3: User Story 1 - Merchant records today's book note (Priority: P1) ðŸŽ¯ MVP

**Goal**: Merchants open Book Notes, pick outlet + todayâ€™s date, enter/split-pay rows (with POS typeahead autofill), save, and reload the day.

**Independent Test**: User with `book_notes.manage` saves a multi-method row for today; reload restores rows; suggestion select fills invoice + editable amounts.

### Implementation for User Story 1

- [x] T011 [US1] Implement order suggestion search + autofill in `lib/book-notes/order-suggestions.ts` (filter by `companyLocationId`, match SI/name/orderNumber, prefer postingDate day, map amounts via `payment-columns.ts`, limit ~20)
- [x] T012 [US1] Implement GET `app/api/admin/book-notes/page-data/route.ts` (`book_notes.manage`): company locations + `today` + optional day load per contract
- [x] T013 [US1] Implement GET `app/api/admin/book-notes/order-suggestions/route.ts` (`book_notes.manage`) calling `order-suggestions.ts`
- [x] T014 [US1] Implement PUT upsert in `app/api/admin/book-notes/route.ts` (`book_notes.manage`): validate location/company, enforce writable postingDate via `lock.ts`, transaction delete-all + recreate `BookNoteRow`, return serialized day
- [x] T015 [US1] Create server page `app/(dashboard)/dashboard/book-notes/page.tsx` gated with `book_notes.manage` (redirect/deny if missing)
- [x] T016 [US1] Build client ledger UI `app/(dashboard)/dashboard/book-notes/book-notes-panel.tsx`: outlet dropdown (all company locations), date, add/remove rows, Cash/Card/KOKO/Bank, row/column/grand totals, multi-method highlight, save + load via page-data/PUT
- [x] T017 [US1] Wire invoice typeahead in `book-notes-panel.tsx` (debounce â†’ order-suggestions; on select fill `salesInvoice` + amounts; amounts remain editable; manual entry allowed)
- [x] T018 [US1] Add sidebar NavItem for Book Notes gated by `book_notes.manage` in `components/organisms/app-sidebar.tsx` (Order Management group near POS Orders is fine)

**Checkpoint**: Merchant can capture and persist todayâ€™s book note with suggestions â€” MVP demoable

---

## Phase 4: User Story 2 - Intern / finance retrieves book note data (Priority: P1)

**Goal**: Finance/admin with `book_notes.read` can GET any locationâ€™s saved day (or short date range) in intern-compatible shape; merchants cannot use company-wide retrieve.

**Independent Test**: After US1 save, finance session GET returns matching rows; manage-only user gets 403 on finance GET; empty day returns `{ days: [] }`.

### Implementation for User Story 2

- [x] T019 [US2] Implement GET handler on `app/api/admin/book-notes/route.ts` (`book_notes.read`): require `companyLocationId` + `postingDate` or `from`/`to` (max 31 days); return `{ days: BookNoteDayDto[] }` per contract
- [x] T020 [US2] Ensure PUT remains `book_notes.manage`-only and GET remains `book_notes.read`-only in `app/api/admin/book-notes/route.ts` (no finance write; no merchant read-all)
- [x] T021 [P] [US2] Add a short retrieve example (curl or fetch) to `specs/029-merchant-book-note/quickstart.md` Â§3 matching contract query params

**Checkpoint**: Intern/finance can pull saved days without merchant export

---

## Phase 5: User Story 3 - Merchant corrects and re-saves; past day locked (Priority: P2)

**Goal**: Same Colombo day: re-save replaces rows. Past postingDate: merchant save rejected; UI read-only; finance GET still works.

**Independent Test**: Edit+save today succeeds; PUT for yesterday returns `DAY_LOCKED`; panel disables save when `locked`; finance still retrieves yesterday.

### Implementation for User Story 3

- [x] T022 [US3] Harden PUT in `app/api/admin/book-notes/route.ts` to return clear `DAY_LOCKED` (status 409 or 403) when `postingDate < today` Asia/Colombo; never mutate rows on lock
- [x] T023 [US3] Update `book-notes-panel.tsx` so past/locked days load read-only (inputs disabled, Save hidden/disabled, clear locked-day message)
- [x] T024 [US3] Disallow selecting future `postingDate` for merchant writes in panel + PUT validation (`lib/validation.ts` / route) â€” only today writable per research R6
- [x] T025 [P] [US3] Add Vitest coverage for lock helper in `lib/book-notes/lock.test.ts` (today writable, yesterday locked)

**Checkpoint**: Same-day correct + past-day lock verified

---

## Phase 6: User Story 4 - Simple focused merchant UI polish (Priority: P2)

**Goal**: Entry-focused UX without ERP verify chrome; optional JSON export matching save shape; multi-method rows obvious.

**Independent Test**: Merchant completes 5-row sample using only on-page labels; Export downloads portable JSON; no verify badges required.

### Implementation for User Story 4

- [x] T026 [US4] Add Export JSON control in `book-notes-panel.tsx` (`company` / `posting_date` / `rows` with cash/card/koko/bank_transfer) without replacing Save as source of truth
- [x] T027 [US4] Polish ledger UX in `book-notes-panel.tsx` (multi-method row styling, money alignment, status line for save errors including `DAY_LOCKED`, empty-row stripping feedback) â€” no ERP connection or verify badges
- [x] T028 [P] [US4] Confirm page title/copy stays entry-focused in `app/(dashboard)/dashboard/book-notes/page.tsx` (Daily Book Note / outlet ledger wording)

**Checkpoint**: UI matches Story 4 acceptance; export optional only

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Unit tests, gates, quickstart validation.

- [x] T029 [P] Add Vitest for payment-column mapper in `lib/book-notes/payment-columns.test.ts` (multi-mop rawPayload, primary-only total â†’ one column, unmapped â†’ Cash fallback)
- [x] T030 [P] Add Vitest for invoice identity in `lib/book-notes/invoice-identity.test.ts` (pending SI skipped, name/orderNumber fallbacks)
- [x] T031 [P] Add Vitest for book-note Zod schemas in `lib/validation` tests (or `lib/validation/book-notes.test.ts`) covering PUT reject zero-amount empty invoice rows and range max days
- [x] T032 Run `npm test` and lint changed files; fix failures
- [x] T033 Walk `specs/029-merchant-book-note/quickstart.md` scenarios (merchant save, lock, finance GET, suggestions) and note any gaps in quickstart

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies â€” start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational â€” MVP
- **US2 (Phase 4)**: Depends on Foundational + ideally US1 save path (needs data to retrieve); can stub seed day for API-only test
- **US3 (Phase 5)**: Depends on US1 PUT/UI (extends lock behavior)
- **US4 (Phase 6)**: Depends on US1 panel (polish/export)
- **Polish (Phase 7)**: Depends on stories being implemented

### User Story Dependencies

- **US1 (P1)**: After Foundational â€” no dependency on other stories â€” **MVP**
- **US2 (P1)**: After Foundational; uses same models/serialize; independently testable with seeded day
- **US3 (P2)**: Builds on US1 write path + lock helper from Foundational
- **US4 (P2)**: Builds on US1 panel only

### Parallel Opportunities

- T002 with nothing else in Setup after T001
- T005, T006, T007, T008, T009 in parallel after T003â€“T004 started (T005/T006 independent of migration apply)
- T021, T025, T028, T029, T030, T031 marked [P] when their target files are free
- After Foundational: US2 GET can proceed in parallel with US1 UI if PUT exists or day is seeded

### Parallel Example: Foundational helpers

```bash
# After schema task started / types exist:
Task: "Implement lock.ts"
Task: "Implement payment-columns.ts"
Task: "Implement serialize.ts"
Task: "Add Zod schemas in lib/validation.ts"
Task: "Add RBAC permissions in lib/rbac.ts"
```

### Parallel Example: User Story 1 APIs

```bash
# After order-suggestions helper:
Task: "GET page-data/route.ts"
Task: "GET order-suggestions/route.ts"
# Then PUT route.ts, then page + panel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1â€“2 (Setup + Foundational)
2. Complete Phase 3 (US1) â€” merchant page + save + suggestions
3. **STOP and VALIDATE** per US1 independent test / quickstart Â§1
4. Demo if ready

### Incremental Delivery

1. Setup + Foundational â†’ foundation ready  
2. US1 â†’ merchant capture MVP  
3. US2 â†’ finance/intern retrieve  
4. US3 â†’ same-day edit + past-day lock  
5. US4 â†’ export + UX polish  
6. Phase 7 tests + quickstart  

### Suggested MVP scope

**US1 only** (T001â€“T018): merchants can enter and persist todayâ€™s dual-payment book note with POS suggestions. US2 is the next must-have for the intern endpoint.

---

## Notes

- [P] = different files, no unfinished blockers
- Do not port ERP verify / bank recon desk into Cosmo
- Scope shop context to `CompanyLocation`, not review `Outlet`
- Migrations: `db:migrate:create` + deploy-all; never `db push` on shared DBs
- Commit after each task or logical group when user requests commits
