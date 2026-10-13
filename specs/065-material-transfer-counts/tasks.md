# Tasks: Material Transfer Counts and Shop Returns

**Input**: Design documents from `/specs/065-material-transfer-counts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/material-transfer-counts.md, quickstart.md

**Tests**: Plan and quickstart require Vitest for the send cap, scan promote, low-count mark, mismatch rule, shop-to-main warehouse pick, and confirm guards. Those unit tasks are included. Not a full TDD-first cycle.

**Organization**: Phases follow spec stories in priority order: US1, US2, US4, US5 (P1), then US3, US6 (P2). Store-to-shop still posts on send. Shop-to-main posts only when stores confirm.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US6 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `lib/material-transfer/`, `lib/validation/material-transfer.ts`, `prisma/schema.prisma`, `app/api/admin/store/material-transfer/`, `components/organisms/material-transfer-*.tsx`, `lib/task-reminders.ts`, `lib/task-reminder-access.ts`

---

## Phase 1: Setup

**Purpose**: Confirm this feature extends the existing material-transfer screens. No new app or package.

- [X] T001 Confirm `specs/065-material-transfer-counts/` contains plan.md, spec.md, research.md, data-model.md, contracts/material-transfer-counts.md, and quickstart.md, and that `.specify/feature.json` `feature_directory` is `specs/065-material-transfer-counts`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Direction, statuses, nullable books name, and the line counter columns every later story reads. **Blocks all user stories.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Extend `MaterialTransfer` and `MaterialTransferLine` in `prisma/schema.prisma` per `specs/065-material-transfer-counts/data-model.md`. Add enum `MaterialTransferDirection` (`store_to_shop`, `shop_to_main`) with default `store_to_shop`. Add `requested`, `confirming`, and `confirmed` to `MaterialTransferStatus`. Make `erpName` optional and keep `@@unique([companyId, slot, erpName])`. Add nullable `receivedQtyUpdatedByUserId` and `receivedQtyUpdatedAt` on `MaterialTransferLine`, with a `User` relation. Add the back-relation on `User`. Do not add a new table
- [X] T003 Create the migration with `npm run db:migrate:create` for those columns and run `npm run db:generate`. Never `prisma migrate dev` or `npm run db:push` against vault, cosmo-dev, or cosmo-prod. Do not run `npm run db:deploy:all` unless the user explicitly confirms. Existing rows stay `store_to_shop` with their current status and `erpName`
- [X] T004 [P] Add `direction`, the wider status union, and nullable `erpName` / `erpUrl` to the transfer types in `lib/material-transfer/types.ts`. Line type keeps `availableQty` as client-only (not a Prisma column)
- [X] T005 [P] In `lib/validation/material-transfer.ts`, extend `materialTransferHistoryQuerySchema` with optional `mismatch` (`"1"`) and statuses `requested`, `confirming`, `confirmed` beside `sent` and `received`. Add a confirm body schema: `lines` of `{ itemCode, qty }` with `qty` an integer 0..100000. Add a shop-return body schema that matches submit lines (`itemCode`, optional `itemName` / `barcode` / `uom`, `qty` integer ≥ 1) and does not accept warehouses
- [X] T006 In `lib/material-transfer/receipts.ts`, set `direction: "store_to_shop"` inside `recordSentTransfer`. Teach list and get-one to return `direction`, `status`, `erpName`, `erpUrl: null` for now, `receivedByName`, `mismatch: false` for now, and each line’s `barcode` plus `receivedQtyUpdatedByName`. Keep the 300-row cap

**Checkpoint**: Prisma client knows the new fields. A store-to-shop send still stores `direction = store_to_shop` and a real `erpName`. No database deploy has been run.

---

## Phase 3: User Story 1 — Scan and count a store-to-shop send (Priority: P1) 🎯 MVP

**Goal**: On the store send screen, scans and typed quantities cannot pass available stock, a bad scan or an over-available try beeps, the scanned line jumps to the top and highlights, a line at available gets a green border, and submit from main marks lines below available without blocking the send.

**Independent Test**: From main, scan a known barcode, scan an unknown barcode, type a quantity equal to available, and try one more. Beep, block, highlight, and green border behave as in spec US1. Submit dialog marks only the line below main’s available quantity. Continuing still posts.

### Tests for User Story 1

- [X] T007 [P] [US1] Extend `lib/material-transfer/lines.test.ts`. Update the existing “manual qty 5” case so its `availableQty` allows 5 (that case currently expects qty 5 while `availableQty` is 3). Add cases: `upsertTransferLine` and `setTransferLineQty` leave the line unchanged and report `over_available` when the next qty would pass `availableQty`; a non-integer or qty below 1 does not change the line and does not report `over_available`; `promoteTransferLine` moves that item code to index 0. When `availableQty` is null, keep the current 1..100000 behavior
- [X] T008 [P] [US1] Add `lib/material-transfer/submit-review.test.ts` for `linesBelowMainAvailable` in `lib/material-transfer/submit-review.ts`. A main source marks only lines with `qty < availableQty`. Lines with `qty === availableQty` or `availableQty == null` are not marked. A non-main source marks nothing

### Implementation for User Story 1

- [X] T009 [US1] Change `upsertTransferLine` and `setTransferLineQty` in `lib/material-transfer/lines.ts` to return `{ lines, rejected: "over_available" | null }` and pass the cases in `lib/material-transfer/lines.test.ts`. Add `promoteTransferLine`. Update every caller (search for both function names) to read `.lines` and beep only on `over_available`
- [X] T010 [US1] Add `linesBelowMainAvailable` in `lib/material-transfer/submit-review.ts` using `isMainWarehouseName` from `lib/material-transfer/warehouses.ts` so `lib/material-transfer/submit-review.test.ts` passes
- [X] T011 [US1] In `lib/material-transfer/erp.ts` `submitMaterialTransfer`, before creating the Stock Entry, reject a line whose qty is above the live source-warehouse bin (409, name the item, no leftover draft). Keep the erp1 VAT check and the existing create-then-submit-then-delete-draft path
- [X] T012 [US1] In `components/organisms/material-transfer-panel.tsx`, keep the scan queue and `scanValueRef`. On an unknown lookup or `over_available`, call `playScanErrorSound` from `lib/store-stock-count/scan-sound.ts` (unlock on first pointer). On a successful scan, `promoteTransferLine` and set one `highlightedItemCode`. Green border only when `qty === availableQty`. The confirm dialog lists every line and marks the `linesBelowMainAvailable` set. Confirm still calls `POST /api/admin/store/material-transfer/submit`. Use `busyKey`, `Loader2`, and `notify`

**Checkpoint**: Store-to-shop send blocks over-available with a beep, highlights the latest scan, greens exact lines, and warns on low main lines without refusing them. Shop-to-main does not exist yet.

---

## Phase 4: User Story 2 — Shop counts what arrived (Priority: P1)

**Goal**: The outlet user sees barcode, can set received qty below or above sent, scan moves that line to the top, a barcode not on the transfer beeps, and after mark-received the count locks. Stores see who last changed each line and who marked it.

**Independent Test**: Open a sent transfer of 3, scan once, type received down to 2, mark received. Stores see the mismatch quantities, the barcode, the person who changed the line, and the person who marked it. A later edit does not stick.

### Implementation for User Story 2

- [X] T013 [US2] In `lib/material-transfer/receipts.ts` `countReceivedItem`, allow `receivedQty` 0..100000 including values that differ from `sentQty`, and set `receivedQtyUpdatedByUserId` / `receivedQtyUpdatedAt` to the caller for both scan-increment and typed qty. Return 409 when status is not `sent`. `markTransferReceived` still sets `receivedByUserId` / `receivedAt` and then rejects further counts
- [X] T014 [US2] Pass the caller user id from `app/api/admin/store/material-transfer/[id]/count/route.ts` and `app/api/admin/store/material-transfer/[id]/receive/route.ts` into those receipt functions. Count stays outlet-scoped to the target warehouse. An unknown scan code stays 404
- [X] T015 [US2] In `components/organisms/material-transfer-receive-panel.tsx`, show barcode beside SKU and description. A successful scan moves that line to the top and highlights it. A 404 scan calls `playScanErrorSound` and adds no line. The qty input accepts integers below or above sent, including 0, until status is `received`, then the inputs lock. Keep the in-flight `countPromise` so mark waits for a blur-save. Show `receivedQtyUpdatedByName` and `receivedByName` once returned
- [X] T016 [US2] In `components/organisms/material-transfer-history.tsx`, show each line’s barcode, `receivedQtyUpdatedByName`, and the transfer `receivedByName` in the open item list. Do not change which click opens the list yet (that is US6)

**Checkpoint**: A shop can record 2 or 4 against a send of 3, mark once, and stores see both people. Counts do not change after mark.

---

## Phase 5: User Story 4 — Shop sends stock back to main (Priority: P1)

**Goal**: An outlet user can request a move only from their shop warehouse to that company’s main warehouse. The send list follows the US1 scan rules. Sending does not create a Stock Entry.

**Independent Test**: As Maharagama (or Cool Planet for an MNK shop), the screen offers only that shop → its main. A qty above available beeps and stays put. Send creates a `requested` row with `erpName` null. ERP has no new Material Transfer.

### Tests for User Story 4

- [X] T017 [P] [US4] Add `lib/material-transfer/shop-return.test.ts` for `resolveShopToMain` in `lib/material-transfer/shop-return.ts`. One outlet match returns that shop warehouse, its ERP company, slot, and the single main warehouse on that company. Zero shop matches, two shop matches, or two mains on that company return an error and no pair. Use `warehouseMatchesOutlet` behavior, including the MNK → Cool Planet alias already in `lib/material-transfer/receive.ts`

### Implementation for User Story 4

- [X] T018 [US4] Implement `resolveShopToMain` in `lib/material-transfer/shop-return.ts` so `lib/material-transfer/shop-return.test.ts` passes. Reuse `warehouseMatchesOutlet`, `isMainWarehouseName`, and `isShopWarehouseName`. Do not add a warehouse the user can switch
- [X] T019 [US4] Add `app/api/admin/store/material-transfer/shop-return/route.ts` per `specs/065-material-transfer-counts/contracts/material-transfer-counts.md`. `GET` returns the resolved pair or 409 with the allocation error. `POST` ignores any client warehouse, re-resolves, rejects empty lines and qty above the live shop bin, applies the erp1 VAT rule, and inserts `direction = shop_to_main`, `status = requested`, `erpName = null`, `sentQty` = shop qty, `receivedQty` = 0. Do not call `submitMaterialTransfer`
- [X] T020 [US4] Add `components/organisms/material-transfer-return-panel.tsx` and render it on `app/(dashboard)/dashboard/store/material-transfer/receive/page.tsx` for users with an outlet. Load `GET /shop-return`. Scan, beep, highlight, green border, and typed qty use the same helpers as `components/organisms/material-transfer-panel.tsx`. Send calls `POST /shop-return`. If GET returns 409, show that message and no send button. A user with no outlet does not see the panel

**Checkpoint**: Shop send creates only a local request. Store-to-shop submit is unchanged. No reminder yet.

---

## Phase 6: User Story 5 — Stores count the shop return and post it (Priority: P1)

**Goal**: Stores users with `store.material_transfer.write` see a reminder, count what arrived (less or more than the shop sent), and confirm. Confirmation posts one Stock Entry for the stores quantities, or posts nothing when the qty is zero or the shop warehouse is short.

**Independent Test**: A 3-unit request shows a reminder. Counting 2 and confirming creates one shop→main Stock Entry for 2, clears that reminder, and the mismatch filter can later show sent 3 / received 2. All zeros and a short bin do not create a document. A second confirm does not create a second document.

### Tests for User Story 5

- [X] T021 [P] [US5] Add `lib/material-transfer/confirm.test.ts` for `decideShopReturnConfirm` in `lib/material-transfer/confirm.ts`. Status other than `requested` → not open. Every qty 0 → all zero, no post lines. A positive qty above that line’s live available → short stock and the item code, no post lines. Otherwise post lines are only qty > 0 and those qtys are the body qtys, not `sentQty`

### Implementation for User Story 5

- [X] T022 [P] [US5] Add `material_transfer_confirmed` beside `material_transfer_received` in `lib/audit-log.ts` (action union and the `material-transfer` action group)
- [X] T023 [US5] Implement `decideShopReturnConfirm` in `lib/material-transfer/confirm.ts` so `lib/material-transfer/confirm.test.ts` passes. In `lib/material-transfer/receipts.ts`, add a confirm function that `updateMany`s `requested` → `confirming`, writes the body qtys and `receivedQtyUpdatedByUserId`, re-reads live shop bins, calls `submitMaterialTransfer` only for positive qtys, then sets `confirmed`, `erpName`, `receivedByUserId`, and `receivedAt`. On all-zero, short stock, or ERP failure, set status back to `requested` and leave `erpName` null. If the claim updates 0 rows, do not call ERP
- [X] T024 [US5] Add `POST` `app/api/admin/store/material-transfer/[id]/confirm/route.ts` per the contract. Require `store.material_transfer.write`. 400 all-zero, 409 not open or short stock (name the item), 502 when ERP submit fails after the draft is deleted. Audit `material_transfer_confirmed` only after `confirmed`. Return `erpName` and `erpUrl`
- [X] T025 [US5] Show open shop returns to stores. Add category `shop_to_main` to `TaskReminderCategory` in `lib/task-reminders.ts` and count rows with `direction = shop_to_main` and `status = requested`. In `lib/task-reminder-access.ts`, treat `shop_to_main` as visible when `permissionKeys` includes `store.material_transfer.write` or the role is `admin` or `super_admin`. Do not add a `reminders.*` key and do not call `reminderPermissionForCategory` for this category. Add the category to the label maps in `components/molecules/task-reminder-bubbles.tsx`. `href` is `/dashboard/store/material-transfer`. Title includes the shop warehouse
- [X] T026 [US5] On `components/organisms/material-transfer-panel.tsx`, list `requested` shop-to-main rows for the write user. Scan and typed received qty use `POST /[id]/count` (stores user, status `requested`, qty may differ from sent, scanned line moves to the top). Confirm sends the counted qtys to `POST /[id]/confirm`. Do not show the main-warehouse low-count mark on this confirm. Follow `busyKey` / `notify`

**Checkpoint**: One confirm posts one document for the stores qty. Zeros, short stock, and a second confirm post nothing. The reminder drops when status leaves `requested`.

---

## Phase 7: User Story 3 — Find mismatch transfers (Priority: P2)

**Goal**: Stores and shop users can filter history to finished transfers where at least one line’s received qty differs from sent. Opening the row shows which lines differ.

**Independent Test**: One transfer received exactly and one received short. Mismatch filter keeps only the short one for stores (all shops) and for that outlet. Clearing the filter shows both.

### Tests for User Story 3

- [X] T027 [P] [US3] Add `lib/material-transfer/mismatch.test.ts` for `isMismatchTransfer` in `lib/material-transfer/mismatch.ts`. True only when status is `received` or `confirmed` and some line has `receivedQty !== sentQty`. False for `sent` or `requested` even when every `receivedQty` is 0. False when a finished transfer matches on every line

### Implementation for User Story 3

- [X] T028 [US3] Implement `isMismatchTransfer` in `lib/material-transfer/mismatch.ts` so `lib/material-transfer/mismatch.test.ts` passes. Use it for the `mismatch` flag in `lib/material-transfer/receipts.ts` list and get-one
- [X] T029 [US3] In `app/api/admin/store/material-transfer/history/route.ts`, honor `mismatch=1` from `materialTransferHistoryQuerySchema`. Filter to finished differing rows. `scope=shop` matches store-to-shop on the target warehouse and shop-to-main on the source warehouse via `warehouseMatchesOutlet`. `scope=all` still requires write and returns every shop
- [X] T030 [US3] In `components/organisms/material-transfer-history.tsx`, add a mismatch toggle that reloads with `mismatch=1`. In the open item list, mark lines where `receivedQty !== sentQty` on a finished transfer so the differing lines are visible

**Checkpoint**: The filter hides exact finished transfers and hides open sends that are still at received 0. Both stores and the outlet user can use it inside their scope.

---

## Phase 8: User Story 6 — Open the books document or the item list (Priority: P2)

**Goal**: The entry identifier opens the ERP Stock Entry when one exists. The rest of the row opens the item list. A shop-to-main request has no books link until stores confirm.

**Independent Test**: On a store-to-shop row, the entry id opens the ERP document and the row opens items with barcodes. An unconfirmed shop return has no books link. After confirm, its entry id opens the document created at confirm.

### Implementation for User Story 6

- [X] T031 [US6] In `lib/material-transfer/receipts.ts`, set `erpUrl` to `{instanceBaseUrl}/app/stock-entry/{erpName}` when `erpName` is set, using the base URL of the row’s `slot` instance. Leave `erpUrl` null when `erpName` is null
- [X] T032 [US6] In `components/organisms/material-transfer-history.tsx`, render the entry identifier as `<a href={erpUrl} target="_blank">` only when `erpUrl` is set, and `stopPropagation` so that click does not open the item list. The rest of the row opens the item list. When `erpUrl` is null, show the shop warehouse and time as plain text, not a link

**Checkpoint**: Entry id and row do different things. Unconfirmed shop returns have no books link.

---

## Phase 9: Polish & Cross-Cutting

**Purpose**: Prove the pure rules and leave the database deploy for an explicit user yes.

- [X] T033 Run the Vitest command in `specs/065-material-transfer-counts/quickstart.md` (`lines`, `submit-review`, `mismatch`, `shop-return`, and `confirm` tests) and fix failures in those files only
- [X] T034 Lint the touched `lib/material-transfer` files, `components/organisms/material-transfer-panel.tsx`, `components/organisms/material-transfer-receive-panel.tsx`, `components/organisms/material-transfer-history.tsx`, and `components/organisms/material-transfer-return-panel.tsx`. Do not run `npm run db:deploy:all`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. Blocks all stories
- **US1 (Phase 3)**: After Foundational. No dependency on other stories
- **US2 (Phase 4)**: After Foundational. Independent of US1
- **US4 (Phase 5)**: After Foundational and US1 helpers (`promoteTransferLine`, beep, green border). Does not require US2
- **US5 (Phase 6)**: After US4 (a `requested` row must exist) and US2’s count path (stores reuse `POST /[id]/count`)
- **US3 (Phase 7)**: After US2 for the shop-receipt UAT. Shop-return mismatches also need US5
- **US6 (Phase 8)**: After US1 (a real `erpName`) and US4/US5 (null `erpName` until confirm)
- **Polish (Phase 9)**: After the stories you intend to ship

### User Story Dependencies

- **US1 (P1)**: MVP. Send-screen only
- **US2 (P1)**: Shop receipt. Does not need the new send beeps
- **US4 (P1)**: Shop return request. Reuses US1 list helpers
- **US5 (P1)**: Needs US4’s request and US2’s count endpoint
- **US3 (P2)**: Filter. Store-to-shop half needs US2. Shop-to-main half needs US5
- **US6 (P2)**: Click split. Needs rows that have and lack `erpUrl`

### Parallel Opportunities

- T002, T004, and T005 touch different files
- T007 and T008 (US1 tests) together
- T017 (US4 test) can be written while US2 is in progress, after Foundational
- T021 and T022 (US5 test and audit action) together
- T027 (US3 test) together with other unfinished story tests, after Foundational

---

## Parallel Example: User Story 1

```text
T007 lib/material-transfer/lines.test.ts
T008 lib/material-transfer/submit-review.test.ts
```

Then T009 and T010, then T011 and T012.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 and Phase 2
2. Phase 3 (US1)
3. Stop and run the send-screen checks in `specs/065-material-transfer-counts/quickstart.md`
4. Do not deploy the database until the user confirms

### Incremental Delivery

1. US1 — send counts, beep, green border, low-count warning
2. US2 — shop receipt, barcode, who counted
3. US4 — shop return request, no ERP document
4. US5 — reminder and one confirm post
5. US3 — mismatch filter
6. US6 — books link vs item row

### Parallel Team Strategy

After Phase 2: one person on US1, another on US2. US4 starts once US1’s line helpers land. US5 waits for US4. US3 and US6 land last.

---

## Notes

- [P] tasks = different files, no incomplete dependencies
- Story labels map to spec.md US1–US6
- Do not add `store.material_transfer.receive` or a `reminders.shop_to_main` permission
- Do not post a live Stock Entry from unit tests
- Migration deploy (`npm run db:deploy:all`) stays out of these tasks until the user says to deploy
