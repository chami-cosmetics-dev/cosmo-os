# Implementation Plan: Admin Daily Sales SMS

**Branch**: `003-admin-daily-sales-sms` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-admin-daily-sales-sms/spec.md`

## Summary

Send a daily sales SMS to configurable admin phones (initial: **0766713205**) in the leadership report format: day value/count, MTD total, MTD by location short code. Cosmo OS first; reuse Hutch `sendSms`, dashboard sales aggregation (`date_type: order` / Asia/Colombo), and cron patterns like `ogf-sale`.

**Technical approach**: Pure functions to aggregate + format SMS; company-scoped `DailySalesSmsConfig` (+ send log for dedupe **and** OGF-logs UI); settings API/UI under `settings.sms_portal`; cron `GET /api/cron/daily-sales-sms` with `CRON_SECRET` + `vercel.json` schedule after midnight Colombo; preview/test admin endpoint; **extend `/dashboard/ogf-logs` with Daily Sales SMS history + manual Resend** (mirror OGF email Resend).

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, existing Hutch SMS (`lib/hutch-sms.ts`), Vitest

**Storage**: Neon PostgreSQL via Prisma — new company-scoped config + send-log models (migration via `db:migrate:create` + `db:deploy:all`)

**Testing**: Vitest for aggregation, SMS body format, phone list validation, dedupe skip logic; manual Cosmo preview/send UAT per quickstart

**Target Platform**: Cosmo OS web admin first (shared codebase; Vault can enable later with its own recipients)

**Project Type**: Web application (Next.js monorepo app)

**Performance Goals**: One aggregation query (or small parallel set) per company per run; SMS fan-out to a small recipient list (&lt;20); cron completes within Vercel `maxDuration` (30–60s)

**Constraints**: Constitution — migrate all DBs; no hard-coded-only phones; reuse SMS portal; ask before prod deploy; Asia/Colombo day bounds

**Scale/Scope**: One SMS product surface (settings + cron + preview); Cosmo locations with `shortName`; not a full reporting suite

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — schema via `npm run db:migrate:create` then `db:deploy:all` (vault + cosmo-dev + cosmo-prod) before complete |
| II. Environment & Credential Isolation | **Pass** — per-tenant DB + existing SmsPortalConfig; Cosmo UAT with Cosmo SMS portal |
| III. Test & Typecheck Gates | **Pass** — Vitest for format/aggregate; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy; user confirms cron enable + prod migrate |
| V. Simplicity & Scope Discipline | **Pass** — reuse `sendSms` + dashboard sales filters; small config model; no new SMS vendor |

**Post-design re-check**: Still pass — one new config + send-log; contracts are thin admin/cron APIs; no speculative abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/003-admin-daily-sales-sms/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── daily-sales-sms.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                    # DailySalesSmsConfig, DailySalesSmsSendLog

lib/
├── page-data/dashboard-sales.ts     # reuse day bounds + eligibility
├── hutch-sms.ts                     # sendSms
├── format-datetime.ts               # Asia/Colombo helpers
├── daily-sales-sms.ts               # aggregate, format body, send orchestration
└── daily-sales-sms.test.ts

app/api/admin/company/daily-sales-sms/
├── route.ts                         # GET/PUT config (recipients)
├── preview/route.ts                 # POST preview / optional test send
└── resend/route.ts                  # POST/GET manual resend by reportDate (for ogf-logs)

app/(dashboard)/dashboard/ogf-logs/
├── page.tsx                         # add Daily Sales SMS logs section + Resend
└── daily-sales-sms-resend-button.tsx

app/api/cron/daily-sales-sms/
└── route.ts                         # scheduled previous-day send

components/molecules/ or organisms/
└── daily-sales-sms-settings-form.tsx

vercel.json                          # cron schedule entry
```

**Structure Decision**: Extend the existing Next.js app — lib orchestration + admin settings API/UI + cron route — matching `ogf-sale` / SMS portal patterns. Failure UX reuses [`/dashboard/ogf-logs`](https://os.cosmetics.lk/dashboard/ogf-logs) rather than a new menu item.

## Complexity Tracking

> No constitution violations requiring justification.
