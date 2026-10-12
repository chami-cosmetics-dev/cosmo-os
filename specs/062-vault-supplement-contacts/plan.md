# Implementation Plan: Vault Supplement Contact Import

**Branch**: `062-vault-supplement-contacts` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/062-vault-supplement-contacts/spec.md`

**Note**: `setup-plan.ps1` reported an empty git branch and did not create one. Spec directory remains `specs/062-vault-supplement-contacts`.

## Summary

One-time staff import of supplement customers into Vault OS Contact Master, with purchase lines limited to Supplement Vault ERP item codes. Customer Insight phone search then shows those invoices, items, and spend. Staff move the data in workbooks: Vault OS exports the item-code list, Cosmo OS builds the draft, staff edit it, Vault OS uploads it.

**Technical approach**: Reuse `AdaptPurchaseHistory` (new `origin` column) so Insight and contact purchase history pick up the rows without a second history table. Pure helpers in `lib/vault-supplement-import/`. One dashboard page, four admin routes, gated by `contacts.master.manage` and by Vault OS vs Cosmo OS. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router)

**Primary Dependencies**: Next.js, React, Prisma, ExcelJS (already used for workbooks), Zod, Auth0 `requirePermission`, `findMatchingContacts` / phone variants, Vault ERP catalog fetch (`getAllOsfErpInstances`), Customer Insight invoice mapper, contact purchase-summary helper

**Storage**: Neon PostgreSQL via Prisma. One new column `AdaptPurchaseHistory.origin` (`npm run db:migrate:create` only — never `prisma migrate dev` or `db push` on vault, cosmo-dev, or cosmo-prod). Deploy with `npm run db:deploy:all` only when the user asks.

**Testing**: Vitest on parse, match, item-code filter, invoice merge, and draft selection. `npm test` and lint on touched files. No rider-app files.

**Target Platform**: Vault OS and Cosmo OS web dashboards (same codebase, separate databases). Upload runs on Vault OS. Draft runs on Cosmo OS.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: Upload of 5,000 data rows returns the result summary within 5 minutes (spec SC-004). ERP item codes are loaded once per request. Invoice writes chunk at about 200.

**Constraints**: Constitution I–V. No `Order` rows. No ERP customer create. No scheduled sync. Do not copy loyalty assignment, merchant allocation, reminders, or call queue. Do not read the other tenant’s database. Omitting a row on a later upload does not delete history. Phone match uses the existing `+94` / `94` / `0` variants.

**Scale/Scope**: One page, four routes, one Prisma column, helpers under `lib/vault-supplement-import/`. Label change on the existing contact history panels and Insight invoice mapper. Historical volume is a single staff file, not a live feed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — `origin` column via `db:migrate:create`. Shared migrations folder. No `db push` on the three Neon databases. `db:deploy:all` only with an explicit user ask. |
| II. Environment & Credential Isolation | **Pass** — Vault ERP credentials stay on Vault OS. Cosmo draft receives item codes as a workbook, not a cross-database query. |
| III. Test & Typecheck Gates | **Pass** — Vitest on pure helpers. `npm test` and lint before merge. No mobile change. |
| IV. Production Deployment Safety | **Pass** — this command does not push `main` or deploy a database. |
| V. Simplicity & Scope Discipline | **Pass** — reuse `AdaptPurchaseHistory` and Insight’s existing reader. No new permission, no new purchase table, no CLI required for v1. |

### Post-design re-check

Still pass. The design adds one column and one page. Cross-tenant transfer is a workbook, which keeps env files apart. Insight spend works because those rows are the history table Insight already sums. UI copy changes from “Adapt” to “Supplement import” only when `origin` says so. No unjustified violation.

## Project Structure

### Documentation (this feature)

```text
specs/062-vault-supplement-contacts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── vault-supplement-contact-import.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
└── AdaptPurchaseHistory.origin

lib/vault-supplement-import/
├── headers.ts                 # 18 headers, template + guide workbook
├── parse-sheet.ts             # header check, row classify, last-row-wins
├── item-codes.ts              # listVaultErpItemCodes; read item_code workbook
├── contact-resolve.ts         # phone-first match, ambiguous reject, fill-blanks
├── invoice-merge.ts           # vsupp key, line replace, ttlAmount
├── draft.ts                   # Cosmo orders + adapt lines → Purchases rows
├── import-run.ts              # upload orchestration
└── *.test.ts

lib/product-items/vault-erp-catalog-sync.ts
└── share the stock-item filter with listVaultErpItemCodes (no ProductItem write)

lib/customer-insight/invoices.ts
└── origin label: Supplement import vs Adapt

app/api/admin/contacts/supplement-import/
├── template/route.ts          # GET blank workbook (Vault OS)
├── item-codes/route.ts        # GET item codes (Vault OS)
├── route.ts                   # POST purchases (Vault OS)
└── draft/route.ts             # POST item codes → draft (Cosmo OS)

app/(dashboard)/dashboard/contacts/supplement-import/
└── page + client panel

components/organisms/app-sidebar.tsx
└── nav link when contacts.master.manage

components/organisms/contacts-panel.tsx
components/organisms/contact-updates-panel.tsx
└── badge follows origin
```

**Structure Decision**: Stay in the single Next.js app. Matching, parsing, and totals are pure functions under `lib/vault-supplement-import/` so Vitest can run without ERP or a database. Routes only check the app name, permission, and company, then call those helpers. The page is a thin client over the four routes.

## Complexity Tracking

> No constitution violations requiring justification.

## Agent context

Skipped. Repo has no `.specify` `update-agent-context` script (same as 041–061). Use this plan, [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/vault-supplement-contact-import.md](./contracts/vault-supplement-contact-import.md).
