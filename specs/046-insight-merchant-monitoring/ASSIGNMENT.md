# Assignment: Merchant Monitoring (Nener)

**Feature**: `046-insight-merchant-monitoring`  
**Branch**: `feature/customer-insight` (or create `046-insight-merchant-monitoring` from latest `main`)  
**Est. effort**: 3–5 days (Phases 1–9 in `tasks.md`)

## What you're building

Admin **Merchant monitoring** card on Customer Insight → **Admin** tab:

- Per-merchant portfolio: allocated, Gold/Plat/Standard, DOB %, email %
- Period filter: Today / MTD / custom (purchase metrics only)
- Recency buckets with tier breakdown
- PDF export, drill-down to Insight filter
- Call-queue banner for missing DOB/email

**Spec is done.** Your job is implementation from `tasks.md`.

## Day 0 — Setup

1. Pull latest `feature/customer-insight` (or `main` after merge).
2. Read in order (30–45 min):
   - `spec.md` — what & why
   - `plan.md` — architecture
   - `research.md` — **read R1–R10** (R10 = perf lessons)
   - `contracts/merchant-monitoring.md` — API contract
   - `data-model.md` — DTO shapes
3. `npm run env:use cosmo-dev` → `npm run dev`
4. Open `/dashboard/customer-insight` → Admin tab — **no Merchant monitoring yet** (expected).

## How to work (task order)

Work **strictly** through `tasks.md` Phases 1–9. Check off `[ ]` → `[x]` as you finish each task.

| Phase | Focus | Deliverable |
|-------|--------|-------------|
| 1–2 | Helpers + Zod + report skeleton | Tests pass: `npm test -- lib/customer-insight/merchant-monitoring` |
| 3 (US1) | Portfolio table + API | Admin sees merchant rows |
| 4 (US2) | Period filter | Purchased-in-period column updates |
| 5 (US3) | Recency matrix | Bucket tier breakdown |
| 6 (US4) | Merchant filter + drill-down | Click cell → Filter tab |
| 7 (US5) | PDF export | Download matches screen |
| 8 (US6) | Call-queue DOB/email banner | Alert on missing fields |
| 9 | Polish | Full `quickstart.md` pass |

**MVP checkpoint**: Stop after Phase 3 and demo portfolio table before continuing.

## Key files you'll create

```
lib/customer-insight/merchant-monitoring-recency.ts (+ test)
lib/customer-insight/merchant-monitoring-period.ts (+ test)
lib/customer-insight/merchant-monitoring.ts (+ test)
lib/customer-insight/merchant-monitoring-pdf.ts
app/api/admin/customer-insight/merchant-monitoring/route.ts
app/api/admin/customer-insight/merchant-monitoring/export/route.ts
```

## Key files you'll modify

```
lib/validation/customer-insight.ts
lib/customer-insight/filters.ts
app/api/admin/customer-insight/filter/route.ts
app/api/admin/customer-insight/filter/export/route.ts
app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx
```

## Patterns to copy

- Period chips: `app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx`
- Allocation rollup: `lib/customer-insight/allocation-summary.ts`
- PDF: `lib/dispatch-pdf.ts` (pdfmake)
- Loading UX: `.cursor/rules/action-loading-ux.mdc`

## Rules (do not break)

- **No Prisma migration** — read-only rollups from `ContactMaster`
- Tier = `effectiveLoyaltyTierKey` only (research R1)
- Portfolio counts **do not** change when period changes (research R3)
- Auth: `contacts.insight.read` + `hasInsightAdminView`
- Keep existing **Merchant allocations** CSV export (FR-011)

## Performance (critical — read R10)

Before marking Phase 3 done, load monitoring on dev with real data. Must not hang on "Loading monitoring…".

- Batch DB queries; no N+1 Adapt calls
- Filter order/purchase queries to allocated contact keys — never scan all company orders
- Portfolio rollup: `ContactMaster` fields only — no phones/emails joins

## Definition of done

- [ ] All 34 tasks in `tasks.md` checked
- [ ] `npm test -- lib/customer-insight/merchant-monitoring` green
- [ ] Lint clean on changed files
- [ ] All scenarios in `quickstart.md` pass
- [ ] PR to `feature/customer-insight` with screenshots (portfolio, period, recency, PDF)

## When stuck

1. Re-read `research.md` decision for that area
2. Compare with `allocation-summary.ts` / existing filter code
3. Ask mentor with: task ID, what you tried, error or screenshot

## PR title suggestion

`feat(insight): merchant monitoring portfolio and recency (046)`
