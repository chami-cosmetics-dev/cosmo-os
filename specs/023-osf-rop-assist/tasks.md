# Tasks: OSF Live Refresh & ROP Assist

**Input**: Design documents from `/specs/023-osf-rop-assist/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Plan recommends Vitest for assist window, suggested ROP rounding, and sales-in-range helpers — included (not full TDD)

**Organization**: Tasks grouped by user story (US1–US4) for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 map to spec user stories
- Include exact file paths in descriptions

## Path Conventions

- Repo root Next.js app: `lib/`, `app/`, `components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient to design docs and reuse targets

- [X] T001 Confirm feature docs in `specs/023-osf-rop-assist/plan.md`, `research.md`, `data-model.md`, `contracts/osf-rop-assist.md`, and `quickstart.md`
- [X] T002 [P] Skim reuse targets: `lib/product-items/erp-priority-sync.ts`, `app/api/admin/product-items/sync-erp-priorities/route.ts`, `lib/osf/monthly-sales.ts`, `lib/osf/erp-stock.ts`, `lib/osf/erp-purchases.ts`, `lib/osf/column-config.ts`, `lib/osf/catalog-rows.ts`, `app/api/admin/osf/profiles/[sku]/route.ts`, `components/organisms/osf-hub-panel.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Assist window + sales-range helpers and Zod — blocks US1–US4 shared logic

**CRITICAL**: No user story work until this phase completes

- [X] T003 [P] Implement assist window + suggested ROP helpers in `lib/osf/assist-window.ts` — purchase date→asOf (inclusive display / exclusive end bound), else asOf−30 days; `suggestedRop = roundHalfUp(sales)`; future/invalid purchase → 30-day fallback per `specs/023-osf-rop-assist/research.md` R2/R4
- [X] T004 [P] Add Vitest in `lib/osf/assist-window.test.ts` covering purchase window, 30-day fallback, invalid/future purchase, rounding (12.5→13, 0→0)
- [X] T005 Implement `aggregateSalesBySkuInRange` in `lib/osf/assist-sales.ts` — same completion rules as `lib/osf/monthly-sales.ts` (`delivery_complete`|`invoice_complete`, date = deliveryCompleteAt ?? invoiceCompleteAt) for `[start, end)` UTC bounds derived from Colombo dates
- [X] T006 [P] Refactor shared order completion filter from `lib/osf/monthly-sales.ts` into a small shared helper used by monthly + assist-sales (avoid divergent sales definitions)
- [X] T007 [P] Add Vitest in `lib/osf/assist-sales.test.ts` (unit with mocked prisma or pure date-bound helpers) proving window bounds feed the query correctly
- [X] T008 [P] Add Zod schemas in `lib/validation/osf.ts` for assist page-data query (`asOfDate`, `priority`, `page`, `limit`, `q`) and PUT assist rops body (`items[{ sku, ropQty }]`, max 200) per `contracts/osf-rop-assist.md`

**Checkpoint**: Helpers + validation ready; stories can consume them

---

## Phase 3: User Story 1 - Open OSF page refreshes live ERP data (Priority: P1) 🎯 MVP

**Goal**: Opening OSF (and manual Refresh) syncs Product Priority from both ERPs; assist can load live stock afterward

**Independent Test**: Change ERP priority/stock; open OSF without visiting Items; refresh runs and new priority/stock appear (or clear partial ERP failure)

### Implementation for User Story 1

- [X] T009 [US1] Implement `POST` `app/api/admin/osf/assist/refresh/route.ts` — require `purchasing.osf.read`; call `syncErpProductPriorities`; return sources/updatedRows; `maxDuration` 300; 502 if all sources failed per contract
- [X] T010 [US1] Create `components/organisms/osf-rop-assist-panel.tsx` shell — on mount call refresh; show syncing / success / partial-failure banner; Refresh button; wire into `components/organisms/osf-hub-panel.tsx` for users with `purchasing.osf.read` (pass capability from OSF page)
- [X] T011 [P] [US1] Ensure `app/(dashboard)/dashboard/purchasing/osf/page.tsx` passes `canReadOsf` / `canManage` flags needed for assist panel visibility

**Checkpoint**: US1 — open OSF triggers priority sync with visible status

---

## Phase 4: User Story 2 - Top Priority work list + sales window metrics (Priority: P1)

**Goal**: Paginated assist list defaults to Top Priority; each row shows stock, purchase date, window, sales, current ROP, suggested ROP

**Independent Test**: Default filter Top Priority; SKU with purchase date shows that window’s sales; SKU without purchase uses last 30 days

### Implementation for User Story 2

- [X] T012 [US2] Implement `GET` `app/api/admin/osf/assist/page-data/route.ts` — auth `purchasing.osf.read`; filter catalog by priority (erp1|erp2 exact match, default `Top Priority`, `all` clears); paginate; attach last purchase (ERP), window + sales via assist helpers, live total stock via OSF columns/bins, current `ProductOsfRop` map, `suggestedRop`; soft-fail stock with warnings per contract
- [X] T013 [US2] Extend `components/organisms/osf-rop-assist-panel.tsx` — load page-data after refresh; priority filter (default Top Priority) + search + pagination; table columns: SKU, title, priority, window, sales, total stock, current ROP summary, suggested ROP
- [X] T014 [P] [US2] Add/adjust Vitest for any pure mappers used by page-data (e.g. priority match, row DTO build) under `lib/osf/` if extracted

**Checkpoint**: US2 — managers see Top Priority–first assist metrics without Excel

---

## Phase 5: User Story 3 - Suggest ROP review, edit, save (Priority: P1)

**Goal**: Suggested ROP = sales in window; accept/edit selected rows; save upserts all active includeInRop columns; no silent overwrite

**Independent Test**: Accept/edit subset → only those SKUs’ ROPs change; viewer cannot save

### Implementation for User Story 3

- [X] T015 [US3] Implement `PUT` `app/api/admin/osf/assist/rops/route.ts` — require `purchasing.osf.manage`; validate body; upsert `ProductOsfRop` for each sku × active includeInRop columnKey; partial success with per-sku errors per contract
- [X] T016 [US3] Extend `components/organisms/osf-rop-assist-panel.tsx` — row checkbox, editable suggested/override qty, Accept selected / Save with busy spinner + `notify`; hide save when `!canManageRops`; do not write ROPs until Save
- [X] T017 [P] [US3] Confirm `canManageRops` in page-data reflects `purchasing.osf.manage` and viewer PUT returns 403

**Checkpoint**: US3 — explicit save path works end-to-end

---

## Phase 6: User Story 4 - Download OSF after decisions (Priority: P2)

**Goal**: Generate OSF uses ROPs saved via assist; stock still live at generate

**Independent Test**: Save assist ROP → download OSF → ROP column matches

### Implementation for User Story 4

- [X] T018 [US4] Verify `app/api/admin/osf/generate/route.ts` already reads `ProductOsfRop` (no change expected); add a short note in `components/organisms/osf-rop-assist-panel.tsx` / hub copy that Generate uses saved ROPs
- [X] T019 [P] [US4] Manual/quickstart check documented in `specs/023-osf-rop-assist/quickstart.md` §5 (mark steps executable)

**Checkpoint**: US4 — assist → generate loop confirmed

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Tests, UX polish, validation pass

- [X] T020 [P] Run `npm test -- lib/osf/assist-window.test.ts lib/osf/assist-sales.test.ts` (and related)
- [X] T021 [P] Lint/typecheck touched assist routes and panel files
- [X] T022 Run quickstart scenarios in `specs/023-osf-rop-assist/quickstart.md` (refresh, Top Priority window, save, generate)
- [X] T023 [P] Action-loading UX on Refresh/Save buttons (`Loader2`, disable while busy, `notify`) per `.cursor/rules/action-loading-ux.mdc`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all stories
- **US1 (Phase 3)**: After Foundational — MVP refresh shell
- **US2 (Phase 4)**: After US1 shell (panel exists); needs T003–T007 for metrics
- **US3 (Phase 5)**: After US2 list UI
- **US4 (Phase 6)**: After US3 save
- **Polish (Phase 7)**: After desired stories

### User Story Dependencies

- **US1**: No dependency on US2–US4
- **US2**: Needs US1 panel mount + foundational helpers
- **US3**: Needs US2 page-data + UI
- **US4**: Needs US3 saves (verify-only on generate)

### Parallel Opportunities

- T003/T004 and T005–T007 can proceed in parallel after T001/T002
- T008 parallel with helpers
- Within US2: mapper tests [P] alongside UI once API shape stable
- Polish T020/T021/T023 parallel

---

## Parallel Example: Foundational

```bash
Task: "Implement lib/osf/assist-window.ts"
Task: "Add lib/osf/assist-window.test.ts"
Task: "Implement lib/osf/assist-sales.ts + monthly-sales share"
Task: "Add Zod assist schemas in lib/validation/osf.ts"
```

## Parallel Example: User Story 3

```bash
Task: "PUT assist/rops route"
Task: "Wire Accept/Save UI on osf-rop-assist-panel"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1–2 helpers  
2. Phase 3 refresh on open + banner  
3. **STOP** — validate ERP priority sync from OSF page  

### Incremental Delivery

1. US1 refresh → demo live priorities on open  
2. US2 work list + windows → demo Top Priority metrics  
3. US3 save → demo suggest/review/save  
4. US4 confirm generate  
5. Polish  

### Parallel Team Strategy

- Dev A: helpers + page-data API (US2)  
- Dev B: refresh API + panel UX (US1/US3)  
- Dev C: tests + quickstart  

---

## Notes

- No Prisma migration expected for v1  
- Suggested ROP never persisted until PUT  
- Apply one accepted `ropQty` to all active `includeInRop` columns  
- Format validation: all tasks use `- [ ] Tnnn` with file paths; story tasks include `[USn]`
