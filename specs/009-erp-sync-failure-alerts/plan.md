# Implementation Plan: ERP Sync Failure Alerts

**Branch**: `009-erp-sync-failure-alerts` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-erp-sync-failure-alerts/spec.md`

## Summary

Recover ERP order syncs stuck at `pending` without an error, keep existing retryable failures on the automatic retry path, and email each company’s configured heads a cutoff reconciliation report for orders that remain unsynced after the local business day (Asia/Colombo). Reports include order details plus totals with shipping, shipping alone, and without shipping. Cosmo OS and Vault OS each keep their own enabled flag and recipient list (Vault initial: `buddhima.cosmetics@outlook.com`), with a Daily Sales SMS–style settings UI for save / preview / test send.

**Technical approach**: Extend `failed-erp-sync-auto-retry` with `erpnextSyncStartedAt`, stale-pending detection (5 minutes), and silent-return fixes in `syncOrderToERPNext*`. Add company-scoped `ErpSyncFailureEmailConfig` + `ErpSyncFailureEmailSendLog` (mirror Daily Sales SMS). Orchestrate report build + Maileroo send in `lib/erp-sync-failure-email.ts`. Cron `GET /api/cron/erp-sync-failure-email` shortly after Colombo midnight for the previous calendar day. Settings card mirrors `daily-sales-sms-settings-form` under email/settings permissions.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, existing Maileroo (`lib/maileroo.ts`), existing ERP retry (`lib/failed-erp-sync-auto-retry.ts`), Vitest

**Storage**: Neon PostgreSQL via Prisma — Order field `erpnextSyncStartedAt`; new company-scoped config + send-log models (migration via `db:migrate:create` + `db:deploy:all`)

**Testing**: Vitest for stale classification, shipping totals, email body/totals, recipient normalization, cron dedupe/skip; manual Cosmo/Vault preview/test UAT per quickstart

**Target Platform**: Cosmo OS and Vault OS web admin (shared codebase, separate company DBs / configs)

**Project Type**: Web application (Next.js App Router)

**Performance Goals**: Minute-level retry cron already exists; cutoff email cron one pass per company; report for typical failure counts (&lt;100 rows) within Vercel `maxDuration` (60s); Maileroo multi-recipient send in one request where possible

**Constraints**: Constitution — migrate all three DBs; no hard-coded-only recipients long-term; reuse Maileroo; Asia/Colombo day bounds; ask before prod deploy/cron enable; no duplicate ERP SI on retry

**Scale/Scope**: One settings surface + one cutoff cron + extensions to existing ERP retry path; not a full reporting suite

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — schema via `npm run db:migrate:create` then `db:deploy:all` (vault + cosmo-dev + cosmo-prod) |
| II. Environment & Credential Isolation | **Pass** — per-tenant DB + company-scoped config; Maileroo env already per deployment; no credential sharing |
| III. Test & Typecheck Gates | **Pass** — Vitest for totals/stale/dedupe; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy; user confirms cron enable + prod migrate |
| V. Simplicity & Scope Discipline | **Pass** — reuse retry cron, Maileroo, Daily Sales SMS settings/log pattern; no new email vendor or status enum layer |

**Post-design re-check**: Still pass — one Order timestamp + config/send-log pair; thin admin/cron contracts; no speculative abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/009-erp-sync-failure-alerts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── erp-sync-failure-alerts.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                    # erpnextSyncStartedAt; ErpSyncFailureEmailConfig; ErpSyncFailureEmailSendLog

lib/
├── failed-erp-sync-auto-retry.ts    # stale pending → mark failed + schedule; scheduleUnscheduled includes zombies after classify
├── failed-erp-sync-classification.ts
├── erpnext-sync.ts                  # throw (or mark failed) on silent skip after claim; set startedAt on claim paths
├── order-webhook-process.ts         # set erpnextSyncStartedAt when claiming pending
├── order-shipping-display.ts        # reuse shipping resolution for report amounts
├── maileroo.ts                      # sendErpSyncFailureAlertEmail(...)
├── erp-sync-failure-email.ts        # aggregate snapshot, format HTML/text, send orchestration, dedupe
├── erp-sync-failure-email.test.ts
└── failed-erp-sync-auto-retry.test.ts  # extend or add stale-pending cases

app/api/admin/company/erp-sync-failure-email/
├── route.ts                         # GET/PUT config
├── preview/route.ts                 # POST preview / test send
└── resend/route.ts                  # POST manual resend by reportDate

app/api/cron/erp-sync-failure-email/
└── route.ts                         # previous Colombo day cutoff report

app/api/cron/failed-erp-syncs-auto-retry/
└── route.ts                         # unchanged schedule; behavior gains stale classification via shared lib

components/molecules/
└── erp-sync-failure-email-settings-form.tsx   # mirror daily-sales-sms-settings-form

app/(dashboard)/dashboard/settings/
└── email-templates/page.tsx         # or sms-portal sibling — mount settings card (see research R6)

components/organisms/failed-erp-syncs-panel.tsx
└── show stuck/interrupted copy instead of "—" for pending-without-error

vercel.json                          # cron: erp-sync-failure-email ~00:05 Asia/Colombo
```

**Structure Decision**: Extend the existing Next.js app — ERP retry lib + Maileroo + Daily Sales SMS settings/cron pattern. No new app package.

## Complexity Tracking

> No constitution violations requiring justification.
