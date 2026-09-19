# Implementation Plan: KOKO Duplicate Order Minimization

**Branch**: `057-koko-duplicate-orders` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/057-koko-duplicate-orders/spec.md`

## Summary

ERP-sourced KOKO orders currently get an immediate `order_payment_approval` on ingest and are hidden from normal fulfillment until finance acts. Change that path so KOKO stays in merchant sample / pre-finance handling until the merchant confirms **KOKO link generated time**, then create the finance approval with that time visible. Finance Approvals UI groups same-phone + identical item-set KOKO orders (30-day lookback, including already-approved siblings). New permission lets finance cancel the surplus duplicate in OS + ERP. Soft duplicate notice at link-time confirm only (no ERP/KOKO-portal pre-create warning).

## Technical Context

**Language/Version**: TypeScript (strict), Node.js via Next.js App Router  
**Primary Dependencies**: Next.js, React, Prisma, Zod (`lib/validation`), Auth0 RBAC (`lib/rbac`), ERPNext sync (`lib/erpnext-sync`, `lib/erp-sales-invoice-ingest`)  
**Storage**: PostgreSQL (Neon) via Prisma — extend `Order` (+ optional fingerprint helper fields)  
**Testing**: Vitest for phone/item fingerprint + grouping helpers; manual UI quickstart for finance panel / sample confirm  
**Target Platform**: Cosmo OS web admin (Vercel)  
**Project Type**: Web application (Next.js monolith)  
**Performance Goals**: Finance approvals list with duplicate grouping stays comparable to current load; grouping query scoped by company + lookback (default 30 days)  
**Constraints**: Migration via `npm run db:migrate:create` + `db:deploy:all`; no `db push` on shared envs; no KOKO portal API sync; ERP order create unchanged  
**Scale/Scope**: Per-company pending/recent KOKO payment approvals; merchant sample confirm for ERP KOKO only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | New `Order` columns via `npm run db:migrate:create`; deploy with `db:deploy:all` before done |
| II. Environment & Credential Isolation | PASS | No new credentials; reuse ERPNext + Auth0 |
| III. Test & Typecheck Gates | PASS | Vitest for grouping/fingerprint; `npm test` / lint on touched files before PR |
| IV. Production Deployment Safety | PASS | No auto push to `main` / prod deploy from this plan |
| V. Simplicity & Scope Discipline | PASS | Defer approval for ERP KOKO only; compute groups at list time (reuse abandoned-cart fingerprint ideas); no portal integration |
| Stack constraints | PASS | Next.js + Prisma + Zod; Vitest units |

**Post-design re-check**: PASS — design reuses `ApprovalRequest`, fulfillment sample path, existing cancel/ERP SI cancel patterns; one new permission; no unjustified layers.

## Project Structure

### Documentation (this feature)

```text
specs/057-koko-duplicate-orders/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── koko-duplicate-orders.md
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/…                    # via db:migrate:create

lib/approval-workflow.ts               # defer ERP KOKO approval create; helpers
lib/koko-order.ts                      # isErpKokoOrder, link-time gates (new)
lib/koko-duplicate-group.ts            # phone + item fingerprint + group (new)
lib/phone-lookup.ts                    # reuse canonicalPhoneForErpCustomerId
lib/abandoned-checkout-cart.ts         # pattern reference for fingerprint
lib/rbac.ts                            # finance.approvals.cancel_koko_duplicate
lib/erp-sales-invoice-ingest.ts        # skip immediate approval for ERP KOKO until confirmed
lib/page-data/orders.ts                # sample queue includes awaiting link-time KOKO
lib/validation.ts                      # Zod for confirm / cancel bodies

app/api/admin/orders/[id]/koko-link-time/route.ts   # confirm/update link time (new)
app/api/admin/approvals/route.ts                     # list DTO + group metadata
app/api/admin/approvals/[id]/route.ts               # expose link time; cancel-duplicate action
app/(dashboard)/dashboard/approvals/page.tsx
app/api/admin/orders/[id]/fulfillment/route.ts      # block advance past sample without link time

components/organisms/finance-approvals-panel.tsx
components/organisms/fulfillment-sample-free-issue-panel.tsx
components/organisms/order-fulfillment-detail.tsx

lib/koko-duplicate-group.test.ts
lib/koko-order.test.ts
```

**Structure Decision**: Single Next.js app — extend approval + sample fulfillment paths; add focused `lib/koko-*` helpers; no new package.

## Complexity Tracking

> No constitution violations requiring justification.
