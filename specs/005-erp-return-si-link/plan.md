# Implementation Plan: ERP Return SI Link

**Branch**: `005-erp-return-si-link` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-erp-return-si-link/spec.md`

## Summary

When ERP issues a credit note it creates a **Return SI** pointing at the original Sales Invoice. OS already voids/returns the original order and sometimes stashes Return SI names inside `rawPayload.erpReturnSalesInvoiceNames`, but staff **cannot search** by Return SI and often cannot **see** it on the original order. This feature persists Return SI ID(s) on the original order as a first-class field, includes them in orders search, shows them on order detail, and provides a bounded recovery path for historical voided orders.

**Technical approach**: Add `Order.erpReturnSalesInvoiceIds String[]`, write it from existing credit-note sync (`applyErpCreditNoteToOriginalOrder` / reconcile), extend `lib/page-data/orders.ts` search + order detail payload/UI, and expose a small admin recovery endpoint (or script + API) that reuses `fetchErpCreditNotesAgainst`-style ERP lookup already in `lib/erp-credit-note-order-sync.ts`.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router), Node.js as in repo

**Primary Dependencies**: Next.js, Prisma, existing ERP Sales Invoice webhook + `lib/erp-credit-note-order-sync.ts`, Vitest

**Storage**: Neon PostgreSQL via Prisma — **new** `Order.erpReturnSalesInvoiceIds String[] @default([])` (migration via `db:migrate:create` + `db:deploy:all`)

**Testing**: Vitest for credit-note merge helpers, search-filter unit coverage, and recovery dry-run logic; manual UAT per [quickstart.md](./quickstart.md)

**Target Platform**: Cosmo OS and Vault OS shared admin (same Order model)

**Project Type**: Web application (Next.js app)

**Performance Goals**: Orders search with Return SI suffix match on the same latency class as current `erpnextInvoiceId` / mer-code searches; webhook path stays one extra column update (no N+1)

**Constraints**: Constitution — multi-DB migrate discipline; do not clear `erpnextInvoiceId` / Shopify ids; preserve finance-reverted and rearrange skip-void protections while still recording Return SI when known; no separate Return-SI-only order required when original exists

**Scale/Scope**: One Order field + credit-note writer fixes + orders search/detail + optional recovery API/script; no new pages unless recovery needs a minimal admin action

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **Pass** — schema change uses `npm run db:migrate:create` and `npm run db:deploy:all` (vault, cosmo-dev, cosmo-prod). No `db:push` on shared DBs |
| II. Environment & Credential Isolation | **Pass** — ERP recovery uses each company’s existing ERP instance credentials; no cross-tenant env bleed |
| III. Test & Typecheck Gates | **Pass** — extend Vitest around credit-note / search helpers; `npm test` before merge |
| IV. Production Deployment Safety | **Pass** — migrate + deploy only with explicit user confirmation |
| V. Simplicity & Scope Discipline | **Pass** — one array column; reuse credit-note sync; search/detail only; recovery reuses ERP list-by-`return_against` |

**Post-design re-check**: Still pass — dedicated column justified (R1: `rawPayload` overwrite risk); no new screens required for P1/P2; recovery is optional admin endpoint/script.

## Project Structure

### Documentation (this feature)

```text
specs/005-erp-return-si-link/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── erp-return-si-link.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # Order.erpReturnSalesInvoiceIds String[]
prisma/migrations/<ts>_erp_return_si_ids/    # migrate:create

lib/
├── erp-credit-note-order-sync.ts            # always merge Return SI ids; skip-void still records
├── erp-return-si.ts                         # optional pure helpers: normalize list, read legacy rawPayload
├── page-data/orders.ts                      # search OR match on array; list DTO field
└── find-erp-return-si-mismatches.ts         # optional reuse for recovery candidates

app/api/webhooks/erpnext/sales-invoice/
└── route.ts                                 # already calls handleErpSalesInvoiceCreditNoteEvent

app/api/admin/orders/[id]/route.ts          # include erpReturnSalesInvoiceIds in detail
app/api/admin/orders/page-data/route.ts      # via fetchOrdersPageData
app/api/admin/erp-migrations/                # optional recover-return-si route (settings.manage / admin)

components/organisms/
├── orders-panel.tsx                         # detail/list: show Return SI(s)
└── order-invoice-view-modal.tsx             # optional distinct Return SI label

scripts/                                     # optional CLI recovery using existing mismatch finder
```

**Structure Decision**: Single Next.js app + Prisma. Persist on `Order`, wire through existing credit-note and orders list/detail paths. No new dashboards for MVP.

## Complexity Tracking

> No constitution violations requiring justification.
