# Implementation Plan: Rider Cash Handover and Invoice Close

**Branch**: `064-rider-handover-invoice` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/064-rider-handover-invoice/spec.md`

**Note**: `setup-plan.ps1 -Json` returned `BRANCH` empty (no `SPECIFY_FEATURE`). Spec directory is `specs/064-rider-handover-invoice` via `.specify/feature.json`.

## Summary

On Cosmo OS Rider performance, two new permissions add a printable company cash slip (no order lines) and a later finance step that records cash received, loads that rider’s delivery-complete orders, lets staff pick an ERP mode of payment, and marks those orders invoice complete only after the payment entry succeeds. Rider incentive, on the staff page and in the rider app, includes an order only after delivery is complete and the invoice is closed. The pay day stays the delivery day. Delivery-complete counts stay operational.

**Technical approach**: New routes under `/api/admin/riders/handover/*`. Cash totals reuse `cashAmountFromDeliveryPayment` (COD lines only) and group by `CompanyLocation.erpnextCompany`. A new `RiderFinanceCashReceipt` stores each accepted snapshot. Invoice close calls `markOrderInvoiceComplete` with a new flag that stamps the order only after the payment entry is created or the invoice is already paid. Incentive aggregation gains an invoice-closed gate. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router)

**Primary Dependencies**: Next.js, React, Auth0 via `requirePermission`, Prisma, `cashAmountFromDeliveryPayment`, `listErpPaymentModesFromInstance`, `markOrderInvoiceComplete`, `syncOrderDeliveryPaymentEntriesToErp`, `aggregateRiderIncentives`, `fetchRiderRoster`, `parseAppCalendarDayStart` / `parseAppCalendarDayEnd`, Zod, `notify`

**Storage**: New Prisma model `RiderFinanceCashReceipt` (migration via `npm run db:migrate:create`, then `npm run db:deploy:all` when the user asks to deploy). No change to `RiderCashHandover` or `DeliveryPayment`.

**Testing**: Vitest for company cash grouping, receipt duplicate rule, and incentive invoice-closed gate. `npm test` and lint on touched files. Manual UAT in [quickstart.md](./quickstart.md). Rider app has no new screens; `npm run mobile:typecheck` if the performance hook’s types change.

**Target Platform**: Cosmo OS web Rider performance (`/dashboard/riders/performance`) plus the existing rider-app performance API. Vault OS out of scope.

**Project Type**: Single full-stack Next.js web app, with one mobile API response change

**Performance Goals**: Summary for one rider and a day or week returns in under 2 seconds without calling ERP. Invoice close runs payment entries one order at a time. One request handles at most 80 eligible orders (about a busy week). A larger set returns a clear error to shorten the range.

**Constraints**: Constitution I–V. Asia/Colombo calendar days. Summary JSON has no order list. Payment-entry failure does not stamp invoice complete on this path. Existing fulfillment invoice-complete behavior stays when the new flag is omitted. Do not rewrite rider-app cash handover.

**Scale/Scope**: One rider and one date range per action. Two permissions. One print slip. One receipt table. Incentive rule shared by staff and rider app.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — one new model, created with `npm run db:migrate:create`, deployed with `npm run db:deploy:all` only when the user confirms. No `prisma db push` against vault, cosmo-dev, or cosmo-prod. |
| II. Environment & Credential Isolation | **PASS** — ERP calls use the order location’s existing `ErpnextInstance`. No new secrets. |
| III. Test & Typecheck Gates | **PASS** — Vitest for pure helpers. Mobile typecheck only if the performance payload type changes. |
| IV. Production Deployment Safety | **PASS** — planning only. No prod deploy, push, or database deploy in this command. |
| V. Simplicity & Scope Discipline | **PASS** — reuse COD cash math, ERP mode list, and invoice-complete PE. New table only for the finance receipt the rider handover model cannot store. No checkbox picker, no signature image capture, no Vault work. |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — one receipt table; incentive gate uses existing `invoiceCompleteAt` and the completed rider task
- [contracts/rider-handover.md](./contracts/rider-handover.md) — four routes; summary omits orders; invoice close is partial-success
- [quickstart.md](./quickstart.md) — unit checks plus a staff UAT path; no prod deploy step

## Project Structure

### Documentation (this feature)

```text
specs/064-rider-handover-invoice/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rider-handover.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # RiderFinanceCashReceipt

lib/rbac.ts                                  # two permission keys; finance role list
lib/rider-handover.ts                        # company cash group, invoice-closed check, duplicate rule
lib/rider-handover.test.ts
lib/rider-incentive.ts                       # incentive only when invoice closed; completed count unchanged
lib/rider-incentive.test.ts
lib/mark-order-invoice-complete.ts           # commitOnlyWhenPaymentEntrySucceeds

app/(dashboard)/dashboard/riders/performance/page.tsx
components/organisms/rider-performance-panel.tsx
components/organisms/rider-handover-panel.tsx

app/api/admin/riders/handover/summary/route.ts
app/api/admin/riders/handover/orders/route.ts
app/api/admin/riders/handover/receipts/route.ts
app/api/admin/riders/handover/invoice-complete/route.ts

app/api/admin/riders/performance/route.ts    # pass invoice-closed into aggregate
app/api/mobile/v1/me/performance/route.ts    # same incentive gate
```

**Structure Decision**: Keep the feature on the existing Rider performance page. Summary and order list are separate routes so the summary permission cannot read orders. Rider mobile cash submit (`/api/mobile/v1/handovers`) stays as it is.

## Complexity Tracking

None. Constitution Check has no violations to justify.

## Agent context

No `.specify/scripts/**/update-agent-context*` script in this repo (same skip as `063-rop-warehouse-compare`). Context is this plan plus [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/rider-handover.md](./contracts/rider-handover.md).
