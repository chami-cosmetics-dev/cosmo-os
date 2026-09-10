# Tasks: Insight Merchant Monitoring

**Input**: Design documents from `/specs/046-insight-merchant-monitoring/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/merchant-monitoring.md, quickstart.md

**Tests**: Plan requires Vitest for recency classifier, period resolver, and rollup invariants. Unit-test tasks included (not full TDD-first contract suite). Manual checks in `quickstart.md`.

**Organization**: Tasks grouped by user story. P1 stories (US1–US3) form MVP core; implement in order US1 → US2 → US3, then P2 stories US4–US6.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no unfinished dependency)
- **[Story]**: US1–US6 from spec.md
- Exact file paths in every task

## Path Conventions

Cosmo OS Next.js app at repo root (`app/`, `lib/`). **No Prisma migration** for this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature docs; Constitution I — no schema work

- [ ] T001 Confirm docs exist under `specs/046-insight-merchant-monitoring/` (plan.md, spec.md, research.md, data-model.md, contracts/merchant-monitoring.md, quickstart.md)
- [ ] T002 [P] Confirm no Prisma changes needed for this feature (Constitution I — read-only rollups from `ContactMaster`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure helpers + Zod + report types so all user stories can build on one loader

**⚠️ CRITICAL**: No user story work until this phase completes

- [ ] T003 [P] Add `classifyPurchaseRecencyBucket` and `recencyBucketToLastPurchaseRange` in `lib/customer-insight/merchant-monitoring-recency.ts` per `specs/046-insight-merchant-monitoring/research.md` R2
- [ ] T004 [P] Add Vitest for recency boundaries (today, 1–30, 31–90, 91–180, 181–365, 365+, never) in `lib/customer-insight/merchant-monitoring-recency.test.ts`
- [ ] T005 [P] Add `resolveMerchantMonitoringPeriod` (clamp future `toYmd`, reject `fromYmd > toYmd`, period labels) in `lib/customer-insight/merchant-monitoring-period.ts`
- [ ] T006 [P] Add Vitest for period validation and clamping in `lib/customer-insight/merchant-monitoring-period.test.ts`
- [ ] T007 Add `customerInsightMerchantMonitoringQuerySchema` (`fromYmd`, `toYmd`, optional `assignedMerchant`, optional `preset`) in `lib/validation/customer-insight.ts` per `specs/046-insight-merchant-monitoring/contracts/merchant-monitoring.md`
- [ ] T008 Add DTO types and `buildMerchantMonitoringReport` skeleton (empty portfolio/recency stubs) in `lib/customer-insight/merchant-monitoring.ts`; export from `lib/customer-insight/index.ts` if needed

**Checkpoint**: Helpers + schema + report entry point ready — user stories can start

---

## Phase 3: User Story 1 - Merchant portfolio snapshot (Priority: P1) 🎯 MVP

**Goal**: Admin sees per-merchant allocated total, Gold/Plat/Standard counts, DOB % and email % on Customer Insight Admin tab

**Independent Test**: Load monitoring table → tier counts sum to allocated total; DOB/email % match spot-check on Contact Master for one merchant

### Tests for User Story 1

- [ ] T009 [P] [US1] Add Vitest for portfolio rollup invariants (tier sum, DOB/email counts, alias rollup) in `lib/customer-insight/merchant-monitoring.test.ts`

### Implementation for User Story 1

- [ ] T010 [US1] Implement portfolio rollup in `buildMerchantMonitoringReport` in `lib/customer-insight/merchant-monitoring.ts` — batched `contactMaster.findMany`, alias map from `lib/customer-insight/allocation-summary.ts`, `effectiveLoyaltyTierKey`, DOB/email completeness from `lib/customer-insight/loyalty-profile-complete.ts`
- [ ] T011 [US1] Add `GET` `app/api/admin/customer-insight/merchant-monitoring/route.ts` — `requirePermission("contacts.insight.read")`, `hasInsightAdminView`, return portfolio rows + `companyPortfolio` + `unallocatedCount` per contract
- [ ] T012 [US1] Add **Merchant monitoring** card with portfolio table (Merchant, Allocated, Gold, Plat, Standard, DOB %, Email %) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` — gate on `canExportFilteredCsv`; fetch on mount with default MTD dates

**Checkpoint**: US1 portfolio table independently testable (no period chips or recency yet — use fixed default dates in fetch)

---

## Phase 4: User Story 2 - Period filter for purchase activity (Priority: P1)

**Goal**: Today / MTD / custom range updates purchased-in-period counts; portfolio snapshot unchanged when period changes

**Independent Test**: Switch Today ↔ MTD → `purchasedInPeriodCount` changes; allocated total and DOB/email % unchanged

