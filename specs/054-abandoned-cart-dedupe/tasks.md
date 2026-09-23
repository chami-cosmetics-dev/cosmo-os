# Tasks: Abandoned Cart Deduplication & Abandonment Reason

**Input**: Design documents from `/specs/054-abandoned-cart-dedupe/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests for cart fingerprint/subset helpers included (plan Technical Context + quickstart automated checks). No full TDD/contract-test suite requested in spec.

**Organization**: Tasks grouped by user story for independent implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1â€“US4)
- Include exact file paths in descriptions

## Path Conventions

- Next.js monolith at repo root: `prisma/`, `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + constants scaffolding shared by all stories

- [X] T001 Create/switch git branch `054-abandoned-cart-dedupe` from an up-to-date base suitable for this feature
- [X] T002 [P] Add abandonment-reason constants + labels (+ export helpers as needed) in `lib/abandoned-orders-constants.ts`
- [X] T003 [P] Extend list DTO types with `abandonmentReason`, `exactDuplicateGroupId`, `exactDuplicateCount`, `sameDaySiblingCount`, `sameDaySiblings` in `lib/page-data/abandoned-orders-types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, cart math, dedupe engine, sync hooks â€” MUST finish before story UI/API work

**âš ï¸ CRITICAL**: No user story phase starts until this phase completes

- [X] T004 Extend `ShopifyAbandonedCheckout` in `prisma/schema.prisma` with `abandonmentReason`, `phoneNormalized`, `cartFingerprint`, `exactDuplicateGroupId`, `supersededByCheckoutId`, `supersededAt`, self-relation + indexes per `specs/054-abandoned-cart-dedupe/data-model.md`
- [X] T005 Create migration via `npm run db:migrate:create` (never `prisma migrate dev` / `db push` on shared DBs); document deploy with `npm run db:deploy:<target>` / `db:deploy:all`
- [X] T006 Implement line normalize / fingerprint / proper-subset helpers in `lib/abandoned-checkout-cart.ts`
- [X] T007 [P] Add Vitest coverage for fingerprint equality, qty mismatch, proper-subset true/false, disjoint carts in `lib/abandoned-checkout-cart.test.ts`
- [X] T008 Implement `recomputeCheckoutCartFields`, `dedupeAbandonedCheckoutsForCompany`, `backfillAbandonedCheckoutDedupe` in `lib/abandoned-checkout-dedupe.ts` (exact groups + soft-hide supersession; skip null phones)
- [X] T009 Enrich GraphQL/REST line item payload with variant/product ids when available and call dedupe after upsert in `lib/abandoned-checkouts-sync.ts`
- [X] T010 Call dedupe after upsert in `lib/shopify-abandoned-checkout-webhook.ts`
- [X] T011 Exclude `supersededByCheckoutId != null` from default list queries in `lib/page-data/abandoned-orders.ts` and ensure sync/page-data path can trigger backfill when fingerprints missing

**Checkpoint**: Foundation ready â€” fingerprints, groups, soft-hide, and sync/webhook hooks work; stories can proceed

---

## Phase 3: User Story 1 - Exact duplicate carts share follow-up updates (Priority: P1) ðŸŽ¯ MVP

**Goal**: Exact duplicates share one group; saving follow-up on one updates all peers; UI shows linked-duplicate cue

**Independent Test**: Two same-phone identical carts â†’ update Closed + response (+ remark) on one â†’ peer matches without second edit; qty-different carts do not group

### Implementation for User Story 1

- [X] T012 [US1] Propagate `followUpStatus`, `customerResponse`, `remark` (and later abandonment reason once US4 lands) across `exactDuplicateGroupId` peers + audit metadata in `lib/abandoned-checkout-follow-up.ts`
- [X] T013 [US1] Confirm `PATCH` route still uses follow-up helper and returns updated list item shape in `app/api/admin/abandoned-orders/[id]/follow-up/route.ts`
- [X] T014 [US1] Populate `exactDuplicateGroupId` / `exactDuplicateCount` on page-data items in `lib/page-data/abandoned-orders.ts`
- [X] T015 [US1] Show exact-duplicate linked indicator on rows and refresh peer rows after save in `components/organisms/abandoned-orders-panel.tsx`

**Checkpoint**: US1 independently testable (exact-dupe sync + indicator)

---

## Phase 4: User Story 2 - Older subset carts are superseded by fuller carts (Priority: P1)

**Goal**: Older proper-subset carts soft-hidden from default list/export; disjoint / non-superset pairs stay visible

**Independent Test**: A then A+B same phone â†’ A gone from default list, B remains, A retained in DB; disjoint P1/P2 both visible; later-smaller cart does not hide fuller older cart

### Implementation for User Story 2

- [X] T016 [US2] Verify/finish supersession rules in `lib/abandoned-checkout-dedupe.ts` (proper subset only; never soft-hide exact equals â€” those group via US1)
- [X] T017 [US2] Keep default CSV export aligned with list (exclude superseded) in `app/api/admin/abandoned-orders/export/route.ts`
- [X] T018 [US2] Smoke-check list empty-state / filters still correct when rows are soft-hidden via `lib/page-data/abandoned-orders.ts` + `components/organisms/abandoned-orders-panel.tsx`

**Checkpoint**: US2 independently testable on top of foundation

---

## Phase 5: User Story 3 - Same-day different carts show a sibling badge (Priority: P1)

**Goal**: Most recent same-day cart for a phone shows badge + links to other intents; no auto status sync across non-exact siblings

**Independent Test**: Same phone, same Colombo day, two different carts â†’ both visible; newest shows `+1` with jump to sibling; status change on one leaves the other unchanged

### Implementation for User Story 3

- [X] T019 [US3] Compute `sameDaySiblingCount` / `sameDaySiblings` (Asia/Colombo; exclude self, superseded, and same exact-duplicate group) in `lib/page-data/abandoned-orders.ts`
- [X] T020 [US3] Render badge on most-recent same-day row and sibling navigation/jump UX in `components/organisms/abandoned-orders-panel.tsx`
- [X] T021 [US3] Confirm follow-up save does **not** propagate across same-day non-exact siblings in `lib/abandoned-checkout-follow-up.ts` (regression guard vs US1)

**Checkpoint**: US3 independently testable; US1 status sync still works for exact dupes

---

## Phase 6: User Story 4 - Record abandonment reason separately (Priority: P2)

**Goal**: Optional structured abandonment reason, separate from customer response/remark; list + CSV + exact-dupe propagate

**Independent Test**: Set â€œCity not availableâ€, save; persists on row/CSV; Close without reason still OK; exact-dupe peers get same reason

### Implementation for User Story 4

- [X] T022 [P] [US4] Extend `abandonedOrderFollowUpPatchBodySchema` with optional/nullable `abandonmentReason` enum in `lib/validation.ts`
- [X] T023 [US4] Persist + return `abandonmentReason`; include in exact-duplicate group propagate + audit before/after in `lib/abandoned-checkout-follow-up.ts`
- [X] T024 [US4] Add abandonment-reason select to follow-up form (optional always) in `components/molecules/abandoned-order-follow-up-form.tsx`
- [X] T025 [US4] Show abandonment reason on list rows in `components/organisms/abandoned-orders-panel.tsx`
- [X] T026 [US4] Add abandonment-reason column (human label) to CSV in `app/api/admin/abandoned-orders/export/route.ts`
- [X] T027 [US4] Map `abandonmentReason` through page-data/list mapping in `lib/page-data/abandoned-orders.ts` and `lib/abandoned-checkout-follow-up.ts` `toListItem`

**Checkpoint**: All four stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and cleanup

- [ ] T028 Run quickstart scenarios V1-V6 in `specs/054-abandoned-cart-dedupe/quickstart.md` against local/dev
- [X] T029 [P] Run `npm test` for abandoned-checkout cart/dedupe coverage and fix regressions
- [X] T030 Lint/typecheck touched files (`lib/abandoned-checkout-*.ts`, abandoned-orders panel/form/API, prisma schema)
- [X] T031 Confirm migration deployed to intended shared targets via `npm run db:deploy:all` only when user explicitly approves prod/shared deploys (constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: Depends on Setup â€” **blocks all user stories**
- **US1 (Phase 3)**: After Foundational â€” MVP
- **US2 (Phase 4)**: After Foundational (dedupe supersession mostly in T008/T016); can follow US1 sequentially to reduce conflict on panel/list files
- **US3 (Phase 5)**: After Foundational; best after US1 list DTO fields exist; panel work conflicts with US1/US2 if parallelized carelessly
- **US4 (Phase 6)**: After Foundational; integrate propagate with US1 helper; can start schema/constants early (already in Setup)
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

- **US1**: Foundation only â€” MVP
- **US2**: Foundation (soft-hide query); independent of US3/US4
- **US3**: Foundation + list enrichment; must not break US1 propagate
- **US4**: Foundation + follow-up form/API; should reuse US1 group propagate

### Within Each User Story

- Helpers/data before API mapping before UI
- Story complete before next priority when one developer

### Parallel Opportunities

- T002 || T003 in Setup
- T007 || (docs) after T006; T009 || T010 after T008
- After Foundational: US4 validation/constants work (T022) can parallel US2 export (T017) if different files
- Panel tasks (T015, T018, T020, T025) serialize on `abandoned-orders-panel.tsx` â€” do not parallelize those

---

## Parallel Example: Foundational

```bash
# After T006 cart helpers exist:
Task: "T007 Vitest in lib/abandoned-checkout-cart.test.ts"

