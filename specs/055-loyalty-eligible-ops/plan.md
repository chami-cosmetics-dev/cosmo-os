# Implementation Plan: Loyalty Eligible Ops & Call Queue Enhancements

**Branch**: `055-loyalty-eligible-ops` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/055-loyalty-eligible-ops/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Surface **loyalty-eligible pending counts** for Insight admins (company list + merchant-wise pending / MTD updated) and a visible **count** on Merchant Dashboard Loyalty eligible (list already exists; array length is capped — need true total). Send a **weekly admin-only** showdown email reusing `CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS`. Extend Assign merchant call queue with **assigned-date** + **not-contacted** filters (queue-history mode), **multi-brand** OR matching, and make the sales report show **Assigned date** detail rows plus **Excel export**.

## Technical Context

**Language/Version**: TypeScript 5, Next.js App Router (Cosmo OS web)

**Primary Dependencies**: `lib/customer-insight/*` (loyalty-outreach, call-queue, call-queue-report, lifetime totals), `lib/page-data/merchant-dashboard-loyalty.ts`, `lib/call-center-weekly-email.ts` recipients + Maileroo, Zod `lib/validation/customer-insight.ts`, `xlsx`, Auth0 / `hasInsightAdminView` / merchant dashboard access

**Storage**: Neon PostgreSQL (vault / cosmo-dev / cosmo-prod). **Migration likely**: `ContactMaster.loyaltyOutreachUpdatedAt` (and optionally `loyaltyEligibleAt`) to power MTD/week **updated** and **newly eligible** without abusing `updatedAt`. Use `npm run db:migrate:create` then `db:deploy:all`. No `db push` on shared DBs.

**Testing**: Vitest — pending/newly/updated counters, multi-brand OR intersect, assigned-date + not-contacted queue filters, email HTML/snapshot helpers. Manual [quickstart.md](./quickstart.md).

**Target Platform**: Cosmo OS dashboard (web) + Vercel cron

**Project Type**: Web application (extend Insight + merchant dashboard + cron email)

**Performance Goals**: Merchant-wise summaries via batched lifetime totals (reuse chunk patterns); email aggregation once/week; call-queue filters stay server-side with existing pageSize 50

**Constraints**: Asia/Colombo day bounds; reuse call-center recipient constant (no parallel hardcode); do not weaken Black List / Wrong Number / hide windows; Principle V — extend existing modules; Constitution I for any schema change

**Scale/Scope**: ~tens of merchants; loyalty candidate pools already capped in UI (count query must be accurate beyond card `take`); call-queue history volume same as 043 report

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS (with migration)**: Timestamp column(s) via `db:migrate:create` / `db:deploy:all` if needed; never `prisma db push` on vault/cosmo-dev/cosmo-prod.
- **II. Environment & Credential Isolation — PASS**: Reuse Maileroo + `CRON_SECRET`; no new secrets.
- **III. Test & Typecheck Gates — PASS**: Vitest on counter/filter/email helpers; lint changed files; no mobile changes expected.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or prod-migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Extend loyalty outreach + call-queue + one new weekly email module mirroring call-center pattern; no new CRM package.

**Post-design re-check**: Still PASS — research resolves counters via one outreach timestamp field; queue filters reuse `ContactInsightCallQueue`; email reuses recipient constant + Maileroo.

## Project Structure

### Documentation (this feature)

```text
specs/055-loyalty-eligible-ops/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── loyalty-eligible-summary.md
│   ├── call-queue-filters-extend.md
│   └── loyalty-eligible-weekly-email.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<ts>_loyalty_outreach_updated_at/

lib/customer-insight/loyalty-outreach.ts          # pending helpers (existing)
lib/customer-insight/loyalty-eligible-summary.ts  # NEW: company + merchant-wise pending / MTD / week counters
lib/customer-insight/loyalty-eligible-summary.test.ts
lib/customer-insight/call-queue.ts                # multi-brand; assigned-date + not-contacted mode
lib/customer-insight/call-queue-report.ts         # notContacted filter if needed
lib/customer-insight/call-queue-report-export.ts  # NEW or inline: xlsx rows
lib/validation/customer-insight.ts                # Zod: brands[], assignedFrom/To, notContacted

lib/page-data/merchant-dashboard-loyalty.ts       # return totalCount + items (cap items)
lib/page-data/merchant-dashboard.ts               # pass loyaltyEligibleCount

lib/loyalty-eligible-weekly-email.ts              # NEW: build HTML + send (recipients from call-center constant)
lib/maileroo.ts                                   # thin send helper if needed (reuse multi-to)

app/api/admin/customer-insight/loyalty-eligible/summary/route.ts   # NEW
app/api/admin/customer-insight/loyalty-eligible/list/route.ts      # NEW (paginated admin list)
app/api/admin/customer-insight/call-queue/candidates/route.ts      # extend query
app/api/admin/customer-insight/call-queue/eligible-ids/route.ts
app/api/admin/customer-insight/call-queue/report/route.ts          # notContacted
app/api/admin/customer-insight/call-queue/report/export/route.ts   # NEW
app/api/cron/loyalty-eligible-weekly-email/route.ts                # NEW
vercel.json                                                       # weekly cron entry

app/(dashboard)/dashboard/customer-insight/customer-insight-panel.tsx
app/(dashboard)/dashboard/merchant/merchant-dashboard-panel.tsx
```

**Structure Decision**: Single Cosmo OS Next.js app. No new package. Loyalty summary + weekly email sit beside existing Insight / call-center email patterns.

## Complexity Tracking

> No constitution violations.
