# Implementation Plan: Insight Merchant Monitoring

**Branch**: `046-insight-merchant-monitoring` | **Date**: 2026-08-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/046-insight-merchant-monitoring/spec.md`

## Summary

Add **Merchant monitoring** to Customer Insight **Admin** tab: per-merchant portfolio rollups (allocated, Gold/Plat/Standard, DOB %, email %), purchase recency buckets with tier splits, Today/MTD/custom period filter, PDF export, and drill-down into existing Insight filter. Surface missing DOB/email when opening queued contacts. **No Prisma migration** — derived from `ContactMaster` + purchase history via new `lib/customer-insight/merchant-monitoring*.ts` helpers and two admin API routes.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20, Next.js App Router

**Primary Dependencies**: React, Prisma, Zod, pdfmake (existing), Auth0 RBAC (`hasInsightAdminView`, `contacts.insight.read`), existing customer-insight libs (`allocation-summary`, `erp-loyalty`, `loyalty-profile-complete`, `filters`)

**Storage**: Neon PostgreSQL — **read-only**; no schema changes

**Testing**: Vitest for recency classifier, period resolver, rollup invariants; manual UAT per [quickstart.md](quickstart.md); `npm test` + lint on touched files

**Target Platform**: Cosmo OS web — `/dashboard/customer-insight` Admin tab

**Performance Goals**: Initial portfolio + company recency loads in one API round-trip; target <5s for ~50k allocated contacts on dev hardware (batch contact fetch + in-memory rollup per [research.md](research.md) R4)

**Constraints**: One page-data-style endpoint; extend existing filter API for drill-down; keep allocation-summary CSV; Colombo date boundaries; assigned-tier-only rollups

**Scale/Scope**: ~12–18 files — monitoring lib + tests, 2 API routes, PDF helper, validation extensions, filter.ts extensions, customer-insight-panel UI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS**: No schema change; no migration.
- **II. Environment & Credential Isolation — PASS**: No new env files or secrets.
- **III. Test & Typecheck Gates — PASS**: Vitest for pure helpers; CI unchanged.
- **IV. Production Deployment Safety — PASS**: Planning only in this phase.
- **V. Simplicity & Scope Discipline — PASS**: Extends Insight Admin tab and filter API; reuses allocation-summary alias map, pdfmake, profile completeness; no parallel monitoring route or summary table.

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](data-model.md) — derived DTOs only, no writes.
- [contracts/merchant-monitoring.md](contracts/merchant-monitoring.md) — two GET routes + filter extensions.
- [research.md](research.md) — tier, recency, period, PDF, drill-down resolved.
- [quickstart.md](quickstart.md) — regression on allocation CSV and call queue.

## Project Structure

### Documentation (this feature)

```text
specs/046-insight-merchant-monitoring/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── merchant-monitoring.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
lib/customer-insight/
├── merchant-monitoring.ts              # NEW: buildMerchantMonitoringReport
├── merchant-monitoring-recency.ts        # NEW: classifyPurchaseRecencyBucket
├── merchant-monitoring-recency.test.ts   # NEW
├── merchant-monitoring-period.ts         # NEW: resolveMerchantMonitoringPeriod
├── merchant-monitoring-period.test.ts    # NEW
├── merchant-monitoring.test.ts           # NEW: rollup invariants
├── merchant-monitoring-pdf.ts            # NEW: generateMerchantMonitoringPdf
├── allocation-summary.ts                 # reuse alias map
├── erp-loyalty.ts                        # effectiveLoyaltyTierKey
├── loyalty-profile-complete.ts           # DOB/email completeness
└── filters.ts                            # extend: lastPurchase, loyalty, hasLastPurchase

lib/validation/
└── customer-insight.ts                   # monitoring query + filter extensions

app/api/admin/customer-insight/
├── merchant-monitoring/route.ts          # NEW GET JSON
└── merchant-monitoring/export/route.ts   # NEW GET PDF

app/(dashboard)/dashboard/customer-insight/
└── customer-insight-panel.tsx            # monitoring UI, period, PDF, drill-down, DOB/email banner
```

**Structure Decision**: Single Next.js app; Admin tab extension only. No new dashboard route.

## Implementation Phases

### Phase A — Pure helpers (P1 foundation)

1. `merchant-monitoring-recency.ts` — bucket classifier + `recencyBucketToLastPurchaseRange`.
2. `merchant-monitoring-period.ts` — validate/clamp dates, period labels.
3. Vitest: boundary days (0, 1, 30, 31, 90, 91, 180, 181, 365, 366, null).

### Phase B — Report builder (P1 data)

1. `merchant-monitoring.ts` — `buildMerchantMonitoringReport(companyId, input)`:
   - Load contacts (batched select).
   - Alias rollup via allocation-summary helpers.
   - Portfolio + recency accumulators.
   - Purchased-in-period batched queries (Adapt + orders).
2. Vitest: tier sum invariant, one contact → one bucket, merchant filter scope.

### Phase C — API routes (P1)

1. Zod `customerInsightMerchantMonitoringQuerySchema`.
2. `GET merchant-monitoring/route.ts` — auth + JSON.
3. `GET merchant-monitoring/export/route.ts` — auth + PDF.

### Phase D — Filter drill-down (P2)

1. Extend `customerInsightFilterQuerySchema` + `filters.ts` for `lastPurchaseFrom/To`, `loyalty`, `hasLastPurchase`.
2. Panel: cell click → set filter tab state + fetch filter list.

### Phase E — UI (P1/P2)

1. Merchant monitoring card: period chips, merchant dropdown, portfolio table, recency matrix.
2. Export PDF button (`busyKey` pattern).
3. Replace or sit above allocation summary (keep CSV card or merge actions).

### Phase F — Call queue profile banner (P2)

1. On contact load from call queue context, Alert for missing Email / Birth date only.
2. Reuse existing profile save path.

### Phase G — PDF (P2)

1. `merchant-monitoring-pdf.ts` — landscape tables (portfolio + recency).
2. Wire export route.

## Complexity Tracking

No constitution violations. Empty table intentionally omitted.

## Artifacts Generated (Phase 0–1)

| Artifact | Path |
|----------|------|
| Research | [research.md](research.md) |
| Data model | [data-model.md](data-model.md) |
| API contract | [contracts/merchant-monitoring.md](contracts/merchant-monitoring.md) |
| Quickstart | [quickstart.md](quickstart.md) |

## Next Step

Run `/speckit-tasks` to produce `tasks.md` with dependency-ordered implementation tasks.
