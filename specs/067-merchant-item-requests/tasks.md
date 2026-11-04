# Tasks: Merchant New Item Requests

**Input**: Design documents from `/specs/067-merchant-item-requests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/merchant-item-requests.md, quickstart.md

**Tests**: Plan and quickstart require Vitest for brand normalize/match, status transitions, and priority-file parse. Those unit tasks are included. Not a full TDD-first cycle. No contract-test suite.

**Organization**: Phases follow spec stories: US1 merchant create (P1, MVP), US2 purchasing brand dashboard (P1), US3 already-have / closed (P1), US4 priority upload + export (P2). Inbox only — no Item Creation, ERP, or Shopify writes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US4 from spec.md
- Exact file paths in every task

## Path Conventions

Repo root Next.js app: `prisma/schema.prisma`, `lib/new-item-requests/`, `lib/validation/new-item-requests.ts`, `lib/rbac.ts`, `app/api/new-item-requests/`, `app/(dashboard)/dashboard/new-item-requests/`, `components/organisms/new-item-request-*.tsx`, `components/organisms/app-sidebar.tsx`

---

## Phase 1: Setup

**Purpose**: Confirm this is a new inbox next to dashboard products. No new app or package.

- [X] T001 Confirm `specs/067-merchant-item-requests/` contains plan.md, spec.md, research.md, data-model.md, contracts/merchant-item-requests.md, quickstart.md, and that `.specify/feature.json` `feature_directory` is `specs/067-merchant-item-requests`. Implementation git branch should be `feature/067-merchant-item-requests`

---

## Phase 2: Foundational (Blocking)

**Purpose**: Tables, permissions, validation, and pure brand/status helpers every story reads. **Blocks all user stories.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add enum `NewItemRequestStatus` (`open`, `already_have`, `closed`) and models `NewItemRequest` and `NewItemRequestBrandPriority` to `prisma/schema.prisma` per `specs/067-merchant-item-requests/data-model.md`. Request: `companyId`, `brandName`, `brandNameNormalized`, `brandIsExisting`, `description`, nullable `storeUrl`, nullable `imageUrl`, nullable `imagePublicId`, `status` default `open`, nullable `createdByUserId`, nullable `statusChangedByUserId`, nullable `statusChangedAt`, timestamps. Indexes `(companyId, status, createdAt)`, `(companyId, brandNameNormalized, status, createdAt)`, `(companyId, createdByUserId, createdAt)`. Priority: `companyId`, `brandName`, `brandNameNormalized`, `priority`, nullable `uploadedByUserId`, timestamps, `@@unique([companyId, brandNameNormalized])`. `onDelete: Cascade` from `Company`. User relations `onDelete: SetNull`, named `NewItemRequestCreatedBy`, `NewItemRequestStatusChangedBy`, `NewItemRequestBrandPriorityUploadedBy`, with back-relations on `model User` and `model Company` next to `shopItemRequests`. Do not change `ItemCreationRequest` or `ShopItemRequest`
- [X] T003 Create the migration with `npm run db:migrate:create` for those models and run `npm run db:generate`. Never `prisma migrate dev` or `npm run db:push` against vault, cosmo-dev, or cosmo-prod. Do not run `npm run db:deploy:all` unless the user explicitly confirms in this moment
- [X] T004 [P] In `lib/rbac.ts`, add `DEFAULT_PERMISSIONS` keys `new_item_requests.manage` ("Create new item requests and read own requests") and `new_item_requests.admin` ("See all new item requests, export, upload brand priority, and mark already have or closed"). Add `new_item_requests.admin` to the default **manager** `permissionKeys` array next to the purchasing keys. Do not add manage to viewer, finance, or hod
- [X] T005 [P] In `lib/validation.ts`, add `LIMITS.newItemRequestDescription` `{ min: 1, max: 1000 }`, `LIMITS.newItemRequestPriority` `{ min: 1, max: 100 }`, `LIMITS.newItemRequestImageMaxBytes` `5 * 1024 * 1024`, `LIMITS.newItemRequestPriorityFileMaxBytes` `8 * 1024 * 1024`. Add `lib/validation/new-item-requests.ts` Zod schemas per `specs/067-merchant-item-requests/contracts/merchant-item-requests.md`: suggest query `q`; create fields `brandName` (`trimmedString` 1..`LIMITS.vendorName.max`), `description` (1..1000), optional `storeUrl` empty→undefined else `http`/`https` URL max `LIMITS.logoUrl.max`; list query `status` default `open` (`open` | `already_have` | `closed`), optional `brand`, optional `createdFrom`/`createdTo` `YYYY-MM-DD`; status body `{ status: "already_have" | "closed" }`
- [X] T006 [P] Add `lib/new-item-requests/permissions.ts` with `NEW_ITEM_REQUESTS_PERMISSIONS = { manage: "new_item_requests.manage", admin: "new_item_requests.admin" }`, `canAdminNewItemRequests(context)` via `hasPermission` on admin, `canManageNewItemRequests(context)` true if admin **or** manage. Do not import `lib/item-creation/`
- [X] T007 [P] Add `lib/new-item-requests/brand.test.ts` for helpers that will live in `lib/new-item-requests/brand.ts`. Cases: `"  The   Ordinary "` normalizes to `"the ordinary"`; vendor match is case-insensitive; existing stores the vendor’s actual `name`; no vendor → new and stores the trimmed typed name; `q` length 1 yields no suggest hits
- [X] T008 Implement `normalizeBrandName`, `isExistingVendorName`, and `toStoredBrand` in `lib/new-item-requests/brand.ts` so `lib/new-item-requests/brand.test.ts` passes. Normalize: trim, collapse `/\s+/` to one space, lower-case. Keep Prisma vendor lookup (insensitive `name` + `companyId`) in `lib/new-item-requests/store.ts` later; this file stays pure string rules plus a small mapper that accepts `{ vendorName: string | null }`
- [X] T009 [P] Add `lib/new-item-requests/status.test.ts` for helpers in `lib/new-item-requests/status.ts`. Cases: `open` → `already_have` allowed; `open` → `closed` allowed; same-status is idempotent (`ok: "noop"`); `already_have` → `closed` rejected; `closed` → `already_have` rejected; `closed` → `open` rejected
- [X] T010 Implement `assertStatusChange(from, to)` in `lib/new-item-requests/status.ts` so `lib/new-item-requests/status.test.ts` passes. Return `{ ok: "change" }` | `{ ok: "noop" }` | `{ ok: "reject" }`. No SKU argument

**Checkpoint**: Prisma client knows the new models. Permissions exist in the catalog. Pure brand/status tests pass. No database deploy. No API or screen yet.

---

## Phase 3: User Story 1 — Merchant logs a customer ask (Priority: P1) 🎯 MVP

**Goal**: A manage user opens New Item Requests, types a brand (suggestions from vendors, existing shows current priority if a priority row exists, unknown is new), adds description, optional link and photo, submits, and sees only their own requests.

**Independent Test**: As manage, submit one existing-vendor request (no link/image) and one new-brand request with link + JPEG. Own list shows both. A second manage user cannot see them. Empty description does not submit. `q` of one letter returns no suggestions.

### Implementation for User Story 1

- [X] T011 [US1] Add `lib/new-item-requests/store.ts` (`server-only`). Functions: `suggestBrands(companyId, q)` — vendors `name contains` case-insensitive, min 2 chars else `[]`, take 15, order by name, join `NewItemRequestBrandPriority` for `priority` (null if none); `createNewItemRequest(context, input)` — require `canManageNewItemRequests`, resolve vendor with `mode: "insensitive"`, set `brandIsExisting` on the server (ignore client flag), upload optional image via `cloudinary.uploader.upload` folder `new-item-requests/{companyId}` (jpeg/png/webp/gif, max `LIMITS.newItemRequestImageMaxBytes`); if a file is present and upload fails, throw and insert nothing; `listOwnRequests(context, filters)` — `createdByUserId` = caller, cap 300, newest first, attach current priority for existing brands; `getRequest(context, id)` — company match; manage-only and not owner → throw not-found (no existence leak). Do not write Item Creation rows
- [X] T012 [P] [US1] Add `GET` `app/api/new-item-requests/brands/suggest/route.ts` per `specs/067-merchant-item-requests/contracts/merchant-item-requests.md`. `requireAnyPermission` of manage + admin. `q` shorter than 2 returns `{ hits: [] }`. 200 `{ hits: [{ name, priority }] }`
- [X] T013 [US1] Add `GET`/`POST` `app/api/new-item-requests/route.ts`. Auth: manage or admin. POST `multipart/form-data` (`brandName`, `description`, optional `storeUrl`, optional `image`). Validate with `lib/validation/new-item-requests.ts`. 413 if image too large. 200 `{ request }`. GET for **manage-only** returns `{ requests }` via `listOwnRequests` (`status` default `open`). Admin GET shape for brand groups is US2 — until then, if the caller is admin, still return `{ requests }` of **all** company rows with the same filters (temporary) or skip and have GET detect admin in T018; do **not** let manage see others. Creator is the caller
- [X] T014 [P] [US1] Add `GET` `app/api/new-item-requests/[id]/route.ts`. Manage or admin. `cuidSchema` for `id`. Manage not-owner → 404. 200 `{ request }`
- [X] T015 [P] [US1] Add `components/organisms/new-item-request-form.tsx`. Brand input calls suggest after 2 characters. Picking a hit labels **existing** and shows `priority` or none. A name not in hits can still submit and shows **new**. Description required. Optional https link. Optional image input (accept jpeg/png/webp/gif). Submit `POST /api/new-item-requests` as FormData. Empty list of fields: disable submit without brand+description. One `busyKey`, disable inputs while busy, `Loader2` plus progress label on the button, `notify` success/error. No Item Creation control. No SKU field. No customer name/phone
- [X] T016 [P] [US1] Add `components/organisms/new-item-request-own-list.tsx`. Load `GET /api/new-item-requests?status=open` (manage). Each row: brand, existing/new, priority if existing, description, link, image thumb, status, created at. Opening a row uses `GET /[id]`. After submit, prepend or reload
- [X] T017 [US1] Add `components/organisms/new-item-request-panel.tsx` that renders the form + own list for manage (and for admin until US2 adds the board). Add `app/(dashboard)/dashboard/new-item-requests/page.tsx`: `requireAnyPermission` of the two keys; 401 → `/login`; 403 → `PermissionDeniedCard`; server-load own (or all-for-admin) initial requests and pass `initialRequests` + `isAdmin`. `export const dynamic = "force-dynamic"`. In `components/organisms/app-sidebar.tsx`, show **New item requests** → `/dashboard/new-item-requests` under **Order Management** when `new_item_requests.manage` is present **and** `new_item_requests.admin` is not. Include this href in the Order Management group-visibility condition. Icon: `ClipboardList` is fine

**Checkpoint**: A manage user can submit requests and see only their own. Admin can open the page and create. Brand dashboard, status marks, export, and priority upload are not in the UI yet.

---

## Phase 4: User Story 2 — Purchasing sees demand brand by brand (Priority: P1)

**Goal**: Admin opens a dashboard grouped by brand with open counts, existing vs new (live vendor match), current priority, and a drill-in of each request (who, date, description, link, image, frozen existing/new).

**Independent Test**: Three open requests — two existing (same vendor) and one new. Admin sees two brand rows, counts 2 and 1, existing vs new, priority on the existing brand when a file row exists. Opening the existing brand lists both requests as separate rows with creator and date. Manage cannot open the brand dashboard API (403).

### Implementation for User Story 2

- [X] T018 [US2] In `lib/new-item-requests/store.ts`, add `listBrandGroups(context, filters)` (admin only) grouped by `brandNameNormalized` for the current `status` (default `open`) and optional dates; `requestCount`; live `isExisting` from vendor match; `priority` from the current file only when existing; display `brandName` = vendor name if matched else latest request name; order count desc then name. Add `listRequestsForBrand(context, brandNormalized, filters)` cap 500, newest first. Change `GET` `app/api/new-item-requests/route.ts`: admin without `brand` returns `{ brands }`; manage still `{ requests }` own-only. Do not merge duplicate asks
- [X] T019 [P] [US2] Add `GET` `app/api/new-item-requests/brands/[brandNormalized]/route.ts`. Admin only (manage 403). Same status/date query. 200 `{ brand, requests }`. 404 if that normalized name has no rows in the company at any status
- [X] T020 [US2] Add `components/organisms/new-item-request-brand-board.tsx`. Load admin `GET /api/new-item-requests?status=open`. Each brand row: name, existing/new, priority, count. Click loads `GET .../brands/{brandNormalized}`. Detail: creator, date, description, link, image, frozen `brandIsExisting`, status. Default filter open
- [X] T021 [US2] In `components/organisms/new-item-request-panel.tsx`, if `isAdmin` show form + brand board (own-list optional/hidden). In `components/organisms/app-sidebar.tsx`, add the same href under **Purchasing** when `new_item_requests.admin` is present, and include it in `canViewPurchasing`. Admin/super_admin therefore only see the Purchasing entry (Order Management slot from T017 stays hidden when admin is present)

**Checkpoint**: Admin sees brand counts and drill-in. Manage still only sees own rows. Status buttons and export are not required yet.

---

## Phase 5: User Story 3 — Admin marks already have and closed (Priority: P1)

**Goal**: Admin marks an open request already have (status only, no SKU) or closed. Those leave the default open counts and stay in history filters. The creating merchant sees the new status. Manage cannot change status.

**Independent Test**: Mark one open request already-have and one closed. Open counts drop. Filters show history. Manage sees the status on their list and cannot POST status (403). A second mark to the same status stays that status. No SKU picker.

### Implementation for User Story 3

- [X] T022 [US3] Add `setNewItemRequestStatus(context, id, status)` in `lib/new-item-requests/store.ts` using `assertStatusChange`. Admin only. Conditional update: from `open` to the target, set `statusChangedByUserId` and `statusChangedAt`. Same status already stored → return the row (`noop`). Cross-status (`already_have` ↔ `closed`) throw conflict. Missing in company → not-found. Add `POST` `app/api/new-item-requests/[id]/status/route.ts`. JSON `{ status }`. 200 `{ request }`. Manage 403. 409 on reject. No SKU in the body. Do not call Item Creation
- [X] T023 [US3] In `components/organisms/new-item-request-brand-board.tsx`, on an open request show **Already have** and **Closed** actions. Call `POST .../[id]/status`. 409 → `notify.error` and reload. After success, reload the brand group so the open count drops. Add Open / Already have / Closed filters (default Open) on the board, passing `status` to GET. `busyKey`, `Loader2`, disable peers while in flight
- [X] T024 [US3] In `components/organisms/new-item-request-own-list.tsx`, show current status on each row. Add the same three filters so a merchant can see already-have/closed on **their** rows. No status buttons for manage

**Checkpoint**: Open counts stay useful. History remains. Manage cannot mark. US1 create still works.

---

## Phase 6: User Story 4 — Admin uploads brand priority and exports (Priority: P2)

**Goal**: Admin replaces the brand-priority list with a spreadsheet. Existing-brand suggestions and the dashboard use it. Admin exports the current view to xlsx. Manage cannot upload or export.

**Independent Test**: Upload a file that sets vendor A to a known priority; suggestions and the dashboard show it; a vendor not on the file stays existing with no priority; a junk file with no usable rows is rejected and the previous list remains. Export already-have includes creator, brand, existing/new, priority, description, link, image URL, status. Manage POST priority / GET export → 403.

### Implementation for User Story 4

- [X] T025 [P] [US4] Add `lib/new-item-requests/priority-parse.test.ts` for `lib/new-item-requests/priority-parse.ts`. Cases: header row matching brand/brand name/vendor + priority/priority status (ignore case/spaces); blank brand or priority skipped; last duplicate normalized brand wins; zero usable rows → `{ ok: false, error }`; a good sheet → `{ ok: true, rows: [{ brandName, brandNameNormalized, priority }] }`
- [X] T026 [US4] Implement `parseBrandPrioritySheet(rows: unknown[][])` in `lib/new-item-requests/priority-parse.ts` so T025 passes. Use `normalizeBrandName` from `lib/new-item-requests/brand.ts`. Priority text trimmed, max `LIMITS.newItemRequestPriority.max`
- [X] T027 [US4] Add `GET`/`POST` `app/api/new-item-requests/priority/route.ts`. Admin only. GET `{ count, uploadedAt }` (`uploadedAt` null when count 0). POST multipart field `file` (xlsx/xls/csv, max `LIMITS.newItemRequestPriorityFileMaxBytes`). Parse with `xlsx` (`SheetNames[0]`, `sheet_to_json` header:1) then `parseBrandPrioritySheet`. Zero usable rows → 400, **do not delete**. Success: transaction `deleteMany` for `companyId` then `createMany` of parsed rows, `uploadedByUserId` = caller. 200 `{ count }`
- [X] T028 [P] [US4] Add `GET` `app/api/new-item-requests/export/route.ts`. Admin only. Same query as the list (`status`, optional `brand`, dates). Build rows via `listRequestsForBrand` or company-wide list (cap 5_000) with current priority. Write `xlsx` columns: Created at, Creator, Brand, Existing or new, Priority, Description, Link, Image URL, Status, Status changed at, Status changed by. Empty view: headers only. Filename `new-item-requests-{status}-{date}.xlsx`. Manage 403
- [X] T029 [US4] In `components/organisms/new-item-request-brand-board.tsx` (or a thin admin toolbar in `new-item-request-panel.tsx`), add priority file upload (`accept` xlsx/xls/csv) calling `POST .../priority` and an Export button that downloads `GET .../export` with the current filters. Show current priority `count` from GET. Manage UI has neither control. `busyKey` / `Loader2` / `notify`

**Checkpoint**: Priority file drives suggest + dashboard. Admin can export the view. Manage still blocked.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Checks that span the stories. No new behavior.

- [X] T030 [P] Run lint on the files this feature changed (`lib/new-item-requests/`, `lib/validation/new-item-requests.ts`, `lib/validation.ts`, `lib/rbac.ts`, `app/api/new-item-requests/`, `app/(dashboard)/dashboard/new-item-requests/page.tsx`, `components/organisms/new-item-request-*.tsx`, `components/organisms/app-sidebar.tsx`)
- [X] T031 Run `npm test -- lib/new-item-requests` and confirm the cases in `specs/067-merchant-item-requests/quickstart.md` unit checks pass
- [X] T032 Confirm no import from `lib/item-creation/` and no control that opens `/dashboard/products/item-creation` from the new-item-request components. Already-have POST body has no SKU field
- [ ] T033 Walk the staff UAT steps in `specs/067-merchant-item-requests/quickstart.md`. Do not run `npm run db:deploy:all` unless the user explicitly confirms. Not run here: needs a signed-in manage user, an admin user, Cloudinary, and at least one Vendor

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories**
- **US1 (Phase 3)**: Depends on Foundational. No dependency on US2–US4. Priority join may return null until US4
- **US2 (Phase 4)**: Depends on Foundational and on US1 create/list so rows exist
- **US3 (Phase 5)**: Depends on US2 brand drill-in (buttons live on those rows) and US1 own list (status display)
- **US4 (Phase 6)**: Depends on Foundational tables. Can start after US1 suggest exists (priority column). Export filters should match US2/US3 query params
- **Polish (Phase 7)**: Depends on the stories you intend to ship

### User Story Dependencies

- **User Story 1 (P1)**: After Phase 2. MVP
- **User Story 2 (P1)**: After US1 POST so there is demand to group
- **User Story 3 (P1)**: After US2 board (and US1 list for merchant-visible status)
- **User Story 4 (P2)**: After US1 suggest + US2 board query params; parse helpers have no UI dependency

### Within Each User Story

- Pure helpers before store
- Store before routes
- Routes before UI
- Story complete before the next priority unless noted [P]

### Parallel Opportunities

- T004, T005, T006, T007, T009 after T002/T003 (T007/T009 do not need the client; they can start after T002 is sketched)
- T012 and T014 after T011
- T015 and T016 after T013
- T019 after T018
- T025 after T008 (`normalizeBrandName`)
- T028 after T018 list helpers

---

## Parallel Example: User Story 1

```bash
# After T011 store exists:
Task: "GET suggest route in app/api/new-item-requests/brands/suggest/route.ts"
Task: "GET by id in app/api/new-item-requests/[id]/route.ts"

# After POST/GET list exists:
Task: "Form in components/organisms/new-item-request-form.tsx"
Task: "Own list in components/organisms/new-item-request-own-list.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Manage user can create and see only own requests
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → tables and permissions
2. US1 → merchant capture (MVP)
3. US2 → purchasing brand dashboard
4. US3 → already have / closed
5. US4 → priority file + export
6. Polish → lint, unit tests, UAT

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Then: A on US1 UI, B on US2 grouping once create works, C on US4 parse (T025–T026) in parallel with US1

---

## Notes

- [P] tasks = different files, no incomplete dependencies
- [Story] label maps to spec.md US1–US4
- Do not `db:deploy:all` or push to `main` without an in-the-moment ask
- Inbox only: no Item Creation ticket, no SKU on already-have
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
