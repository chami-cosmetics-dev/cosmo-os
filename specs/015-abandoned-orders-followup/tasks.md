# Tasks: Abandoned Orders Follow-up

**Input**: Design documents from `/specs/015-abandoned-orders-followup/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new feature file layout and shared constants used across stories.

- [X] T001 [P] Create new directories for abandoned-orders routes (`app/api/admin/abandoned-orders/*`) and page (`app/(dashboard)/dashboard/orders/abandoned-orders/`)
  - `app/api/admin/abandoned-orders/page-data/`
  - `app/api/admin/abandoned-orders/[id]/follow-up/`
  - `app/api/admin/abandoned-orders/export/`
  - `app/api/cron/`
  - `app/(dashboard)/dashboard/orders/abandoned-orders/`
  - `components/organisms/`
  - `lib/page-data/`
  - `lib/`
- [X] T002 [P] Add shared abandoned-orders constants in `lib/abandoned-orders-constants.ts` (follow-up status values + customer response values + display labels)
- [X] T003 [P] Add shared DTO/types in `lib/page-data/abandoned-orders-types.ts` (list response row shape, filters shape, CSV column mapping types)

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database + RBAC + core logic that all user stories depend on.

- [X] T004 Create Prisma models in `prisma/schema.prisma`:
  - `ShopifyAbandonedCheckout`
  - `CompanyAbandonedCheckoutSync`
  - include fields, unique constraint, and indexes consistent with `data-model.md`
- [X] T005 Create and deploy migration for abandoned-orders tables:
  - Run `npm run db:migrate:create` to generate a new migration under `prisma/migrations/`
  - Run `npm run db:deploy:all` to deploy to `vault`, `cosmo-dev`, and `cosmo-prod`
- [X] T006 Add RBAC permissions in `lib/rbac.ts`:
  - Add `abandoned_orders.read` and `abandoned_orders.manage` to `DEFAULT_PERMISSIONS`
  - Ensure descriptions align with the spec (view/export vs follow-up update)
- [X] T007 Add Zod validation schemas in `lib/validation.ts` for this feature:
  - follow-up status schema (`pending|follow_up|closed`)
  - customer response schema (`no_more_interest|purchased_elsewhere|changed_my_mind|recovered_sale|no_response`)
  - list query schema (date range, follow-up status, response, search, page, limit)
  - follow-up PATCH body schema (response required when status is `closed`, `remark` optional + trimmed + bounded)
- [X] T008 Add audit log action key in `lib/audit-log.ts`:
  - Add a new `AUDIT_LOG_ACTIONS` value for abandoned checkout follow-up (e.g. `abandoned_order_follow_up_saved`)
  - Add it into an appropriate `AUDIT_LOG_ACTION_GROUPS` entry (use the existing `orders` group if consistent)
- [X] T009 Implement Shopify abandoned-checkout sync in `lib/shopify-abandoned-checkouts.ts`:
  - Implement GraphQL Admin API call to Shopify `abandonedCheckouts` (API version `2024-10`)
  - Fetch only last 7 days of abandoned checkouts
  - Upsert rows into `ShopifyAbandonedCheckout` using `(companyId, shopifyCheckoutGid)` identity
  - Persist sync watermark into `CompanyAbandonedCheckoutSync`
  - Implement recovery detection (e.g. `completedAt` set) and auto-close with `recovered_sale` only when the row isn’t already manually closed with a different response
- [X] T010 Implement abandoned-orders list query + filtering in `lib/page-data/abandoned-orders.ts`:
  - Provide a function that accepts `companyId`, filters, and pagination
  - Returns items ordered by `abandonedAt DESC`
  - Supports filtering by `followUpStatus` and `customerResponse` and supports search by name/phone/email/cart summary
- [X] T011 Implement follow-up update rules in `lib/abandoned-checkout-follow-up.ts`:
  - Validate payload and enforce close requires `customerResponse`
  - Allow reopen from `closed` to `follow_up`
  - Update `followUpStatus`, `customerResponse`, `remark`, and `lastFollowUpById/lastFollowUpAt`
  - Write an audit log entry using `writeAuditLog`
- [X] T012 Implement cron sync endpoint in `app/api/cron/abandoned-checkouts-sync/route.ts`:
  - Authorize by `CRON_SECRET` like existing cron routes
  - Iterate companies with at least one `CompanyLocation.shopifyAdminStoreHandle` set
  - Call `syncAbandonedCheckoutsForCompany(companyId)` and return per-company counters
- [X] T013 Add cron schedule in `vercel.json`:
  - Add a cron entry for `/api/cron/abandoned-checkouts-sync` running approximately every 30 minutes

## Phase 3: User Story 1 - View abandoned checkouts in a dedicated sidebar page (Priority: P1) 🎯 MVP

**Goal**: A permitted user can open the Abandoned Orders page and see the list (read-only) with filters and pagination.

**Independent Test**: With `abandoned_orders.read` permission, open `/dashboard/orders/abandoned-orders` and verify rows load within ~5 seconds and reflect the most recent abandoned checkouts first.

- [X] T014 [US1] Implement list API `GET /api/admin/abandoned-orders/page-data` in `app/api/admin/abandoned-orders/page-data/route.ts`:
  - Use `requirePermission("abandoned_orders.read")`
  - Parse filters via the new schemas in `lib/validation.ts`
  - Trigger sync if `CompanyAbandonedCheckoutSync.lastSyncedAt` is null or older than ~30 minutes
  - Return `items`, `pagination`, `sync.lastSyncedAt`, and `sync.lastSyncError` (when applicable)
- [X] T015 [US1] Implement server page component in `app/(dashboard)/dashboard/orders/abandoned-orders/page.tsx`:
  - Enforce permissions server-side with `requirePermission("abandoned_orders.read")`
  - Compute `canManage` with `hasPermission(context, "abandoned_orders.manage")`
  - Fetch initial list data via `lib/page-data/abandoned-orders.ts` (and sync if stale, matching page-data behavior)
  - Render the client panel with `initialData` and `canManage`
- [X] T016 [US1] Create Abandoned Orders panel UI in `components/organisms/abandoned-orders-panel.tsx` (client component):
  - Render filters (date range, follow-up status, customer response, search)
  - Render table/list with at minimum: abandoned date, customer name, phone, email, cart summary, checkout total, follow-up status, customer response, last updated by/at
  - Default filters: show `pending` + `follow_up` only; `closed` excluded unless user includes it
  - Hide follow-up editing controls when `canManage` is false (read-only mode)
- [X] T017 [US1] Add sidebar navigation item in `components/organisms/app-sidebar.tsx` under Order Management:
  - Show `Abandoned Orders` link only when user has `abandoned_orders.read`
  - Link to `/dashboard/orders/abandoned-orders`
- [X] T018 [US1] Wire client refetch behavior in `components/organisms/abandoned-orders-panel.tsx`:
  - On filter/page/limit changes, call `GET /api/admin/abandoned-orders/page-data` with the current filter query params
  - Update the table rows and pagination from the response
- [X] T019 [US1] Add empty + error states to `components/organisms/abandoned-orders-panel.tsx`:
  - Empty set message when no rows match filters
  - Show a visible sync error banner when `sync.lastSyncError` is present, while still displaying cached DB rows

## Phase 4: User Story 2 - Follow up and record customer outcome (Priority: P1)

**Goal**: A permitted manager can update follow-up status, select a customer response, add optional remarks, and save.

**Independent Test**: With `abandoned_orders.manage`, open a row, set status to `Closed`, provide a customer response, save, refresh, and verify values persist and the row obeys default filters.

- [X] T020 [US2] Implement follow-up PATCH API in `app/api/admin/abandoned-orders/[id]/follow-up/route.ts`:
  - Enforce `requirePermission("abandoned_orders.manage")`
  - Validate `id` via `cuidSchema`
  - Validate body via the follow-up PATCH schema in `lib/validation.ts`
  - Call `lib/abandoned-checkout-follow-up.ts` to persist and audit
  - Return updated row data on success; return validation errors clearly on 400
- [X] T021 [US2] Add follow-up editor UI to `components/organisms/abandoned-orders-panel.tsx`:
  - Row action opens a drawer/modal with fields:
    - follow-up status: `Pending|Follow up|Closed`
    - customer response dropdown (shown; required when setting status to `Closed`)
    - optional remark text area
  - Reopen behavior: if status is changed from `Closed` to `Follow up`, allow saving
- [X] T022 [US2] Implement a reusable form component in `components/molecules/abandoned-order-follow-up-form.tsx`:
  - Export a form that renders status + response + remark inputs
  - Enforce client-side UX validation (response required when closing) but keep server-side enforcement in the route
- [X] T023 [US2] Add save action UX in `components/organisms/abandoned-orders-panel.tsx`:
  - Use action-loading UX (busy state on save button and disable inputs while saving)
  - On success: `notify.success` with confirmation and refresh the list rows for the updated item
  - On failure: `notify.error` with a helpful message and keep the editor open
- [X] T024 [US2] Ensure list updates after follow-up save in `components/organisms/abandoned-orders-panel.tsx`:
  - Updated row reflects new `followUpStatus` and `customerResponse`
  - If user closes a row (and it becomes `closed`), it disappears from the default view; if reopened, it returns
- [X] T025 [US2] Enforce permission separation between UI and PATCH route (`components/organisms/abandoned-orders-panel.tsx`, `app/api/admin/abandoned-orders/[id]/follow-up/route.ts`):
  - Viewer users can view the list but must not be able to trigger PATCH (UI hidden/disabled, and route returns 403)
- [X] T026 [US2] Ensure server-side validation rules in `lib/abandoned-checkout-follow-up.ts` are correct:
  - Response required when `followUpStatus=closed`
  - Reopen allowed (`closed` -> `follow_up`)

## Phase 5: User Story 3 - Export abandoned orders to CSV (Priority: P2)

**Goal**: A permitted user can export the full filtered result set to CSV.

**Independent Test**: With `abandoned_orders.read`, apply filters that return >1 row, click export, and verify CSV contains all filtered rows (not only current page).

- [X] T027 [US3] Implement CSV export API in `app/api/admin/abandoned-orders/export/route.ts`:
  - Enforce `requirePermission("abandoned_orders.read")`
  - Parse query params using the same list filter schemas as page-data
  - Export all rows matching filters (ignore pagination page size), but enforce a max row limit consistent with `SC-004` (e.g. 1000)
  - Use `buildCsv` and set `Content-Type` and `Content-Disposition: attachment; filename="abandoned-orders.csv"`
  - If empty, return a 400 JSON error with a clear message
- [X] T028 [US3] Add Export button in `components/organisms/abandoned-orders-panel.tsx`:
  - Build the export query params from the current filter state
  - Fetch the export route, create a blob URL, and download via an `<a>` click (matching patterns used in other export panels)
  - Show a loading/busy state while exporting
- [X] T029 [US3] Ensure export uses the current filters, not the default view (`components/organisms/abandoned-orders-panel.tsx`, `app/api/admin/abandoned-orders/export/route.ts`):
  - If the user includes `closed` via filter, CSV must include `closed` rows as well
  - If user selects a specific customer response, CSV must match it
- [X] T030 [US3] Ensure export permission behavior in `app/api/admin/abandoned-orders/export/route.ts` and the export UI:
  - Viewer can export; if a user loses permission, direct call returns 403 and the UI shows an error toast
- [X] T031 [US3] Ensure export empty-set handling in `app/api/admin/abandoned-orders/export/route.ts` and export UI:
  - If export route returns 400 `{ error: ... }`, show `notify.error(...)` and do not generate/download a file

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: UX hardening and small follow-through improvements that affect multiple stories.

- [X] T032 [P] Add responsive table layout and skeleton states in `components/organisms/abandoned-orders-panel.tsx` (reuse existing UI primitives)
- [X] T033 [P] Add/adjust formatting helpers for currency + date/time in `components/organisms/abandoned-orders-panel.tsx` (reuse existing helpers where possible)
- [X] T034 [P] Run a manual verification pass using `specs/015-abandoned-orders-followup/quickstart.md` scenarios and update the quickstart if any steps change

## Dependencies & Execution Order

- Phase 2 (Foundational) must complete before any user story tasks start.
- Recommended story execution order: US1 (MVP) → US2 → US3.
- US2 and US3 both depend on the panel UI from US1 (shared filters and row display), so implement US1 first.

## Parallel Opportunities

- Phase 1 tasks (`T001`–`T003`) can run in parallel (different files).
- After Phase 2, US1 tasks `T014`, `T016`, and `T017` can be implemented in parallel by different developers if coordination is available on shared types/constants.

## Parallel Example: User Story 1

```text
T014 Implement page-data route
T016 Create abandoned-orders-panel UI (read-only)
T017 Add sidebar navigation item
```

## Parallel Example: User Story 2

```text
T020 Implement PATCH API route
T022 Build follow-up form component
```

## Parallel Example: User Story 3

```text
T027 Implement CSV export route
T028 Add export button and download handler
```

