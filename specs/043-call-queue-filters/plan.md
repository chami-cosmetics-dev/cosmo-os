# Implementation Plan: Merchant Call Queue Filters, Assign, Export & Sales Report

**Branch**: `043-call-queue-filters` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/043-call-queue-filters/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Extend **Assign merchant call queue** (Insight admin) with targeting filters (Push Gold / Platinum **without** showing amounts, loyalty, last purchase, brand), hide/retry rules (2-month allocation/update, 1-week **Not Responding**, permanent Black List / Wrong Number), select count N / page / all on the **eligible** matching set, Excel of **full assignment history**, and a live sales-after-assign / after-contact report. Reuse `lib/customer-insight/call-queue.ts`, lifetime totals, brand ID lookup, `xlsx` export, and `hasInsightAdminView`. Prisma: drop one-row-per-contact unique and snapshot lifetime at assign.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: `customer-insight-panel.tsx`, `lib/customer-insight/call-queue.ts`, Zod `lib/validation/customer-insight.ts`, Prisma, `xlsx`, `lifetimeTotalsByContactId`, `findContactsByPurchasedBrandRanked`, Auth0 + `requirePermission` + `hasInsightAdminView`

**Storage**: Neon PostgreSQL (vault / cosmo-dev / cosmo-prod). **Migration required**: drop `ContactInsightCallQueue` unique `(companyId, contactId)`; add `lifetimeTotalAtAssign`; index `(companyId, contactId, status)`. `npm run db:migrate:create` then `db:deploy:all`. No `db push` on shared DBs.

**Testing**: Vitest — inclusive call-queue push bands, hide-window helper, eligible-N skip queued. Manual [quickstart.md](./quickstart.md) for UI / Excel / report.

**Target Platform**: Cosmo OS dashboard (web)

**Project Type**: Web application (extend existing Insight call-queue APIs + panel)

**Performance Goals**: Filter + hide on server; paginate 50; eligible-ids for N/all; assign still max 200 per request with UI remainder; chunk lifetime totals

**Constraints**: Server-side authZ + Zod; do not change insight list filter bar (039); do not change live `isPushToGold` exclusivity; Principle V — extend call-queue module, no parallel CRM; Constitution I for schema

**Scale/Scope**: One Insight admin card + 2–3 API routes (eligible-ids, export, report) + candidate query expansion + call-queue assign insert-history

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS (with migration)**: Unique drop + snapshot column via `db:migrate:create` / `db:deploy:all`; never `prisma db push` on vault/cosmo-dev/cosmo-prod.
- **II. Environment & Credential Isolation — PASS**: No new secrets.
- **III. Test & Typecheck Gates — PASS**: Vitest on hide/push/eligible helpers; lint changed files; no mobile changes expected.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Extend existing call-queue + Insight panel; no new roles; Excel via existing `xlsx`; hide rules as a tested helper.

**Post-design re-check**: Still PASS — research R1–R9 keep push bands local to call-queue, history via dropping unique (required by spec), report on-read.

## Project Structure

### Documentation (this feature)

```text
specs/043-call-queue-filters/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── call-queue-assign.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<ts>_call_queue_assign_history/

lib/customer-insight/loyalty-tier.ts          # optional: do NOT change isPushToGold; add call-queue inclusive helpers here or call-queue-filters.ts
lib/customer-insight/call-queue.ts            # filter pipeline, hide, insert history, snapshot total
lib/customer-insight/call-queue-hide.ts       # NEW: hide windows + tests
lib/customer-insight/call-queue-report.ts     # NEW: after-assign / after-contact sums
lib/customer-insight/call-queue.test.ts
lib/validation/customer-insight.ts            # candidates filters, eligible-ids, export, report Zod

app/api/admin/customer-insight/call-queue/candidates/route.ts
app/api/admin/customer-insight/call-queue/eligible-ids/route.ts   # NEW
app/api/admin/customer-insight/call-queue/assign/route.ts
app/api/admin/customer-insight/call-queue/export/route.ts         # NEW
app/api/admin/customer-insight/call-queue/report/route.ts         # NEW

app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx
```

**Structure Decision**: Single Cosmo OS Next.js app. Call-queue stays under `lib/customer-insight` + existing admin API folder. No mobile, no new package.

## Complexity Tracking

> No constitution violations.
