# Tasks: Rider Performance Sync & Analytics

**Input**: Design documents from `/specs/038-rider-performance-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested as TDD in the spec. Unit tests for parse/upsert/filter helpers are included in Polish to satisfy constitution CI gates.

**Organization**: Tasks grouped by user story for independent implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: `[US1]`â€¦`[US4]` for story phases only
- Include exact file paths in descriptions

## Path Conventions

Cosmo OS monorepo: `app/`, `lib/`, `components/`, `mobile/rider-app/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and working context for 038

- [X] T001 Confirm feature docs under `specs/038-rider-performance-sync/` and create/switch git branch `038-rider-performance-sync` from current base (or `main`/`dev` per team practice)
- [X] T002 [P] Skim contracts in `specs/038-rider-performance-sync/contracts/` and note response-shape deltas vs current routes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared completion helper and date utilities used by later stories

**CRITICAL**: Complete before US1â€“US4 implementation

- [X] T003 Add or extend shared rider/order delivery-complete helper in `lib/mark-order-delivered.ts` (or new `lib/complete-rider-delivery.ts`) covering: complete task when present, set order `delivery_complete` fields, set `deliveryCompleteById` from task.`riderId` when task exists, idempotent already-complete
- [X] T004 [P] Verify Asia/Colombo helpers `parseAppCalendarDayStart` / `parseAppCalendarDayEnd` in `lib/format-datetime.ts` (add tests in `lib/format-datetime.test.ts` only if missing)
- [X] T005 [P] Add unmatched-incentive helper (e.g. `isUnmatchedRiderCharge` / flag on resolve) in `lib/rider-delivery-charge.ts` or `lib/rider-incentive-resolve.ts` returning charge + `matched: boolean`

**Checkpoint**: Shared complete + date + unmatched helpers ready

---

## Phase 3: User Story 1 â€” Completions update rider ops & performance (Priority: P1) ðŸŽ¯ MVP

**Goal**: App and link completion both update Cosmo Riders/performance for the assigned rider when a task exists; link without task completes order only.

**Independent Test**: Complete one order via app and one via link for a known rider; refresh `/dashboard/riders` and `/dashboard/riders/performance` â€” both completions count once. Link without task does not add rider credit.

### Implementation for User Story 1

- [X] T006 [US1] Wire mobile complete route `app/api/mobile/v1/deliveries/[id]/complete/route.ts` to shared helper from T003 (preserve payment-approval/SMS side effects)
- [X] T007 [US1] Update public confirm in `app/api/public/rider-delivery/[token]/route.ts` per `contracts/public-rider-delivery-complete.md`: use shared helper when task exists; order-only when no task; keep fail path; idempotent confirm
- [X] T008 [US1] Confirm admin performance GET already uses Colombo day bounds in `app/api/admin/riders/performance/route.ts` (align with `contracts/admin-riders-performance.md` date query); fix if still server-local `startOfDay`
- [X] T009 [US1] Ensure `components/organisms/rider-performance-panel.tsx` sends `YYYY-MM-DD` `from`/`to` (not local-midnight ISO) so completions land on the correct Colombo day

**Checkpoint**: US1 independently verifiable via app + link + admin refresh

---

## Phase 4: User Story 2 â€” Rider pay from shipping rules (Priority: P1)

**Goal**: Incentive = sheet **Delivery Charges for riders** via upsert import; blanks skipped; admin + rider app use same rules; unmatched visible as 0 + flag.

**Independent Test**: Upload Shipping Rule New.xlsx; sample labels with F filled show correct pay; blank-F rows skipped; re-upload does not wipe omitted labels; unmatched completion shows 0 incentive.

### Implementation for User Story 2

- [X] T010 [US2] Update `parseRiderDeliveryChargeSheetRows` in `lib/rider-delivery-charge.ts` to **skip** blank rider-charge rows (no hard error for intentional blanks); keep shipping-amount validation for imported rows; count/report skips
- [X] T011 [US2] Change `POST` in `app/api/admin/settings/rider-delivery-charges/route.ts` from `deleteMany`+`createMany` to **upsert by `labelKey`**; return `imported` / `created` / `updated` / `skippedBlank` / `warnings` per `contracts/admin-settings-rider-delivery-charges.md`
- [X] T012 [P] [US2] Update upload UX messaging in `components/molecules/rider-delivery-charges-form.tsx` to show skip/upsert stats after upload
- [X] T013 [US2] Extend admin performance aggregation in `app/api/admin/riders/performance/route.ts` + `lib/rider-incentive.ts` to expose per-rider `unmatchedCount` and range `unmatchedTotal` using T005
- [X] T014 [P] [US2] Confirm mobile `app/api/mobile/v1/me/performance/route.ts` still uses `incentiveForOrder` / charge map (same rules); adjust only if unmatched fields are required for parity display

**Checkpoint**: US2 independently verifiable via settings upload + performance incentive totals

---

## Phase 5: User Story 3 â€” Admin analytics UI on Rider performance (Priority: P2)

**Goal**: Attractive KPIs + charts + table with unmatched markers for permitted users.

**Independent Test**: Open `/dashboard/riders/performance`, change date range â€” KPIs, charts, and table update; unmatched badge/count visible when applicable.

### Implementation for User Story 3

