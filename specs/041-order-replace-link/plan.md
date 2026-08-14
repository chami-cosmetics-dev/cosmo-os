# Implementation Plan: Order Cancel Replace Link

**Branch**: `041-order-replace-link` | **Date**: 2026-08-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/041-order-replace-link/spec.md`

## Summary

After a Cosmo Shopify-originated order is cancelled and replaced by an ERP-created Cosmo order, staff need a durable link between them and bidirectional discovery in order search/detail. Implement an optional `Order.replacedByOrderId` self-FK (editable only on cancelled Cosmo orders via dedicated PATCH), enrich order detail + quick-search/page-data search with one-hop counterparts, and gate mutate/UI off on Vault. Do not reuse `OrderExchange` or create ERP/Shopify documents.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js / project tsconfig)

**Primary Dependencies**: Next.js App Router, React, Prisma, Zod, Auth0 (`requirePermission`)

**Storage**: Neon PostgreSQL via Prisma — additive `Order.replacedByOrderId` (+ index, self-relation); migrate with `npm run db:migrate:create` then `npm run db:deploy:all`

**Testing**: Vitest for resolve/validation helpers + route behavior; `npm test`, lint, typecheck; manual Cosmo UAT per [quickstart.md](quickstart.md)

**Target Platform**: Vercel-hosted Cosmo OS (Vault explicitly out of scope for mutate/UI)

**Project Type**: Single full-stack Next.js web app (rider app unaffected)

**Performance Goals**: Detail/search enrichment one hop; resolve by indexed equality on company + identity fields; search enrichment batch-load FKs (no N+1)

**Constraints**: Cosmo-only (`!isVaultOsDeployment()`); link only when `cancelledAt` set; exact order-number resolve (not contains); constitution migration discipline; no cancel-dialog field

**Scale/Scope**: Schema + one PATCH route; GET detail enrichment; quick-search + orders page-data enrichment; Cosmo order detail UI (fulfillment/invoice modal); unit tests; no ERP/Shopify API changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **I. Multi-Database Migration Discipline — PASS**: Plan requires `npm run db:migrate:create` for additive FK; deploy all three DBs via `npm run db:deploy:all`; no `db push` on shared envs.
- **II. Environment & Credential Isolation — PASS**: No new secrets; Cosmo/Vault split via existing `isVaultOsDeployment()`.
- **III. Test & Typecheck Gates — PASS**: Vitest for resolve + PATCH rules; CI unchanged.
- **IV. Production Deployment Safety — PASS**: Planning only; prod migrate/deploy needs explicit user confirmation later.
- **V. Simplicity & Scope Discipline — PASS**: Single FK on `Order`; dedicated small route; no `OrderExchange` reuse; no auto-detect; Cosmo only.

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](data-model.md) documents additive FK only.
- Contracts cover PATCH, detail enrichment, search enrichment.
- Quickstart forbids assuming Vault behavior and ERP document creation.

## Project Structure

### Documentation (this feature)

```text
specs/041-order-replace-link/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── admin-orders-replaced-by.md
│   ├── admin-orders-detail-replace-link.md
│   └── admin-orders-search-replace-link.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                    # Order.replacedByOrderId + relation/index

lib/
├── order-display-label.ts           # reuse formatBusinessOrderNumber
├── order-replace-link.ts            # NEW: resolve order number, validate set/clear
├── falcon-waybill-brand.ts          # reuse isVaultOsDeployment
└── page-data/
    ├── orders-quick-search.ts       # enrich hits
    └── orders.ts                    # enrich search hits (as needed)

app/api/admin/orders/
├── [id]/route.ts                   # GET include replacedByOrder / replacedFromOrders
├── [id]/replaced-by/route.ts       # NEW PATCH
└── quick-search/route.ts            # passthrough enriched DTO

components/organisms/
├── order-fulfillment-detail.tsx     # editable + read-only reverse UI
└── order-invoice-view-modal.tsx     # wire detail fields if needed

components/molecules/
└── dashboard-order-search.tsx       # show related counterpart in results

lib/**/*.test.ts                     # resolve + permission/cancel gates
```

**Structure Decision**: Extend existing Cosmo admin order APIs and order detail organisms; no new app package. Rider mobile out of scope.

## Complexity Tracking

> No constitution violations requiring justification.
