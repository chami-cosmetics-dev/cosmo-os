# Tasks: Rider Maps Fallback & Cash Change Display

**Input**: Design documents from `/specs/026-maps-cash-change/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan/constitution require Vitest helpers + `mobile:typecheck`; include focused unit tests per story (not full TDD suite).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: US1 = maps fallback, US2 = cash change under payment total
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Align branch with tender baseline from `main` / 025 before feature work

- [x] T001 Create/switch to feature branch `026-maps-cash-change` from `origin/main` (or merge `origin/main` into current branch) so `DeliveryPayment.customerGaveAmount` / `changeAmount` and 025 payment API exist
- [x] T002 Confirm tender migration is present under `prisma/migrations/` and `prisma/schema.prisma`; if missing on branch only, restore from `main` — do not invent a duplicate migration
- [x] T003 [P] Skim `specs/026-maps-cash-change/contracts/mobile-maps-and-tender.md` and `quickstart.md` acceptance paths before coding

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared tender helpers/API must exist before US2 UI; clipboard capability for US1 fallback

**⚠️ CRITICAL**: Complete before US2; US1 can start after T004–T005 if tender already on branch

- [x] T004 Ensure `lib/mobile/payment-tender.ts` exists with cashDue + change helpers (restore from `main` / 025 if absent)
- [x] T005 [P] Ensure mobile payment Zod rules accept `customerGaveAmount` / `changeAmount` in `lib/mobile/validation.ts` and route `app/api/mobile/v1/deliveries/[id]/payment/route.ts` persists server-computed change
- [x] T006 [P] Ensure DTO exposes tender fields in `lib/mobile/dto.ts` and `mobile/rider-app/src/types/delivery.ts`
- [x] T007 [P] Add clipboard support for address copy (prefer RN/`expo-clipboard` already in app; add `expo-clipboard` via `npx expo install` in `mobile/rider-app` only if required)

**Checkpoint**: Tender API + types ready; clipboard available for maps fallback

---

## Phase 3: User Story 1 - Open delivery location without a dead-end error (Priority: P1) 🎯 MVP

**Goal**: Open map tries workable intents; on failure offers Copy address (not only “Maps unavailable”)

**Independent Test**: Delivery with address → Open map opens navigation OR shows copy fallback; no address → clear unavailable message

### Tests for User Story 1

- [x] T008 [P] [US1] Add unit tests for map URL candidates / open-attempt ordering in `mobile/rider-app/src/utils/contact.test.ts` (or `lib` helper if extracted)

### Implementation for User Story 1

- [x] T009 [US1] Refactor `openDirections` in `mobile/rider-app/src/utils/contact.ts` to try `geo:` then HTTPS maps URLs; do not stop solely on a single `canOpenURL` false for https
- [x] T010 [US1] On all open failures with a valid address, show alert with **Copy address** action that copies address text (use clipboard from T007)
- [x] T011 [P] [US1] Keep/adjust empty-address messaging in `mobile/rider-app/src/utils/contact.ts` and ensure Open map in `mobile/rider-app/src/components/delivery-contact-section.tsx` stays disabled or no-ops clearly when address is missing
- [x] T012 [US1] Manually smoke Open map on device/emulator per `specs/026-maps-cash-change/quickstart.md` sections 1–3

**Checkpoint**: US1 independently testable — no dead-end-only maps alert

---

## Phase 4: User Story 2 - Enter cash received and see change under the order total (Priority: P1)

**Goal**: Payment UI shows customer gave under amount due and live change (e.g. 2500 / 5000 → 2500); persist + show on Cosmo OS

**Independent Test**: COD due 2500, gave 5000 → balance 2500 before confirm; insufficient tender blocked; Cosmo OS shows tender after save

### Tests for User Story 2

- [x] T013 [P] [US2] Extend/add unit tests for change = gave − cashDue and cashDue from COD lines in `lib/mobile/payment-tender.test.ts` (create if missing)

### Implementation for User Story 2

- [x] T014 [US2] Add customer-gave input + live change/balance display under/near amount due in `mobile/rider-app/src/components/payment-form.tsx` (show when cashDue &gt; 0)
- [x] T015 [US2] Wire customerGaveAmount into payment submit payload in rider delivery payment hooks/screens under `mobile/rider-app/` (e.g. delivery detail / payment handlers)
- [x] T016 [US2] Block confirm when cashDue &gt; 0 and gave missing or &lt; cashDue in payment form / submit validation
- [x] T017 [P] [US2] Confirm Cosmo OS order/fulfillment detail shows customer gave + change in `components/organisms/order-fulfillment-detail.tsx` (or equivalent order payment display); add UI if missing
- [x] T018 [US2] Manual smoke per `specs/026-maps-cash-change/quickstart.md` sections 4–5 (due 2500 / gave 5000 / insufficient)

**Checkpoint**: US1 + US2 both independently functional

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Gates and docs

- [x] T019 Run `npm test` and `npm run mobile:typecheck` from repo root / `mobile/rider-app` as applicable; fix regressions
- [x] T020 [P] Mark `specs/026-maps-cash-change/checklists/requirements.md` notes if any quickstart gaps remain; keep tasks.md checkboxes updated
- [x] T021 If only JS changes and OTA-enabled APK is installed, publish update (`eas update` / Rider app OTA workflow); otherwise note APK rebuild only if new native module was added in T007

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately — branch sync is critical
- **Foundational (Phase 2)**: After Setup — blocks full US2; US1 needs T007 (+ T008–T012)
- **US1 (Phase 3)**: After T007 (clipboard); independent of tender UI
- **US2 (Phase 4)**: After T004–T006; independent of maps once foundation done
- **Polish (Phase 5)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: No dependency on US2
- **US2 (P1)**: Depends on Foundational tender restore only; no dependency on US1

### Parallel Opportunities

- After Setup: T005, T006, T007 in parallel
- US1 vs US2 can proceed in parallel after Foundational (different files: `contact.ts` vs `payment-form.tsx`)
- T008 || T009 start; T013 || T014 start once foundation ready
- T011 and T017 are [P] relative to other story work when files don’t conflict

### Parallel Example: After Foundational

```text
Developer A: T008 → T009 → T010 → T011 → T012   (US1 maps)
Developer B: T013 → T014 → T015 → T016 → T017 → T018  (US2 tender UI)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001–T003 Setup  
2. T007 clipboard  
3. T008–T012 maps fallback  
4. **STOP** — validate Open map on device  

### Incremental Delivery

1. Setup + Foundational (tender on branch)  
2. US1 maps → demo  
3. US2 cash change UI + admin display → demo  
4. Polish / typecheck / OTA  

### Suggested MVP scope

**US1 only** (maps fallback) unblocks riders immediately; US2 follows once branch has 025 tender.

---

## Notes

- Do not create a second Prisma migration for the same tender columns if 025 already shipped on `main`
- Change is vs **cash due**, not always full merchandise total on splits
- Prefer OTA for JS-only delivery after one OTA-capable APK install