- [X] T015 [US3] Extend performance API response with `summary` + `dailySeries` in `app/api/admin/riders/performance/route.ts` per `contracts/admin-riders-performance.md`
- [X] T016 [US3] Rebuild `components/organisms/rider-performance-panel.tsx` with summary KPI cards, Recharts bar (completions/incentive by rider), daily trend chart, and detail table
- [X] T017 [P] [US3] Add unmatched summary + row/rider markers in `components/organisms/rider-performance-panel.tsx` (and styles as needed under `components/` / existing UI primitives)
- [X] T018 [P] [US3] Verify page gate still uses `staff.read` on `app/(dashboard)/dashboard/riders/performance/page.tsx`

**Checkpoint**: US3 independently verifiable as analytics UI on correct data

---

## Phase 6: User Story 4 â€” Riders page live activity (Priority: P2)

**Goal**: Assigned/In progress always show open tasks; Completed/Failed respect Colombo date filter; payment totals reflect real collections.

**Independent Test**: Rider with yesterdayâ€™s open tasks + todayâ€™s completions â€” Assigned includes yesterdayâ€™s open; Completed shows todayâ€™s only; location totals non-zero when payments exist.

### Implementation for User Story 4

- [X] T019 [US4] Implement FR-003 filtering in `lib/page-data/riders.ts` and/or `app/api/admin/riders/[riderId]/orders/route.ts` per `contracts/admin-riders-orders.md` (open any day; completed/failed in range)
- [X] T020 [US4] Update client filter/summary in `components/organisms/rider-operations-panel.tsx` so cards and lists match FR-003 (stop using single `completedAt ?? failedAt ?? assignedAt` day bucket for all statuses)
- [X] T021 [P] [US4] Ensure location payment aggregates only use completed tasks in the completed date scope in `lib/page-data/riders.ts`
- [X] T022 [P] [US4] Use Colombo `YYYY-MM-DD` defaults/bounds for riders date inputs in `components/organisms/rider-operations-panel.tsx` (align with `lib/format-datetime.ts`)

**Checkpoint**: US4 independently verifiable on `/dashboard/riders`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Tests, typecheck, quickstart validation

- [X] T023 [P] Extend unit tests in `lib/rider-delivery-charge.test.ts` for skip-blank parse + normalize label key cases
- [X] T024 [P] Add/extend unit tests for unmatched flag + aggregate unmatched counts (new or existing under `lib/rider-incentive*.test.ts`)
- [X] T025 [P] Add/extend unit tests for riders open-vs-dated filter helper if extracted from `lib/page-data/riders.ts`
- [X] T026 Run `npx vitest run` for touched `lib/**/*.test.ts` and `npm run mobile:typecheck` if mobile client touched
- [ ] T027 Walk `specs/038-rider-performance-sync/quickstart.md` scenarios on cosmo-dev and fix gaps
- [X] T028 [P] Update contract docs if response field names drifted during implement under `specs/038-rider-performance-sync/contracts/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” **blocks** all stories
- **US1 (Phase 3)**: After Foundational â€” MVP
- **US2 (Phase 4)**: After Foundational; benefits from US1 dates but independently testable via upload + incentive math
- **US3 (Phase 5)**: After US2 unmatched fields ideally (T013); can stub unmatched=0 then wire
- **US4 (Phase 6)**: After Foundational; parallel with US2/US3 if staffed
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|-------|
| US1 | Phase 2 | MVP completion parity |
| US2 | Phase 2 (+ T005) | Import + unmatched data |
| US3 | US2 T013â€“T015 for full unmatched/charts data | UI can start after T015 |
| US4 | Phase 2 | Independent of US2/US3 |

### Parallel Opportunities

- T002 || T001 after branch exists
- T004 || T005 after T003 started (different files)
- T012 || T014 after T011
- T017 || T018 after T016 scaffold
- T021 || T022 after T019/T020
- T023 || T024 || T025 in Polish

---

## Parallel Example: User Story 1

```bash
# After T003â€“T005:
Task: "Wire mobile complete to shared helper in app/api/mobile/v1/deliveries/[id]/complete/route.ts"
Task: "Update public link confirm in app/api/public/rider-delivery/[token]/route.ts"
# Then dates:
Task: "Confirm Colombo bounds in app/api/admin/riders/performance/route.ts"
Task: "Send YYYY-MM-DD from components/organisms/rider-performance-panel.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "Skip blank rider charges in lib/rider-delivery-charge.ts"
Task: "Upsert POST in app/api/admin/settings/rider-delivery-charges/route.ts"
# Then:
Task: "Upload stats UI in components/molecules/rider-delivery-charges-form.tsx"
Task: "Unmatched counts in app/api/admin/riders/performance/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1  
4. **STOP** â€” validate app + link â†’ admin pages  
5. Demo ops trust restored  

### Incremental Delivery

1. US1 â†’ completion parity  
2. US2 â†’ real rider pay + import  
3. US3 â†’ analytics UI  
4. US4 â†’ riders open-task UX  
5. Polish â†’ tests + quickstart  

### Parallel Team Strategy

- Dev A: US1 then US3  
- Dev B: US2 (import/pay)  
- Dev C: US4 (riders page) after Phase 2  

---

## Notes

- No Prisma migration expected for v1  
- Do not full-replace `RiderDeliveryChargeRule` on upload  
- Blank **Delivery Charges for riders** = skip (non-rider areas)  
- Historical user-id remap remains out of scope  
- Suggested MVP: **US1 only**; pay/charts follow quickly via US2+US3
