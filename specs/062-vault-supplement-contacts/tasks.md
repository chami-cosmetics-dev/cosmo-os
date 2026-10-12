# Tasks: Vault Supplement Contact Import

**Input**: Design documents from `/specs/062-vault-supplement-contacts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/vault-supplement-contact-import.md, quickstart.md

**Tests**: Plan and quickstart require Vitest on pure helpers. Not a TDD-first spec. Write the helper, then the test in the task that names the test file. Manual checks stay in `quickstart.md`.

**Organization**: Tasks grouped by user story. Priority order is P1 (US1, US2, US4) then P2 (US3). Git branch to use when implementing: `062-vault-supplement-contacts`. This command did not create the branch. Spec dir: `specs/062-vault-supplement-contacts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1, US2, US3, US4
- Exact file paths in every task description

## Path Conventions

Cosmo OS / Vault OS Next.js app at repo root (`app/`, `lib/`, `prisma/`, `components/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the design set before schema or routes

- [ ] T001 Confirm these files exist: `specs/062-vault-supplement-contacts/plan.md`, `specs/062-vault-supplement-contacts/spec.md`, `specs/062-vault-supplement-contacts/research.md`, `specs/062-vault-supplement-contacts/data-model.md`, `specs/062-vault-supplement-contacts/contracts/vault-supplement-contact-import.md`, `specs/062-vault-supplement-contacts/quickstart.md`
- [ ] T002 [P] Follow the migration rule already written in `specs/062-vault-supplement-contacts/plan.md`: schema changes only through `npm run db:migrate:create`; never `prisma db push` / `npm run db:push` on vault, cosmo-dev, or cosmo-prod; do not run `npm run db:deploy:all` unless the user asks in that turn

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Column, workbook parse, ERP item-code set, contact match, invoice merge — every story uses these

**CRITICAL**: No user story work until this phase completes

- [ ] T003 Add `origin String @default("adapt")` on `AdaptPurchaseHistory` in `prisma/schema.prisma` per `specs/062-vault-supplement-contacts/data-model.md` (`adapt` | `vault_supplement_import`)
- [ ] T004 Create the migration for T003 with `npm run db:migrate:create` and run `npm run db:generate` (no `db push`; no deploy unless the user asks)
- [ ] T005 [P] Define the 18 `Purchases` headers, required-header set, and header-name matching (order-independent; extra columns ignored; `Guide` sheet ignored) in `lib/vault-supplement-import/headers.ts`
- [ ] T006 [P] Export the Supplement Vault ERP stock-item filter used by `syncVaultErpCatalogToProductItems` (stock items, skip disabled except force-included SKUs, skip `DELIVERY-CHARGES` and `TEST`, ERP1 and ERP2) from `lib/product-items/vault-erp-catalog-sync.ts` without writing `ProductItem` from a read
- [ ] T007 [P] Implement invoice identity `vsupp:{source_ref}|{invoice_no}`, line replace by `itemCode`, keep lines omitted from the file, and `ttlAmount` = sum of line amounts in `lib/vault-supplement-import/invoice-merge.ts`
- [ ] T008 [P] Implement phone-first contact resolution in `lib/vault-supplement-import/contact-resolve.ts` using `normalizeContactPhone`, `normalizeContactEmail`, and `buildPhoneLookupVariants` from `lib/contact-identifiers.ts` and `lib/phone-lookup.ts`: one match by phone else email; reject with the contract phrases when phone and email hit different contacts or either side hits more than one
- [ ] T009 Classify `Purchases` rows in `lib/vault-supplement-import/parse-sheet.ts` (depends on T005): missing required header fails the whole file before row results; per-row reasons match `specs/062-vault-supplement-contacts/contracts/vault-supplement-contact-import.md`; `invoice_date` only via `parseAppCalendarDayStart` in `lib/format-datetime.ts`; blank `line_amount` = quantity × unit price; blank currency = `LKR`; later row wins for the same `source_ref` + `invoice_no` + `item_code`; group customers by normalized phone else email
- [ ] T010 Load the in-memory ERP item-code set in `lib/vault-supplement-import/item-codes.ts` (depends on T006) and read an uploaded workbook whose header is `item_code`
- [ ] T011 [P] Add Vitest in `lib/vault-supplement-import/headers.test.ts` and `lib/vault-supplement-import/parse-sheet.test.ts` for header rejection with no data rows, `YYYY-MM-DD`, quantity > 0, blank line amount, last-row-wins, and stable reject phrases
- [ ] T012 [P] Add Vitest in `lib/vault-supplement-import/invoice-merge.test.ts` and `lib/vault-supplement-import/contact-resolve.test.ts` for supplement-only invoice totals, second apply updates the same line and keeps an omitted line, `077…` / `+94…` as one customer, and phone/email hitting different contacts

**Checkpoint**: Migration created; parse, match, and merge covered by Vitest — story work can start

---

## Phase 3: User Story 1 - Upload the file into Vault OS (Priority: P1) 🎯 MVP

**Goal**: A staff member with `contacts.master.manage` uploads a `Purchases` workbook on Vault OS. New phones become Contact Master contacts. Existing phones stay one contact. Supplement lines land on purchase history. The page lists accepted, created, matched, added, updated, and each rejected row.

**Independent Test**: Upload two customers, one phone already on Vault Contact Master, and one unknown item code. New contact appears, the existing contact gains only the new valid line, the bad row is rejected, and a second upload of the same file does not add a duplicate line.

### Implementation for User Story 1

- [ ] T013 [US1] Implement `lib/vault-supplement-import/import-run.ts`: load ERP codes once via T010 (ERP failure writes nothing); reject unknown `item_code` with `Item code is not on the Supplement Vault ERP item list`; create `ContactMaster` with `source` `vault-supplement-import` and `osRegistrationCreated` false, or fill only empty `name` / `phoneNumber` / `email` / `address` / `city` / `district`; ensure primary `ContactPhone` / `ContactEmail` when those values are written; do not set `assignedMerchant`, loyalty fields, reminders, or call queue; upsert `AdaptPurchaseHistory` with `origin` `vault_supplement_import` and `importBatchId`; move `lastPurchaseAt` forward only; recompute `purchaseOrderCount`, `purchaseTotalValue`, and `purchaseLastOrderAt` for touched contacts through `purchaseSummaryForContact` in `lib/contacts/purchase-summary-export.ts`
- [ ] T014 [US1] Add `POST /api/admin/contacts/supplement-import` in `app/api/admin/contacts/supplement-import/route.ts`: `requirePermission("contacts.master.manage")`, Vault OS only (`APP_NAME` from `lib/branding.ts`), multipart field `file`, JSON body from the contract, `409` on a bad header or on Cosmo OS, `502` when the ERP list fails, `400` when the file is missing
- [ ] T015 [US1] Add the permission-gated page `app/(dashboard)/dashboard/contacts/supplement-import/page.tsx` (deny without `contacts.master.manage`)
- [ ] T016 [US1] Build the Vault OS upload control and on-page reject table in `components/organisms/supplement-contact-import-panel.tsx` (busy spinner on the upload button, disable peers while the request runs, toast via `notify` for success or hard failure; keep the row-reason table on the page)
- [ ] T017 [P] [US1] Add sidebar link **Supplement contact import** → `/dashboard/contacts/supplement-import` gated by `contacts.master.manage` in `components/organisms/app-sidebar.tsx`
- [ ] T018 [P] [US1] Add the `/dashboard/contacts/supplement-import` title prefix in `components/organisms/topbar.tsx`

**Checkpoint**: Vault OS upload is testable with a hand-built xlsx even before the blank-template button exists

---

## Phase 4: User Story 2 - Start from a blank template (Priority: P1)

**Goal**: Staff download a blank workbook whose `Purchases` header row is the 18 spec headers, plus one orange example row, and a `Guide` sheet that says to delete the example before upload.

**Independent Test**: Download the file, confirm headers and the example row, add one real data row, delete the example, upload it through the US1 endpoint, and see that line on Vault purchase history. A renamed required header uploads nothing.

### Implementation for User Story 2

- [ ] T019 [US2] Build the xlsx in `lib/vault-supplement-import/template-workbook.ts`: sheet `Purchases` row 1 = T005 headers in spec order, row 2 = the Nimal Perera example from `specs/062-vault-supplement-contacts/spec.md` with `line_amount` formula `=K2*L2`, orange fill, phone and item code stored as text; sheet `Guide` tells staff to delete the example row
- [ ] T020 [P] [US2] Assert header order, example phone `0771234567`, and the `K2*L2` formula in `lib/vault-supplement-import/template-workbook.test.ts`
- [ ] T021 [US2] Add `GET /api/admin/contacts/supplement-import/template` in `app/api/admin/contacts/supplement-import/template/route.ts`: `contacts.master.manage`, Vault OS only, file name `vault-supplement-contacts-template.xlsx`, `409` on Cosmo OS
- [ ] T022 [US2] Add the blank-template download button to `components/organisms/supplement-contact-import-panel.tsx` (Vault OS only)

**Checkpoint**: Template download works on Vault OS; Cosmo OS receives 409

---

## Phase 5: User Story 4 - Contact Master and Customer Insight (Priority: P1)

**Goal**: After US1, Customer Insight phone search and Contact Master purchase history show the imported supplement invoices, items, and spend, labeled **Supplement import**. The `merchant` column stays on the purchase. The contact is not allocated.

**Independent Test**: Upload one new phone with two supplement lines. Contact Master has one contact. Insight search of that phone shows both lines and a spend total equal to those lines. A second upload leaves the contact count at one. No `assignedMerchant` is set from the file.

### Implementation for User Story 4

- [ ] T023 [US4] Return `origin` on each adapt purchase from `app/api/admin/contacts/[id]/orders/route.ts` (`vault_supplement_import` or `adapt`)
- [ ] T024 [P] [US4] Teach `mapAdaptToInvoiceRow` in `lib/customer-insight/invoices.ts` to label `vault_supplement_import` as **Supplement import** and to use the stored payment method (or `Imported` when payment is blank); keep `source: "adapt"` so lifetime spend still includes the row; add `lib/customer-insight/invoices.test.ts` for that label and for an `adapt` origin still saying Adapt
- [ ] T025 [US4] Pass `origin` from `lib/customer-insight/load.ts` into the invoice mapper (depends on T024)
- [ ] T026 [P] [US4] Show **Supplement import** instead of Adapt when `origin` is `vault_supplement_import` in `components/organisms/contacts-panel.tsx`
- [ ] T027 [P] [US4] Show the same label in `components/organisms/contact-updates-panel.tsx`

**Checkpoint**: Insight phone search and both contact history panels show supplement lines with the right label and spend

---

## Phase 6: User Story 3 - Review a draft taken from Cosmo OS (Priority: P2)

**Goal**: Vault OS downloads ERP item codes. Cosmo OS accepts that workbook and returns a `Purchases` draft of supplement lines only. Staff edit it, then upload on Vault OS (US1). Cosmo data is not modified.

**Independent Test**: A Cosmo order with one supplement SKU and one other SKU produces one draft row. A cancelled or voided order is absent. A line with neither phone nor email is absent. Deleting a draft row and uploading leaves that line off Vault OS.

### Implementation for User Story 3

- [ ] T028 [US3] Build draft rows in `lib/vault-supplement-import/draft.ts`: non-cancelled, non-voided `Order` lines whose `ProductItem.sku` is in the uploaded code set; `AdaptPurchaseHistory` lines whose item code is in the set; skip rows with neither phone nor email; prefer Contact Master name, phone, email, address, city, and district when the order phone or email matches one contact; `source_ref` is the order id or existing `adaptInvoiceKey`; `invoice_no` is the order number, else order name, else id, or `salesInvoiceNo`; `invoice_date` is the Colombo calendar day
- [ ] T029 [US3] Add Vitest in `lib/vault-supplement-import/draft.test.ts` for mixed-invoice filtering, cancelled and voided orders dropped, unknown codes dropped, and missing phone+email dropped
- [ ] T030 [US3] Add `GET /api/admin/contacts/supplement-import/item-codes` in `app/api/admin/contacts/supplement-import/item-codes/route.ts`: `contacts.master.manage`, Vault OS only, sheet `ItemCodes` header `item_code`, `502` when ERP cannot be listed, `409` on Cosmo OS
- [ ] T031 [US3] Add `POST /api/admin/contacts/supplement-import/draft` in `app/api/admin/contacts/supplement-import/draft/route.ts`: `contacts.master.manage`, Cosmo OS only, multipart `file`, `400` when `item_code` is missing or the code set is empty, response file `vault-supplement-contacts-draft.xlsx` with sheet `Purchases` only, no writes to Cosmo contacts, orders, or ERP, `409` on Vault OS
- [ ] T032 [US3] On Vault OS, add item-code download; on Cosmo OS, add item-code upload and draft download; hide purchase upload on Cosmo OS — in `components/organisms/supplement-contact-import-panel.tsx`

**Checkpoint**: Item-code file from Vault OS produces a Cosmo draft that US1 can upload

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quickstart proof across both apps

- [ ] T033 Walk `specs/062-vault-supplement-contacts/quickstart.md` on Vault OS and Cosmo OS (template, item codes, draft, upload, Insight search, second upload, wrong-app 409)
- [ ] T034 [P] Run `npm test -- lib/vault-supplement-import` and lint the touched files under `lib/vault-supplement-import/`, `app/api/admin/contacts/supplement-import/`, `app/(dashboard)/dashboard/contacts/supplement-import/`, `components/organisms/supplement-contact-import-panel.tsx`, `components/organisms/contacts-panel.tsx`, `components/organisms/contact-updates-panel.tsx`, `lib/customer-insight/invoices.ts`, and `lib/customer-insight/load.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — blocks all user stories
- **User stories**: Depend on Foundational. US2 and US4 also touch files US1 creates (panel, purchase rows). US3 draft upload is only useful after US1 exists
- **Polish**: After the stories you intend to ship

### User Story Dependencies

- **US1 (P1)**: After Foundational. No other story required. MVP.
- **US2 (P1)**: After Foundational for the workbook helper. Download button (T022) waits on the US1 panel (T016). The GET route (T021) is testable without the button
- **US4 (P1)**: After US1 has written `origin` rows. Label tasks can be coded against the contract before a live upload
- **US3 (P2)**: After Foundational. Staff loop closes only once US1 upload exists. Draft route does not write Vault data

### Within Each User Story

- Helpers before routes
- Routes before buttons that call them
- Tests for a helper land in the task that names the test file, after that helper exists
- Not TDD-first: do not block the helper on a failing test commit

### Parallel Opportunities

- T002 parallel with T001
- After T003 starts, T005, T006, T007, and T008 are parallel (different files)
- T011 parallel with T012 once their helpers exist
- T017 parallel with T018
- T020 parallel with T019’s route work only after T019 exists; T020 parallel with T021 once T019 is done
- T024 parallel with T023
- T026 parallel with T027
- T034 parallel with a second person finishing T033 notes

---

## Parallel Example: Foundational

```text
T005 headers.ts
T006 vault-erp-catalog-sync.ts filter export
T007 invoice-merge.ts
T008 contact-resolve.ts
```

After those land:

```text
T011 parse-sheet.test.ts + headers.test.ts
T012 invoice-merge.test.ts + contact-resolve.test.ts
```

## Parallel Example: User Story 4

```text
T023 orders/route.ts origin field
T024 invoices.ts label + invoices.test.ts
```

Then:

```text
T026 contacts-panel.tsx
T027 contact-updates-panel.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 and Phase 2
2. Phase 3 (US1)
3. Stop. Upload a small xlsx built with the spec headers. Confirm Contact Master and a second upload

### Incremental Delivery

1. Foundation → US1 upload (MVP)
2. US2 blank template so staff are not hand-typing headers
3. US4 labels and Insight spend check
4. US3 item-code file + Cosmo draft
5. Polish quickstart

### Parallel Team Strategy

1. Together: Phase 1 and Phase 2
2. Then: one person on US1 (`import-run.ts` + POST), another on US2 workbook + GET template
3. US4 labels after `origin` is on the schema
4. US3 after the item-code reader (T010) exists

---

## Notes

- [P] tasks = different files, no unfinished dependency
- Story labels: US1 upload, US2 template, US3 draft, US4 Insight / Contact Master display
- Do not create `Order` rows or ERP customers
- Do not query the Vault database from Cosmo OS; item codes travel as a workbook
- Commit after each task or logical group
- Format check: every task has a checkbox, `Tnnn` id, optional `[P]`, story label only on story phases, and a file path
