# Implementation Plan: Order Number, Search, Rider Performance & Cash Tender

**Branch**: `025-order-search-rider-incentives` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-order-search-rider-incentives/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Make order numbers consistently visible across Cosmo OS web and the rider app; add quick order search on the Cosmo OS dashboard home; let riders record cash tendered (“customer gave”) and show change balance; add a rider performance dashboard where incentive equals each completed order’s shipping cost (`totalShipping`).

## Technical Context

**Language/Version**: TypeScript 5, Node.js (Next.js 16 App Router)

**Primary Dependencies**: Next.js 16, React 19, Prisma 6, Zod, Expo/React Native rider app

**Storage**: Neon PostgreSQL via Prisma (vault / cosmo-dev / cosmo-prod share migrations)

**Testing**: Vitest unit tests (`lib/mobile`, helpers), `npm run mobile:typecheck`, manual web + APK smoke

**Target Platform**: Cosmo OS web (Vercel) + Cosmo Rider Android APK (EAS)

**Project Type**: Full-stack web + mobile client against shared mobile/admin APIs

**Performance Goals**: Dashboard quick-search returns within ~1s for typical company order volume; rider performance aggregates for a date range without N+1 per order in the UI

**Constraints**: Schema changes require `db:migrate:create` + `db:deploy:all`; do not overload `collectedAmount` for tender; incentive v1 = 100% of `Order.totalShipping` at completion; reuse existing RBAC keys where possible

**Scale/Scope**: Primary order surfaces (orders list, fulfillment, approvals, rider ops, mobile lists/detail); one dashboard search entry point; DeliveryPayment tender fields; one rider performance page/API

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: Tender fields (and optional incentive ledger if chosen) require a Prisma migration created via `npm run db:migrate:create` and deployed with `npm run db:deploy:all`. No `db push` against shared DBs.
- **II. Environment & Credential Isolation — PASS**: No new secrets or cross-tenant env changes.
- **III. Test & Typecheck Gates — PASS**: Vitest for payment-line/tender helpers + performance aggregation; `npm test` and `npm run mobile:typecheck` before merge.
- **IV. Production Deployment Safety — PASS**: Plan does not push to `main` or run prod migrate; those remain explicit user actions.
- **V. Simplicity & Scope Discipline — PASS**: Prefer extending `DeliveryPayment` + aggregating completed tasks/`totalShipping` over a full payroll subsystem; no incentive % engine in v1.

**Post-design re-check**: Still PASS — v1 incentive is a computed aggregate (or thin ledger tied 1:1 to completion); no speculative abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/025-order-search-rider-incentives/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md              # created by /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
app/(dashboard)/dashboard/
├── page.tsx                          # dashboard home + search entry
├── riders/page.tsx                   # existing rider ops
└── riders/performance/page.tsx       # NEW performance dashboard

app/api/admin/
├── orders/quick-search/route.ts      # NEW
└── riders/performance/route.ts       # NEW (or page-data)

app/api/mobile/v1/deliveries/[id]/payment/route.ts  # tender fields

components/organisms/
├── orders-panel.tsx
├── rider-operations-panel.tsx
├── order-fulfillment-detail.tsx
└── rider-performance-panel.tsx       # NEW

lib/
├── page-data/riders.ts
├── page-data/orders.ts               # reuse/extend search filters
├── mobile/dto.ts
├── mobile/validation.ts
├── mobile/payment-lines.ts
└── rider-incentive.ts                # NEW aggregation helpers

mobile/rider-app/
├── src/components/payment-form.tsx
├── src/components/delivery-card.tsx
├── src/types/delivery.ts
└── app/delivery/[tenant]/[id].tsx

prisma/schema.prisma                  # DeliveryPayment tender fields
```

**Structure Decision**: Extend the existing Cosmo OS dashboard + riders area and shared mobile payment API. No new app package.

## Complexity Tracking

> No constitution violations requiring justification.
