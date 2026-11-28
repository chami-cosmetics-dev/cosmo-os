# Tasks: CityPak Delivery Failed Reminders

**Input**: Design documents from `/specs/071-citypak-delivery-failed/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Spec does not require TDD-first. Plan calls for Vitest on eligibility, ownership/DM, href — unit tests in Polish phase.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 maps to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Next.js monolith root: `lib/`, `components/`, `app/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align category identity with contracts before code wiring

- [x] T001 Confirm category key `citypak_delivery_failed`, permission `reminders.citypak_delivery_failed`, and UI label **City Pack Delivery Failed** against `specs/071-citypak-delivery-failed/contracts/citypak-delivery-failed.md` (no new packages/dirs required)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register category + permission + types so every story can compile against the same identity — MUST finish before US work

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T002 Add `citypak_delivery_failed` entry to `REMINDER_BUBBLE_PERMISSIONS` and `REMINDER_BUBBLE_LABELS` ("City Pack Delivery Failed") in `lib/reminder-permissions.ts`
- [x] T003 [P] Extend `TaskReminderCategory` union with `citypak_delivery_failed` in `lib/task-reminders.ts`
- [x] T004 [P] Add `citypak_delivery_failed` to `ALL_TASK_REMINDER_CATEGORIES` in `lib/task-reminder-access.ts` (visibility via `reminders.citypak_delivery_failed`)
- [x] T005 [P] Add `citypak_delivery_failed` to `CATEGORY_ORDER`, `CATEGORY_LABELS`, and `CATEGORY_NODE_LABELS` in `components/molecules/task-reminder-bubbles.tsx`

**Checkpoint**: Category permission + types + bubble chrome registered; fetch still empty until US1

---

## Phase 3: User Story 1 - Merchant sees CityPak delivery-failed orders (Priority: P1) 🎯 MVP

**Goal**: Matched CityPak waybills with `attempt_failed` appear under **City Pack Delivery Failed**, merchant-scoped via existing ownership helpers; admins with permission see company-wide

**Independent Test**: Merchant A with attempt-failed matched waybill sees it; merchant B does not; in-transit/delivered rows absent; empty state OK when zero

### Implementation for User Story 1

- [x] T006 [US1] Implement eligibility query + mapper for attempt-failed matched `OrderWaybill` (`source = citypak_api`, JSON `citypakStatus = attempt_failed`, non-null `orderId`) producing `TaskReminder` items (`id` `citypak_delivery_failed:{waybillId}`, title/body with invoice + waybillNo, waitingHours from `citypakStatusCheckedAt`/fallback) in `lib/task-reminders.ts` (reuse `CITYPAK_WAYBILL_SOURCE` from `lib/citypak-api.ts`)
- [x] T007 [US1] Apply merchant audience filter with `merchantOwnsReminderOrder` + coupon load pattern (mirror `fetchMerchantDispatchPendingReminders`) and company-wide path for admin audience in `lib/task-reminders.ts`
- [x] T008 [US1] Wire fetch into aggregate `getTaskReminders` (or equivalent): `canSeeTaskReminderCategory(..., "citypak_delivery_failed")`, push reminders, set `categoryCounts`, include in capped-count set if applicable in `lib/task-reminders.ts`
- [x] T009 [US1] Point reminder `href` at `/dashboard/fulfillment/waybill-lookup` with at least invoice-identifying query available (full `waybillId` deep-link lands in US3); ensure list renders under new tab in `components/molecules/task-reminder-bubbles.tsx` without extra email UI

**Checkpoint**: MVP — merchants/admins with permission see attempt-failed CityPak rows merchant-wise / company-wide; no email controls

---

## Phase 4: User Story 2 - DM General orders for Sandali (Priority: P1)

**Goal**: DM-only orders with CityPak attempt-failed appear for users who hold DM coupon codes (Sandali / MER115 family), alongside their personal MER failures

**Independent Test**: DM-only attempt-failed waybill visible to Sandali (DM coupon holder); absent for merchant without DM coupons; Sandali still sees personal MER failures too

### Implementation for User Story 2

- [x] T010 [US2] Extend ownership filter in `lib/task-reminders.ts` so DM-only orders (`isDmOnlyMerchantTracking` from `lib/merchant-dm-sales.ts`) are included when the viewer’s `couponCodes` / `wholesaleCouponCodes` contain any `isDmCouponCode` match — do not hardcode Sandali user id
- [x] T011 [US2] Ensure admin company-wide path still returns DM-only failures without requiring DM coupons on the admin user in `lib/task-reminders.ts`

**Checkpoint**: FR-004 satisfied via coupon-based DM controller mapping

---

## Phase 5: User Story 3 - Click opens Waybill Details (Priority: P1)

**Goal**: Reminder click opens existing Waybill Details dialog for that CityPak waybill on waybill-lookup

