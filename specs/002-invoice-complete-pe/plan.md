# Implementation Plan: Invoice Complete PE Integrity

**Branch**: `002-invoice-complete-pe` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-invoice-complete-pe/spec.md`

## Summary

Harden PE integrity on **two product paths**: (1) KOKO / bank transfer / WebXPay — finance approval first, PE on approval, then fulfillment; (2) other payments — normal fulfillment, PE when user marks invoice complete after delivery. Fix silent missing PEs (e.g. SV1008360 / SI SV100-0695), discover/repair gaps, and stop finance approval from forcing already invoice-complete prepaid orders back through the invoice-complete queue.

**Technical approach**: Fix `createDeliveryPaymentEntry` SI lookup (`erpnextInvoiceId`) and silent returns under `requireMop`; tighten `markOrderInvoiceComplete` success/clear-failure rules; guard approval stage updates when already `invoice_complete`; extend Failed ERP PE list/retry for silent gaps. Prefer no new schema.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, ERPNext REST (Sales Invoice + Payment Entry), existing Vitest

**Storage**: Neon PostgreSQL via Prisma — reuse `Order.erpPeSync*` fields; no new migration planned unless discovery requires a persisted flag (default: no)

**Testing**: Vitest unit tests for PE lookup / requireMop / approval stage guards; manual Vault UAT per quickstart

**Target Platform**: Vault OS + Cosmo OS web admin (shared codebase)

**Project Type**: Web application (monorepo Next.js app)

**Performance Goals**: Invoice complete remains single-order ERP round-trip; PE gap list may add bounded ERP outstanding checks or seed-on-detect — keep list page responsive (paginate / limit)

**Constraints**: Constitution — no speculative schema; do not auto mass-create PEs; preserve MOP selection UX; ask before prod deploy

**Scale/Scope**: Fulfillment invoice-complete + Failed ERP PE tab + finance approval approve path; both tenants

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — no schema change planned; if a column is added later, use `db:migrate:create` + `db:deploy:all` |
| II. Environment & Credential Isolation | **Pass** — use existing per-tenant ERP instance credentials; UAT on vault vs cosmo separately |
| III. Test & Typecheck Gates | **Pass** — add Vitest coverage; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — no auto push/deploy in this plan; user confirms prod |
| V. Simplicity & Scope Discipline | **Pass** — reuse Failed PE tab + existing completer/approval routes; no new subsystem |

**Post-design re-check**: Still pass — contracts extend existing APIs; discovery reuses PE failure model.

## Project Structure

### Documentation (this feature)

```text
specs/002-invoice-complete-pe/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── invoice-complete-pe.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
lib/
├── mark-order-invoice-complete.ts
├── erpnext-sync.ts                 # createDeliveryPaymentEntry
├── failed-erp-pe-sync.ts
├── delivery-payment-approval.ts
└── erp-payment-modes.ts

app/api/admin/
├── orders/[id]/fulfillment/route.ts
├── orders/bulk-invoice-complete/route.ts
├── orders/failed-erp-syncs/route.ts
├── orders/[id]/retry-erp-pe-sync/route.ts
└── approvals/[id]/route.ts

components/organisms/
├── fulfillment-bulk-invoice-complete.tsx
├── failed-erp-syncs-panel.tsx
└── failed-erp-pe-syncs-tab.tsx
```

**Structure Decision**: Single Next.js app; change shared libs + admin APIs/UI used by both Vault and Cosmo deployments.

## Complexity Tracking

> No constitution violations requiring justification.
