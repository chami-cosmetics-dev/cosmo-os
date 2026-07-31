# Tasks: Adapt Sales Invoice Contact & Purchase History Import

**Input**: Design documents from `/specs/028-adapt-contact-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for import helpers are included (plan Testing + constitution gate). Not full TDD.

**Organization**: Phases by user story so each increment is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1 / US2 / US3 maps to spec user stories
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create `lib/adapt-import/` layout and shared types used by all stories.

- [x] T001 Create `lib/adapt-import/` package layout with barrel `lib/adapt-import/index.ts` exporting public helpers only
- [x] T002 [P] Add Adapt import shared types in `lib/adapt-import/types.ts` (row shape, classify result, report counters, location map entry) aligned with `contracts/adapt-contact-import.md`
- [x] T003 [P] Add Adapt CSV column constants / header aliases in `lib/adapt-import/columns.ts` for `invoice_data_headers.csv` (86-col primary) including Adapt spellings (`merchent_id`, `payment_methode`, `cancel_coment`, `shiping_service_name`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + pure import helpers that MUST exist before merchant UI or CLI stories.

**⚠️ CRITICAL**: No user story work begins until this phase is complete

- [x] T004 Add Prisma model `AdaptPurchaseHistory` and `ContactMaster` / `Company` / `CompanyLocation` relations in `prisma/schema.prisma` per `data-model.md` (`@@unique([companyId, adaptInvoiceKey])`, contact + invoiceDate indexes)
- [x] T005 Create migration with `npm run db:migrate:create` for `AdaptPurchaseHistory`; document deploy via `npm run db:deploy:<target>` / `db:deploy:all` (prod only with explicit user confirmation)
- [x] T006 [P] Implement Adapt invoice identity key builder in `lib/adapt-import/invoice-identity.ts` (`mid:{sales_invoice_master_id}` else composite invoice no + location + date)
- [x] T007 [P] Implement Adapt date/amount parsers and row skip classification in `lib/adapt-import/row-classify.ts` (`active_flag`, `deleted_on`, cancel fields, no phone/email, bad date/amount)
- [x] T008 [P] Implement fill-blanks ContactMaster patch builder in `lib/adapt-import/fill-blanks.ts` (never overwrite non-blank Cosmo fields; map address/district/zone/name/email/etc.)
- [x] T009 [P] Implement Adapt location map loader + resolve in `lib/adapt-import/location-map.ts` (JSON map by `salesLocationId` / `locationName`; fallback match `CompanyLocation.name|shortName|locationReference`)
- [x] T010 Implement contact resolve (find + best-match + ambiguous flag) in `lib/adapt-import/contact-resolve.ts` using `findMatchingContacts` / `buildPhoneLookupVariants` and `pickBetterContact`-style ranking from `lib/contact-display-dedupe.ts`
- [x] T011 Implement Adapt purchase upsert + optional `lastPurchaseAt` / `recentMerchant` snapshot update in `lib/adapt-import/persist.ts` (never create `Order`; reuse snapshot “only if newer” pattern from `lib/contact-master-sync.ts`; do not set `assignedMerchant`)

**Checkpoint**: Foundation ready — history can be written/read in code; stories can start

---

## Phase 3: User Story 1 - Merchant sees Adapt-era purchase history (Priority: P1) 🎯 MVP

**Goal**: Merchants opening Contact Master / Contact Updates see Adapt purchases (date, invoice no, amount, location/merchant) merged with Cosmo order history.

**Independent Test**: Seed or upsert Adapt history for a known phone; search that phone; purchase list shows Adapt rows with correct dates/totals and Adapt label; no dispatch-queue entry.

### Implementation for User Story 1

- [x] T012 [US1] Extend `GET` handler in `app/api/admin/contacts/[id]/orders/route.ts` to load `AdaptPurchaseHistory` for the contact (cap ~200, newest first) and return `adaptPurchases` (or unified list with `source: "adapt"`) per `contracts/adapt-contact-import.md`
- [x] T013 [P] [US1] Update purchase-history types and rendering in `components/organisms/contacts-panel.tsx` to show Adapt rows with source badge; omit Cosmo invoice deep-link when no Order id
- [x] T014 [P] [US1] Update purchase-history types and rendering in `components/organisms/contact-updates-panel.tsx` with the same Adapt display rules as contacts panel
- [x] T015 [US1] Add a small seed helper or documented Prisma upsert snippet under `scripts/` or `specs/028-adapt-contact-import/quickstart.md` so US1 can be validated before full CLI import

**Checkpoint**: Merchants can view Adapt history when rows exist — MVP demoable

---

## Phase 4: User Story 2 - Operators import Adapt export safely (Priority: P1)

**Goal**: Ops runs dry-run then real import of `invoice_data_headers.csv` with counts/report, without blocking order queues; re-run is idempotent.

**Independent Test**: Dry-run on a sample CSV writes nothing and prints would-counts; real run creates/enriches contacts + history; second run adds 0 duplicate `adaptInvoiceKey` rows.

### Implementation for User Story 2

- [x] T016 [US2] Implement streaming import orchestrator in `lib/adapt-import/import-run.ts` (batch size configurable; dry-run vs real; checkpoint/resume by completed invoice keys; aggregate report counters)
- [x] T017 [US2] Create ops CLI `scripts/import-adapt-sales-invoices.mjs` patterned on `scripts/backfill-erp-customer-contacts.mjs` with `--company-id`, `--file`, `--map`, `--dry-run`, `--resume`, `--report`, `--batch-size` per contract
- [x] T018 [US2] Wire CLI to call `import-run` / Prisma against selected env; print summary matching contract report JSON shape; exit `0` on completed run with row errors counted, `1` on fatal errors
- [x] T019 [P] [US2] Add example location map file `scripts/adapt-location-map.example.json` (e.g. map `sales_location_id` `1` / `Head Office- Pepiliyana` → placeholder Cosmo location id)
- [x] T020 [US2] Document operator commands (env:use, dry-run, real, resume) in `specs/028-adapt-contact-import/quickstart.md` using primary file `invoice_data_headers.csv`

**Checkpoint**: Full sample import path works end-to-end for ops

---

## Phase 5: User Story 3 - Data quality & exclusions (Priority: P2)

**Goal**: Cancelled/deleted/inactive and identifier-less rows are skipped; ambiguous multi-contact phones attach to one best match and are reported; KnownName stays text-only.

**Independent Test**: Fixture mixing good, cancelled, phone-less, and dual-contact phone rows yields correct skips, one best-match write, ambiguous count ≥ 1, and no `assignedMerchant` set from Adapt.

### Implementation for User Story 3

- [x] T021 [US3] Extend report `skipReasons` in `lib/adapt-import/import-run.ts` / types (`cancelled_or_deleted`, `no_identifier`, `bad_amount_or_date`, `ambiguous`) and ensure CLI `--report` JSON includes them
- [x] T022 [US3] Verify and harden `lib/adapt-import/row-classify.ts` + `lib/adapt-import/contact-resolve.ts` so cancelled/deleted/`active_flag=0` never create purchases; multi-match never writes to more than one contact
- [x] T023 [US3] Ensure `lib/adapt-import/persist.ts` / fill-blanks path stores `KnownName` only on history / `recentMerchant` text and never assigns Cosmo `assignedMerchant` user id
- [x] T024 [P] [US3] Add fixture CSV under `lib/adapt-import/fixtures/adapt-quality-sample.csv` covering cancelled, no-id, ambiguous-phone, and mapped/unmapped location cases for manual/CLI validation

**Checkpoint**: Quality rules covered and reportable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tests, gates, and validation against quickstart.

- [x] T025 [P] Add Vitest coverage in `lib/adapt-import/invoice-identity.test.ts` and `lib/adapt-import/row-classify.test.ts`
- [x] T026 [P] Add Vitest coverage in `lib/adapt-import/fill-blanks.test.ts`, `lib/adapt-import/location-map.test.ts`, and `lib/adapt-import/contact-resolve.test.ts`
- [x] T027 Run `npm test` for adapt-import helpers and fix failures; ensure no Order creation paths exist in adapt-import modules
- [x] T028 [P] Cross-check Data Sufficiency / column map notes in `specs/028-adapt-contact-import/spec.md` still match `invoice_data_headers.csv` primary file
- [x] T029 Execute dry-run + sample real-run steps from `specs/028-adapt-contact-import/quickstart.md` on a carved sample (not full 723 MB until ops is ready) and record results in the report JSON

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks all user stories**
- **US1 (Phase 3)**: After Foundational — MVP merchant visibility (seeded rows OK)
- **US2 (Phase 4)**: After Foundational — can proceed in parallel with US1 UI if staffed; needs T011 persist
- **US3 (Phase 5)**: After US2 orchestrator exists (extends report + hardens classify/resolve)
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — independent with seeded `AdaptPurchaseHistory`
- **US2 (P1)**: Foundational — CLI delivers import; validates FR-008/009
- **US3 (P2)**: Builds on US2 report/classify wiring; can harden helpers in parallel with US2 CLI polish

### Parallel Opportunities

- T002 || T003 after T001
- T006 || T007 || T008 || T009 after T004/T005 (T010 after match helpers available; T011 after T006–T010)
- T013 || T014 after T012
- T019 || T020 after T017 sketched
- T025 || T026 || T028 in Polish

### Parallel Example: Foundational helpers

```bash
# After schema/migration (T004–T005):
Task: "lib/adapt-import/invoice-identity.ts"
Task: "lib/adapt-import/row-classify.ts"
Task: "lib/adapt-import/fill-blanks.ts"
Task: "lib/adapt-import/location-map.ts"
# Then:
Task: "lib/adapt-import/contact-resolve.ts"
Task: "lib/adapt-import/persist.ts"
```

### Parallel Example: User Story 1 UI

```bash
# After API returns adaptPurchases (T012):
Task: "components/organisms/contacts-panel.tsx Adapt display"
Task: "components/organisms/contact-updates-panel.tsx Adapt display"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup
2. Phase 2 Foundational (schema + persist)
3. Phase 3 US1 (API + UI + seed)
4. **STOP**: Validate merchant can see Adapt history on a contact

### Incremental Delivery

1. Setup + Foundational → writable history model
2. US1 → merchant visibility (MVP)
3. US2 → streaming CLI dry-run/real on sample then full `invoice_data_headers.csv`
4. US3 → quality counters + fixtures
5. Polish → Vitest + quickstart sample run

### Suggested MVP scope

**US1 only** (with foundational + seed): proves Contact Master value before the multi-hour full-file import.

---

## Notes

- Primary file: `invoice_data_headers.csv` (~723 MB) — always stream; carve samples for dev
- Never create Cosmo `Order` rows from Adapt
- Prod migrate/import only with explicit user confirmation (constitution IV)
- Commit after each task or logical group