# After T008 dedupe exists:
Task: "T009 Hook dedupe in lib/abandoned-checkouts-sync.ts"
Task: "T010 Hook dedupe in lib/shopify-abandoned-checkout-webhook.ts"
```

## Parallel Example: User Story 4

```bash
Task: "T022 Zod abandonmentReason in lib/validation.ts"
# then sequential persist/UI/export on shared follow-up path
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (CRITICAL)
3. Phase 3 US1 exact-dupe propagate + indicator
4. **STOP** â€” validate Independent Test for US1
5. Demo/ship MVP if needed

### Incremental Delivery

1. Setup + Foundational
2. US1 â†’ validate â†’ demo
3. US2 soft-hide â†’ validate
4. US3 same-day badge â†’ validate
5. US4 abandonment reason â†’ validate
6. Polish / quickstart

### Parallel Team Strategy

1. Pair on Setup + Foundational
2. Then: Dev A US1+US4 (follow-up path); Dev B US2 export/list filters; Dev C US3 badge â€” coordinate `abandoned-orders-panel.tsx` ownership

---

## Notes

- [P] = different files, no incomplete-task dependency
- Default list/export always hide superseded (US2)
- Exact-dupe status sync takes precedence over same-day badge counting (count unique intents)
- Phone linking uses `canonicalPhoneForErpCustomerId` / `Asia/Colombo` per research
- Do not commit secrets; do not prod-deploy DBs without explicit user approval
