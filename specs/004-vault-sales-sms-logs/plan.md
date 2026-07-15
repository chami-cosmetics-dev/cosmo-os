# Implementation Plan: Vault Sales SMS Logs & Delivery Visibility

**Branch**: `004-vault-sales-sms-logs` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-vault-sales-sms-logs/spec.md`

## Summary

Give Vault OS a dedicated **Sales SMS Logs** UI (status summary + attempt history + Resend / Send for date) so operators can see why Daily Sales SMS failed or never ran—without relying on Cosmo’s OGF-gated nav. Keep Cosmo **OGF & Sales Logs** unchanged. Ensure scheduled Daily Sales SMS continues at **09:00 Asia/Colombo** on both deployments and actually executes against Vault’s company data when config is valid.

**Technical approach**: Reuse existing `DailySalesSmsConfig`, `DailySalesSmsSendLog`, `lib/daily-sales-sms.ts`, and resend API from `003-admin-daily-sales-sms`. Add Vault-only page/nav (`NEXT_PUBLIC_APP_NAME === "Vault OS"` or `!OGF_LOCATION_ID` nav rule). Extract shared Daily Sales SMS log table/status UI for Cosmo section + Vault page to avoid drift. Confirm `vercel.json` cron `30 3 * * *` is deployed on the Vault Vercel project.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, existing `lib/daily-sales-sms.ts` / Hutch `sendSms`, Vitest

**Storage**: Neon PostgreSQL via Prisma — **no new models**; reuse `DailySalesSmsConfig` + `DailySalesSmsSendLog` (already migrated)

**Testing**: Vitest for any new pure helpers (e.g. next-run label, Vault nav visibility); manual Vault UAT per quickstart; Cosmo regression smoke on OGF & Sales Logs

**Target Platform**: Vault OS web admin primary; Cosmo regression-safe shared codebase

**Project Type**: Web application (Next.js app)

**Performance Goals**: Single page-data load (config + last N logs) with one auth check; Resend/Send-for-date within existing Hutch fan-out latency

**Constraints**: Constitution — no unnecessary schema; credential isolation (Vault vs Cosmo); ask before prod deploy; Asia/Colombo schedule display; simplicity (dedicated page, thin wrappers)

**Scale/Scope**: One Vault page + nav; optional small shared component; cron schedule already set to 09:00 Colombo; no generic SMS Portal audit log expansion

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no schema changes expected; if a migration is ever needed, `db:migrate:create` + `db:deploy:all` |
| II. Environment & Credential Isolation | **Pass** — Vault page uses Vault company DB + Vault SMS portal; Cosmo OGF path untouched |
| III. Test & Typecheck Gates | **Pass** — Vitest for helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — cron/nav deploy to Vault (+ Cosmo if shared) only with user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — reuse send/log/resend; one Vault page; share presentational bits only if duplicated |

**Post-design re-check**: Still pass — contracts extend admin UI/API lightly; no new persistence layer; Vault/Cosmo nav split is a few conditionals + one route.

## Project Structure

### Documentation (this feature)

```text
specs/004-vault-sales-sms-logs/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── vault-sales-sms-logs.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
vercel.json                              # daily-sales-sms cron already 30 3 * * * (09:00 Colombo)

lib/
├── daily-sales-sms.ts                   # reuse run/build/resend orchestration
├── branding.ts                          # APP_NAME / isVault helper if needed
└── (optional) daily-sales-sms-status.ts # next-run copy / status DTO helper + tests

app/(dashboard)/dashboard/sales-sms-logs/
└── page.tsx                             # Vault Sales SMS Logs (status + table + send-for-date)

app/(dashboard)/dashboard/ogf-logs/
├── page.tsx                             # Cosmo unchanged functionally (may import shared SMS section)
└── daily-sales-sms-resend-button.tsx    # reuse from Vault page

components/
├── organisms/app-sidebar.tsx            # Cosmo: OGF & Sales Logs if hasOgf; Vault: Sales SMS Logs → /dashboard/sales-sms-logs
└── molecules/ or organisms/
    └── daily-sales-sms-logs-panel.tsx   # shared list + status summary (optional extract)

app/api/admin/company/daily-sales-sms/
├── route.ts                             # may extend GET with status summary fields for Vault page
└── resend/route.ts                      # already supports force manual send by reportDate (Send for date)
```

**Structure Decision**: Single Next.js app. Vault gets a dedicated route; Cosmo keeps `/dashboard/ogf-logs`. Prefer extracting a shared Daily Sales SMS logs panel used by both to avoid dual maintenance, without merging navigation.

## Complexity Tracking

> No constitution violations requiring justification.