### Implementation for User Story 2

- [ ] T013 [US2] Implement `purchasedInPeriodCount` in `buildMerchantMonitoringReport` in `lib/customer-insight/merchant-monitoring.ts` — batched Adapt `invoiceDate` + Cosmo orders per `specs/046-insight-merchant-monitoring/research.md` R3/R4
- [ ] T014 [US2] Add period preset chips (Today / MTD / Custom) and date inputs in Merchant monitoring card in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` — mirror `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx` pattern
- [ ] T015 [US2] Wire period change to re-fetch `GET /api/admin/customer-insight/merchant-monitoring` with resolved `fromYmd`/`toYmd`; show `periodLabel` in card header
- [ ] T016 [US2] Add **Purchased in period** column to portfolio table in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US1 + US2 period behavior independently testable

---

## Phase 5: User Story 3 - Purchase recency buckets with tier breakdown (Priority: P1)

**Goal**: Per-merchant and company recency matrix (Today, 1–30, …, 365+, Never) with Gold/Plat/Standard sub-counts anchored to `periodEndYmd`

**Independent Test**: Known `lastPurchaseAt` contacts land in correct bucket; tier sub-counts sum to bucket total

### Tests for User Story 3

- [ ] T017 [P] [US3] Extend `lib/customer-insight/merchant-monitoring.test.ts` — one contact → exactly one recency bucket; `companyRecency` equals sum of merchant rows

### Implementation for User Story 3

- [ ] T018 [US3] Implement recency + tier accumulators in `buildMerchantMonitoringReport` in `lib/customer-insight/merchant-monitoring.ts` using `classifyPurchaseRecencyBucket` and `lastPurchaseAt`
- [ ] T019 [US3] Return `recencyRows` and `companyRecency` from `app/api/admin/customer-insight/merchant-monitoring/route.ts`
- [ ] T020 [US3] Add recency bucket matrix UI (rows = buckets, columns = Gold / Plat / Standard / Total) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx` — company totals when all merchants; per-merchant when filtered

**Checkpoint**: P1 complete — portfolio + period + recency all working in one view

---

## Phase 6: User Story 4 - Filter by merchant and drill to contacts (Priority: P2)

**Goal**: Merchant dropdown narrows metrics; clicking a bucket/tier cell opens Insight Filter tab pre-scoped

**Independent Test**: Filter to merchant A → only A's rows; click Gold in 31–90 days → filter list matches expected contacts

### Implementation for User Story 4

- [ ] T021 [P] [US4] Extend `customerInsightFilterFieldsSchema` with `lastPurchaseFrom`, `lastPurchaseTo`, `loyalty`, `hasLastPurchase` in `lib/validation/customer-insight.ts` per contract
- [ ] T022 [US4] Apply new filter fields in `filterAllocatedContacts` in `lib/customer-insight/filters.ts` — loyalty via `effectiveLoyaltyTierKey`; last purchase inclusive Colombo bounds; `hasLastPurchase=false` → `lastPurchaseAt` null
- [ ] T023 [US4] Pass optional `assignedMerchant` query param through `app/api/admin/customer-insight/merchant-monitoring/route.ts` and `buildMerchantMonitoringReport` in `lib/customer-insight/merchant-monitoring.ts`
- [ ] T024 [US4] Add merchant dropdown (reuse call-queue merchant options pattern) to Merchant monitoring card in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [ ] T025 [US4] On recency/portfolio cell click, switch to Filter tab with `assignedMerchant`, `loyalty`, and `recencyBucketToLastPurchaseRange` params in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US4 drill-down independently testable

---

## Phase 7: User Story 5 - PDF export (Priority: P2)

**Goal**: Export current monitoring view (period, filters, portfolio + recency) as PDF

**Independent Test**: Export MTD PDF → header shows period; numbers match on-screen table

### Implementation for User Story 5

