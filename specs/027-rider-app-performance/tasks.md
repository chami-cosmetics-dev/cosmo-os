# Tasks: Rider App Performance & Incentives

**Input**: Design documents from `/specs/027-rider-app-performance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Vitest for pay-period math (plan/constitution); no full TDD contract suite required. Run `npm run mobile:typecheck` before merge.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js app at repository root (`app/`, `components/`, `lib/`, `prisma/`) + `mobile/rider-app/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and confirm touch points from plan

- [x] T001 Create/switch git branch `feature/rider-app-performance` from current working base
- [x] T002 [P] Confirm plan touch points exist: `lib/rider-incentive.ts`, `app/api/admin/riders/performance/route.ts`, `mobile/rider-app/app/(tabs)/_layout.tsx`, `app/api/admin/settings/page-data/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Singleton payday config, period helper, admin settings API/UI â€” required before any rider pay-period UI

**âš ï¸ CRITICAL**: No user story work until payday can be configured and period windows are unit-tested

- [x] T003 Add `RiderPayPeriodConfig` model (`singletonKey` unique `"default"`, `paydayDayOfMonth Int?`, optional `updatedById`) to `prisma/schema.prisma`
- [x] T004 Create migration via `npm run db:migrate:create` (name: `add_rider_pay_period_config`) and apply to local/target DB(s) per constitution (`db:deploy:<target>`; use `db:deploy:all` when ready for all envs)
- [x] T005 Implement pay-period window helpers (current/previous from day-of-month D; unconfigured â†’ null) in `lib/rider-pay-period.ts` using `lib/mobile/dates.ts`
- [x] T006 [P] Add Vitest coverage for period boundaries (incl. month cross, D inclusive start) in `lib/rider-pay-period.test.ts`
- [x] T007 [P] Add Zod payday schema (`1â€“28` or `null`) in `lib/validation.ts` (and LIMITS if needed)
- [x] T008 Implement `GET`/`PUT` `/api/admin/settings/rider-payday/route.ts` per `contracts/admin-settings-rider-payday.md` (`requirePermission("settings.company")`, singleton upsert)
- [x] T009 Extend `app/api/admin/settings/page-data/route.ts` with `riderPayday` per `contracts/admin-settings-page-data-rider-payday.md`
- [x] T010 Add payday day-of-month control to settings UI (e.g. `components/molecules/company-settings-form.tsx` or dedicated molecule wired from `components/organisms/settings-page-data.tsx`) with busy/toast patterns

**Checkpoint**: Ops can set one shared payday; period math tested; foundation ready for mobile stories

---

## Phase 3: User Story 1 - See my incentive without manual math (Priority: P1) ðŸŽ¯ MVP

**Goal**: Rider opens a dedicated Performance tab and sees current pay-period completed count + incentive total (shipping sum) without manual math.

**Independent Test**: With payday configured, complete three deliveries (shipping 200, 0, 350); Performance tab shows completed 3 and incentive 550 for the current pay period.

### Implementation for User Story 1

- [x] T011 [US1] Implement `GET /api/mobile/v1/me/performance/route.ts` for `period=current` (default): paydayConfigured handling, period bounds, completedCount, incentiveTotal, todayCompletedCount/todayIncentiveTotal, empty lines array OK for MVP; reuse `lib/rider-incentive.ts`; scope to `requireRiderMobileSession` userId only â€” per `contracts/mobile-me-performance.md`
- [x] T012 [P] [US1] Add mobile types for performance response in `mobile/rider-app/src/types/` (e.g. `performance.ts`)
- [x] T013 [US1] Add fan-out fetch/aggregate hook `mobile/rider-app/src/hooks/use-rider-performance.ts` (mirror cash-summary multi-tenant pattern; sum counts/incentive across tenants)
- [x] T014 [US1] Create Performance screen `mobile/rider-app/app/(tabs)/performance.tsx` showing period dates, completed count, incentive total, and clear unconfigured-payday / empty states
- [x] T015 [US1] Register Performance tab in `mobile/rider-app/app/(tabs)/_layout.tsx` (distinct from Done, Cash, Profile)

**Checkpoint**: US1 independently testable (MVP)

---

## Phase 4: User Story 2 - Understand each deliveryâ€™s contribution (Priority: P1)

**Goal**: Per-delivery incentive visible so riders can reconcile the period total line by line.

**Independent Test**: Two completions (200, 350) show those amounts on detail lines and on Done list; sum matches period total 550.

### Implementation for User Story 2

- [x] T016 [US2] Extend `app/api/mobile/v1/me/performance/route.ts` to return `lines[]` (taskId, orderId, orderLabel, completedAt, incentiveAmount) for eligible completions in the selected period
- [x] T017 [US2] Render pay-period delivery lines on `mobile/rider-app/app/(tabs)/performance.tsx` (incentive per row; zero shipping shown clearly)
- [x] T018 [P] [US2] Ensure completed list payloads expose shipping/incentive for rows in `lib/mobile/dto.ts` (and related mobile list mapping) as needed
- [x] T019 [US2] Show per-delivery incentive on completed cards in `mobile/rider-app/src/components/completed-delivery-card.tsx` (and `mobile/rider-app/app/(tabs)/completed.tsx` if binding required)

**Checkpoint**: US2 independently testable; US1 totals still match sum of lines

---

## Phase 5: User Story 3 - See my performance at a glance (Priority: P2)

**Goal**: Dedicated tab shows completed + failed + incentive for current period; rider can switch to previous pay period only.

**Independent Test**: Period with 8 completed and 2 failed shows those counts and correct incentive for the 8; switching to previous updates all three metrics.

### Implementation for User Story 3

- [x] T020 [US3] Extend `app/api/mobile/v1/me/performance/route.ts` to accept `period=previous`, return `failedCount` (failedAt in window, status failed), and reject invalid period with 400
- [x] T021 [US3] Update `mobile/rider-app/src/hooks/use-rider-performance.ts` + types to support period switch and failedCount aggregation across tenants
- [x] T022 [US3] Add current/previous period control and failed-attempt display on `mobile/rider-app/app/(tabs)/performance.tsx` (friendly empty/zero copy)

**Checkpoint**: US3 independently testable

---

## Phase 6: User Story 4 - Friendlier daily home cues (Priority: P3)

**Goal**: Route tab shows compact today completed + today incentive; tap opens Performance (current pay period).

**Independent Test**: After todayâ€™s completions totaling incentive 550 / count 3, Route shows cue; tap navigates to Performance tab.

### Implementation for User Story 4

- [x] T023 [US4] Add compact today cue UI on `mobile/rider-app/app/(tabs)/deliveries.tsx` using today fields from `use-rider-performance` (or lightweight today-only fetch)
- [x] T024 [US4] Wire cue press to navigate to Performance tab (`/(tabs)/performance`) with current period as default

**Checkpoint**: US4 independently testable; prior stories unchanged

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Sync honesty, gates, validation guide

- [x] T025 [P] Surface pending-sync / stale cue when offline queue has unsynced completions affecting totals (reuse `mobile/rider-app/src/providers/sync.tsx` / queue patterns) on Performance and/or Route cue
- [x] T026 [P] Confirm riders cannot call admin payday routes; mobile performance never returns other ridersâ€™ data (spot-check auth paths)
- [x] T027 Run `npm test` (include `lib/rider-pay-period` / incentive) and `npm run mobile:typecheck`; fix regressions
- [x] T028 Walk through `specs/027-rider-app-performance/quickstart.md` and fix any gaps (incl. matching ops `/dashboard/riders/performance` for same date window)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None
- **Foundational (Phase 2)**: Depends on Setup â€” **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on US1 API/tab existing (extends lines + Done UI)
- **US3 (Phase 5)**: Depends on US1 tab; can parallelize with US2 after T011 if API extended carefully â€” prefer after US1
- **US4 (Phase 6)**: Depends on US1 today fields + Performance route
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational â€” MVP
- **US2 (P1)**: After US1 (extends same screen/API)
- **US3 (P2)**: After US1 (period switch + failed); soft dependency on US2 for full glance UX
- **US4 (P3)**: After US1 (today fields + navigation target)

### Parallel Opportunities

- T002 with T001 wrapping up
- T006 || T007 after T005 exists (tests vs validation)
- T012 || T011 once contract clear (types vs API)
- T018 || T017 (DTO vs Performance lines UI)
- T025 || T026 in polish

### Parallel Example: After Foundational

```text
# US1 track:
T011 API â†’ T013 hook â†’ T014 screen â†’ T015 tab

# Can draft in parallel once T011 shape known:
T012 mobile types
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational (payday + period helper)  
3. Phase 3 US1 (mobile performance summary tab)  
4. **STOP and VALIDATE** per US1 independent test / quickstart Â§3  

### Incremental Delivery

1. Setup + Foundational â†’ ops can set payday  
2. US1 â†’ riders see pay-period incentive (MVP)  
3. US2 â†’ line reconciliation + Done incentives  
4. US3 â†’ failed counts + previous period  
5. US4 â†’ Route today cue  
6. Polish â†’ typecheck, quickstart, sync cue  

### Parallel Team Strategy

1. Together: Setup + Foundational  
2. Then: Dev A US1â†’US4 mobile UI; Dev B can finish settings polish / tests â€” or single-threaded P1â†’P3 order  

---

## Notes

- [P] = different files, no dependency on incomplete sibling tasks  
- Incentive rules must stay aligned with `lib/rider-incentive.ts` / admin riders performance  
- One payday for **all companies** in the DB (singleton) â€” set matching D on Vault DB if riders use that tenant  
- Commit after each task or logical group  
- Suggested next command: `/speckit-implement`