**Independent Test**: Click reminder → URL has `waybillId` → details dialog shows correct invoice/waybill/timeline; missing permission uses existing page denial

### Implementation for User Story 3

- [x] T012 [US3] Extend `taskReminderHref` (and exports) to accept `waybillId` in `lib/task-reminder-links.ts`
- [x] T013 [US3] Set City Pack Delivery Failed reminder `href` to `/dashboard/fulfillment/waybill-lookup?waybillId={id}` (optional `orderId`) in `lib/task-reminders.ts`
- [x] T014 [US3] On mount/searchParams change in `components/organisms/fulfillment-pages/waybill-lookup.tsx`, resolve `waybillId` and open `selectedDetails` Waybill Details dialog for that company waybill (toast/no-crash if missing)

**Checkpoint**: Reminder → Waybill Details loop works end-to-end

---

## Phase 6: User Story 4 - List updates when CityPak status changes (Priority: P2)

**Goal**: When stored status leaves `attempt_failed`, item disappears on next reminder refresh (status-derived membership only)

**Independent Test**: attempt_failed in list → refresh status to delivered/returned → reload reminders → gone; later attempt_failed again → reappears

### Implementation for User Story 4

- [x] T015 [US4] Harden eligibility in `lib/task-reminders.ts` so only exact `attempt_failed` qualifies (exclude `returned`, `delivered`, null/unchecked, other statuses) — no dismiss table
- [x] T016 [US4] Confirm no caching path keeps stale category membership across reminder API refreshes for `citypak_delivery_failed` in `lib/task-reminders.ts` / reminder API route consumers

**Checkpoint**: FR-008 — membership tracks last stored CityPak status

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Tests, lint, quickstart validation; email remains out of scope

- [x] T017 [P] Add Vitest cases for eligibility + merchant isolation + DM coupon attribution in `lib/task-reminders.test.ts`
- [x] T018 [P] Add Vitest cases for `waybillId` href helper in `lib/task-reminder-links.test.ts` (create file if missing)
- [x] T019 [P] Add Vitest cases for `reminders.citypak_delivery_failed` visibility in `lib/task-reminder-access.test.ts`
- [x] T020 Run `npm test` for touched reminder tests and lint changed files; walk `specs/071-citypak-delivery-failed/quickstart.md` UAT checklist (including negative: no send-email on tab)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None
- **Foundational (Phase 2)**: After Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After US1 fetch/filter exists (extends ownership in same file)
- **US3 (Phase 5)**: After US1 reminders exist (needs items to click); can parallelize link helper work with US2 if careful on `lib/task-reminders.ts` merge
- **US4 (Phase 6)**: After US1 eligibility; small hardening pass
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Foundation only — MVP
- **US2 (P1)**: Builds on US1 ownership filter
- **US3 (P1)**: Builds on US1 href/list; deep-link UI independent of DM rule
- **US4 (P2)**: Builds on US1 eligibility predicate

### Parallel Opportunities

- T003, T004, T005 after T002 (or carefully parallel if coordinating the category string)
- T017, T018, T019 in Polish
- US3 `task-reminder-links.ts` (T012) can start once category exists, before waybill-lookup (T014)
- US2 and US3 conflict on `lib/task-reminders.ts` — serialize edits there

---

## Parallel Example: User Story 1

```bash
# After foundation:
Task: "Implement eligibility query + mapper in lib/task-reminders.ts"
# Then sequential in same file:
Task: "Apply merchant/admin audience filter in lib/task-reminders.ts"
Task: "Wire into getTaskReminders aggregate in lib/task-reminders.ts"
```

## Parallel Example: Polish

```bash
Task: "Vitest eligibility/ownership/DM in lib/task-reminders.test.ts"
Task: "Vitest waybillId href in lib/task-reminder-links.test.ts"
Task: "Vitest permission visibility in lib/task-reminder-access.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1 (fetch + merchant scope + bubble tab)
3. **STOP**: Validate merchant A/B isolation with an attempt-failed waybill
4. Then US2 (DM), US3 (deep-link), US4 (status clear), Polish

### Incremental Delivery

1. Foundation → empty tab visible to permitted users
2. US1 → actionable merchant list (MVP)
3. US2 → Sandali/DM coverage
4. US3 → Waybill Details navigation
5. US4 → status-driven cleanup confidence
6. Polish → Vitest + quickstart UAT

### Parallel Team Strategy

1. Pair finishes Foundation together
2. Dev A: US1 → US2 (reminder fetch/ownership)
3. Dev B: T012 links + T014 waybill-lookup deep-link (merge href in US3 after US1)
4. Shared Polish tests

---

## Notes

- No Prisma migration
- No send-email (FR-009)
- Do not hardcode Sandali user id — DM coupon codes only
- [P] = different files / no incomplete deps
- Commit after each task or logical group
- Format: every task uses `- [x] Txxx ...` with file paths