- [ ] T026 [P] [US5] Implement `generateMerchantMonitoringPdf` (landscape tables, period header) in `lib/customer-insight/merchant-monitoring-pdf.ts` — follow `lib/dispatch-pdf.ts` pdfmake pattern
- [ ] T027 [US5] Add `GET` `app/api/admin/customer-insight/merchant-monitoring/export/route.ts` — same auth/query as JSON route; `Content-Type: application/pdf`
- [ ] T028 [US5] Add **Export PDF** button with `busyKey` loading UX in Merchant monitoring card in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`

**Checkpoint**: US5 PDF export independently testable

---

## Phase 8: User Story 6 - Surface missing DOB and email when contacting (Priority: P2)

**Goal**: Call-queue contact open highlights empty Email and Birth date for on-call collection

**Independent Test**: Open queued contact missing email/DOB → banner shows; save profile → banner clears; monitoring % updates on refresh

### Implementation for User Story 6

- [ ] T029 [US6] When insight loads from call-queue context, show `Alert` for missing **Email** and **Birth date** only (subset of `getLoyaltyProfileMissingFields`) in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [ ] T030 [US6] Hide banner when profile save succeeds and both fields complete — reuse existing profile PATCH flow; no new API

**Checkpoint**: US6 banner independently testable

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Regression, UX, validation

- [ ] T031 [P] Keep existing **Merchant allocations** CSV export (`app/api/admin/customer-insight/allocation-summary/export/route.ts`) and Refresh — do not remove FR-011
- [ ] T032 [P] Apply `busyKey` / spinner / disable pattern on Refresh and Export PDF in Merchant monitoring card per `.cursor/rules/action-loading-ux.mdc` in `app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx`
- [ ] T033 Run `npm test -- lib/customer-insight/merchant-monitoring` and fix failures; lint changed files
- [ ] T034 Run manual scenarios in `specs/046-insight-merchant-monitoring/quickstart.md` (portfolio, period, recency, drill-down, PDF, CSV retained, permission gate)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Foundational — **MVP**
- **US2 (Phase 4)**: Depends on US1 report + API + table shell
- **US3 (Phase 5)**: Depends on US1 report builder; parallel with US2 after US1 if split work
- **US4 (Phase 6)**: Depends on US3 recency UI + filter API extensions
- **US5 (Phase 7)**: Depends on US1–US3 (full report payload for PDF)
- **US6 (Phase 8)**: Independent of monitoring API — can run parallel to US4–US5 after Foundational
- **Polish (Phase 9)**: Depends on desired stories complete

### User Story Dependencies

| Story | Depends on | Can parallel with |
|-------|------------|-------------------|
| US1 | Foundational | — |
| US2 | US1 | US3 (after US1) |
| US3 | US1 | US2 (after US1) |
| US4 | US3 | US5, US6 |
| US5 | US1–US3 | US4, US6 |
| US6 | Foundational only | US4, US5 |

### Within Each User Story

- Vitest tasks [P] before or alongside implementation in same phase
- `merchant-monitoring.ts` report builder before API routes
- API before panel wiring
- Filter schema (`filters.ts`) before drill-down click handlers

### Parallel Opportunities

- **Phase 2**: T003+T004, T005+T006 in parallel; T007–T008 sequential after
- **Phase 3**: T009 parallel with T010 start; T011 after T010
- **Phase 6**: T021 parallel with T023; T022 after T021
- **Phase 7**: T026 parallel with US4 filter work
- **Phase 8**: US6 entirely parallel to US4–US5 once Foundational done

---

## Parallel Example: Foundational

```bash
# Recency + period helpers together:
Task T003: lib/customer-insight/merchant-monitoring-recency.ts
Task T004: lib/customer-insight/merchant-monitoring-recency.test.ts
Task T005: lib/customer-insight/merchant-monitoring-period.ts
Task T006: lib/customer-insight/merchant-monitoring-period.test.ts
```

## Parallel Example: After US1

```bash
# Two developers after T012 checkpoint:
Developer A: US2 (T013–T016) purchased-in-period + period UI
Developer B: US3 (T017–T020) recency rollup + matrix UI
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (portfolio table + API)
4. **STOP and VALIDATE**: quickstart scenario 1
5. Demo to stakeholders

### Incremental Delivery (recommended)

1. Setup + Foundational → helpers ready
2. US1 → portfolio MVP
3. US2 → period filter + purchased-in-period
4. US3 → recency matrix (P1 complete)
5. US4 → drill-down
6. US5 → PDF
7. US6 → call-queue DOB/email banner
8. Polish → quickstart full pass

### Task Count Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Setup | 2 | — |
| Foundational | 6 | — |
| US1 Portfolio | 4 | 4 |
| US2 Period | 4 | 4 |
| US3 Recency | 4 | 4 |
| US4 Drill-down | 5 | 5 |
| US5 PDF | 3 | 3 |
| US6 Banner | 2 | 2 |
| Polish | 4 | — |
| **Total** | **34** | **22 story tasks** |

---

## Notes

- Tier counts use `effectiveLoyaltyTierKey` only — not `classifyLoyaltyTierKey(lifetimeTotal)` (research R1)
- Portfolio metrics do **not** change when period changes; only `purchasedInPeriodCount` and recency buckets do (spec FR-008)
- Do not add Prisma migration or materialized summary table (research R4)
- Recency `asOfYmd` = `toYmd` from period resolution
- Drill-down `never` bucket → `hasLastPurchase=false` filter param
