# Implementation Plan: Delivery & CC Checkout Invoice Complete

**Branch**: `fix/finance-approval-fixes` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-delivery-cc-invoice-complete/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Align payment completion with OS invoice completion in two flows. A successful delivery-payment approval will move a physically delivered order to terminal `invoice_complete` only after ERP creates a Payment Entry or confirms the Sales Invoice is already paid. A paid CC Checkout order will create/confirm its PE during order-received ERP synchronization, set the independent `invoiceCompleteAt` payment marker, and retain its nonterminal physical fulfillment stage. Queue and PE-recovery predicates will recognize this early-complete state so fulfillment continues and failed PE attempts remain visible and retryable.

## Technical Context

**Language/Version**: TypeScript 5, Node.js runtime supported by Next.js 16

**Primary Dependencies**: Next.js 16 App Router, React 19, Prisma 6, Zod 4, ERPNext REST integration

**Storage**: Neon PostgreSQL via Prisma; ERPNext Sales Invoice and Payment Entry are external records

**Testing**: Vitest 3 unit tests, ESLint, TypeScript/build checks, manual ERPNext integration validation

**Target Platform**: Next.js web application and server routes deployed on Vercel; Shopify and ERPNext web integrations

**Project Type**: Full-stack web application with admin UI, APIs, webhook processing, and a mobile client consuming shared APIs

**Performance Goals**: Preserve current ingestion and approval responsiveness; add no client-side round trips; process each PE/invoice-complete transition idempotently

**Constraints**: Never mark OS invoice complete after failed required ERP settlement; never duplicate a PE for an already-paid SI; early invoice completion must not terminate physical fulfillment; preserve location-specific gateway-to-MOP mappings

**Scale/Scope**: Two payment paths, existing Order/ApprovalRequest records, Shopify order webhook, one finance approval route, fulfillment queues, and PE failure/retry surfaces across Vault and Cosmo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: Existing Order completion and PE-failure fields are sufficient; no Prisma schema change or migration is planned.
- **II. Environment & Credential Isolation — PASS**: ERP company, credentials, and MOP configuration remain location/environment scoped. No secret or environment-file changes are required.
- **III. Test & Typecheck Gates — PASS**: Focused Vitest coverage plus `npm test`, `npm run lint`, and `npm run mobile:typecheck` are required.
- **IV. Production Deployment Safety — PASS**: No production database deployment, push to `main`, or force push is part of this plan.
- **V. Simplicity & Scope Discipline — PASS**: Reuse `invoiceCompleteAt`, `financialStatus`, `erpPeSync*`, existing PE creation, and existing routes. No new model, feature flag, or speculative framework.
- **Integration mapping constraint — PASS**: CC Checkout continues to use the configured WebXPay MOP; normalization does not change other gateway mappings.

**Post-design re-check**: PASS. The model adds no schema, contracts preserve authenticated endpoints and mappings, and recovery extends existing fields and UI.

## Project Structure

### Documentation (this feature)

```text
specs/011-delivery-cc-invoice-complete/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── payment-invoice-complete.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
```text
app/api/
├── admin/approvals/[id]/route.ts
├── admin/orders/[id]/retry-erp-pe-sync/route.ts
└── webhooks/shopify/orders/route.ts

lib/
├── approval-workflow.ts
├── delivery-payment-approval.ts
├── erpnext-sync.ts
├── failed-erp-pe-sync.ts
├── fulfillment-queue-filters.ts
├── mark-order-delivered.ts
├── order-webhook-process.ts
└── page-data/orders.ts

prisma/
└── schema.prisma                 # Existing fields only; no planned migration

lib/*.test.ts                     # Focused Vitest coverage beside helpers
```

**Structure Decision**: Keep changes in the existing App Router and colocated domain helpers. The approval route remains the delivery-payment orchestration boundary; Shopify ingestion/ERP sync remains the CC Checkout boundary. Shared predicates represent payment completion without a new service layer.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitutional violations require justification.
