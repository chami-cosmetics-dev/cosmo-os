# Tasks: Shop Item Requests

**Input**: Design documents from `/specs/066-shop-item-requests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/shop-item-requests.md, quickstart.md

**Tests**: Plan and quickstart require Vitest for warehouse matching, the under-4 mark, Shop Availability, duplicate item codes, and the done claim. Those unit tasks are included. Not a full TDD-first cycle.

**Organization**: Phases follow spec stories: US1 shop request (P1, MVP), US2 stores review and mark done (P1), US3 pending/done history (P2). Marking done does not create a Stock Entry or a `MaterialTransfer`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US3 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `prisma/schema.prisma`, `lib/material-transfer/`, `lib/validation/material-transfer.ts`, `app/api/admin/store/material-transfer/shop-requests/`, `components/organisms/material-transfer-*.tsx`, `app/(dashboard)/dashboard/store/material-transfer/`

---

## Phase 1: Setup

**Purpose**: Confirm this feature extends the existing material-transfer screens. No new app or package.

- [X] T001 Confirm `specs/066-shop-item-requests/` contains plan.md, spec.md, research.md, data-model.md, contracts/shop-item-requests.md, quickstart.md, and tasks.md, and that `.specify/feature.json` `feature_directory` is `specs/066-shop-item-requests`. Git branch is `feature/066-shop-item-requests`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Request tables and the pure stock / availability / done rules every story reads. **Blocks all user stories.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add `ShopItemRequestStatus` (`pending`, `done`), `ShopItemRequest`, and `ShopItemRequestLine` to `prisma/schema.prisma` per `specs/066-shop-item-requests/data-model.md`. Header: `companyId`, `outletName`, `status` default `pending`, nullable `createdByUserId`, nullable `doneByUserId`, nullable `doneAt`, timestamps. Line: `itemCode`, `itemName`, `barcode` default `""`, `neededQty`, nullable `shopAvailability`. Indexes `(companyId, status, createdAt desc)` and `(companyId, outletName, status, createdAt desc)` on the header, `(requestId)` on the line. `onDelete: Cascade` from company and from request. User relations `onDelete: SetNull`, named `ShopItemRequestCreatedBy` and `ShopItemRequestDoneBy`, with the back-relations on `model User` next to `materialTransfersCreated`. Do not change `MaterialTransfer` or `MaterialTransferLine`
- [X] T003 Create the migration with `npm run db:migrate:create` for those models and run `npm run db:generate`. Never `prisma migrate dev` or `npm run db:push` against vault, cosmo-dev, or cosmo-prod. Do not run `npm run db:deploy:all` unless the user explicitly confirms in this moment
- [X] T004 [P] In `lib/validation/material-transfer.ts`, add Zod schemas for the shop-request contract in `specs/066-shop-item-requests/contracts/shop-item-requests.md`: suggest query `q` trimmed string; lookup body `{ code }`; create body `lines` of `{ itemCode, neededQty }` with `neededQty` int 1..100000, 1..100 lines; list query `status` optional `pending` | `done` and `scope` optional `shop` | `all`. Use the existing `trimmedString` / `LIMITS` helpers
- [X] T005 [P] Add `lib/material-transfer/shop-item-request.test.ts` for the pure helpers that will live in `lib/material-transfer/shop-item-request.ts`. Cases: Cosmetics main resolves only to warehouse name `Main Warehouse - Cosmo` on erp1; Pevi, SPK, Chami, Udara, and SDP prefer `Main Warehouse - {token}` on erp2 and otherwise the single main whose name or company contains that token as a word; zero matches or two matches without the preferred name yield `qty: null` and `cannotTransfer: false`; qty 0, 1, 2, 3 → `cannotTransfer: true`; qty 4 → false; null qty → false; `shopAvailabilityWarn` is true only for `not_allowed`; a create body with a repeated `itemCode` is rejected; `canMarkDone` is true only when status is `pending`
- [X] T006 Implement `resolveMainWarehouses`, `stockCell`, `shopAvailabilityWarn`, `assertUniqueItemCodes`, and `canMarkDone` in `lib/material-transfer/shop-item-request.ts` so `lib/material-transfer/shop-item-request.test.ts` passes. Reuse `isMainWarehouseName` from `lib/material-transfer/warehouses.ts`. Column order is Cosmetics main, Pevi, SPK, Chami, Udara, SDP with keys `cosmetics_main`, `pevi`, `spk`, `chami`, `udara`, `sdp`

**Checkpoint**: Prisma client knows the new models. Pure rules pass. No database deploy has been run. No API or screen exists yet.

---

## Phase 3: User Story 1 — Shop asks stores for items (Priority: P1) 🎯 MVP

**Goal**: An outlet user, on a new Request items tab, adds any item by barcode or SKU suggestion, edits quantity, removes lines, hears the error sound for OSF Not Allowed and still keeps the line, sees the six main-warehouse stocks with cannot-transfer below 4, and submits a pending request.

**Independent Test**: As a shop user with an outlet, add one allowed item by barcode, one by SKU suggestion, one Not Allowed item, and one item with a main below 4. Edit a quantity, remove a line, and submit. The request is pending, the Not Allowed line is present, and the low cell is marked cannot-transfer. An unknown code beeps and adds nothing. An empty list does not submit.

### Implementation for User Story 1

- [X] T007 [US1] Add `lib/material-transfer/shop-item-request-lookup.ts` (`server-only`). `suggestShopRequestItems(companyId, q)` searches erp1 and erp2 Item `item_code like`, disabled excluded, min 2 characters, cap 15 unique codes, no item-name search. `lookupShopRequestItem(companyId, code)` returns one item or throws not-found / ambiguous: exact `item_code` first, else `scan_barcode` via the helpers in `lib/material-transfer/erp.ts`. Same code on both ERPs is one item. Read `ProductOsfProfile.shopAvailability` for the company, matching the item code and the hyphen/underscore swap of a trailing variant (`SKU_1` / `SKU-1`); store only `allowed`, `not_allowed`, or null. Load the six stocks with `fetchBinActualQty` from `lib/osf/erp-stock.ts` once per ERP. A thrown ERP read leaves those columns null. A successful read with no Bin key is qty 0. Apply `stockCell` from `lib/material-transfer/shop-item-request.ts`
- [X] T008 [P] [US1] Add `GET` `app/api/admin/store/material-transfer/shop-requests/suggest/route.ts` per `specs/066-shop-item-requests/contracts/shop-item-requests.md`. Auth: `requireMaterialTransferView` from `lib/material-transfer/auth.ts`; allow an outlet (`canReceive`) or `canWrite`; otherwise 403. `q` shorter than 2 returns `{ hits: [] }`. One ERP slot failing still returns the other slot’s hits. Both failing returns 502
- [X] T009 [P] [US1] Add `POST` `app/api/admin/store/material-transfer/shop-requests/lookup/route.ts` with the same auth as T008. Validate with the lookup schema from `lib/validation/material-transfer.ts`. 404 when no item, 409 when two item codes, 200 with `item` including `shopAvailability` and `stocks`. Do not beep on the server
- [X] T010 [US1] Add `POST` `app/api/admin/store/material-transfer/shop-requests/route.ts`. Require an outlet from `requireMaterialTransferView` (`scope.outletName`); write permission alone is 403. Validate the create schema. Reject duplicate `itemCode` with `assertUniqueItemCodes`. Re-resolve each line by exact item code through `lookupShopRequestItem` (do not trust client name, barcode, or Shop Availability). Unknown code is 404 and inserts nothing. Insert `ShopItemRequest` `status: pending`, `outletName` from the profile, `createdByUserId` from the caller, and lines with server-read `itemName`, `barcode`, and `shopAvailability`. Return 201 and the request with live stocks. Do not call `submitMaterialTransfer` and do not insert `MaterialTransfer`
- [X] T011 [US1] Add `components/organisms/material-transfer-request-panel.tsx`. Draft lines stay in React state until submit. Barcode/SKU field calls `POST .../shop-requests/lookup`. A 404 or 409 calls `playScanErrorSound` from `lib/store-stock-count/scan-sound.ts` (unlock on first pointer) and `notify.error`, and adds no line. `shopAvailability === "not_allowed"` plays that sound, `notify` says this item is not allowed for shops, and the line stays. A repeat item code increases `neededQty` by 1. Qty input is an integer 1..100000. Remove drops the line. Each line shows the six stock labels; `cannotTransfer` is marked; null qty shows as unknown and is not marked. Submit is disabled when the list is empty. Submit calls `POST .../shop-requests` with `{ itemCode, neededQty }` only. Use one `busyKey`, disable inputs while busy, `Loader2` plus a progress label on the active button, and `notify` for success and error
- [X] T012 [US1] On `app/(dashboard)/dashboard/store/material-transfer/receive/page.tsx`, add a tab strip: Request items, Receive, and Return to main only when the user has `store.material_transfer.shop_return`. Initial tab stays Receive. Request items renders `MaterialTransferRequestPanel`. Receive still renders `MaterialTransferReceivePanel`. Return still renders `MaterialTransferReturnPanel`. A user with no outlet still sees the existing permission card and no request tab

**Checkpoint**: A shop user can build and submit a pending request, including Not Allowed and under-4 lines. Stores cannot see the queue yet. No stock moves.

---

## Phase 4: User Story 2 — Stores review the request and mark it done (Priority: P1)

**Goal**: Stores with `store.material_transfer.write` see each pending request with creator, outlet, Shop Availability, and the same six live stocks, and can mark the whole request done once. Done does not move stock.

**Independent Test**: Submit a two-line request, one line with a main qty of 2. As stores, open Shop requests. Pending shows creator, outlet, both lines, Shop Availability, six stocks, and cannot-transfer on the low cell. Mark done. It is no longer pending. A second mark says it is already done. No `MaterialTransfer` row exists for those lines.

### Implementation for User Story 2

- [X] T013 [P] [US2] In `app/api/admin/store/material-transfer/shop-requests/route.ts`, add `GET` per `specs/066-shop-item-requests/contracts/shop-item-requests.md`. `status` defaults to `pending`. `scope=all` requires `canWrite` and returns every outlet in the company. `scope=shop` or a caller without write returns rows whose `outletName` equals the current outlet. Cap 300, newest first. Include `createdByName`, `outletName`, `status`, lines, stored `shopAvailability`, and live `stocks` from `lookupShopRequestItem`’s stock loader (batch the item codes; do not call lookup once per cell). Missing user name is null
- [X] T014 [P] [US2] Add `GET` `app/api/admin/store/material-transfer/shop-requests/[id]/route.ts` and `POST` `app/api/admin/store/material-transfer/shop-requests/[id]/done/route.ts`. GET uses the same visibility as T013 and returns 404 outside the company or outlet. POST requires `canWrite` (outlet-only is 403). `updateMany` where `id`, `companyId`, and `status: pending`, setting `done`, `doneByUserId`, and `doneAt`. Zero rows and the request is already `done` → 409 “already done”. Missing in the company → 404. Return the done request with live stocks. Do not insert `MaterialTransfer` and do not call ERP write methods. Use `canMarkDone` only as the documented rule; the conditional `updateMany` is the lock
- [X] T015 [US2] Add `components/organisms/material-transfer-request-queue.tsx`. Load `GET /api/admin/store/material-transfer/shop-requests?status=pending&scope=all`. Each row shows creator, outlet, and lines with needed qty, Shop Availability, six stocks, and the cannot-transfer mark. Mark done calls `POST .../[id]/done`, then reloads. A 409 uses `notify.error` and reloads so the row leaves Pending. `busyKey`, `Loader2`, and disabled buttons while the mark is in flight
- [X] T016 [US2] In `components/organisms/material-transfer-panel.tsx`, add tabs Send and Shop requests. Initial tab stays Send and keeps the current send form, shop-return queue, and history. Shop requests renders `MaterialTransferRequestQueue`. The stores page `app/(dashboard)/dashboard/store/material-transfer/page.tsx` already requires `store.material_transfer.write`; do not add a permission key

**Checkpoint**: Stores can open a pending request, read who and which outlet, see the under-4 marks, and mark it done once. Shop compose from US1 still works. History filters are not in the UI yet.

---

## Phase 5: User Story 3 — Pending, done, and history (Priority: P2)

**Goal**: Shop users and stores users filter pending or done. New requests show under pending. Done requests stay openable. A shop user sees only their outlet.

**Independent Test**: Two requests, one marked done. Stores Pending and Done each show only that status, and the done request still opens with creator, outlet, lines, and quantities. The shop user, on Request items, sees only their outlet under the same filters.

### Implementation for User Story 3

- [X] T017 [US3] Confirm `GET` `app/api/admin/store/material-transfer/shop-requests/route.ts` and `GET` `app/api/admin/store/material-transfer/shop-requests/[id]/route.ts` honor `status=pending|done` and `scope=shop|all` from T013. `scope=all` without write is 403. `GET /[id]` for a done request returns the stored lines and needed quantities plus live stocks. Do not add a path from `done` back to `pending`
- [X] T018 [P] [US3] In `components/organisms/material-transfer-request-panel.tsx`, under the draft form, list this outlet’s requests with Pending and Done controls. Default Pending. Call `GET .../shop-requests?status=&scope=shop`. Opening a row shows creator, outlet, lines, and needed quantities. No add, edit, or remove on a submitted request
- [X] T019 [P] [US3] In `components/organisms/material-transfer-request-queue.tsx`, add Pending and Done controls. Default Pending. Done calls `GET ...?status=done&scope=all`. Opening a done row shows the same fields as a pending row. The mark-done button is absent when status is `done`

**Checkpoint**: Pending is the default on both screens. Done history remains. A shop user never sees another outlet.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Checks that span the stories. No new behavior.

- [X] T020 [P] Run lint on the files this feature changed (`lib/material-transfer/shop-item-request.ts`, `lib/material-transfer/shop-item-request-lookup.ts`, `lib/validation/material-transfer.ts`, the new `app/api/admin/store/material-transfer/shop-requests/` routes, `components/organisms/material-transfer-request-panel.tsx`, `components/organisms/material-transfer-request-queue.tsx`, `components/organisms/material-transfer-panel.tsx`, `app/(dashboard)/dashboard/store/material-transfer/receive/page.tsx`)
- [X] T021 Run `npm test -- lib/material-transfer/shop-item-request.test.ts` and confirm the cases in `specs/066-shop-item-requests/quickstart.md` pass
- [ ] T022 Walk the staff UAT steps in `specs/066-shop-item-requests/quickstart.md`. Do not run `npm run db:deploy:all` unless the user explicitly confirms. Not run in this implementation: needs a signed-in shop user, a stores user, and live ERP stock

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories**
- **US1 (Phase 3)**: Depends on Foundational. No dependency on US2 or US3
- **US2 (Phase 4)**: Depends on Foundational and on US1 `POST` so a pending row exists. The done route itself does not import the shop panel
- **US3 (Phase 5)**: Depends on US1 shop panel and US2 list/get/done routes
- **Polish (Phase 6)**: Depends on the stories you intend to ship

### User Story Dependencies

- **US1 (P1)**: After Foundational. MVP. Shop can submit without the stores queue
- **US2 (P1)**: After US1 create. Stores queue and mark done. Does not change draft editing
- **US3 (P2)**: After US2 list. Adds filters and the shop history list. Does not change submit or mark-done rules

### Within Each User Story

- Pure tests (T005) before the pure module (T006)
- Lookup module (T007) before suggest and lookup routes (T008, T009)
- Create route (T010) before the shop panel (T011)
- Panel (T011) before the receive-page tab (T012)
- List GET (T013) and done route (T014) before the stores queue (T015)
- Queue (T015) before the stores tab (T016)
- Scope check (T017) before the two filter UIs (T018, T019)

### Parallel Opportunities

- T004 and T005 can run together with T002 (different files)
- T008 and T009 can run together after T007
- T013 and T014 can run together after US1
- T018 and T019 can run together after T017
- T020 can run beside T021 once the code is done

---

## Parallel Example: User Story 1

```bash
# After T007 lookup module:
Task: "GET suggest route in app/api/admin/store/material-transfer/shop-requests/suggest/route.ts"
Task: "POST lookup route in app/api/admin/store/material-transfer/shop-requests/lookup/route.ts"
```

## Parallel Example: User Story 2

```bash
# After US1 create exists:
Task: "GET list in app/api/admin/store/material-transfer/shop-requests/route.ts"
Task: "GET one and POST done in app/api/admin/store/material-transfer/shop-requests/[id]/route.ts and done/route.ts"
```

## Parallel Example: User Story 3

```bash
# After T017:
Task: "Pending/Done on the shop panel in components/organisms/material-transfer-request-panel.tsx"
Task: "Pending/Done on the stores queue in components/organisms/material-transfer-request-queue.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2
2. Complete Phase 3 (shop tab, lookup, submit)
3. **STOP and VALIDATE**: Shop user can submit a pending request with the sound, the six stocks, and the under-4 mark
4. Demo that request in the database before building the stores queue

### Incremental Delivery

1. Setup + Foundational → models and pure rules
2. US1 → shop can ask (MVP)
3. US2 → stores can see and mark done, still no stock movement
4. US3 → pending/done history on both screens
5. Polish → lint, unit test, quickstart UAT

### Parallel Team Strategy

1. Together: T002–T006
2. Then one person on US1 (T007–T012)
3. After T010, a second person can start T013–T014 while the first finishes the shop panel
4. US3 filters split across the two panel files

---

## Notes

- [P] tasks = different files, no unfinished dependency
- [US1]–[US3] map to spec.md stories
- No new permission key. Outlet gate and `store.material_transfer.write` only
- Do not deploy the migration to vault, cosmo-dev, or cosmo-prod unless the user confirms
- Commit after each task or logical group
