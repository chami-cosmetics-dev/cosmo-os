# Tasks: Loyalty SMS Templates

**Input**: Design documents from `/specs/070-loyalty-sms-templates/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan/constitution call for Vitest on catalog, render, select, merchant resolve, dedupe — unit tests included in Polish (not TDD-first unless noted).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 maps to spec user stories
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold feature module and shared validation limits

- [x] T001 Create `lib/sms-templates/` directory and barrel exports placeholder in `lib/sms-templates/index.ts`
- [x] T002 [P] Add SMS template body/name/key limits to `lib/validation.ts` (mirror email template LIMITS pattern)
- [x] T003 [P] Add settings hub card + topbar prefix for SMS Templates in `app/(dashboard)/dashboard/settings/page.tsx` and `components/organisms/topbar.tsx` (href `/dashboard/settings/sms-templates`, gate `settings.sms_portal`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + shared libs all stories need — MUST finish before US work

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T004 Add Prisma models `SmsTemplate`, `LoyaltySmsConfig`, `LoyaltyWishSend` and Company relations in `prisma/schema.prisma` per `specs/070-loyalty-sms-templates/data-model.md`
- [x] T005 Create migration with `npm run db:migrate:create` (never `prisma migrate dev` / `db:push` on shared DBs); run `npm run db:generate`
- [x] T006 [P] Implement builtin catalog + key regex + purpose types in `lib/sms-templates/catalog.ts` (four keys: `loyalty_gold_wish_1/2`, `loyalty_platinum_wish_1/2`)
- [x] T007 [P] Implement `{{placeholder}}` renderer in `lib/sms-templates/render.ts` (`customerName`, `tier`, `discountPercent`, `merchantName`, `merchantPhone`, `officePhone`)
- [x] T008 [P] Implement active-pool filter + uniform random pick in `lib/sms-templates/select.ts` (purpose `gold_wish` / `platinum_wish`)
- [x] T009 [P] Implement allocated-merchant resolve (match `ContactMaster.assignedMerchant` → User via ownership helpers) returning display name + `User.mobile` in `lib/sms-templates/merchant-contact.ts`
- [x] T010 Implement `LoyaltySmsConfig` get/upsert helper (office phone) in `lib/sms-templates/loyalty-sms-config.ts`

**Checkpoint**: Schema generated; catalog/render/select/merchant/config helpers ready

---

## Phase 3: User Story 1 - Wish SMS on Gold / Platinum update (Priority: P1) 🎯 MVP

**Goal**: After a new Gold/Platinum loyalty write, send one congratulatory SMS with discount + merchant/office contacts; never fail the loyalty API on SMS errors

**Independent Test**: Assign contact with phone to Gold → one Hutch/`SmsLog`/`LoyaltyWishSend` success with 10% and merchant/office when configured; repeat Platinum 15%; empty phone → assign OK + skip status

### Implementation for User Story 1

- [x] T011 [US1] Implement orchestrator `maybeSendLoyaltyWishSms` in `lib/sms-templates/loyalty-wish-send.ts` (dedupe success per contact+tier → pick template → render → `sendSms` from `lib/hutch-sms.ts` → upsert `LoyaltyWishSend`; catch all errors)
- [x] T012 [US1] After successful **new** tier persistence in `app/api/admin/customer-insight/contact/[contactId]/loyalty-assign/route.ts`, call wish helper when `!isRetrySameTier` (Gold or Platinum); do not fail response on SMS errors
- [x] T013 [US1] After successful **new** tier persistence in `app/api/admin/customer-insight/contact/[contactId]/loyalty-override/route.ts`, call wish helper for Gold/Platinum upgrades; do not fail response on SMS errors
- [x] T014 [US1] Ensure Gold→Platinum triggers Platinum wish only (existing Gold success row left alone) inside `lib/sms-templates/loyalty-wish-send.ts` dedupe rules

**Checkpoint**: US1 MVP — loyalty update sends wish SMS (or records skip/fail) without blocking assign

---

## Phase 4: User Story 2 - Random Gold / Platinum template selection (Priority: P1)

**Goal**: Each send picks uniformly among active templates for that tier so customers do not all get the same wording

**Independent Test**: Two active Gold templates → multiple Gold sends use both keys over a sample; inactive/wrong-purpose never selected; empty pool → `skipped_no_template`

### Implementation for User Story 2

- [x] T015 [US2] Wire `select.ts` into `lib/sms-templates/loyalty-wish-send.ts` so pool is merged builtins+DB (active + matching purpose only) before random pick
- [x] T016 [P] [US2] Add Vitest coverage for pool filter + random eligibility in `lib/sms-templates/select.test.ts` (inject RNG or multi-run assertion)
- [x] T017 [US2] Persist chosen `templateKey` on `LoyaltyWishSend` in `lib/sms-templates/loyalty-wish-send.ts` for ops verification of random picks

**Checkpoint**: Random tier pools proven; selection observable via `templateKey`

---

## Phase 5: User Story 3 - Manage SMS templates like Email Templates (Priority: P1)

**Goal**: Authorized staff list/edit/save/create SMS templates and office phone with preview, gated by `settings.sms_portal`

**Independent Test**: Open `/dashboard/settings/sms-templates`, edit body, save, reload; create new Platinum template; user without permission refused

### Implementation for User Story 3

- [x] T018 [US3] Implement `GET`/`PUT`/`DELETE` for SMS templates in `app/api/admin/company/sms-templates/route.ts` per `specs/070-loyalty-sms-templates/contracts/loyalty-sms-templates.md` (Zod, `requirePermission(..., "settings.sms_portal")`, builtin merge)
- [x] T019 [P] [US3] Implement `GET`/`PUT` office phone in `app/api/admin/company/loyalty-sms-config/route.ts` (or fold into sms-templates GET/PUT if simpler — keep contract behavior)
- [x] T020 [US3] Build Email-Templates-style editor (list, + New, fields, sample preview) in `components/molecules/sms-templates-settings-form.tsx` using `notify` + action-loading UX
- [x] T021 [US3] Add page `app/(dashboard)/dashboard/settings/sms-templates/page.tsx` loading initial templates server-side when practical
- [x] T022 [US3] Add sidebar NavItem for SMS Templates in `components/organisms/app-sidebar.tsx` (visible with `settings.sms_portal`)
- [x] T023 [US3] Audit-log template upsert/delete in `app/api/admin/company/sms-templates/route.ts` via `writeAuditLog`

**Checkpoint**: Ops can CRUD templates + office phone; preview works; RBAC enforced

---

## Phase 6: User Story 4 - Seeded four wish templates day one (Priority: P2)

**Goal**: Fresh company sees two distinct Gold and two distinct Platinum wish templates with correct discount wording without prior DB rows

**Independent Test**: Open SMS Templates with empty `SmsTemplate` table → four builtins listed; Gold seeds mention 10%; Platinum 15%; edits persist without losing purpose

### Implementation for User Story 4

- [x] T024 [US4] Finalize distinct seed bodies (merchant/office placeholders + discount copy) for all four builtins in `lib/sms-templates/catalog.ts`
- [x] T025 [US4] Ensure GET merge in `app/api/admin/company/sms-templates/route.ts` returns four builtins when no rows saved (`saved: false`)
- [x] T026 [US4] Lock builtin key/purpose on PUT (allow name/body/active edits only) in `app/api/admin/company/sms-templates/route.ts`

**Checkpoint**: Day-one seeds ready; custom templates can still extend Gold/Platinum pools

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Tests, lint, quickstart validation

- [x] T027 [P] Add Vitest for placeholder render in `lib/sms-templates/render.test.ts`
- [x] T028 [P] Add Vitest for catalog merge / key validation in `lib/sms-templates/catalog.test.ts`
- [x] T029 [P] Add Vitest for merchant resolve matching in `lib/sms-templates/merchant-contact.test.ts`
- [x] T030 [P] Add Vitest for dedupe / skip statuses (mock prisma + sendSms) in `lib/sms-templates/loyalty-wish-send.test.ts`
- [x] T031 Run `npm test -- lib/sms-templates` and fix failures
- [x] T032 [P] Lint clean on touched files (`npm run lint` scope as project allows)
- [x] T033 Walk `specs/070-loyalty-sms-templates/quickstart.md` scenarios on cosmo-dev (after `npm run db:deploy:cosmo-dev` — **do not** prod deploy without user OK)
- [x] T034 Confirm order SMS page `app/(dashboard)/dashboard/settings/sms-notifications/page.tsx` unchanged in behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After US1 send path exists (uses same orchestrator)
- **US3 (Phase 5)**: After Foundational — can start parallel to US1/US2 if API/UI staffed separately (send can use catalog-only until DB saves exist)
- **US4 (Phase 6)**: After catalog (T006) + GET merge (T018) — refine seeds/locks
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1**: Foundational only — MVP wish send using catalog defaults
- **US2**: Builds on US1 orchestrator + Foundational `select.ts`
- **US3**: Foundational models; independent of live sends (CRUD/preview)
- **US4**: Tightens catalog + API merge from US3; improves US1/US2 copy quality

### Parallel Opportunities

- T002/T003; T006–T010 after T004/T005
- T016 parallel with T015/T017 once select API stable
- T019 parallel with T018
- T027–T030 parallel in Polish
- US3 UI (T020–T022) can proceed while US1 hooks land if API contract mocked

---

## Parallel Example: Foundational

```text
T006 catalog.ts
T007 render.ts
T008 select.ts
T009 merchant-contact.ts
# after T004–T005 migration
```

## Parallel Example: User Story 3

```text
T018 sms-templates/route.ts
T019 loyalty-sms-config/route.ts
# then T020 form → T021 page → T022 sidebar
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (wish send on assign/override)  
4. **STOP** — validate quickstart §4–§5 / miss paths  
5. Demo before UI polish if needed  

### Incremental Delivery

1. Setup + Foundational  
2. US1 → live wishes  
3. US2 → random variation  
4. US3 → ops edit UI  
5. US4 → seed copy polish  
6. Polish tests + quickstart  

### Parallel Team Strategy

- Dev A: US1 + US2 (send path)  
- Dev B: US3 + US4 (settings UI + seeds) after Foundational  

---

## Notes

- Reuse `settings.sms_portal` — no new permission in v1  
- Migration: `npm run db:migrate:create` then deploy all three DBs when shipping (`db:deploy:all`) — never silent prod  
- Vault OS UI/send out of scope; schema still shared  
- Order SMS Notifications stay separate  
- Commit after each task or logical group  
